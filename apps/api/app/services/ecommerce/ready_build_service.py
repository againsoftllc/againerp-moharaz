"""Admin-curated prebuilt PCs ("Ready Builds") — pricing, discount, and the
publish gate that reuses the Phase-1 rule engine so a build can't go live
with an incompatible default combination."""

from __future__ import annotations

import json
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_compatibility_rule import ConfiguratorCompatibilityRule, load_json as load_rule_json
from app.models.ready_build import ReadyBuild, ReadyBuildSlot, ReadyBuildSlotItem
from app.services import configurator_rule_engine
from app.services.pc_builder_rules import SLOT_TO_COMPONENT, ensure_pc_builder_rules, pc_builder_profile_ids

MODES = ("locked", "list", "any", "hidden")


class ReadyBuildError(ValueError):
    pass


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or f"build-{uuid.uuid4().hex[:8]}"


def list_builds(db: Session, *, profile_id: Optional[str] = None, status: Optional[str] = None) -> List[ReadyBuild]:
    q = db.query(ReadyBuild)
    if profile_id:
        q = q.filter(ReadyBuild.profile_id == profile_id)
    if status:
        q = q.filter(ReadyBuild.status == status)
    return q.order_by(ReadyBuild.created_at.desc()).all()


def get_build(db: Session, build_id: str) -> ReadyBuild:
    row = db.get(ReadyBuild, build_id)
    if not row:
        raise ReadyBuildError("Ready Build not found")
    return row


def get_build_by_slug(db: Session, slug: str) -> ReadyBuild:
    row = db.query(ReadyBuild).filter(ReadyBuild.slug == slug).first()
    if not row:
        raise ReadyBuildError("Ready Build not found")
    return row


def slots_of(db: Session, build_id: str) -> List[ReadyBuildSlot]:
    return (
        db.query(ReadyBuildSlot)
        .filter(ReadyBuildSlot.ready_build_id == build_id)
        .order_by(ReadyBuildSlot.sort_order)
        .all()
    )


def items_of(db: Session, slot_id: str) -> List[ReadyBuildSlotItem]:
    return db.query(ReadyBuildSlotItem).filter(ReadyBuildSlotItem.ready_build_slot_id == slot_id).all()


def save_build(db: Session, payload: Dict[str, Any], *, build_id: Optional[str] = None) -> ReadyBuild:
    """Nested save — replaces all slots/items for the build in one transaction,
    matching the artifact's single-drawer-save UX (simpler and safer than
    diffing individual rows for a small per-build row count)."""
    if build_id:
        build = get_build(db, build_id)
    else:
        build = ReadyBuild(profile_id=payload["profile_id"], name="", slug="")
        db.add(build)

    build.profile_id = payload.get("profile_id", build.profile_id)
    build.name = (payload.get("name") or build.name or "Untitled Build").strip()[:255]
    slug = (payload.get("slug") or "").strip()
    build.slug = _slugify(slug or build.name) if not build_id or slug else build.slug
    build.images_json = json.dumps(payload.get("images", []))
    build.tags_json = json.dumps(payload.get("tags", []))
    build.category = payload.get("category")
    build.fps_label = payload.get("fps_label")
    build.discount_type = payload.get("discount_type", "none")
    build.discount_value = Decimal(str(payload.get("discount_value") or 0))
    build.starts_at = payload.get("starts_at") or None
    build.ends_at = payload.get("ends_at") or None
    build.show_timer = bool(payload.get("show_timer", True))
    build.discount_on_change = bool(payload.get("discount_on_change", True))
    if not payload.get("status"):
        pass
    elif payload["status"] in ("draft", "published"):
        build.status = payload["status"]
    db.flush()

    for slot in slots_of(db, build.id):
        db.delete(slot)
    db.flush()

    for slot_payload in payload.get("slots", []):
        mode = slot_payload.get("mode", "hidden")
        if mode not in MODES:
            raise ReadyBuildError(f"Invalid slot mode: {mode}")
        slot = ReadyBuildSlot(
            ready_build_id=build.id,
            category_id=slot_payload["category_id"],
            mode=mode,
            sort_order=int(slot_payload.get("sort_order", 0)),
        )
        db.add(slot)
        db.flush()
        for item_payload in slot_payload.get("items", []):
            db.add(
                ReadyBuildSlotItem(
                    ready_build_slot_id=slot.id,
                    product_id=item_payload["product_id"],
                    build_price=Decimal(str(item_payload["build_price"])) if item_payload.get("build_price") not in (None, "") else None,
                    is_default=bool(item_payload.get("is_default", False)),
                )
            )

    db.commit()
    db.refresh(build)
    return build


def delete_build(db: Session, build_id: str) -> None:
    build = get_build(db, build_id)
    db.delete(build)
    db.commit()


def _catalog_price(db: Session, product_id: str) -> Decimal:
    product = db.get(CatalogProduct, product_id)
    return Decimal(str(product.price)) if product else Decimal("0")


def _is_discount_live(build: ReadyBuild, today: date) -> bool:
    if build.discount_type == "none":
        return False
    if build.starts_at and build.starts_at > today:
        return False
    if build.ends_at and build.ends_at < today:
        return False
    return True


def compute_totals(db: Session, build: ReadyBuild, selection: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """selection: {category_id: product_id} — only consulted for list/any
    slots; locked slots always resolve to their one item."""
    selection = selection or {}
    regular = Decimal("0")
    price = Decimal("0")
    changed = False
    breakdown: List[Dict[str, Any]] = []

    for slot in slots_of(db, build.id):
        if slot.mode == "hidden":
            continue
        items = items_of(db, slot.id)
        default_item = next((i for i in items if i.is_default), items[0] if items else None)
        chosen_product_id = default_item.product_id if default_item else None
        chosen_build_price = default_item.build_price if default_item else None

        if slot.mode in ("list", "any") and slot.category_id in selection:
            picked = selection[slot.category_id]
            if picked and picked != chosen_product_id:
                changed = True
                chosen_product_id = picked
                matching_item = next((i for i in items if i.product_id == picked), None)
                chosen_build_price = matching_item.build_price if matching_item else None

        if not chosen_product_id:
            continue

        catalog_price = _catalog_price(db, chosen_product_id)
        line_price = chosen_build_price if chosen_build_price is not None else catalog_price
        regular += catalog_price
        price += line_price
        breakdown.append({
            "category_id": slot.category_id,
            "product_id": chosen_product_id,
            "price": float(line_price),
        })

    discount_live = _is_discount_live(build, date.today())
    apply_discount = discount_live and (build.discount_on_change or not changed)
    whole_discount = Decimal("0")
    if apply_discount:
        if build.discount_type == "pct":
            whole_discount = (price * build.discount_value / Decimal("100")).quantize(Decimal("0.01"))
        elif build.discount_type == "fixed":
            whole_discount = build.discount_value

    final = max(Decimal("0"), price - whole_discount)
    return {
        "regular": float(regular),
        "price": float(price),
        "discount": float(whole_discount),
        "final": float(final),
        "changed": changed,
        "discount_applied": apply_discount,
        "components": breakdown,
    }


def validate_for_publish(db: Session, build: ReadyBuild) -> List[str]:
    errors: List[str] = []
    slots = slots_of(db, build.id)
    by_category_id = {s.category_id: s for s in slots}

    categories = {c.id: c for c in db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == build.profile_id).all()}
    for cat in categories.values():
        if not cat.is_required:
            continue
        slot = by_category_id.get(cat.id)
        if not slot or slot.mode == "hidden":
            errors.append(f'"{cat.name}" is required but is hidden or not configured in this build')
            continue
        if slot.mode in ("locked", "list") and not items_of(db, slot.id):
            errors.append(f'"{cat.name}" has no product selected')

    ensure_pc_builder_rules(db)
    rule_rows = (
        db.query(ConfiguratorCompatibilityRule)
        .filter(
            ConfiguratorCompatibilityRule.active.is_(True),
            ConfiguratorCompatibilityRule.configurator_profile_id.in_(pc_builder_profile_ids(None)),
        )
        .order_by(ConfiguratorCompatibilityRule.priority)
        .all()
    )
    rules = [{"id": r.id, "name": r.name, "body": load_rule_json(r.body_json, {})} for r in rule_rows]

    contexts: List[configurator_rule_engine.ComponentContext] = []
    for slot in slots:
        if slot.mode == "hidden":
            continue
        items = items_of(db, slot.id)
        default_item = next((i for i in items if i.is_default), items[0] if items else None)
        if not default_item:
            continue
        cat = categories.get(slot.category_id)
        component_profile_id = SLOT_TO_COMPONENT.get(cat.slug if cat else "")
        if not component_profile_id:
            continue
        from app.services.ecommerce.storefront_configurator_service import StorefrontConfiguratorService

        attrs = StorefrontConfiguratorService(db).attributes_for_product(default_item.product_id)
        contexts.append({"componentProfileId": component_profile_id, "attributes": attrs})

    result = configurator_rule_engine.evaluate_rules(rules, contexts)
    if result["status"] == "incompatible":
        for r in result["results"]:
            if r["status"] == "incompatible":
                errors.append(r["message"] or r["rule_name"])

    return errors


def _default_product_name(db: Session, slot: ReadyBuildSlot) -> Optional[str]:
    items = items_of(db, slot.id)
    default_item = next((i for i in items if i.is_default), items[0] if items else None)
    if not default_item:
        return None
    product = db.get(CatalogProduct, default_item.product_id)
    return product.name if product else None


def _detect_gpu_vendor(name: str) -> Optional[str]:
    text = name.lower()
    if any(h in text for h in ("rtx", "gtx", "nvidia", "geforce")):
        return "NVIDIA"
    if any(h in text for h in ("radeon", "rx 6", "rx 7", "rx 9")):
        return "AMD"
    return None


def build_brands(db: Session, build: ReadyBuild) -> Dict[str, Optional[str]]:
    """CPU/GPU vendor of this build's default selection — used for the
    storefront brand filter. CPU uses the same AMD/Intel name-sniff the
    Smart PC Builder slot matching already relies on; GPU uses its own
    chip-vendor sniff since detect_platform's hints are socket/chipset
    oriented and don't recognize NVIDIA."""
    from app.models.configurator_category import ConfiguratorCategory
    from app.services.ecommerce.storefront_configurator_service import detect_platform

    categories = {
        c.id: c
        for c in db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == build.profile_id).all()
    }
    cpu_brand: Optional[str] = None
    gpu_brand: Optional[str] = None
    for slot in slots_of(db, build.id):
        if slot.mode == "hidden":
            continue
        cat = categories.get(slot.category_id)
        if not cat:
            continue
        name = _default_product_name(db, slot)
        if not name:
            continue
        if cat.slug == "cpu":
            cpu_brand = detect_platform(name)
        elif cat.slug == "graphics-card":
            gpu_brand = _detect_gpu_vendor(name)
    return {"cpu_brand": cpu_brand, "gpu_brand": gpu_brand}


def list_published(
    db: Session,
    profile_id: str,
    *,
    tag: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    cpu_brand: Optional[str] = None,
    gpu_brand: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Storefront listing — published builds with their default-selection
    totals, filtered by tag/price/CPU-GPU brand."""
    rows = list_builds(db, profile_id=profile_id, status="published")
    out = []
    for build in rows:
        tags = json.loads(build.tags_json or "[]")
        if tag and tag not in tags:
            continue
        totals = compute_totals(db, build)
        if min_price is not None and totals["final"] < min_price:
            continue
        if max_price is not None and totals["final"] > max_price:
            continue
        brands = build_brands(db, build)
        if cpu_brand and (brands["cpu_brand"] or "").lower() != cpu_brand.lower():
            continue
        if gpu_brand and (brands["gpu_brand"] or "").lower() != gpu_brand.lower():
            continue
        out.append({"build": build, "tags": tags, "totals": totals, "brands": brands})
    return out


def resolve_selection(
    db: Session,
    build: ReadyBuild,
    selection: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Final category_id -> product_id for every non-hidden slot: the
    customer's pick for list/any slots when given, else the slot default."""
    resolved: List[Dict[str, Any]] = []
    for slot in slots_of(db, build.id):
        if slot.mode == "hidden":
            continue
        items = items_of(db, slot.id)
        default_item = next((i for i in items if i.is_default), items[0] if items else None)
        product_id = default_item.product_id if default_item else None
        if slot.mode in ("list", "any") and slot.category_id in selection and selection[slot.category_id]:
            product_id = selection[slot.category_id]
        if product_id:
            resolved.append({"category_id": slot.category_id, "product_id": product_id})
    return resolved


def publish_build(db: Session, build_id: str) -> ReadyBuild:
    build = get_build(db, build_id)
    errors = validate_for_publish(db, build)
    if errors:
        raise ReadyBuildError("; ".join(errors))
    build.status = "published"
    db.commit()
    db.refresh(build)
    return build
