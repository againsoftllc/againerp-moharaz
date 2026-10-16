from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_category import ConfiguratorCategory
from app.schemas.configurator_profile import (
    ConfiguratorProfileBulkStatusRequest,
    ConfiguratorProfileCreate,
    ConfiguratorProfileListMeta,
    ConfiguratorProfileListResponse,
    ConfiguratorProfileRead,
    ConfiguratorProfileResponse,
    ConfiguratorProfileUpdate,
)

from app.services.builder_slot_packs import ensure_builder_slots_for_profile

router = APIRouter(prefix="/profiles", tags=["configurator-profiles"])


def _to_read(row: ConfiguratorProfile) -> ConfiguratorProfileRead:
    return ConfiguratorProfileRead.model_validate(row)


def _clear_default_for_type(db: Session, profile_type: str, exclude_id: str | None = None) -> None:
    query = db.query(ConfiguratorProfile).filter(
        ConfiguratorProfile.profile_type == profile_type,
        ConfiguratorProfile.is_default.is_(True),
    )
    if exclude_id:
        query = query.filter(ConfiguratorProfile.id != exclude_id)
    for row in query.all():
        row.is_default = False


def _unique_slug(db: Session, base_slug: str, exclude_id: str | None = None) -> str:
    slug = base_slug
    suffix = 1
    while True:
        conflict = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.slug == slug)
        if exclude_id:
            conflict = conflict.filter(ConfiguratorProfile.id != exclude_id)
        if not conflict.first():
            return slug
        suffix += 1
        slug = f"{base_slug}-{suffix}"


@router.get("", response_model=ConfiguratorProfileListResponse)
def list_profiles(db: Session = Depends(get_db)) -> ConfiguratorProfileListResponse:
    rows = (
        db.query(ConfiguratorProfile)
        .order_by(ConfiguratorProfile.name)
        .all()
    )
    data = [_to_read(r) for r in rows]
    return ConfiguratorProfileListResponse(data=data, meta=ConfiguratorProfileListMeta(count=len(data)))


@router.patch("/bulk/status", response_model=ConfiguratorProfileListResponse)
def bulk_set_status(
    payload: ConfiguratorProfileBulkStatusRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorProfileListResponse:
    rows = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.id.in_(payload.ids)).all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="One or more profile ids not found")

    for row in rows:
        row.status = payload.status

    db.commit()

    all_rows = db.query(ConfiguratorProfile).order_by(ConfiguratorProfile.name).all()
    data = [_to_read(r) for r in all_rows]
    return ConfiguratorProfileListResponse(data=data, meta=ConfiguratorProfileListMeta(count=len(data)))


@router.get("/{profile_id}", response_model=ConfiguratorProfileResponse)
def get_profile(profile_id: str, db: Session = Depends(get_db)) -> ConfiguratorProfileResponse:
    row = db.get(ConfiguratorProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator profile not found")
    return ConfiguratorProfileResponse(data=_to_read(row))


@router.post("", response_model=ConfiguratorProfileResponse, status_code=201)
def create_profile(
    payload: ConfiguratorProfileCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorProfileResponse:
    existing = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Profile slug already exists")

    row = ConfiguratorProfile(**payload.model_dump())
    if row.is_default:
        _clear_default_for_type(db, row.profile_type)

    db.add(row)
    db.flush()
    ensure_builder_slots_for_profile(db, row)
    row.category_count = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == row.id)
        .count()
    )
    db.commit()
    db.refresh(row)
    return ConfiguratorProfileResponse(data=_to_read(row))


@router.patch("/{profile_id}", response_model=ConfiguratorProfileResponse)
def update_profile(
    profile_id: str,
    payload: ConfiguratorProfileUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorProfileResponse:
    row = db.get(ConfiguratorProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator profile not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return ConfiguratorProfileResponse(data=_to_read(row))

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = (
            db.query(ConfiguratorProfile)
            .filter(ConfiguratorProfile.slug == slug, ConfiguratorProfile.id != profile_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Profile slug already exists")

    profile_type = changes.get("profile_type", row.profile_type)
    will_be_default = changes.get("is_default", row.is_default)
    if will_be_default:
        _clear_default_for_type(db, profile_type, exclude_id=profile_id)

    for key, value in changes.items():
        setattr(row, key, value)

    if row.status in ("active", "published"):
        ensure_builder_slots_for_profile(db, row)
        row.category_count = (
            db.query(ConfiguratorCategory)
            .filter(ConfiguratorCategory.profile_id == row.id)
            .count()
        )

    db.commit()
    db.refresh(row)
    return ConfiguratorProfileResponse(data=_to_read(row))


@router.post("/{profile_id}/duplicate", response_model=ConfiguratorProfileResponse, status_code=201)
def duplicate_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorProfileResponse:
    source = db.get(ConfiguratorProfile, profile_id)
    if not source:
        raise HTTPException(status_code=404, detail="Configurator profile not found")

    row = ConfiguratorProfile(
        name=f"{source.name} (copy)",
        slug=_unique_slug(db, f"{source.slug}-copy"),
        profile_type=source.profile_type,
        description=source.description,
        is_default=False,
        status="draft",
    )
    db.add(row)
    db.flush()
    ensure_builder_slots_for_profile(db, row)
    row.category_count = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == row.id)
        .count()
    )
    db.commit()
    db.refresh(row)
    return ConfiguratorProfileResponse(data=_to_read(row))


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator profile not found")
    db.delete(row)
    db.commit()
