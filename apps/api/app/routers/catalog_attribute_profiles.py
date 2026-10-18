from __future__ import annotations

import json
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_filter import CatalogFilter
from app.services.catalog_filter_sync import sync_attribute_filters
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.schemas.attribute_profile import (
    AttributeFieldRead,
    AttributeGroupRead,
    AttributeProfileBulkSaveRequest,
    AttributeProfileCreate,
    AttributeProfileDetailRead,
    AttributeProfileListMeta,
    AttributeProfileListResponse,
    AttributeProfileRead,
    AttributeProfileReorderRequest,
    AttributeProfileResponse,
    AttributeProfileUpdate,
    AttributeValueUsageItem,
    AttributeValueUsageResponse,
    dump_json_list,
    parse_json_list,
    slugify_code,
)

router = APIRouter(prefix="/attribute-profiles", tags=["catalog-attribute-profiles"])


def _unique_profile_code(db: Session, base_code: str, exclude_id: str | None = None) -> str:
    """Auto-dedupe a profile code derived from name — /bulk creates the code
    from profile_name rather than accepting it directly, so a name that
    happens to slugify the same as an existing profile must not crash."""
    def _taken(code: str) -> bool:
        query = db.query(CatalogAttributeProfile).filter(CatalogAttributeProfile.code == code)
        if exclude_id:
            query = query.filter(CatalogAttributeProfile.id != exclude_id)
        return query.first() is not None

    if not _taken(base_code):
        return base_code
    for n in range(2, 1000):
        candidate = f"{base_code}-{n}"
        if not _taken(candidate):
            return candidate
    return base_code


def _field_to_read(row: CatalogAttribute) -> AttributeFieldRead:
    return AttributeFieldRead(
        id=row.id,
        group_id=row.group_id,
        name=row.name,
        code=row.code,
        field_type=row.field_type,
        sort_order=row.sort_order,
        is_required=row.is_required,
        is_filterable=row.is_filterable,
        is_comparable=row.is_comparable,
        is_searchable=row.is_searchable,
        is_visible=row.is_visible,
        is_active=row.is_active,
        filter_display_type="multi_select" if row.field_type == "multi_select" else "single_select",
        storefront_filter_visible=bool(getattr(row, "storefront_filter_visible", True)),
        unit=row.unit,
        help_text=row.help_text,
        predefined_values=parse_json_list(row.predefined_values),
    )


def _group_to_read(row: CatalogAttributeGroup, attrs: List[CatalogAttribute]) -> AttributeGroupRead:
    group_attrs = [_field_to_read(a) for a in attrs if a.group_id == row.id]
    group_attrs.sort(key=lambda a: a.sort_order)
    return AttributeGroupRead(
        id=row.id,
        profile_id=row.profile_id,
        name=row.name,
        code=row.code,
        sort_order=row.sort_order,
        is_active=row.is_active,
        description=row.description,
        attributes=group_attrs,
    )


def _profile_to_read(
    row: CatalogAttributeProfile,
    group_count: int,
    attribute_count: int,
    product_count: int = 0,
) -> AttributeProfileRead:
    return AttributeProfileRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        code=row.code,
        description=row.description,
        sort_order=row.sort_order,
        is_active=row.is_active,
        icon_url=row.icon_url,
        image_url=row.image_url,
        category_labels=parse_json_list(row.category_labels),
        product_count=product_count,
        group_count=group_count,
        attribute_count=attribute_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _counts_for_profiles(
    db: Session,
    profile_ids: List[str],
) -> Dict[str, Dict[str, int]]:
    counts: Dict[str, Dict[str, int]] = {
        pid: {"groups": 0, "attributes": 0} for pid in profile_ids
    }
    if not profile_ids:
        return counts

    groups = db.query(CatalogAttributeGroup).filter(
        CatalogAttributeGroup.profile_id.in_(profile_ids),
    ).all()
    group_ids = [g.id for g in groups]
    group_by_profile: Dict[str, List[str]] = {}
    for group in groups:
        counts[group.profile_id]["groups"] += 1
        group_by_profile.setdefault(group.profile_id, []).append(group.id)

    if group_ids:
        attrs = db.query(CatalogAttribute.group_id).filter(
            CatalogAttribute.group_id.in_(group_ids),
        ).all()
        attr_count_by_group: Dict[str, int] = {}
        for (group_id,) in attrs:
            attr_count_by_group[group_id] = attr_count_by_group.get(group_id, 0) + 1
        for profile_id, gids in group_by_profile.items():
            counts[profile_id]["attributes"] = sum(
                attr_count_by_group.get(gid, 0) for gid in gids
            )

    return counts


def _next_sort_order(db: Session) -> int:
    max_order = (
        db.query(CatalogAttributeProfile.sort_order)
        .order_by(CatalogAttributeProfile.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


def _load_structure(db: Session, profile_id: str) -> AttributeProfileDetailRead:
    row = db.get(CatalogAttributeProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id == profile_id)
        .order_by(CatalogAttributeGroup.sort_order)
        .all()
    )
    group_ids = [g.id for g in groups]
    attrs: List[CatalogAttribute] = []
    if group_ids:
        attrs = (
            db.query(CatalogAttribute)
            .filter(CatalogAttribute.group_id.in_(group_ids))
            .order_by(CatalogAttribute.sort_order)
            .all()
        )

    base = _profile_to_read(row, len(groups), len(attrs))
    detail = AttributeProfileDetailRead(**base.model_dump())
    detail.groups = [_group_to_read(g, attrs) for g in groups]
    return detail


@router.get("", response_model=AttributeProfileListResponse)
def list_profiles(db: Session = Depends(get_db)) -> AttributeProfileListResponse:
    rows = (
        db.query(CatalogAttributeProfile)
        .order_by(CatalogAttributeProfile.sort_order, CatalogAttributeProfile.name)
        .all()
    )
    profile_ids = [r.id for r in rows]
    counts = _counts_for_profiles(db, profile_ids)

    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id.in_(profile_ids))
        .order_by(CatalogAttributeGroup.sort_order)
        .all()
        if profile_ids
        else []
    )
    group_ids = [g.id for g in groups]
    attrs = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.group_id.in_(group_ids))
        .order_by(CatalogAttribute.sort_order)
        .all()
        if group_ids
        else []
    )

    data = [
        _profile_to_read(
            r,
            counts[r.id]["groups"],
            counts[r.id]["attributes"],
        )
        for r in rows
    ]
    flat_groups = [_group_to_read(g, attrs) for g in groups]
    flat_attrs = [_field_to_read(a) for a in attrs]

    return AttributeProfileListResponse(
        data=data,
        groups=flat_groups,
        attributes=flat_attrs,
        meta=AttributeProfileListMeta(count=len(data)),
    )


@router.patch("/reorder", response_model=AttributeProfileListResponse)
def reorder_profiles(
    payload: AttributeProfileReorderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeProfileListResponse:
    rows = db.query(CatalogAttributeProfile).all()
    row_map = {r.id: r for r in rows}
    if set(payload.ordered_ids) != set(row_map.keys()):
        raise HTTPException(status_code=400, detail="ordered_ids must include all profiles")

    for index, profile_id in enumerate(payload.ordered_ids):
        row_map[profile_id].sort_order = index
    db.commit()
    return list_profiles(db)


@router.get("/{profile_id}", response_model=AttributeProfileResponse)
def get_profile(profile_id: str, db: Session = Depends(get_db)) -> AttributeProfileResponse:
    return AttributeProfileResponse(data=_load_structure(db, profile_id))


@router.post("", response_model=AttributeProfileResponse, status_code=201)
def create_profile(
    payload: AttributeProfileCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeProfileResponse:
    existing = (
        db.query(CatalogAttributeProfile)
        .filter(CatalogAttributeProfile.code == payload.code)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Profile code already exists")

    row = CatalogAttributeProfile(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        sort_order=payload.sort_order or _next_sort_order(db),
        is_active=payload.is_active,
        icon_url=payload.icon_url,
        image_url=payload.image_url,
        category_labels=dump_json_list(payload.category_labels),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AttributeProfileResponse(data=_load_structure(db, row.id))


@router.post("/bulk", response_model=AttributeProfileResponse, status_code=201)
def create_profile_bulk(
    payload: AttributeProfileBulkSaveRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeProfileResponse:
    code = _unique_profile_code(db, slugify_code(payload.profile_name))
    row = CatalogAttributeProfile(
        name=payload.profile_name.strip(),
        code=code,
        sort_order=_next_sort_order(db),
        is_active=True,
        image_url=payload.image_url,
        category_labels=dump_json_list([]),
    )
    db.add(row)
    db.flush()
    _replace_profile_structure(db, row.id, payload)
    db.commit()
    return AttributeProfileResponse(data=_load_structure(db, row.id))


@router.put("/{profile_id}/bulk", response_model=AttributeProfileResponse)
def update_profile_bulk(
    profile_id: str,
    payload: AttributeProfileBulkSaveRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeProfileResponse:
    row = db.get(CatalogAttributeProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    row.name = payload.profile_name.strip()
    row.code = _unique_profile_code(db, slugify_code(payload.profile_name), exclude_id=profile_id)
    if payload.image_url is not None:
        row.image_url = payload.image_url or None
    _replace_profile_structure(db, profile_id, payload)
    db.commit()
    return AttributeProfileResponse(data=_load_structure(db, profile_id))


def _stored_value_uses_option(stored: str, option: str) -> bool:
    """Exact match or comma-separated multi-select membership."""
    if not option:
        return False
    if stored == option:
        return True
    parts = [p.strip() for p in stored.split(",") if p.strip()]
    return option in parts


def _usage_counts_for_attributes(
    db: Session,
    attribute_ids: List[str],
) -> Dict[str, Dict[str, int]]:
    """attribute_id -> { option_value -> product_count } for values currently on products."""
    if not attribute_ids:
        return {}
    rows = (
        db.query(CatalogProductAttributeValue)
        .filter(CatalogProductAttributeValue.attribute_id.in_(attribute_ids))
        .all()
    )
    # Collect predefined options per attribute so we only count known chips.
    attrs = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.id.in_(attribute_ids))
        .all()
    )
    options_by_attr: Dict[str, List[str]] = {
        a.id: parse_json_list(a.predefined_values) for a in attrs
    }
    counts: Dict[str, Dict[str, int]] = {aid: {} for aid in attribute_ids}
    for row in rows:
        options = options_by_attr.get(row.attribute_id) or []
        for option in options:
            if _stored_value_uses_option(row.value or "", option):
                bucket = counts.setdefault(row.attribute_id, {})
                bucket[option] = bucket.get(option, 0) + 1
    return counts


@router.get("/{profile_id}/value-usage", response_model=AttributeValueUsageResponse)
def get_profile_value_usage(
    profile_id: str,
    db: Session = Depends(get_db),
) -> AttributeValueUsageResponse:
    """Which predefined filter values are assigned on products for this profile."""
    row = db.get(CatalogAttributeProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id == profile_id)
        .all()
    )
    group_ids = [g.id for g in groups]
    if not group_ids:
        return AttributeValueUsageResponse(data=[])
    attrs = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.group_id.in_(group_ids))
        .all()
    )
    attr_ids = [a.id for a in attrs]
    counts = _usage_counts_for_attributes(db, attr_ids)
    items: List[AttributeValueUsageItem] = []
    for attr_id, by_value in counts.items():
        for value, product_count in by_value.items():
            if product_count > 0:
                items.append(
                    AttributeValueUsageItem(
                        attribute_id=attr_id,
                        value=value,
                        product_count=product_count,
                    )
                )
    items.sort(key=lambda i: (i.attribute_id, i.value))
    return AttributeValueUsageResponse(data=items)


def _assert_no_in_use_values_removed(
    db: Session,
    profile_id: str,
    payload: AttributeProfileBulkSaveRequest,
) -> None:
    """Block deleting predefined values that are still set on any product."""
    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id == profile_id)
        .all()
    )
    group_ids = [g.id for g in groups]
    if not group_ids:
        return
    existing_attrs = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.group_id.in_(group_ids))
        .all()
    )
    old_values: Dict[str, Set[str]] = {
        a.id: set(parse_json_list(a.predefined_values)) for a in existing_attrs
    }
    new_values: Dict[str, Set[str]] = {}
    for group in payload.groups:
        for attr in group.attributes:
            if attr.id:
                new_values[attr.id] = set(attr.predefined_values or [])

    removed: List[tuple[str, str]] = []
    for attr_id, old in old_values.items():
        gone = old - new_values.get(attr_id, set())
        for value in gone:
            removed.append((attr_id, value))

    if not removed:
        return

    counts = _usage_counts_for_attributes(db, list({aid for aid, _ in removed}))
    blocked: List[str] = []
    for attr_id, value in removed:
        n = counts.get(attr_id, {}).get(value, 0)
        if n > 0:
            attr = next((a for a in existing_attrs if a.id == attr_id), None)
            label = attr.name if attr else attr_id
            blocked.append(f'"{value}" on {label} ({n} product{"s" if n != 1 else ""})')

    if blocked:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot remove filter values still used on products. "
                "Clear them from products first: " + "; ".join(blocked)
            ),
        )


def _replace_profile_structure(
    db: Session,
    profile_id: str,
    payload: AttributeProfileBulkSaveRequest,
) -> None:
    _assert_no_in_use_values_removed(db, profile_id, payload)

    # Update groups/attributes in place by id and delete only the ones left out. Deleting and
    # re-inserting everything (the old approach) fired catalog_product_attribute_values'
    # ON DELETE CASCADE, wiping every product's saved spec values on each profile save.
    existing_groups = {
        g.id: g
        for g in db.query(CatalogAttributeGroup).filter(CatalogAttributeGroup.profile_id == profile_id).all()
    }
    existing_attrs = (
        {
            a.id: a
            for a in db.query(CatalogAttribute).filter(CatalogAttribute.group_id.in_(list(existing_groups))).all()
        }
        if existing_groups
        else {}
    )

    kept_group_ids: Set[str] = set()
    kept_attr_ids: Set[str] = set()
    for group_index, group_item in enumerate(payload.groups):
        if not group_item.name.strip():
            continue
        group = existing_groups.get(group_item.id or "")
        if group is None:
            # A client id that already belongs to another profile must not collide.
            new_id = group_item.id if group_item.id and not db.get(CatalogAttributeGroup, group_item.id) else None
            group = CatalogAttributeGroup(id=new_id, profile_id=profile_id)
            db.add(group)
        group.name = group_item.name.strip()
        group.code = slugify_code(group_item.name)
        group.sort_order = group_index
        group.is_active = True
        db.flush()
        kept_group_ids.add(group.id)

        for attr_index, attr_item in enumerate(group_item.attributes):
            if not attr_item.name.strip():
                continue
            attr = existing_attrs.get(attr_item.id or "")
            if attr is None:
                new_id = attr_item.id if attr_item.id and not db.get(CatalogAttribute, attr_item.id) else None
                attr = CatalogAttribute(id=new_id)
                db.add(attr)
            renamed = attr.name != attr_item.name.strip()
            attr.group_id = group.id
            attr.name = attr_item.name.strip()
            # the code is the shop filter's key, shared across profiles: keep it unless the attribute is renamed
            if renamed or not attr.code:
                attr.code = slugify_code(attr_item.name)
            display = attr_item.normalized_display_type()
            if attr_item.field_type:
                attr.field_type = attr_item.field_type
            elif attr_item.filterable and (attr_item.predefined_values or attr.field_type in ("dropdown", "multi_select")):
                # the filter's single / multi choice IS how the spec value is entered: one option, or several
                attr.field_type = "multi_select" if display == "multi_select" else "dropdown"
            elif attr.field_type != "multi_select":
                attr.field_type = "dropdown" if attr_item.predefined_values else "text"
            attr.sort_order = attr_index
            attr.is_filterable = attr_item.filterable
            attr.filter_display_type = "multi_select" if attr.field_type == "multi_select" else "single_select"
            attr.storefront_filter_visible = bool(attr_item.storefront_filter_visible)
            attr.predefined_values = json.dumps(attr_item.predefined_values or [])
            db.flush()
            kept_attr_ids.add(attr.id)

    for attr_id, attr in existing_attrs.items():
        if attr_id not in kept_attr_ids:
            db.delete(attr)
    for group_id, group in existing_groups.items():
        if group_id not in kept_group_ids:
            db.delete(group)

    db.flush()
    _sync_catalog_filters_for_profile(db, profile_id)


def _next_filter_sort_order(db: Session) -> int:
    max_order = (
        db.query(CatalogFilter.sort_order)
        .order_by(CatalogFilter.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


def _sync_catalog_filters_for_profile(db: Session, profile_id: str) -> None:
    """Keep Catalog Filters rows in sync with filterable attributes on this profile (one row per code)."""
    attrs = (
        db.query(CatalogAttribute)
        .join(CatalogAttributeGroup, CatalogAttributeGroup.id == CatalogAttribute.group_id)
        .filter(CatalogAttributeGroup.profile_id == profile_id)
        .all()
    )
    sync_attribute_filters(db, attrs)


@router.patch("/{profile_id}", response_model=AttributeProfileResponse)
def update_profile(
    profile_id: str,
    payload: AttributeProfileUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeProfileResponse:
    row = db.get(CatalogAttributeProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return AttributeProfileResponse(data=_load_structure(db, profile_id))

    code = changes.get("code", row.code)
    if code != row.code:
        conflict = (
            db.query(CatalogAttributeProfile)
            .filter(CatalogAttributeProfile.code == code, CatalogAttributeProfile.id != profile_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Profile code already exists")

    if "category_labels" in changes:
        changes["category_labels"] = dump_json_list(changes["category_labels"])

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    return AttributeProfileResponse(data=_load_structure(db, profile_id))


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogAttributeProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(row)
    db.commit()
