from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.configurator_build import ConfiguratorBuild
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_template import load_components
from app.schemas.configurator_build import (
    ConfiguratorBuildBulkStatusRequest,
    ConfiguratorBuildListMeta,
    ConfiguratorBuildListResponse,
    ConfiguratorBuildRead,
    ConfiguratorBuildResponse,
    ConfiguratorBuildUpdate,
)
from app.schemas.configurator_template import BuildComponentPick

router = APIRouter(prefix="/builds", tags=["configurator-builds"])


def _profile_name_map(db: Session) -> dict[str, str]:
    return {row.id: row.name for row in db.query(ConfiguratorProfile.id, ConfiguratorProfile.name).all()}


def _to_read(row: ConfiguratorBuild, profile_names: dict[str, str]) -> ConfiguratorBuildRead:
    return ConfiguratorBuildRead(
        id=row.id,
        company_id=row.company_id,
        profile_id=row.profile_id,
        profile_name=profile_names.get(row.profile_id, ""),
        name=row.name,
        build_code=row.build_code,
        customer_name=row.customer_name,
        user_name=row.user_name,
        components=[BuildComponentPick.model_validate(item) for item in load_components(row.components_json)],
        total_price=row.total_price,
        compatibility_status=row.compatibility_status,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_profile_build_count(db: Session, profile_id: str) -> None:
    profile = db.get(ConfiguratorProfile, profile_id)
    if not profile:
        return
    count = db.query(ConfiguratorBuild).filter(ConfiguratorBuild.profile_id == profile_id).count()
    profile.build_count = count


@router.get("", response_model=ConfiguratorBuildListResponse)
def list_builds(
    profile_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> ConfiguratorBuildListResponse:
    query = db.query(ConfiguratorBuild)
    if profile_id:
        query = query.filter(ConfiguratorBuild.profile_id == profile_id)
    rows = query.order_by(ConfiguratorBuild.updated_at.desc(), ConfiguratorBuild.name).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in rows]
    return ConfiguratorBuildListResponse(data=data, meta=ConfiguratorBuildListMeta(count=len(data)))


@router.patch("/bulk/status", response_model=ConfiguratorBuildListResponse)
def bulk_set_status(
    payload: ConfiguratorBuildBulkStatusRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorBuildListResponse:
    rows = db.query(ConfiguratorBuild).filter(ConfiguratorBuild.id.in_(payload.ids)).all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="One or more build ids not found")

    for row in rows:
        row.status = payload.status

    db.commit()

    all_rows = db.query(ConfiguratorBuild).order_by(ConfiguratorBuild.updated_at.desc()).all()
    profile_names = _profile_name_map(db)
    data = [_to_read(r, profile_names) for r in all_rows]
    return ConfiguratorBuildListResponse(data=data, meta=ConfiguratorBuildListMeta(count=len(data)))


@router.get("/{build_id}", response_model=ConfiguratorBuildResponse)
def get_build(build_id: str, db: Session = Depends(get_db)) -> ConfiguratorBuildResponse:
    row = db.get(ConfiguratorBuild, build_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator build not found")
    profile_names = _profile_name_map(db)
    return ConfiguratorBuildResponse(data=_to_read(row, profile_names))


@router.patch("/{build_id}", response_model=ConfiguratorBuildResponse)
def update_build(
    build_id: str,
    payload: ConfiguratorBuildUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorBuildResponse:
    row = db.get(ConfiguratorBuild, build_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator build not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        profile_names = _profile_name_map(db)
        return ConfiguratorBuildResponse(data=_to_read(row, profile_names))

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    profile_names = _profile_name_map(db)
    return ConfiguratorBuildResponse(data=_to_read(row, profile_names))


@router.delete("/{build_id}", status_code=204)
def delete_build(
    build_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorBuild, build_id)
    if not row:
        raise HTTPException(status_code=404, detail="Configurator build not found")
    profile_id = row.profile_id
    db.delete(row)
    db.commit()
    _sync_profile_build_count(db, profile_id)
    db.commit()
