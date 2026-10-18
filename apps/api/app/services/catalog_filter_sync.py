"""Shop filters are managed from specifications.

A storefront filter is a filterable specification attribute: one ``catalog_filters`` row per attribute
*code* (``param_key == code``), shared by every profile's attribute with that code. Its values are the
attributes' values — predefined options plus whatever products carry — so adding a spec value on a
product is enough for it to show up as a filter option. Nothing has to be added on the filters page.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_filter import CatalogFilter
from app.schemas.attribute_profile import parse_json_list


def split_values(attr: CatalogAttribute, raw: str | None) -> list[str]:
    """A product's value for this attribute as filter options (multi-select values are comma-separated)."""
    raw = (raw or "").strip()
    if not raw:
        return []
    if attr.field_type == "multi_select":
        return [p.strip() for p in raw.split(",") if p.strip()]
    return [raw]


def add_options(attr: CatalogAttribute, values: list[str]) -> bool:
    """Append values missing from the attribute's options (case-insensitive). True when it changed."""
    options = parse_json_list(attr.predefined_values)
    known = {o.lower() for o in options}
    added = [v for v in values if v.lower() not in known and not known.add(v.lower())]
    if added:
        attr.predefined_values = json.dumps(options + added)
    return bool(added)


def _next_sort(db: Session) -> int:
    top = db.query(CatalogFilter.sort_order).order_by(CatalogFilter.sort_order.desc()).first()
    return (top[0] + 1) if top else 0


def sync_attribute_filters(db: Session, attrs: list[CatalogAttribute]) -> None:
    """Create / update / switch off the filter row of each attribute's code."""
    for code in {a.code for a in attrs if a.code}:
        members = db.query(CatalogAttribute).filter(CatalogAttribute.code == code).all()
        on = [a for a in members if a.is_filterable]
        row = db.query(CatalogFilter).filter(CatalogFilter.param_key == code).first()
        if row is None:  # filters made before code-based rows: linked by attribute id
            row = (
                db.query(CatalogFilter)
                .filter(CatalogFilter.source == "attribute", CatalogFilter.attribute_id.in_([a.id for a in members]))
                .first()
            )
        if row is not None and row.source != "attribute":
            continue  # a built-in filter owns this key
        if not on:
            if row is not None:
                row.is_active = False
                row.storefront_visible = False
            continue
        values: set[str] = set()
        for a in on:
            values.update(v.lower() for v in parse_json_list(a.predefined_values))
        lead = next((a for a in on if row is not None and a.id == row.attribute_id), on[0])
        if row is None:
            row = CatalogFilter(
                name=lead.name,
                param_key=code,
                display_type="multi_select" if lead.field_type == "multi_select" else "single_select",
                source="attribute",
                sort_order=_next_sort(db),
                category_scope="All categories",
                url_example=f"?{code}=",
                is_system=False,
            )
            db.add(row)
        row.attribute_id = lead.id
        row.attribute_name = lead.name
        row.display_type = "multi_select" if lead.field_type == "multi_select" else "single_select"  # follows the attribute
        row.is_active = True
        row.storefront_visible = any(bool(a.storefront_filter_visible) for a in on)
        row.value_count = len(values)
    db.flush()


def connect_product_values(db: Session, pairs: list[tuple[CatalogAttribute, str | None]]) -> None:
    """After a product's specs are saved: new values of filterable attributes become filter options."""
    changed: list[CatalogAttribute] = []
    for attr, raw in pairs:
        if attr.is_filterable and add_options(attr, split_values(attr, raw)):
            changed.append(attr)
    if changed:
        sync_attribute_filters(db, changed)
