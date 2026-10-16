"""Smart PC Builder — its own plugin, separate from Again Builder. Install
state here is the single source of truth for whether the real
compatibility-engine storefront page (/smart-pc-builder) is reachable; see
app/services/ecommerce/builder_plugin_settings.py where it's merged into the
same builder_plugins settings dict the storefront already reads."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.smart_pc_builder_plugin import SmartPcBuilderPlugin
from app.schemas.smart_pc_builder_plugin import (
    SmartPcBuilderPluginRead,
    SmartPcBuilderPluginResponse,
    SmartPcBuilderPluginUpdate,
)

router = APIRouter(prefix="/plugins/smart-pc-builder", tags=["plugins-smart-pc-builder"])

DEFAULT_ID = "smart-pc-builder-default"


def _get_or_create(db: Session) -> SmartPcBuilderPlugin:
    row = db.get(SmartPcBuilderPlugin, DEFAULT_ID)
    if row:
        return row
    row = SmartPcBuilderPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: SmartPcBuilderPlugin) -> SmartPcBuilderPluginRead:
    return SmartPcBuilderPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=SmartPcBuilderPluginResponse)
def get_smart_pc_builder_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> SmartPcBuilderPluginResponse:
    return SmartPcBuilderPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=SmartPcBuilderPluginResponse)
def install_smart_pc_builder_plugin(
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> SmartPcBuilderPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return SmartPcBuilderPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=SmartPcBuilderPluginResponse)
def uninstall_smart_pc_builder_plugin(
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> SmartPcBuilderPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    db.commit()
    db.refresh(row)
    return SmartPcBuilderPluginResponse(data=_to_read(row))


@router.patch("", response_model=SmartPcBuilderPluginResponse)
def update_smart_pc_builder_plugin(
    payload: SmartPcBuilderPluginUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> SmartPcBuilderPluginResponse:
    row = _get_or_create(db)
    changes = payload.model_dump(exclude_unset=True)
    if "enabled" in changes and changes["enabled"] is not None:
        row.enabled = bool(changes["enabled"])
    db.commit()
    db.refresh(row)
    return SmartPcBuilderPluginResponse(data=_to_read(row))
