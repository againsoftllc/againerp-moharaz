"""Admin Overview for the Smart PC Builder: per-slot product counts and a
product-by-product list of what an admin has to fix so the slots and rules work.

Reads only — nothing here writes to the catalog. Issue kinds:

  missing  a product in the slot's catalog category fell out of the slot because
           the slot's main identifying spec is empty
  profile  a product from another slot has a value for this slot's identifying
           spec but isn't in this slot (e.g. a motherboard carrying "Memory Type")
  rule     a product in the slot lacks a spec some active rule compares
  lookup   a product's chipset isn't in the chipset lookup table
  alias    a product's value is spelled inconsistently with the same value on
           other products (or uses Bengali characters) and has no alias yet
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_category_product_override import ConfiguratorCategoryProductOverride
from app.models.configurator_compatibility_rule import ConfiguratorCompatibilityRule, load_json
from app.models.configurator_profile import ConfiguratorProfile
from app.services import configurator_attribute_resolver
from app.services.ecommerce.storefront_configurator_service import ConfiguratorError, StorefrontConfiguratorService
from app.services.pc_builder_rules import SLOT_TO_COMPONENT, pc_builder_profile_ids

_BENGALI = re.compile(r"[ঀ-৿]")
_MULTI = re.compile(r"[,|/]")
# Fields the chipset lookup supplies — when one of these is empty on a board
# that has a chipset, the real problem is a missing lookup row, not a missing spec.
_LOOKUP_FIELDS = {"socket", "socket_support", "supported_generations", "bios_update_generations"}


def _norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _pretty(code: str) -> str:
    return code.replace("_", " ").strip().title() if code else code


def _json_list(raw: Optional[str]) -> List[Any]:
    try:
        data = json.loads(raw or "[]")
    except ValueError:
        return []
    return data if isinstance(data, list) else []


def _rule_fields_by_component(db: Session, profile_slug: str) -> Dict[str, List[Tuple[str, Optional[Dict[str, Any]]]]]:
    """component profile id -> [(field_code, when)] for every active rule operand
    on that component. `when` is the rule's own gate (e.g. cooler type = Air) so
    a product the gate excludes isn't asked for a spec the rule never reads."""
    rows = (
        db.query(ConfiguratorCompatibilityRule)
        .filter(
            ConfiguratorCompatibilityRule.active.is_(True),
            ConfiguratorCompatibilityRule.configurator_profile_id.in_(pc_builder_profile_ids(profile_slug)),
        )
        .all()
    )
    out: Dict[str, List[Tuple[str, Optional[Dict[str, Any]]]]] = {}
    for row in rows:
        body = load_json(row.body_json, {})
        when = body.get("when") or None
        for cond in body.get("conditions", []):
            for side in ("left", "right"):
                operand = cond.get(side) or {}
                pid, field = operand.get("profileId"), operand.get("fieldCode")
                if pid and field and not str(field).startswith("__"):
                    out.setdefault(pid, []).append((field, when))
    return out


def overview_slots(db: Session, profile_slug: str = "pc-builder") -> List[Dict[str, Any]]:
    """The profile's active slots, without any product work — the Overview shows these at once and then
    loads each slot's numbers with build_overview(slot_id=…)."""
    profile: ConfiguratorProfile = StorefrontConfiguratorService(db).get_profile(profile_slug)
    rows = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == profile.id, ConfiguratorCategory.status == "active")
        .order_by(ConfiguratorCategory.sort_order, ConfiguratorCategory.name)
        .all()
    )
    return [{"id": c.id, "slug": c.slug, "name": c.name, "icon": c.icon, "required": bool(c.is_required)} for c in rows]


def build_overview(db: Session, profile_slug: str = "pc-builder", slot_id: Optional[str] = None) -> Dict[str, Any]:
    """All slots, or only `slot_id` (the Overview loads slot by slot so the page fills in as it goes). For one
    slot, the other slots are only read when they have an identifying spec (for the "profile" issues)."""
    svc = StorefrontConfiguratorService(db)
    profile: ConfiguratorProfile = svc.get_profile(profile_slug)
    categories: List[ConfiguratorCategory] = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == profile.id, ConfiguratorCategory.status == "active")
        .order_by(ConfiguratorCategory.sort_order, ConfiguratorCategory.name)
        .all()
    )

    overrides: Dict[Tuple[str, str], str] = {
        (o.category_id, o.product_id): o.action
        for o in db.query(ConfiguratorCategoryProductOverride)
        .filter(ConfiguratorCategoryProductOverride.category_id.in_([c.id for c in categories] or [""]))
        .all()
    }
    lookup_ctx = configurator_attribute_resolver.ResolverContext.load(db)

    def in_lookup(chipset: str) -> bool:
        # matched the way the resolver matches it ("Intel B760" → B760, "X870E" → X870)
        return configurator_attribute_resolver.chipset_row(lookup_ctx, chipset) is not None
    rule_fields = _rule_fields_by_component(db, profile_slug)
    attr_labels: Dict[str, str] = {
        (a.code or "").strip(): a.name for a in db.query(CatalogAttribute).all() if (a.code or "").strip() and a.name
    }

    def label(code: str) -> str:
        return attr_labels.get(code) or _pretty(code)

    def entry_field(cat: ConfiguratorCategory) -> Optional[str]:
        conds = _json_list(cat.conditions_json)
        return conds[0].get("f") if conds and isinstance(conds[0], dict) else None

    # Attributes are resolved through the same pipeline the storefront uses
    # (stored spec -> inference -> override -> alias -> chipset lookup), once per product.
    attr_cache: Dict[str, Dict[str, str]] = {}

    def attrs_for(views: List[Any]) -> None:
        todo = [v for v in views if v.id not in attr_cache]
        if not todo:
            return
        attr_map = svc.attribute_map([v.id for v in todo])
        for v in todo:
            attr_cache[v.id] = svc._view_specs_and_attributes(v, attr_map)[1]

    reported = [c for c in categories if c.id == slot_id] if slot_id else categories
    if slot_id and not reported:
        raise ConfiguratorError("Slot not found")
    reported_ids = {c.id for c in reported}

    base_by_cat: Dict[str, List[Any]] = {}
    shown_by_cat: Dict[str, List[Dict[str, Any]]] = {}
    for cat in categories:
        if cat.id not in reported_ids and not entry_field(cat):
            continue  # neither reported nor part of the "profile" pool below
        base = svc.slot_base_views(cat, limit=200)
        base_by_cat[cat.id] = base
        if cat.id in reported_ids:
            shown_by_cat[cat.id] = svc.list_slot_products(profile, cat.slug, limit=200)
        attrs_for(base)

    # Pool for "profile" issues: products that belong to some slot that has an
    # identifying spec. Slots with no condition (monitor, keyboard…) have no
    # spec to confuse them with, so they stay out of the pool.
    pool: Dict[str, Tuple[Any, str]] = {}
    for cat in categories:
        if not entry_field(cat):
            continue
        for v in base_by_cat[cat.id]:
            pool.setdefault(v.id, (v, cat.name))

    slots_out: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []

    for cat in reported:
        shown = shown_by_cat[cat.id]
        shown_ids = {p["id"] for p in shown}
        base_ids = {v.id for v in base_by_cat[cat.id]}
        entry = entry_field(cat)
        slot_issues: List[Dict[str, Any]] = []

        def add(kind: str, pid: str, pname: str, field: Optional[str], **extra: Any) -> None:
            slot_issues.append(
                {
                    "kind": kind,
                    "slot_id": cat.id,
                    "slot_name": cat.name,
                    "product_id": pid,
                    "product_name": pname,
                    "field_code": field,
                    "field_label": label(field) if field else None,
                    **extra,
                }
            )

        if entry:
            # missing: in this slot's category but dropped for an empty identifying spec
            for v in base_by_cat[cat.id]:
                if v.id in shown_ids or overrides.get((cat.id, v.id)) in ("exclude", "ignore"):
                    continue
                if not str(attr_cache.get(v.id, {}).get(entry, "")).strip():
                    add("missing", v.id, v.name, entry)

            # profile: another slot's product that carries this slot's identifying spec
            for pid, (view, home) in pool.items():
                if pid in base_ids or pid in shown_ids or overrides.get((cat.id, pid)) in ("exclude", "ignore"):
                    continue
                pattrs = attr_cache.get(pid, {})
                # A board's socket comes from the chipset lookup, not from its own spec,
                # so it isn't evidence the board belongs in a CPU/cooler slot.
                if entry in _LOOKUP_FIELDS and str(pattrs.get("chipset", "")).strip():
                    continue
                value = str(pattrs.get(entry, "")).strip()
                if value:
                    add("profile", pid, view.name, entry, from_slot=home, value=value)

        component = SLOT_TO_COMPONENT.get(cat.slug)
        needed = rule_fields.get(component or "", [])
        seen_fields: Set[str] = set()
        for field, _when in needed:
            seen_fields.add(field)

        # Majority spelling per (field, normalised key) across the slot, for the alias check.
        checked_fields = ([entry] if entry else []) + sorted(seen_fields - {entry or ""})
        spellings: Dict[Tuple[str, str], Counter] = {}
        for p in shown:
            for field in checked_fields:
                value = str(p["attributes"].get(field, "")).strip()
                if value and not _MULTI.search(value):
                    spellings.setdefault((field, _norm_key(value)), Counter())[value] += 1

        for p in shown:
            attrs = p["attributes"]
            # the Chipset Lookup is the motherboard's (a graphics card's "chipset" is its GPU)
            chipset = str(attrs.get("chipset", "")).strip() if component == "cap_mobo" else ""
            lookup_flagged = False

            # rule: a spec some active rule compares is empty on this product
            for field, when in needed:
                if when and when.get("profileId") == component:
                    if _norm_key(str(attrs.get(when.get("fieldCode", ""), ""))) != _norm_key(str(when.get("value", ""))):
                        continue
                if str(attrs.get(field, "")).strip():
                    continue
                if field in _LOOKUP_FIELDS and chipset:
                    if not in_lookup(chipset) and not lookup_flagged:
                        add("lookup", p["id"], p["name"], "chipset", value=chipset)
                        lookup_flagged = True
                    continue
                if not any(i["kind"] == "rule" and i["product_id"] == p["id"] and i["field_code"] == field for i in slot_issues):
                    add("rule", p["id"], p["name"], field)

            if chipset and not in_lookup(chipset) and not lookup_flagged:
                add("lookup", p["id"], p["name"], "chipset", value=chipset)

            # alias: messy spelling of a value other products spell consistently
            for field in checked_fields:
                value = str(attrs.get(field, "")).strip()
                if not value or _MULTI.search(value):
                    continue
                group = spellings.get((field, _norm_key(value)))
                canonical = group.most_common(1)[0][0] if group else value
                if _BENGALI.search(value):
                    add("alias", p["id"], p["name"], field, value=value, suggested="" if value == canonical else canonical)
                elif group and len(group) > 1 and value != canonical:
                    add("alias", p["id"], p["name"], field, value=value, suggested=canonical)

        problem_ids = {i["product_id"] for i in slot_issues if i["kind"] != "profile"}
        ready = [p for p in shown if p["id"] not in problem_ids]
        slots_out.append(
            {
                "id": cat.id,
                "slug": cat.slug,
                "name": cat.name,
                "icon": cat.icon,
                "required": bool(cat.is_required),
                "shown": len(shown),
                "ready_pct": round(len(ready) / len(shown) * 100) if shown else 0,
                "issue_count": len(slot_issues),
            }
        )
        issues.extend(slot_issues)

    return {"slots": slots_out, "issues": issues, "total": len(issues)}
