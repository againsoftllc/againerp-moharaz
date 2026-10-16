from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.builder_plugin import BuilderPlugin
from app.schemas.builder_plugin import (
    BuilderPluginRead,
    BuilderPluginResponse,
    BuilderPluginUpdate,
)
from app.services.builder_slot_packs import ensure_builder_slots_for_profile
from app.models.configurator_profile import ConfiguratorProfile

router = APIRouter(prefix="/plugins/again-builder", tags=["plugins-again-builder"])

DEFAULT_ID = "again-builder-default"
# Phase 1 focus: PC Builder only. Enable CCTV / Laptop later from the plugin panel.
DEFAULT_BUILDERS = ["pc-builder"]


def _parse_builders(raw: str | None) -> List[str]:
    if not raw:
        return list(DEFAULT_BUILDERS)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return list(DEFAULT_BUILDERS)
    if not isinstance(data, list):
        return list(DEFAULT_BUILDERS)
    out = [str(item).strip() for item in data if str(item).strip()]
    return out or list(DEFAULT_BUILDERS)


def _get_or_create(db: Session) -> BuilderPlugin:
    row = db.get(BuilderPlugin, DEFAULT_ID)
    if row:
        return row
    row = BuilderPlugin(
        id=DEFAULT_ID,
        enabled_builders_json=json.dumps(DEFAULT_BUILDERS),
        default_profile_slug="pc-builder",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: BuilderPlugin) -> BuilderPluginRead:
    return BuilderPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        enabled_builders=_parse_builders(row.enabled_builders_json),
        default_profile_slug=row.default_profile_slug or "pc-builder",
        admin_builders_href="/catalog/product-configurator",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _ensure_enabled_profiles(db: Session, slugs: List[str]) -> None:
    """Activate known builder profiles and seed slot packs."""
    for slug in slugs:
        row = (
            db.query(ConfiguratorProfile)
            .filter(ConfiguratorProfile.slug == slug)
            .first()
        )
        if not row:
            continue
        if row.status not in ("active", "published"):
            row.status = "active"
        ensure_builder_slots_for_profile(db, row)
    db.commit()


@router.get("", response_model=BuilderPluginResponse)
def get_builder_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> BuilderPluginResponse:
    return BuilderPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=BuilderPluginResponse)
def install_builder_plugin(
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BuilderPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    if not row.enabled_builders_json:
        row.enabled_builders_json = json.dumps(DEFAULT_BUILDERS)
    builders = _parse_builders(row.enabled_builders_json)
    _ensure_enabled_profiles(db, builders)
    db.commit()
    db.refresh(row)
    return BuilderPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=BuilderPluginResponse)
def uninstall_builder_plugin(
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BuilderPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    db.commit()
    db.refresh(row)
    return BuilderPluginResponse(data=_to_read(row))


@router.patch("", response_model=BuilderPluginResponse)
def update_builder_plugin(
    payload: BuilderPluginUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BuilderPluginResponse:
    row = _get_or_create(db)
    changes = payload.model_dump(exclude_unset=True)
    if "enabled" in changes and changes["enabled"] is not None:
        row.enabled = bool(changes["enabled"])
    if "enabled_builders" in changes and changes["enabled_builders"] is not None:
        builders = [str(s).strip() for s in changes["enabled_builders"] if str(s).strip()]
        row.enabled_builders_json = json.dumps(builders or DEFAULT_BUILDERS)
        if row.installed and row.enabled:
            _ensure_enabled_profiles(db, _parse_builders(row.enabled_builders_json))
    if "default_profile_slug" in changes and changes["default_profile_slug"]:
        row.default_profile_slug = str(changes["default_profile_slug"]).strip()
    db.commit()
    db.refresh(row)
    return BuilderPluginResponse(data=_to_read(row))
