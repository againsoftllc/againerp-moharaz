"""Filters Registry (Phase 4, Stage A) — the typed field list a Configurator
category's condition-builder, and the Rules editor's field/operator pickers,
both read from. Backed by the real `CatalogAttribute`/`CatalogAttributeGroup`
rows `seed_pc_builder_filters.py` sets up — not a hand-maintained duplicate
of the catalog.

Two kinds of field a real catalog attribute can't express on its own, kept
here as small static lists (mirrors the reference artifact's own LOOKUPS/
SPECIAL constants, which are hand-maintained even though its main FILTERS
list is data-driven):
  - Lookup fields: resolved via configurator_attribute_resolver from the
    Chipset Lookup table, not stored directly on the product.
  - Special fields: the rule engine's synthetic pseudo-fields (item count,
    presence, whole-build power) — usable as a rule's left/right operand,
    never as a slot condition.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile

PROFILE_CODE = "pc_builder_specs"

# The builder's groups used to share the single "pc_builder_specs" profile; they now live
# one per component profile (see scripts/split_pc_builder_profiles.py). Reading groups by
# code across both layouts keeps this working before and after that script has run.
BUILDER_PROFILE_CODES = (
    PROFILE_CODE,
    "processor",
    "motherboard",
    "memory",
    "graphics_card",
    "power_supply",
    "casing",
    "cpu_cooler",
    "storage",
    "monitor",
)

# Configurator category slug -> attribute group code from seed_pc_builder_filters.py.
CATEGORY_SLUG_TO_GROUP_CODE: Dict[str, str] = {
    "cpu": "cpu",
    "motherboard": "motherboard",
    "memory": "memory",
    "graphics-card": "graphics_card",
    "power-supply": "power_supply",
    "casing": "casing",
    "cpu-cooler": "cpu_cooler",
    "storage": "storage",
    "monitor": "monitor",
}

# group_code -> lookup fields resolved via configurator_attribute_resolver
# rather than stored directly (artifact's LOOKUPS, scoped to Motherboard).
LOOKUP_FIELDS: Dict[str, List[Dict[str, str]]] = {
    "motherboard": [
        {"code": "socket", "name": "Socket (Chipset Lookup)", "source": "lookup"},
        {"code": "supported_generations", "name": "Supported CPU Gen (Chipset Lookup)", "source": "lookup"},
        {"code": "bios_update_generations", "name": "BIOS Update Gen (Chipset Lookup)", "source": "lookup"},
    ],
}

# Synthetic pseudo-fields every slot can use as a rule operand (not as a
# slot-membership condition) — artifact's SPECIAL constants.
SPECIAL_FIELDS: List[Dict[str, str]] = [
    {"code": "__qty", "name": "Quantity (Qty)", "field_type": "count", "source": "special"},
    {"code": "__selected", "name": "Selected", "field_type": "presence", "source": "special"},
]
POWER_FIELD: Dict[str, str] = {"code": "__power", "name": "Total TDP", "field_type": "power", "source": "special"}


def list_filters_for_group_code(db: Session, group_code: str, *, include_special: bool = True) -> List[Dict[str, Any]]:
    """Real, typed attribute fields for one component group, plus any Lookup
    and Special pseudo-fields that apply to it."""
    out: List[Dict[str, Any]] = []
    group = (
        db.query(CatalogAttributeGroup)
        .join(CatalogAttributeProfile, CatalogAttributeProfile.id == CatalogAttributeGroup.profile_id)
        .filter(CatalogAttributeProfile.code.in_(BUILDER_PROFILE_CODES), CatalogAttributeGroup.code == group_code)
        .first()
    )
    if group:
        rows = (
            db.query(CatalogAttribute)
            .filter(CatalogAttribute.group_id == group.id, CatalogAttribute.is_active.is_(True))
            .order_by(CatalogAttribute.sort_order)
            .all()
        )
        for row in rows:
            out.append(
                {
                    "code": row.code,
                    "name": row.name,
                    "field_type": row.field_type,
                    "unit": row.unit,
                    "source": "attribute",
                }
            )
    out.extend(LOOKUP_FIELDS.get(group_code, []))
    if include_special:
        out.extend(SPECIAL_FIELDS)
    return out


def list_filters_for_category_slug(db: Session, category_slug: str, *, include_special: bool = True) -> List[Dict[str, Any]]:
    group_code = CATEGORY_SLUG_TO_GROUP_CODE.get(category_slug)
    if not group_code:
        return list(SPECIAL_FIELDS) if include_special else []
    return list_filters_for_group_code(db, group_code, include_special=include_special)


# Catalog category a slot is bound to -> the slot slug whose attribute group it uses.
# Mirrors the bindings seeded in ensure_configurator_category_catalog_column.
CATALOG_SLUG_TO_CATEGORY_SLUG: Dict[str, str] = {
    "component-processor": "cpu",
    "component-motherboard": "motherboard",
    "component-cpu-cooler": "cpu-cooler",
    "component-ram": "memory",
    "component-ssd-hdd": "storage",
    "component-graphics-card": "graphics-card",
    "component-power-supply": "power-supply",
    "component-casing": "casing",
    "monitor": "monitor",
}


def profile_ids_for_catalog_category(db: Session, catalog_slug: str) -> List[str]:
    """Attribute profile(s) scoped to a catalog category: the nearest scoped category wins (itself, else its
    closest ancestor)."""
    from app.models.catalog_attribute_profile_category import CatalogAttributeProfileCategory
    from app.models.catalog_category import CatalogCategory

    cat = db.query(CatalogCategory).filter(CatalogCategory.slug == catalog_slug).first()
    if cat is None:
        return []
    chain: List[str] = []
    cur: Optional[CatalogCategory] = cat
    while cur is not None and cur.id not in chain:
        chain.append(cur.id)
        cur = db.get(CatalogCategory, cur.parent_id) if cur.parent_id else None
    for cid in chain:
        rows = db.query(CatalogAttributeProfileCategory.profile_id).filter(CatalogAttributeProfileCategory.category_id == cid).all()
        if rows:
            return [r[0] for r in rows]
    return []


def list_filters_for_catalog_category(
    db: Session, catalog_slug: str, *, include_special: bool = True
) -> Optional[List[Dict[str, Any]]]:
    """Fields for a slot bound to this catalog category, read from the attribute profile(s)
    scoped to that category (the same link the product form and storefront facets use):
    category -> attribute profile -> groups -> attributes.

    The nearest scoped category wins (the category itself, else its closest ancestor), so a
    broad parent never drags in an unrelated profile. None when no profile is scoped to it —
    the caller then falls back to the slot-slug mapping."""
    from app.models.catalog_attribute_profile_category import CatalogAttributeProfileCategory
    from app.models.catalog_category import CatalogCategory

    profile_ids = profile_ids_for_catalog_category(db, catalog_slug)
    if not profile_ids:
        return None
    return _fields_for_profile_ids(db, profile_ids, include_special=include_special)


def list_filters_for_profile(db: Session, profile_id: str, *, include_special: bool = True) -> Optional[List[Dict[str, Any]]]:
    """Fields for a slot sourced from this attribute profile: profile -> groups -> attributes."""
    return _fields_for_profile_ids(db, [profile_id], include_special=include_special)


def _fields_for_profile_ids(db: Session, profile_ids: List[str], *, include_special: bool = True) -> Optional[List[Dict[str, Any]]]:
    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id.in_(profile_ids), CatalogAttributeGroup.is_active.is_(True))
        .order_by(CatalogAttributeGroup.sort_order)
        .all()
    )
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for group in groups:
        rows = (
            db.query(CatalogAttribute)
            .filter(CatalogAttribute.group_id == group.id, CatalogAttribute.is_active.is_(True))
            .order_by(CatalogAttribute.sort_order)
            .all()
        )
        for row in rows:
            if row.code in seen:
                continue
            seen.add(row.code)
            out.append(
                {"code": row.code, "name": row.name, "field_type": row.field_type, "unit": row.unit, "source": "attribute"}
            )
        out.extend(LOOKUP_FIELDS.get(group.code, []))
    if not out:
        return None
    if include_special:
        out.extend(SPECIAL_FIELDS)
    return out


def list_filters_for_catalog_slug(db: Session, catalog_slug: str, *, include_special: bool = True) -> List[Dict[str, Any]]:
    found = list_filters_for_catalog_category(db, catalog_slug, include_special=include_special)
    if found is not None:
        return found
    return list_filters_for_category_slug(
        db, CATALOG_SLUG_TO_CATEGORY_SLUG.get(catalog_slug, ""), include_special=include_special
    )
