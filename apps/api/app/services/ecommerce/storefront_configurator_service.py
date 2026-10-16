"""Storefront PC / product configurator — reads configurator_* + catalog products."""

from __future__ import annotations

import json
import re
import secrets
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.configurator_build import ConfiguratorBuild
from app.models.configurator_compatibility_rule import ConfiguratorCompatibilityRule, load_json as load_rule_json
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_template import ConfiguratorTemplate, dump_components
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.services.builder_slot_packs import (
    PC_BUILDER_CATEGORY_DEFS,
    PC_SLOT_CATALOG_SLUGS,
    ensure_builder_slots_for_profile,
)
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService, StorefrontProductView
from app.services.ecommerce.storefront_cart_service import StorefrontCartService
from app.models.storefront_cart import StorefrontCart
from app.models.platform_setting import PlatformSetting
from app.services import (
    configurator_attribute_resolver,
    configurator_derived_fields,
    configurator_field_sources as field_sources,
    configurator_researched_specs,
    configurator_rule_engine,
    configurator_slot_guard,
)
from app.services.pc_builder_rules import SLOT_TO_COMPONENT, ensure_pc_builder_rules, pc_builder_profile_ids

# Re-export for callers that imported PC_BUILDER_CATEGORY_DEFS from this module.
__all__ = ["PC_BUILDER_CATEGORY_DEFS", "StorefrontConfiguratorService", "ConfiguratorError"]

# the storefront slot listing's default size (GET …/categories/{slot}/listing)
SLOT_LISTING_LIMIT = 2000

# Old seed slugs → current storefront slugs
_SLUG_ALIASES = {
    "ram": "memory",
    "gpu": "graphics-card",
    "psu": "power-supply",
    "case": "casing",
    "cooler": "cpu-cooler",
}

_SLOT_EXCLUDES: Dict[str, Sequence[str]] = {
    "cpu": ("motherboard", "laptop", "notebook"),
    "cpu-cooler": ("case fan", "casing cooler", "phone cooler", "power supply", "mwe", "td500", "mid tower"),
    "casing-cooler": ("cpu cooler", "air cooler", "hyper 212", "aio"),
    "memory": ("gddr", "graphics card"),
    "graphics-card": ("laptop",),
}
_SLOT_KEYWORDS: Dict[str, Sequence[str]] = {
    "cpu": ("ryzen", "core i", "14700", "14600", "7800x3d", "7950", "processor"),
    "motherboard": ("motherboard", "b650", "b760", "b550", "z790", "x670", "tomahawk"),
    "cpu-cooler": ("cpu cooler", "aio", "hyper 212", "liquid cooler", "peerless", "ak620", "h100i", "air cooler"),
    "memory": ("ddr5", "ddr4", "vengeance", "memory kit", "dimm", "desktop ram"),
    "storage": ("nvme", "ssd", "990 pro", "hdd", "solid state"),
    "graphics-card": ("rtx", "gtx", "radeon", "geforce", "rx 7600"),
    "power-supply": ("psu", "power supply", "rm750", "rm850", "mwe", "80+ gold", "80+ bronze"),
    "casing": ("mid tower", "full tower", "mini tower", "nzxt h", "lian li", "pc case", "gaming case", "atx case", "td500"),
    "casing-cooler": ("case fan", "casing cooler", "fc120", "rgb fan", "cooling fan"),
    "monitor": ("monitor", "ultrawide", "odyssey"),
    "keyboard": ("keyboard", "keychron", "mechanical"),
    "mouse": ("mouse", "g502", "mx master", "deathadder", "gaming mouse"),
    "headphone": ("headphone", "headset", "wh-1000"),
    "ups": ("ups", "uninterruptible", "back-ups", "power backup"),
    # CCTV slots
    "dvr-nvr": ("dvr", "nvr", "recorder", "xvr"),
    "cameras": ("camera", "cctv", "ip camera", "dome", "bullet"),
    "hdd-storage": ("surveillance hdd", "purple", "skyhawk", "hdd", "hard disk"),
    "poe-switch": ("poe", "poe switch", "network switch"),
    "cable": ("cat6", "rg59", "cctv cable", "network cable"),
    "power-adapter": ("power adapter", "12v", "adapter"),
    "connector": ("bnc", "dc jack", "connector", "rj45"),
}


class ConfiguratorError(Exception):
    pass


def _token_match(hay: str, keyword: str) -> bool:
    """Substring match with word boundaries for short/ambiguous keywords."""
    key = keyword.lower().strip()
    if not key:
        return False
    if len(key) <= 3 or key in {"ram", "cpu", "gpu", "ssd", "hdd", "aio", "ups", "psu"}:
        return re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", hay) is not None
    return key in hay


def detect_platform(name: str, brand: str = "") -> Optional[str]:
    text = f"{name} {brand}".lower()
    amd_hints = ("amd", "ryzen", "b650", "x670", "b550", "am5", "am4")
    intel_hints = ("intel", "core i", "z790", "b760", "z690", "lga", "14700", "14600", "14100")
    if any(h in text for h in amd_hints):
        return "AMD"
    if any(h in text for h in intel_hints):
        return "Intel"
    return None


_LABEL_TO_CODE = {
    "socket": "socket",
    "cpu_socket": "socket",
    "supported_cpu": "socket",
    "processor_socket": "socket",
    "ram_type": "ram_type",
    "ram_support": "ram_type",
    "memory_type": "ram_type",
    "supported_ram": "ram_type",
    "type": "type",
    "tdp": "tdp",
    "ppt": "tdp",
    "wattage": "wattage",
    "socket_support": "socket_support",
    "supported_socket": "socket_support",
    "form_factor": "form_factor",
    "speed": "speed",
    "max_ram_speed": "speed",
    # Fields the older "Casing" attribute profile already carries, read as the builder's own
    # casing fields so those products don't have to be filled in twice.
    "maximum_cpu_cooler_height": "case_max_cooler_height",
    "maximum_graphics_card_length": "case_max_gpu_length",
    "motherboard_support": "case_motherboard_support",
}


# fields _normalize_builder_value reads into a known token (am5, ddr5 …)
_TOKEN_FIELDS = {"socket", "socket_support", "ram_type", "type"}


def _normalize_builder_value(code: str, raw: str) -> str:
    text = raw.strip()
    low = text.lower()
    if code == "socket_support":
        # Multi-value field (a cooler can list several sockets) — keep every
        # match, not just the first, or a universal cooler silently loses
        # every socket but one and gets marked incompatible for the rest.
        if "universal" in low:
            return "universal"
        found = []
        if "am5" in low:
            found.append("am5")
        if "am4" in low:
            found.append("am4")
        if "1700" in low:
            found.append("lga_1700")
        if "1851" in low:
            found.append("lga_1851")
        if found:
            return ",".join(found)
    if code == "socket":
        if "universal" in low:
            return "universal"
        if "am5" in low:
            return "am5"
        if "am4" in low:
            return "am4"
        if "1700" in low:
            return "lga_1700"
        if "1851" in low:
            return "lga_1851"
    if code in {"ram_type", "type"}:
        found = []
        if "ddr5" in low:
            found.append("ddr5")
        if "ddr4" in low:
            found.append("ddr4")
        if found:
            return ",".join(found)
    if code in {"case_max_cooler_height", "case_max_gpu_length"}:
        match = re.search(r"(\d{2,4})", text.replace(",", ""))
        if match:
            return match.group(1)
    if code in {"tdp", "wattage", "speed"}:
        match = re.search(r"(\d{2,5})", text.replace(",", ""))
        if match:
            return match.group(1)
    return text


def _infer_from_text(*parts: str) -> Dict[str, str]:
    hay = " ".join(p for p in parts if p).lower()
    out: Dict[str, str] = {}
    if re.search(r"\bam5\b|ryzen\s*[579]\s*[78]\d{3}|b650|x670|b850", hay):
        out["socket"] = "am5"
    elif re.search(r"\bam4\b|ryzen\s*[579]\s*[35]\d{3}|b550|x570", hay):
        out["socket"] = "am4"
    elif re.search(r"lga\s*1700|14[0-9]{3}k|14[0-9]{3}f|13[0-9]{3}|z790|b760|z690", hay):
        out["socket"] = "lga_1700"
    if "ddr5" in hay or re.search(r"\b(z790|b760|b650|x670|b850)\b", hay):
        out["ram_type"] = "ddr5"
        out["type"] = "ddr5"
    elif "ddr4" in hay or re.search(r"\b(z690|b660|b550|x570|a520)\b", hay):
        out["ram_type"] = "ddr4"
        out["type"] = "ddr4"
    watt = re.search(r"(\d{3,4})\s*w\b", hay)
    if watt:
        out["wattage"] = watt.group(1)
    tdp = re.search(r"\btdp[:\s]+(\d{2,3})", hay)
    if tdp:
        out["tdp"] = tdp.group(1)
    return out


def _builder_attributes(
    stored: Dict[str, str],
    *,
    name: str,
    brand: str,
    specs: List[str],
    extra_pairs: Optional[List[tuple[str, str]]] = None,
    product_id: Optional[str] = None,
) -> Dict[str, str]:
    attrs: Dict[str, str] = {}

    def put(code: str, value: str) -> None:
        normalized = _normalize_builder_value(code, value)
        # Several labels feed one field (socket ← Socket, Supported CPU …). Free text the field can't read
        # ("Supports AMD Ryzen 9000/8000/7000 Series") never replaces a value it could ("am5").
        if code in _TOKEN_FIELDS and normalized == value.strip() and attrs.get(code):
            return
        attrs[code] = normalized

    for key, value in stored.items():
        code = _LABEL_TO_CODE.get(key.lower().replace(" ", "_"), key)
        if value:
            put(code, value)
    for label, value in extra_pairs or []:
        code = _LABEL_TO_CODE.get(label.lower().replace(" ", "_"))
        if code and value:
            put(code, value)
    inferred = _infer_from_text(name, brand, " ".join(specs))
    for key, value in inferred.items():
        attrs.setdefault(key, value)
    if "ram_type" in attrs and "type" not in attrs:
        attrs["type"] = attrs["ram_type"]
    if "type" in attrs and "ram_type" not in attrs:
        attrs["ram_type"] = attrs["type"]
    if "socket" in attrs and "socket_support" not in attrs:
        attrs["socket_support"] = attrs["socket"]
    # values looked up on the maker's spec page, where the catalog has none
    for key, value in (configurator_researched_specs.for_product(product_id) if product_id else {}).items():
        if not str(attrs.get(key) or "").strip():
            attrs[key] = value
    # rule fields the product's other specs / name can answer (TDP, iGPU, RAM slots, GPU length …)
    return configurator_derived_fields.derive(attrs, stored, name)


def _discount_pct(price: Decimal, compare: Optional[Decimal]) -> int:
    if not compare or compare <= price or price <= 0:
        return 0
    return int(round(((compare - price) / compare) * 100))


def _short_spec_lines(raw: Optional[str], limit: int = 5) -> List[str]:
    if not raw or not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    lines: List[str] = []

    def add(label: str, value: str) -> None:
        text = f"{label} {value}".strip() if label and value else (value or label).strip()
        if text:
            lines.append(text)

    if isinstance(data, dict):
        attrs = data.get("customAttrs")
        if isinstance(attrs, list):
            for attr in attrs:
                if not isinstance(attr, dict):
                    continue
                add(str(attr.get("name") or "").strip(), str(attr.get("value") or "").strip())
                if len(lines) >= limit:
                    return lines
        for key in ("specs", "items", "lines"):
            blob = data.get(key)
            if isinstance(blob, list):
                data = blob
                break
    if isinstance(data, list):
        for item in data:
            if isinstance(item, str):
                add("", item)
            elif isinstance(item, dict):
                add(
                    str(item.get("name") or item.get("label") or "").strip(),
                    str(item.get("value") or "").strip(),
                )
            if len(lines) >= limit:
                break
    return lines[:limit]


def _catalog_slugs_for_slot(category: ConfiguratorCategory) -> List[str]:
    ordered: List[str] = []
    bound = (getattr(category, "catalog_category_slug", None) or "").strip()
    if bound:
        ordered.append(bound)
    for slug in PC_SLOT_CATALOG_SLUGS.get(category.slug, ()):
        if slug not in ordered:
            ordered.append(slug)
    if category.slug not in ordered:
        ordered.append(category.slug)
    return ordered


class StorefrontConfiguratorService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._items = EcommerceItemService(db)
        self._prefetched: List[Any] = []
        self._base_views: Dict[Any, List[StorefrontProductView]] = {}
        self._attrs: Dict[str, Any] = {}

    def ensure_pc_builder_categories(self, profile: ConfiguratorProfile) -> None:
        """Align builder slots with packs (PC / CCTV / …). Idempotent."""
        ensure_builder_slots_for_profile(self._db, profile)
        self._db.commit()

    def get_profile(self, slug: str) -> ConfiguratorProfile:
        from app.models.configurator_category import ensure_configurator_category_catalog_column

        ensure_configurator_category_catalog_column()
        profile = (
            self._db.query(ConfiguratorProfile)
            .filter(ConfiguratorProfile.slug == slug)
            .first()
        )
        if not profile or profile.status not in ("active", "published"):
            raise ConfiguratorError("Configurator profile not found")
        return profile

    def list_categories(self, profile: ConfiguratorProfile) -> List[ConfiguratorCategory]:
        return (
            self._db.query(ConfiguratorCategory)
            .filter(
                ConfiguratorCategory.profile_id == profile.id,
                ConfiguratorCategory.status == "active",
            )
            .order_by(ConfiguratorCategory.sort_order, ConfiguratorCategory.name)
            .all()
        )

    def get_category(self, profile: ConfiguratorProfile, category_slug: str) -> ConfiguratorCategory:
        slug = _SLUG_ALIASES.get(category_slug, category_slug)
        row = (
            self._db.query(ConfiguratorCategory)
            .filter(
                ConfiguratorCategory.profile_id == profile.id,
                ConfiguratorCategory.slug == slug,
                ConfiguratorCategory.status == "active",
            )
            .first()
        )
        if not row:
            raise ConfiguratorError("Category not found")
        return row

    def _published_views(self) -> List[StorefrontProductView]:
        rows = (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.publish_status == "published")
            .order_by(EcommerceItem.sort_order, EcommerceItem.slug)
            .limit(500)
            .all()
        )
        # Batch cache warm-up exists only in item services that implement it.
        preload = getattr(self._items, "preload_for_items", None)
        if preload:
            preload(rows)
        views: List[StorefrontProductView] = []
        for ec in rows:
            view = self._items.resolve_storefront_from_ecommerce(ec)
            if view:
                views.append(view)
        return views

    def _matches_slot(self, view: StorefrontProductView, category_slug: str) -> bool:
        keywords = _SLOT_KEYWORDS.get(category_slug)
        if not keywords:
            return False
        hay = f"{view.name} {view.brand} {view.slug}".lower()
        if any(_token_match(hay, k) for k in _SLOT_EXCLUDES.get(category_slug, ())):
            return False
        return any(_token_match(hay, k) for k in keywords)

    def _is_pc_part_candidate(self, view: StorefrontProductView, category_slug: str) -> bool:
        """Drop China/marketplace noise that keyword-matches (laptops as CPUs, etc.)."""
        hay = f"{view.name} {view.slug}".lower()
        if category_slug in {
            "cpu",
            "motherboard",
            "cpu-cooler",
            "memory",
            "storage",
            "graphics-card",
            "power-supply",
            "casing",
            "casing-cooler",
            "headphone",
            "monitor",
            "keyboard",
            "mouse",
            "ups",
        }:
            blocked = (
                "laptop",
                "notebook",
                "netbook",
                "phone case",
                "phone cooler",
                "mobile phone",
                "iphone",
                "huawei",
                "sunglasses",
                "ear clip",
                "hot-selling",
                "e-commerce product",
            )
            if any(b in hay for b in blocked):
                return False
            allowed_cats = {
                "components",
                "storage",
                "accessories",
                "monitors",
                "audio",
                "networking",
                "computers",
            }
            cat = (view.category or "").strip().lower()
            if cat and cat not in allowed_cats and not any(a in cat for a in allowed_cats):
                brands = {
                    "amd",
                    "intel",
                    "asus",
                    "msi",
                    "corsair",
                    "samsung",
                    "nzxt",
                    "cooler master",
                    "deepcool",
                    "gigabyte",
                    "asrock",
                    "evga",
                    "seasonic",
                    "lian li",
                    "thermaltake",
                    "lg",
                    "keychron",
                    "logitech",
                    "sony",
                    "apc",
                }
                if (view.brand or "").strip().lower() not in brands:
                    return False
        return True

    def _apply_category_overrides(
        self, category_id: str, views: List[StorefrontProductView]
    ) -> List[StorefrontProductView]:
        """Admin-forced per-slot include/exclude, layered on top of the
        keyword matching above. A category with no rows here is unchanged."""
        from app.models.configurator_category_product_override import (
            ConfiguratorCategoryProductOverride,
        )

        rows = (
            self._db.query(ConfiguratorCategoryProductOverride)
            .filter(ConfiguratorCategoryProductOverride.category_id == category_id)
            .all()
        )
        if not rows:
            return views

        excluded = {r.product_id for r in rows if r.action == "exclude"}
        included = [r.product_id for r in rows if r.action == "include"]

        result = [v for v in views if v.id not in excluded]
        present = {v.id for v in result}
        for product_id in included:
            if product_id in present:
                continue
            ec = (
                self._db.query(EcommerceItem)
                .filter(EcommerceItem.catalog_product_id == product_id)
                .first()
            )
            view = self._items.resolve_storefront_from_ecommerce(ec) if ec else None
            if view:
                result.append(view)
                present.add(view.id)
        return result

    def _ecommerce_in_category(self, category_id: str, *, search: Optional[str], limit: int) -> List[EcommerceItem]:
        from app.models.item import Item
        from app.services.ecommerce.constants import STOREFRONT_LIVE_STATUSES

        query = (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                EcommerceItem.visibility == "public",
                or_(
                    EcommerceItem.primary_category_id == category_id,
                    EcommerceItem.item_id.in_(
                        self._db.query(EcommerceItemCategory.item_id).filter(
                            EcommerceItemCategory.category_id == category_id,
                        )
                    ),
                    EcommerceItem.catalog_product_id.in_(
                        self._db.query(CatalogProduct.id).filter(CatalogProduct.category_id == category_id)
                    ),
                ),
            )
        )
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(Item.name.ilike(term) | EcommerceItem.slug.ilike(term) | Item.sku.ilike(term))
        return query.order_by(EcommerceItem.sort_order, EcommerceItem.slug).limit(max(limit, 24)).all()

    def _ecommerce_in_profile(self, profile_id: str, *, search: Optional[str], limit: int) -> List[EcommerceItem]:
        """Live storefront products whose catalog product carries this attribute profile."""
        from app.models.item import Item
        from app.services.ecommerce.constants import STOREFRONT_LIVE_STATUSES

        query = (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                EcommerceItem.visibility == "public",
                EcommerceItem.catalog_product_id.in_(
                    self._db.query(CatalogProduct.id).filter(CatalogProduct.attribute_profile_id == profile_id)
                ),
            )
        )
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(Item.name.ilike(term) | EcommerceItem.slug.ilike(term) | Item.sku.ilike(term))
        return query.order_by(EcommerceItem.sort_order, EcommerceItem.slug).limit(max(limit, 24)).all()

    def attribute_map(self, product_ids: List[str]) -> Dict[str, Any]:
        """StorefrontCatalogService.all_attributes_for_products, each product read once per service (one
        request) — the admin Overview needs the same products' attributes for several steps."""
        from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

        missing = [pid for pid in dict.fromkeys(product_ids) if pid not in self._attrs]
        if missing:
            found = StorefrontCatalogService(self._db).all_attributes_for_products(missing)
            for pid in missing:
                self._attrs[pid] = found.get(pid)
        return {pid: self._attrs[pid] for pid in product_ids if self._attrs.get(pid) is not None}

    def _prefetch_for_views(self, rows: List[EcommerceItem]) -> None:
        """Loads what resolve_storefront_from_ecommerce looks up one row at a time (catalog product, item,
        brand, category) in one query per table, so its session.get() calls are served from the session
        instead of a query each (the PC Builder overview resolves thousands of rows)."""
        from app.models.catalog_brand import CatalogBrand
        from app.models.catalog_category import CatalogCategory
        from app.models.item import Item

        wanted = (
            (CatalogProduct, {r.catalog_product_id for r in rows if r.catalog_product_id}),
            (Item, {r.item_id for r in rows if r.item_id}),
            (CatalogBrand, {r.brand_id for r in rows if r.brand_id}),
            (CatalogCategory, {r.primary_category_id for r in rows if r.primary_category_id}),
        )
        for model, ids in wanted:
            ids = list(ids)
            for i in range(0, len(ids), 1000):
                # kept on the service: the session only holds loaded rows weakly
                self._prefetched.extend(self._db.query(model).filter(model.id.in_(ids[i : i + 1000])).all())

    def _views_from_rows(self, rows: List[EcommerceItem]) -> List[StorefrontProductView]:
        views: List[StorefrontProductView] = []
        seen: set[str] = set()
        self._prefetch_for_views(rows)
        for ec in rows:
            view = self._items.resolve_storefront_from_ecommerce(ec)
            if view and view.id not in seen:
                seen.add(view.id)
                views.append(view)
        return views

    def _keyword_scan(self, slot_slug: str, *, search: Optional[str], limit: int) -> List[StorefrontProductView]:
        from app.models.item import Item
        from app.services.ecommerce.constants import STOREFRONT_LIVE_STATUSES

        keywords = _SLOT_KEYWORDS.get(slot_slug) or ()
        if not keywords:
            return []
        name_filters = [Item.name.ilike(f"%{k}%") for k in keywords if k]
        query = (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                EcommerceItem.visibility == "public",
                or_(*name_filters),
            )
        )
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(Item.name.ilike(term) | EcommerceItem.slug.ilike(term))
        rows = query.order_by(EcommerceItem.sort_order, EcommerceItem.slug).limit(80).all()
        return [
            v
            for v in self._views_from_rows(rows)
            if self._matches_slot(v, slot_slug) and self._is_pc_part_candidate(v, slot_slug)
        ][:limit]

    def list_slot_products(
        self,
        profile: ConfiguratorProfile,
        category_slug: str,
        *,
        search: Optional[str] = None,
        platform: Optional[str] = None,
        limit: int = 100,
        conditions_override: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """conditions_override: used only by the admin slot-editor's live
        preview, to evaluate a DRAFT (not-yet-saved) condition list against
        real data without writing it — None means "use the category's own
        saved conditions_json" (the real, normal path)."""
        category = self.get_category(profile, category_slug)
        slug = category.slug

        views = self.slot_base_views(category, search=search, limit=limit)

        # Phase 4 Stage B: real per-slot conditions (field/operator/value
        # against the same resolved attributes the rule engine reads),
        # replacing keyword-only matching for slots that have them defined.
        # Resolve specs/attributes once here so a passing view doesn't pay
        # for it twice below.
        return self._finish_slot_products(
            category, views, platform=platform, limit=limit, conditions_override=conditions_override
        )

    def slot_base_views(
        self,
        category: ConfiguratorCategory,
        *,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[StorefrontProductView]:
        """_slot_base_views, worked out once per slot for this service (one request): the admin Overview asks for
        a slot's base list and then its final list, which starts from the same base."""
        key = (category.id, search or "", limit)
        if key not in self._base_views:
            self._base_views[key] = self._slot_base_views(category, search=search, limit=limit)
        return list(self._base_views[key])

    def _slot_base_views(
        self,
        category: ConfiguratorCategory,
        *,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[StorefrontProductView]:
        """Products that could belong to a slot before its AND-conditions and
        include/exclude overrides apply — the catalog category bound to the
        slot, narrowed by the slot keywords. Admin Overview diffs this against
        the final list to find products that fall out because a spec is empty."""
        # a product filed under the wrong category / profile (a webcam under Motherboard) stays out
        return [v for v in self._slot_base_views_unguarded(category, search=search, limit=limit)
                if configurator_slot_guard.belongs(category.slug, v.name)]

    def _slot_base_views_unguarded(
        self,
        category: ConfiguratorCategory,
        *,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[StorefrontProductView]:
        profile_id = (getattr(category, "attribute_profile_id", None) or "").strip()
        if profile_id:
            # The attribute profile is authoritative: every product that carries it, whatever its category.
            return self._views_from_rows(self._ecommerce_in_profile(profile_id, search=search, limit=limit))

        from app.models.catalog_category import CatalogCategory

        slug = category.slug
        views: List[StorefrontProductView] = []
        seen: set[str] = set()
        for catalog_slug in _catalog_slugs_for_slot(category):
            catalog_cat = (
                self._db.query(CatalogCategory)
                .filter(CatalogCategory.slug == catalog_slug)
                .order_by(CatalogCategory.sort_order.asc())
                .first()
            )
            if not catalog_cat:
                continue
            for view in self._views_from_rows(
                self._ecommerce_in_category(catalog_cat.id, search=search, limit=limit)
            ):
                if view.id in seen:
                    continue
                seen.add(view.id)
                views.append(view)
            if views:
                break

        if _SLOT_KEYWORDS.get(slug):
            matched = [v for v in views if self._matches_slot(v, slug)]
            # Category tags are often copied onto every sibling (CPU slot showing PSUs).
            views = matched
            if len(views) < min(3, limit):
                for extra in self._keyword_scan(slug, search=search, limit=limit):
                    if extra.id in {v.id for v in views}:
                        continue
                    views.append(extra)
        return views

    def slot_preview(
        self,
        category: ConfiguratorCategory,
        *,
        conditions: List[Dict[str, Any]],
        include_ids: List[str],
        exclude_ids: List[str],
    ) -> Dict[str, Any]:
        """Slot-editor live preview for a DRAFT slot (nothing is written): which
        products would show and, for the ones that wouldn't, why. `category` may
        be an unsaved ConfiguratorCategory — only its slug and bound catalog
        category are read."""
        from app.services.configurator_rule_engine import _slot_condition_ok
        from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

        base = self.slot_base_views(category, limit=200)
        base_ids = {v.id for v in base}
        extra: List[StorefrontProductView] = []
        for pid in include_ids:
            if pid in base_ids:
                continue
            ec = self._db.query(EcommerceItem).filter(EcommerceItem.catalog_product_id == pid).first()
            view = self._items.resolve_storefront_from_ecommerce(ec) if ec else None
            if view:
                extra.append(view)
        views = base + extra
        attr_map = self.attribute_map([v.id for v in views])

        shown: List[Dict[str, Any]] = []
        hidden: List[Dict[str, Any]] = []
        for v in views:
            if v.id in exclude_ids:
                hidden.append({"id": v.id, "name": v.name, "why": {"type": "exclude"}})
                continue
            if v.id in include_ids:
                shown.append({"id": v.id, "name": v.name, "via": "include", "in_stock": v.in_stock})
                continue
            attrs = self._view_specs_and_attributes(v, attr_map)[1]
            bad = next((c for c in conditions if not _slot_condition_ok(c, attrs)), None)
            if bad:
                hidden.append(
                    {
                        "id": v.id,
                        "name": v.name,
                        "why": {"type": "condition", "field": bad.get("f"), "op": bad.get("op", "has"), "v": bad.get("v")},
                    }
                )
            else:
                shown.append({"id": v.id, "name": v.name, "via": "rule", "in_stock": v.in_stock})
        return {"shown": shown, "hidden": hidden}

    def search_pickable_products(self, query: str, *, limit: int = 30) -> List[Dict[str, Any]]:
        """Published products matching a name/SKU search — for hand-adding a
        product to (or removing one from) a slot regardless of its category."""
        from app.models.item import Item
        from app.services.ecommerce.constants import STOREFRONT_LIVE_STATUSES

        term = f"%{query.strip()}%"
        rows = (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                Item.name.ilike(term) | EcommerceItem.slug.ilike(term) | Item.sku.ilike(term),
            )
            .order_by(Item.name)
            .limit(limit)
            .all()
        )
        return [{"id": v.id, "name": v.name} for v in self._views_from_rows(rows)]

    def slot_member_views(
        self, profile: ConfiguratorProfile, category_slug: str, *, limit: int = 2000
    ) -> List[StorefrontProductView]:
        """The products a slot shows, as the admin set it up (Website → PC Builder → Tabs & Slots): the slot's
        category / attribute profile, its identifying conditions, then its Include / Exclude overrides. Plain
        storefront views, so the shop can show them like any product list."""
        import json as _json
        from app.services.configurator_rule_engine import evaluate_slot_conditions

        category = self.get_category(profile, category_slug)
        views = self.slot_base_views(category, limit=limit)
        try:
            conditions = _json.loads(category.conditions_json or "[]")
        except ValueError:
            conditions = []
        if conditions:
            attr_map = self.attribute_map([v.id for v in views])
            views = [v for v in views if evaluate_slot_conditions(conditions, self._view_specs_and_attributes(v, attr_map)[1])]
        return self._apply_category_overrides(category.id, views)[:limit]

    def _finish_slot_products(
        self,
        category: ConfiguratorCategory,
        views: List[StorefrontProductView],
        *,
        platform: Optional[str],
        limit: int,
        conditions_override: Optional[List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        slug = category.slug
        from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService
        from app.services.configurator_rule_engine import evaluate_slot_conditions
        import json as _json

        attr_map = self.attribute_map([v.id for v in views])
        resolved: Dict[str, tuple[List[str], Dict[str, str]]] = {
            view.id: self._view_specs_and_attributes(view, attr_map) for view in views
        }

        if conditions_override is not None:
            conditions = conditions_override
        else:
            try:
                conditions = _json.loads(category.conditions_json or "[]")
            except ValueError:
                conditions = []
        if conditions:
            views = [v for v in views if evaluate_slot_conditions(conditions, resolved[v.id][1])]

        views = self._apply_category_overrides(category.id, views)

        out: List[Dict[str, Any]] = []
        for view in views:
            plat = detect_platform(view.name, view.brand or "")
            if platform and slug in ("cpu", "motherboard") and plat and plat.upper() != platform.upper():
                continue
            compare = view.compare_at_price
            price = view.price
            if view.id in resolved:
                specs, attributes = resolved[view.id]
            else:
                # Manually Included via category override — never resolved above.
                specs, attributes = self._view_specs_and_attributes(view, attr_map)
            out.append(
                {
                    "id": view.id,
                    "item_id": view.item_id,
                    "slug": view.slug,
                    "name": view.name,
                    "price": float(price),
                    "compare_at_price": float(compare) if compare is not None else None,
                    "discount_pct": _discount_pct(price, compare),
                    "brand": view.brand,
                    "thumbnail": view.thumbnail,
                    "in_stock": view.in_stock,
                    "stock_status": view.stock_status,
                    "platform": plat,
                    "category_slug": slug,
                    "specs": specs,
                    "attributes": attributes,
                }
            )
            if len(out) >= limit:
                break
        return out

    def _view_specs_and_attributes(
        self,
        view: StorefrontProductView,
        attr_map: Dict[str, Dict[str, str]],
    ) -> tuple[List[str], Dict[str, str]]:
        product = self._db.get(CatalogProduct, view.id)
        specs = _short_spec_lines(getattr(product, "custom_specs_json", None) if product else None)
        extra_pairs: List[tuple[str, str]] = []
        for line in specs:
            if ":" in line:
                label, value = line.split(":", 1)
                extra_pairs.append((label.strip(), value.strip()))
            elif " " in line:
                label, value = line.split(" ", 1)
                extra_pairs.append((label.strip(), value.strip()))
        short = getattr(view, "short_description", None) or ""
        if getattr(self, "_field_map", None) is None:
            # Which attribute feeds each built-in field (Lookup & Alias > Field Sources); read once per request.
            self._field_map = field_sources.load_map(self._db)
        attributes = _builder_attributes(
            field_sources.apply(attr_map.get(view.id, {}), self._field_map),
            name=f"{view.name} {short}",
            brand=view.brand or "",
            specs=specs,
            extra_pairs=extra_pairs,
            product_id=view.id,
        )
        if getattr(self, "_resolver_ctx", None) is None:
            self._resolver_ctx = configurator_attribute_resolver.ResolverContext.load(self._db)
        attributes = configurator_attribute_resolver.resolve(self._db, view.id, attributes, self._field_map, self._resolver_ctx)
        return specs, attributes

    def attributes_for_product(self, product_id: str) -> Dict[str, str]:
        """Same resolution `list_slot_products` uses, for one product by id —
        what the rule engine needs when checking a build the customer already
        picked, rather than the candidate list for a slot."""
        ec = (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.catalog_product_id == product_id)
            .first()
        )
        view = self._items.resolve_storefront_from_ecommerce(ec) if ec else None
        if not view:
            return {}
        from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

        attr_map = StorefrontCatalogService(self._db).all_attributes_for_products([view.id])
        _specs, attributes = self._view_specs_and_attributes(view, attr_map)
        return attributes

    def evaluate_components(
        self,
        profile: ConfiguratorProfile,
        components: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Server-authoritative compatibility check — the same rules the admin
        test panel runs, evaluated here so create_build/add_build_to_cart never
        have to trust whatever status the client claims."""
        rules = self._active_rules(profile)

        contexts: List[configurator_rule_engine.ComponentContext] = []
        for raw in components:
            cat_slug = str(raw.get("category_slug") or "").strip()
            cat_slug = _SLUG_ALIASES.get(cat_slug, cat_slug)
            product_id = str(raw.get("product_id") or "").strip()
            component_profile_id = SLOT_TO_COMPONENT.get(cat_slug)
            if not component_profile_id or not product_id:
                continue
            attributes = self.attributes_for_product(product_id)
            # Several of the same part (two RAM sticks) count that many times for sums and counts.
            for _ in range(max(1, min(int(raw.get("quantity") or 1), 9))):
                contexts.append({"componentProfileId": component_profile_id, "attributes": attributes})

        result = configurator_rule_engine.evaluate_rules(rules, contexts)
        self._fill_fallback_messages(result)
        return result

    def _active_rules(self, profile: ConfiguratorProfile) -> List[Dict[str, Any]]:
        ensure_pc_builder_rules(self._db)
        rows = (
            self._db.query(ConfiguratorCompatibilityRule)
            .filter(
                ConfiguratorCompatibilityRule.active.is_(True),
                ConfiguratorCompatibilityRule.configurator_profile_id.in_(pc_builder_profile_ids(profile.slug)),
            )
            .order_by(ConfiguratorCompatibilityRule.priority)
            .all()
        )
        return [{"id": row.id, "name": row.name, "body": load_rule_json(row.body_json, {})} for row in rows]

    @staticmethod
    def _rule_involves(body: Dict[str, Any], component_id: str) -> bool:
        """Does this rule compare the given component with something? Mirrors the admin Test
        Build's Auto Filter. "requires" rules are completeness checks (a GPU is needed), not a
        mismatch between two parts, so they never hide a product."""
        conditions = body.get("conditions") or []
        if not conditions:
            return False
        first = conditions[0]
        if first.get("operator") == "requires":
            return False
        if (first.get("left") or {}).get("profileId") == component_id:
            return True
        if (first.get("right") or {}).get("profileId") == component_id:
            return True
        if (body.get("when") or {}).get("profileId") == component_id:
            return True
        return first.get("operator") == "power" and component_id in ("cap_cpu", "cap_gpu")

    def slot_compatibility(
        self,
        profile: ConfiguratorProfile,
        slot_slug: str,
        components: List[Dict[str, Any]],
        *,
        replace: bool,
    ) -> Dict[str, Dict[str, List[str]]]:
        """For every product of a slot: which Error rules it would break (errors) and which
        Warning rules it would trip (warnings), given the parts already picked. A rule whose
        data is missing is skipped by the engine, so a product is never blocked on a guess."""
        slot_slug = _SLUG_ALIASES.get(slot_slug, slot_slug)
        component_id = SLOT_TO_COMPONENT.get(slot_slug)
        if not component_id:
            return {}
        others: List[configurator_rule_engine.ComponentContext] = []
        # The same build without this slot's own parts: a rule that pairs this slot with another one (RAM type vs the
        # motherboard) reads the first part of the slot, so a candidate next to an already picked stick would go unchecked.
        elsewhere: List[configurator_rule_engine.ComponentContext] = []
        for raw in components:
            cat_slug = _SLUG_ALIASES.get(str(raw.get("category_slug") or "").strip(), str(raw.get("category_slug") or "").strip())
            product_id = str(raw.get("product_id") or "").strip()
            cap = SLOT_TO_COMPONENT.get(cat_slug)
            if not cap or not product_id or (replace and cat_slug == slot_slug):
                continue
            attributes = self.attributes_for_product(product_id)
            for _ in range(max(1, min(int(raw.get("quantity") or 1), 9))):
                others.append({"componentProfileId": cap, "attributes": attributes})
                if cat_slug != slot_slug:
                    elsewhere.append({"componentProfileId": cap, "attributes": attributes})
        if not others:
            return {}

        rules = [r for r in self._active_rules(profile) if self._rule_involves(r["body"], component_id)]
        if not rules:
            return {}
        out: Dict[str, Dict[str, List[str]]] = {}
        # as many as the storefront lists (slot listing), so no part past the first page goes unchecked
        for row in self.list_slot_products(profile, slot_slug, limit=SLOT_LISTING_LIMIT):
            candidate = {"componentProfileId": component_id, "attributes": row["attributes"]}
            scenarios = [others + [candidate]]
            if len(elsewhere) != len(others) and elsewhere:
                scenarios.append(elsewhere + [candidate])
            errors: List[str] = []
            warnings: List[str] = []
            for contexts in scenarios:
                result = configurator_rule_engine.evaluate_rules(rules, contexts)
                self._fill_fallback_messages(result)
                for r in result["results"]:
                    if r["status"] == "incompatible" and r["message"] not in errors:
                        errors.append(r["message"])
                    elif r["status"] == "warning" and r["message"] not in warnings:
                        warnings.append(r["message"])
            if errors or warnings:
                out[row["id"]] = {"errors": errors, "warnings": warnings}
        return out

    def slot_filters(self, profile: ConfiguratorProfile, category_slug: str) -> Dict[str, Any]:
        """The chooser's filter drawer: price bounds, brands and the attribute filters of the slot's
        attribute profile (the same Filterable / storefront-visible / Catalog Filters settings the
        category page uses), with option counts over the slot's own products."""
        from app.models.catalog_attribute import CatalogAttribute
        from app.models.catalog_attribute_group import CatalogAttributeGroup
        from app.models.catalog_filter import CatalogFilter
        from app.schemas.attribute_profile import parse_json_list
        from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

        category = self.get_category(profile, category_slug)
        rows = self.list_slot_products(profile, category_slug, limit=SLOT_LISTING_LIMIT)
        if not rows:
            return {"price_min": 0, "price_max": 0, "brands": [], "attributes": []}
        values = StorefrontCatalogService(self._db).filter_attributes_for_products([r["id"] for r in rows])

        prices = [r["price"] for r in rows]
        brand_counts: Dict[str, int] = {}
        for r in rows:
            name = (r.get("brand") or "").strip()
            if name:
                brand_counts[name] = brand_counts.get(name, 0) + 1
        brands = [{"value": n, "label": n, "count": c} for n, c in sorted(brand_counts.items())]

        query = self._db.query(CatalogAttribute).filter(
            CatalogAttribute.is_filterable.is_(True), CatalogAttribute.is_active.is_(True)
        )
        profile_id = (getattr(category, "attribute_profile_id", None) or "").strip()
        if profile_id:
            group_ids = [g.id for g in self._db.query(CatalogAttributeGroup).filter(CatalogAttributeGroup.profile_id == profile_id).all()]
            query = query.filter(CatalogAttribute.group_id.in_(group_ids or [""]))
        configured = {
            f.attribute_id: f
            for f in self._db.query(CatalogFilter).filter(CatalogFilter.source == "attribute", CatalogFilter.attribute_id.isnot(None)).all()
        }
        attrs = []
        for a in query.all():
            cfg = configured.get(a.id)
            visible = bool(cfg.is_active and cfg.storefront_visible) if cfg else bool(getattr(a, "storefront_filter_visible", True))
            if visible:
                attrs.append((cfg.sort_order if cfg else 10_000 + (a.sort_order or 0), a.name, a, cfg))
        attrs.sort(key=lambda t: (t[0], t[1]))

        out: List[Dict[str, Any]] = []
        for _sort, _name, attr, cfg in attrs:
            seen: Dict[str, int] = {}
            for r in rows:
                raw = (values.get(r["id"], {}).get(attr.code) or "").strip()
                if not raw:
                    continue
                for part in [p.strip() for p in raw.split(",") if p.strip()] or [raw]:
                    seen[part] = seen.get(part, 0) + 1
            if not seen:
                continue
            ordered = [v for v in parse_json_list(attr.predefined_values) if v in seen]
            ordered += sorted(v for v in seen if v not in ordered)
            unit = f" {attr.unit}" if attr.unit else ""
            out.append(
                {
                    "key": attr.code,
                    "title": attr.name,
                    "display_type": (cfg.display_type if cfg and cfg.display_type else getattr(attr, "filter_display_type", None)) or "multi_select",
                    "options": [{"value": v, "label": v.replace("_", " ") + unit, "count": seen[v]} for v in ordered],
                }
            )
        return {"price_min": min(prices), "price_max": max(prices), "brands": brands, "attributes": out}

    def storefront_settings(self) -> Dict[str, Any]:
        """The General tab's storefront behaviour, with the same defaults the admin shows."""
        defaults = {
            "pcbuilder.show_incompatible": "false",
            "pcbuilder.show_coming_soon": "true",
            "pcbuilder.hide_oos": "false",
            "pcbuilder.show_autofilter_notice": "true",
            "pcbuilder.share_link": "true",
            "pcbuilder.default_sort": "popular",
        }
        rows = self._db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(defaults))).all()
        raw = {**defaults, **{r.key: r.value for r in rows if r.value is not None and r.value != ""}}
        truthy = lambda key: str(raw[key]).strip().lower() in ("1", "true", "yes", "on")
        return {
            "show_incompatible": truthy("pcbuilder.show_incompatible"),
            "show_coming_soon": truthy("pcbuilder.show_coming_soon"),
            "hide_out_of_stock": truthy("pcbuilder.hide_oos"),
            "show_autofilter_notice": truthy("pcbuilder.show_autofilter_notice"),
            "share_link": truthy("pcbuilder.share_link"),
            "default_sort": str(raw["pcbuilder.default_sort"]),
        }

    def _fill_fallback_messages(self, result: Dict[str, Any]) -> None:
        """A rule with no message of its own (then/else left blank) falls
        back to the admin's Language template for its status, filled with the
        rule's name — mirrors the artifact's msgFor() fallback behavior."""
        empties = [r for r in result.get("results", []) if not (r.get("message") or "").strip()]
        if not empties:
            return
        keys = {"incompatible": "pcbuilder.msg.incompatible", "warning": "pcbuilder.msg.warning"}
        needed = {keys[r["status"]] for r in empties if r["status"] in keys}
        if not needed:
            return
        rows = self._db.query(PlatformSetting).filter(PlatformSetting.key.in_(needed)).all()
        templates = {row.key: row.value for row in rows if row.value}
        for r in empties:
            template = templates.get(keys.get(r["status"], ""))
            if template:
                r["message"] = template.replace("{rule}", r.get("rule_name") or "")

    def list_templates(self, profile: ConfiguratorProfile) -> List[ConfiguratorTemplate]:
        return (
            self._db.query(ConfiguratorTemplate)
            .filter(
                ConfiguratorTemplate.profile_id == profile.id,
                ConfiguratorTemplate.status == "active",
            )
            .order_by(
                ConfiguratorTemplate.is_featured.desc(),
                ConfiguratorTemplate.name,
            )
            .all()
        )

    def _new_build_code(self) -> str:
        for _ in range(12):
            code = f"PCB-{secrets.token_hex(3).upper()}"
            exists = (
                self._db.query(ConfiguratorBuild.id)
                .filter(ConfiguratorBuild.build_code == code)
                .first()
            )
            if not exists:
                return code
        return f"PCB-{secrets.token_hex(4).upper()}"

    def create_build(
        self,
        profile: ConfiguratorProfile,
        *,
        name: str,
        components: List[Dict[str, Any]],
        customer_name: Optional[str] = None,
    ) -> ConfiguratorBuild:
        categories = {c.slug: c for c in self.list_categories(profile)}
        picks: List[Dict[str, Any]] = []
        total = Decimal("0")

        for raw in components:
            cat_slug = str(raw.get("category_slug") or "").strip()
            product_id = str(raw.get("product_id") or "").strip()
            qty = max(1, int(raw.get("quantity") or 1))
            cat = categories.get(cat_slug) or categories.get(_SLUG_ALIASES.get(cat_slug, ""))
            if not cat or not product_id:
                continue
            product = self._db.get(CatalogProduct, product_id)
            if not product:
                ec = (
                    self._db.query(EcommerceItem)
                    .filter(
                        or_(
                            EcommerceItem.catalog_product_id == product_id,
                            EcommerceItem.item_id == product_id,
                        )
                    )
                    .first()
                )
                if ec and ec.catalog_product_id:
                    product = self._db.get(CatalogProduct, ec.catalog_product_id)
            if not product:
                raise ConfiguratorError(f"Product not found for slot {cat_slug}")

            unit = Decimal(str(product.price or 0))
            total += unit * qty
            picks.append(
                {
                    "category_id": cat.id,
                    "category_name": cat.name,
                    "product_id": product.id,
                    "product_name": product.name,
                    "quantity": qty,
                }
            )

        if not picks:
            raise ConfiguratorError("Build must include at least one component")

        evaluation = self.evaluate_components(profile, components)

        build = ConfiguratorBuild(
            profile_id=profile.id,
            name=(name or "My PC Build").strip()[:255],
            build_code=self._new_build_code(),
            customer_name=customer_name,
            components_json=dump_components(picks),
            total_price=total,
            compatibility_status=evaluation["status"],
            status="saved",
        )
        self._db.add(build)
        self._db.flush()
        profile.build_count = (
            self._db.query(ConfiguratorBuild)
            .filter(ConfiguratorBuild.profile_id == profile.id)
            .count()
        )
        self._db.commit()
        self._db.refresh(build)
        return build

    def get_build(self, build_code: str) -> ConfiguratorBuild:
        build = (
            self._db.query(ConfiguratorBuild)
            .filter(ConfiguratorBuild.build_code == build_code.strip().upper())
            .first()
        )
        if not build:
            # try exact
            build = (
                self._db.query(ConfiguratorBuild)
                .filter(ConfiguratorBuild.build_code == build_code.strip())
                .first()
            )
        if not build:
            raise ConfiguratorError("Build not found")
        return build

    def build_to_dict(self, build: ConfiguratorBuild, profile: Optional[ConfiguratorProfile] = None) -> Dict[str, Any]:
        if profile is None:
            profile = self._db.get(ConfiguratorProfile, build.profile_id)
        cats = {c.id: c for c in self.list_categories(profile)} if profile else {}
        components = []
        for raw in build.components:
            cat = cats.get(raw.get("category_id") or "")
            product_id = raw.get("product_id")
            product_payload = None
            if product_id:
                ec = (
                    self._db.query(EcommerceItem)
                    .filter(EcommerceItem.catalog_product_id == product_id)
                    .first()
                )
                view = self._items.resolve_storefront_from_ecommerce(ec) if ec else None
                if view:
                    product_payload = {
                        "id": view.id,
                        "item_id": view.item_id,
                        "slug": view.slug,
                        "name": view.name,
                        "price": float(view.price),
                        "compare_at_price": float(view.compare_at_price)
                        if view.compare_at_price is not None
                        else None,
                        "discount_pct": _discount_pct(view.price, view.compare_at_price),
                        "brand": view.brand,
                        "thumbnail": view.thumbnail,
                        "in_stock": view.in_stock,
                        "platform": detect_platform(view.name, view.brand or ""),
                        "category_slug": cat.slug if cat else None,
                    }
            components.append(
                {
                    "category_id": raw.get("category_id"),
                    "category_slug": cat.slug if cat else None,
                    "category_name": raw.get("category_name") or (cat.name if cat else ""),
                    "product_id": product_id,
                    "product_name": raw.get("product_name"),
                    "quantity": int(raw.get("quantity") or 1),
                    "product": product_payload,
                }
            )
        return {
            "id": build.id,
            "profile_slug": profile.slug if profile else None,
            "name": build.name,
            "build_code": build.build_code,
            "total_price": float(build.total_price or 0),
            "compatibility_status": build.compatibility_status,
            "status": build.status,
            "components": components,
        }

    def add_build_to_cart(
        self,
        cart: StorefrontCart,
        components: List[Dict[str, Any]],
    ) -> StorefrontCart:
        cart_svc = StorefrontCartService(self._db)
        if not components:
            raise ConfiguratorError("No components to add")
        for raw in components:
            product_id = str(raw.get("product_id") or "").strip()
            item_id = str(raw.get("item_id") or "").strip() or None
            qty = max(1, int(raw.get("quantity") or 1))
            if not product_id and not item_id:
                continue
            cart = cart_svc.add_item(
                cart,
                item_id=item_id,
                product_id=product_id or None,
                quantity=qty,
            )
        return cart
