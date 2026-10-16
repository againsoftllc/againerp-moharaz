from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.configurator_category import (
    ConfiguratorCategory,
    ensure_configurator_category_catalog_column,
)
from app.models.configurator_profile import ConfiguratorProfile
from app.schemas.configurator_category import (
    ConfiguratorCategoryBulkStatusRequest,
    ConfiguratorCategoryCreate,
    ConfiguratorCategoryListMeta,
    ConfiguratorCategoryListResponse,
    ConfiguratorCategoryRead,
    ConfiguratorCategoryResponse,
    ConfiguratorCategoryUpdate,
)

router = APIRouter(prefix="/categories", tags=["configurator-categories"])


def _profile_name_map(db: Session) -> dict[str, str]:
    return {row.id: row.name for row in db.query(ConfiguratorProfile.id, ConfiguratorProfile.name).all()}


def _load_json_list(raw: str | None) -> list:
    import json

    if not raw:
        return []
    try:
        value = json.loads(raw)
    except ValueError:
        return []
    return value if isinstance(value, list) else []


def _to_read(row: ConfiguratorCategory, profile_names: dict[str, str]) -> ConfiguratorCategoryRead:
    data = ConfiguratorCategoryRead.model_validate(row)
    data.profile_name = profile_names.get(row.profile_id, "")
    data.conditions = _load_json_list(row.conditions_json)
    data.specs = _load_json_list(row.specs_json)
    # Rows seeded before min/max existed (or by older callers) only carry
    # is_required / selection_mode — never report limits that contradict them.
    data.min_select = max(row.min_select or 0, 1 if row.is_required else 0)
    data.max_select = max(row.max_select or 1, 2 if row.selection_mode == "multiple" else 1)
    return data


def _sync_limits(row: ConfiguratorCategory, explicit: set[str]) -> None:
    """Keep min/max_select, is_required and selection_mode agreeing. The slot
    editor sends min/max; older callers send only is_required/selection_mode —
    translate those so neither side drifts."""
    if not explicit & {"min_select", "max_select", "is_required", "selection_mode"}:
        return
    if "min_select" not in explicit and "is_required" in explicit:
        row.min_select = 1 if row.is_required else 0
    if "max_select" not in explicit and "selection_mode" in explicit:
        row.max_select = max(row.max_select, 2) if row.selection_mode == "multiple" else 1
    row.max_select = max(row.max_select, 1)
    row.min_select = min(row.min_select, row.max_select)
    row.is_required = row.min_select >= 1
    row.selection_mode = "multiple" if row.max_select > 1 else "single"


def _sync_profile_category_count(db: Session, profile_id: str) -> None:
    profile = db.get(ConfiguratorProfile, profile_id)
    if not profile:
        return
    count = db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == profile_id).count()
    profile.category_count = count


def _next_sort_order(db: Session, profile_id: str) -> int:
    max_order = (
        db.query(ConfiguratorCategory.sort_order)
        .filter(ConfiguratorCategory.profile_id == profile_id)
        .order_by(ConfiguratorCategory.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 1


@router.get("", response_model=ConfiguratorCategoryListResponse)
def list_categories(
    profile_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> ConfiguratorCategoryListResponse:
    ensure_configurator_category_catalog_column()
    query = db.query(ConfiguratorCategory)
    if profile_id:
        query = query.filter(ConfiguratorCategory.profile_id == profile_id)
    rows = query.order_by(ConfiguratorCategory.sort_order, ConfiguratorCategory.name).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in rows]
    return ConfiguratorCategoryListResponse(data=data, meta=ConfiguratorCategoryListMeta(count=len(data)))


@router.patch("/bulk/status", response_model=ConfiguratorCategoryListResponse)
def bulk_set_status(
    payload: ConfiguratorCategoryBulkStatusRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorCategoryListResponse:
    rows = db.query(ConfiguratorCategory).filter(ConfiguratorCategory.id.in_(payload.ids)).all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="One or more category ids not found")

    for row in rows:
        row.status = payload.status

    db.commit()

    all_rows = db.query(ConfiguratorCategory).order_by(ConfiguratorCategory.sort_order).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in all_rows]
    return ConfiguratorCategoryListResponse(data=data, meta=ConfiguratorCategoryListMeta(count=len(data)))


class _DraftPreviewBody(BaseModel):
    category_id: Optional[str] = None
    slug: str = ""
    catalog_category_slug: str = ""
    attribute_profile_id: str = ""
    conditions: list[dict] = []
    include: list[str] = []
    exclude: list[str] = []


@router.post("/preview-draft")
def preview_draft_slot(
    payload: _DraftPreviewBody,
    db: Session = Depends(get_db),
) -> dict:
    """Live preview for the slot editor, including slots not saved yet: shown
    products, plus hidden ones with the reason each is hidden."""
    from app.services.ecommerce.storefront_configurator_service import StorefrontConfiguratorService

    # Always a transient copy: the draft's binding must never be written back.
    saved = db.get(ConfiguratorCategory, payload.category_id) if payload.category_id else None
    category = ConfiguratorCategory(
        slug=(saved.slug if saved else payload.slug) or "",
        catalog_category_slug=payload.catalog_category_slug or (saved.catalog_category_slug if saved else "") or "",
        attribute_profile_id=payload.attribute_profile_id or None,
        name=(saved.name if saved else payload.slug) or "",
    )
    result = StorefrontConfiguratorService(db).slot_preview(
        category,
        conditions=payload.conditions,
        include_ids=payload.include,
        exclude_ids=payload.exclude,
    )
    return {"data": result}


@router.get("/pickable-products")
def pickable_products(q: str = Query(""), db: Session = Depends(get_db)) -> dict:
    from app.services.ecommerce.storefront_configurator_service import StorefrontConfiguratorService

    if len(q.strip()) < 2:
        return {"data": []}
    return {"data": StorefrontConfiguratorService(db).search_pickable_products(q)}


@router.get("/filters-for")
def filters_for(
    slug: str = Query(""),
    catalog_category_slug: str = Query(""),
    profile_id: str = Query(""),
    db: Session = Depends(get_db),
) -> dict:
    """Filters Registry fields for a slot that may not exist yet - resolved from
    the slot slug, else from the catalog category it is bound to."""
    from app.services import configurator_filters

    fields = None
    if profile_id:
        fields = configurator_filters.list_filters_for_profile(db, profile_id)
    if fields is None and catalog_category_slug:
        fields = configurator_filters.list_filters_for_catalog_category(db, catalog_category_slug)
    if fields is None:
        fields = configurator_filters.list_filters_for_category_slug(db, slug)
        if not any(f["source"] == "attribute" for f in fields) and catalog_category_slug:
            fields = configurator_filters.list_filters_for_catalog_slug(db, catalog_category_slug)
    return {"data": fields, "meta": {"count": len(fields)}}


@router.get("/{category_id}", response_model=ConfiguratorCategoryResponse)
def get_category(category_id: str, db: Session = Depends(get_db)) -> ConfiguratorCategoryResponse:
    row = db.get(ConfiguratorCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator category not found")
    profile_names = _profile_name_map(db)
    return ConfiguratorCategoryResponse(data=_to_read(row, profile_names))


@router.post("/{category_id}/preview")
def preview_category_conditions(
    category_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> dict:
    """Live preview for the slot editor's condition-builder: evaluate a DRAFT
    (not-yet-saved) condition list against real catalog data — nothing is
    written. Body: {"conditions": [{"f","op","v?"}, ...]}."""
    from app.services.ecommerce.storefront_configurator_service import StorefrontConfiguratorService

    row = db.get(ConfiguratorCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator category not found")
    profile = db.get(ConfiguratorProfile, row.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Configurator profile not found")
    conditions = payload.get("conditions", [])
    products = StorefrontConfiguratorService(db).list_slot_products(
        profile, row.slug, limit=200, conditions_override=conditions,
    )
    return {"data": products, "meta": {"count": len(products)}}


@router.get("/{category_id}/filters")
def get_category_filters(category_id: str, db: Session = Depends(get_db)) -> dict:
    """The Filters Registry for this slot: real typed catalog attributes for
    its component group, plus Chipset-Lookup and rule-engine pseudo-fields —
    what the condition-builder and Rules editor field/operator pickers read."""
    from app.services import configurator_filters

    row = db.get(ConfiguratorCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator category not found")
    fields = None
    if (row.attribute_profile_id or "").strip():
        fields = configurator_filters.list_filters_for_profile(db, row.attribute_profile_id.strip())
    if fields is None and (row.catalog_category_slug or "").strip():
        # Fields follow the category this slot is bound to (its attribute profile).
        fields = configurator_filters.list_filters_for_catalog_category(db, row.catalog_category_slug.strip())
    if fields is None:
        fields = configurator_filters.list_filters_for_category_slug(db, row.slug)
    return {"data": fields, "meta": {"count": len(fields)}}


@router.post("", response_model=ConfiguratorCategoryResponse, status_code=201)
def create_category(
    payload: ConfiguratorCategoryCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorCategoryResponse:
    ensure_configurator_category_catalog_column()
    profile = db.get(ConfiguratorProfile, payload.profile_id)
    if not profile:
        raise HTTPException(status_code=400, detail="Configurator profile not found")

    existing = (
        db.query(ConfiguratorCategory)
        .filter(
            ConfiguratorCategory.profile_id == payload.profile_id,
            ConfiguratorCategory.slug == payload.slug,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Category slug already exists for this profile")

    import json

    data = payload.model_dump()
    conditions = data.pop("conditions", [])
    specs = data.pop("specs", [])
    row = ConfiguratorCategory(**data, conditions_json=json.dumps(conditions), specs_json=json.dumps(specs))
    _sync_limits(row, set(payload.model_fields_set))
    row.catalog_category_slug = (row.catalog_category_slug or "").strip()
    if row.sort_order == 0:
        row.sort_order = _next_sort_order(db, payload.profile_id)

    db.add(row)
    db.commit()
    _sync_profile_category_count(db, payload.profile_id)
    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorCategoryResponse(data=_to_read(row, profile_names))


@router.patch("/{category_id}", response_model=ConfiguratorCategoryResponse)
def update_category(
    category_id: str,
    payload: ConfiguratorCategoryUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorCategoryResponse:
    row = db.get(ConfiguratorCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator category not found")

    ensure_configurator_category_catalog_column()
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        profile_names = _profile_name_map(db)
        return ConfiguratorCategoryResponse(data=_to_read(row, profile_names))

    profile_id = changes.get("profile_id", row.profile_id)
    if profile_id != row.profile_id:
        profile = db.get(ConfiguratorProfile, profile_id)
        if not profile:
            raise HTTPException(status_code=400, detail="Configurator profile not found")

    slug = changes.get("slug", row.slug)
    if "catalog_category_slug" in changes and changes["catalog_category_slug"] is not None:
        changes["catalog_category_slug"] = str(changes["catalog_category_slug"]).strip()
    if slug != row.slug or profile_id != row.profile_id:
        conflict = (
            db.query(ConfiguratorCategory)
            .filter(
                ConfiguratorCategory.profile_id == profile_id,
                ConfiguratorCategory.slug == slug,
                ConfiguratorCategory.id != category_id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Category slug already exists for this profile")

    import json

    if "conditions" in changes:
        changes["conditions_json"] = json.dumps(changes.pop("conditions"))
    if "specs" in changes:
        changes["specs_json"] = json.dumps(changes.pop("specs"))

    old_profile_id = row.profile_id
    for key, value in changes.items():
        setattr(row, key, value)
    _sync_limits(row, set(changes))

    db.commit()
    _sync_profile_category_count(db, old_profile_id)
    if profile_id != old_profile_id:
        _sync_profile_category_count(db, profile_id)
    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorCategoryResponse(data=_to_read(row, profile_names))


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator category not found")
    profile_id = row.profile_id
    db.delete(row)
    db.commit()
    _sync_profile_category_count(db, profile_id)
    db.commit()
