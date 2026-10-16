from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_template import ConfiguratorTemplate, dump_components, load_components
from app.schemas.configurator_template import (
    BuildComponentPick,
    ConfiguratorTemplateBulkStatusRequest,
    ConfiguratorTemplateCreate,
    ConfiguratorTemplateListMeta,
    ConfiguratorTemplateListResponse,
    ConfiguratorTemplateRead,
    ConfiguratorTemplateResponse,
    ConfiguratorTemplateUpdate,
)

router = APIRouter(prefix="/templates", tags=["configurator-templates"])


def _profile_name_map(db: Session) -> dict[str, str]:
    return {row.id: row.name for row in db.query(ConfiguratorProfile.id, ConfiguratorProfile.name).all()}


def _to_read(row: ConfiguratorTemplate, profile_names: dict[str, str]) -> ConfiguratorTemplateRead:
    data = ConfiguratorTemplateRead(
        id=row.id,
        company_id=row.company_id,
        profile_id=row.profile_id,
        profile_name=profile_names.get(row.profile_id, ""),
        name=row.name,
        slug=row.slug,
        description=row.description,
        components=[BuildComponentPick.model_validate(item) for item in load_components(row.components_json)],
        is_featured=row.is_featured,
        status=row.status,
        use_count=row.use_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
    return data


def _sync_profile_template_count(db: Session, profile_id: str) -> None:
    profile = db.get(ConfiguratorProfile, profile_id)
    if not profile:
        return
    count = db.query(ConfiguratorTemplate).filter(ConfiguratorTemplate.profile_id == profile_id).count()
    profile.template_count = count


def _unique_slug(db: Session, profile_id: str, base_slug: str, exclude_id: str | None = None) -> str:
    slug = base_slug
    suffix = 1
    while True:
        conflict = db.query(ConfiguratorTemplate).filter(
            ConfiguratorTemplate.profile_id == profile_id,
            ConfiguratorTemplate.slug == slug,
        )
        if exclude_id:
            conflict = conflict.filter(ConfiguratorTemplate.id != exclude_id)
        if not conflict.first():
            return slug
        suffix += 1
        slug = f"{base_slug}-{suffix}"


@router.get("", response_model=ConfiguratorTemplateListResponse)
def list_templates(
    profile_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> ConfiguratorTemplateListResponse:
    query = db.query(ConfiguratorTemplate)
    if profile_id:
        query = query.filter(ConfiguratorTemplate.profile_id == profile_id)
    rows = query.order_by(ConfiguratorTemplate.name).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in rows]
    return ConfiguratorTemplateListResponse(data=data, meta=ConfiguratorTemplateListMeta(count=len(data)))


@router.patch("/bulk/status", response_model=ConfiguratorTemplateListResponse)
def bulk_set_status(
    payload: ConfiguratorTemplateBulkStatusRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorTemplateListResponse:
    rows = db.query(ConfiguratorTemplate).filter(ConfiguratorTemplate.id.in_(payload.ids)).all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="One or more template ids not found")

    for row in rows:
        row.status = payload.status

    db.commit()

    all_rows = db.query(ConfiguratorTemplate).order_by(ConfiguratorTemplate.name).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in all_rows]
    return ConfiguratorTemplateListResponse(data=data, meta=ConfiguratorTemplateListMeta(count=len(data)))


@router.get("/{template_id}", response_model=ConfiguratorTemplateResponse)
def get_template(template_id: str, db: Session = Depends(get_db)) -> ConfiguratorTemplateResponse:
    row = db.get(ConfiguratorTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator template not found")
    profile_names = _profile_name_map(db)
    return ConfiguratorTemplateResponse(data=_to_read(row, profile_names))


@router.post("", response_model=ConfiguratorTemplateResponse, status_code=201)
def create_template(
    payload: ConfiguratorTemplateCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorTemplateResponse:
    profile = db.get(ConfiguratorProfile, payload.profile_id)
    if not profile:
        raise HTTPException(status_code=400, detail="Configurator profile not found")

    existing = (
        db.query(ConfiguratorTemplate)
        .filter(
            ConfiguratorTemplate.profile_id == payload.profile_id,
            ConfiguratorTemplate.slug == payload.slug,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Template slug already exists for this profile")

    row = ConfiguratorTemplate(
        profile_id=payload.profile_id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        components_json=dump_components([c.model_dump() for c in payload.components]),
        is_featured=payload.is_featured,
        status=payload.status,
    )
    db.add(row)
    db.commit()
    _sync_profile_template_count(db, payload.profile_id)
    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorTemplateResponse(data=_to_read(row, profile_names))


@router.patch("/{template_id}", response_model=ConfiguratorTemplateResponse)
def update_template(
    template_id: str,
    payload: ConfiguratorTemplateUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorTemplateResponse:
    row = db.get(ConfiguratorTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator template not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        profile_names = _profile_name_map(db)
        return ConfiguratorTemplateResponse(data=_to_read(row, profile_names))

    profile_id = changes.get("profile_id", row.profile_id)
    if profile_id != row.profile_id:
        profile = db.get(ConfiguratorProfile, profile_id)
        if not profile:
            raise HTTPException(status_code=400, detail="Configurator profile not found")

    slug = changes.get("slug", row.slug)
    if slug != row.slug or profile_id != row.profile_id:
        conflict = (
            db.query(ConfiguratorTemplate)
            .filter(
                ConfiguratorTemplate.profile_id == profile_id,
                ConfiguratorTemplate.slug == slug,
                ConfiguratorTemplate.id != template_id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Template slug already exists for this profile")

    old_profile_id = row.profile_id
    components = changes.pop("components", None)
    for key, value in changes.items():
        setattr(row, key, value)
    if components is not None:
        row.components_json = dump_components([BuildComponentPick.model_validate(c).model_dump() for c in components])

    db.commit()
    _sync_profile_template_count(db, old_profile_id)
    if profile_id != old_profile_id:
        _sync_profile_template_count(db, profile_id)
    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorTemplateResponse(data=_to_read(row, profile_names))


@router.post("/{template_id}/duplicate", response_model=ConfiguratorTemplateResponse, status_code=201)
def duplicate_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorTemplateResponse:
    source = db.get(ConfiguratorTemplate, template_id)
    if not source:
        raise HTTPException(status_code=404, detail="Configurator template not found")

    row = ConfiguratorTemplate(
        profile_id=source.profile_id,
        name=f"{source.name} (copy)",
        slug=_unique_slug(db, source.profile_id, f"{source.slug}-copy"),
        description=source.description,
        components_json=source.components_json,
        is_featured=False,
        status="draft",
        use_count=0,
    )
    db.add(row)
    db.commit()
    _sync_profile_template_count(db, source.profile_id)
    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorTemplateResponse(data=_to_read(row, profile_names))


@router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator template not found")
    profile_id = row.profile_id
    db.delete(row)
    db.commit()
    _sync_profile_template_count(db, profile_id)
    db.commit()
