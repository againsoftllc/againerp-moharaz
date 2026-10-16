from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.pathao_plugin import PathaoPlugin
from app.schemas.pathao_plugin import (
    PathaoPluginRead,
    PathaoPluginResponse,
    PathaoPluginUpdate,
)
from app.services.cloudflare_client import _mask_hint
from app.services.pathao_client import verify_credentials

router = APIRouter(prefix="/plugins/pathao", tags=["plugins-pathao"])

DEFAULT_ID = "pathao-default"


def _get_or_create(db: Session) -> PathaoPlugin:
    row = db.get(PathaoPlugin, DEFAULT_ID)
    if row:
        return row
    row = PathaoPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: PathaoPlugin) -> PathaoPluginRead:
    return PathaoPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        client_id="",
        client_id_set=bool(row.client_id),
        client_id_hint=_mask_hint(row.client_id),
        client_secret_set=bool(row.client_secret),
        username=row.username or "",
        password_set=bool(row.password),
        store_id=row.store_id or "",
        pickup_address=row.pickup_address or "",
        pickup_phone=row.pickup_phone or "",
        default_service=row.default_service or "regular",
        item_type=row.item_type or "parcel",
        auto_create_shipment=row.auto_create_shipment,
        sync_tracking=row.sync_tracking,
        cod_enabled=row.cod_enabled,
        webhook_url=row.webhook_url or "",
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=PathaoPluginResponse)
def get_pathao_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> PathaoPluginResponse:
    return PathaoPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=PathaoPluginResponse)
def install_pathao_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PathaoPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    row.connection_status = "disconnected"
    row.connection_message = "Installed — enter Pathao Merchant API credentials"
    db.commit()
    db.refresh(row)
    return PathaoPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=PathaoPluginResponse)
def uninstall_pathao_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PathaoPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.client_id = ""
    row.client_secret = ""
    row.username = ""
    row.password = ""
    row.store_id = ""
    row.pickup_address = ""
    row.pickup_phone = ""
    row.default_service = "regular"
    row.item_type = "parcel"
    row.auto_create_shipment = True
    row.sync_tracking = True
    row.cod_enabled = True
    row.webhook_url = ""
    row.access_token = ""
    row.refresh_token = ""
    row.token_expires_at = None
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return PathaoPluginResponse(data=_to_read(row))


@router.patch("", response_model=PathaoPluginResponse)
def update_pathao_plugin(
    payload: PathaoPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PathaoPluginResponse:
    row = _get_or_create(db)
    if not row.installed:
        row.installed = True
        row.enabled = True

    credentials_changed = False
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.environment is not None:
        if payload.environment != row.environment:
            credentials_changed = True
        row.environment = payload.environment
    if payload.client_id is not None and payload.client_id.strip():
        row.client_id = payload.client_id.strip()
        credentials_changed = True
    if payload.client_secret is not None and payload.client_secret.strip():
        row.client_secret = payload.client_secret.strip()
        credentials_changed = True
    if payload.username is not None:
        row.username = payload.username.strip()
        credentials_changed = True
    if payload.password is not None and payload.password.strip():
        row.password = payload.password.strip()
        credentials_changed = True
    if payload.store_id is not None:
        row.store_id = payload.store_id.strip()
    if payload.pickup_address is not None:
        row.pickup_address = payload.pickup_address.strip()
    if payload.pickup_phone is not None:
        row.pickup_phone = payload.pickup_phone.strip()
    if payload.default_service is not None:
        svc = payload.default_service.strip().lower()
        row.default_service = svc if svc in ("regular", "express", "same_day") else "regular"
    if payload.item_type is not None:
        it = payload.item_type.strip().lower()
        row.item_type = it if it in ("parcel", "document") else "parcel"
    if payload.auto_create_shipment is not None:
        row.auto_create_shipment = payload.auto_create_shipment
    if payload.sync_tracking is not None:
        row.sync_tracking = payload.sync_tracking
    if payload.cod_enabled is not None:
        row.cod_enabled = payload.cod_enabled
    if payload.webhook_url is not None:
        row.webhook_url = payload.webhook_url.strip()

    if credentials_changed:
        row.access_token = ""
        row.refresh_token = ""
        row.token_expires_at = None
        row.connection_status = "disconnected"
        row.connection_message = ""

    if payload.verify_connection:
        result = verify_credentials(db, row)
        row.connection_status = result.status
        row.connection_message = result.message
        if result.status == "connected":
            row.verified_at = datetime.utcnow()
            # Auto-fill store_id from first store when empty
            if not row.store_id and result.stores:
                first = result.stores[0]
                sid = first.get("store_id") or first.get("id")
                if sid is not None:
                    row.store_id = str(sid)
        elif result.status == "error":
            db.commit()
            raise HTTPException(status_code=400, detail=result.message)

    db.commit()
    db.refresh(row)
    return PathaoPluginResponse(data=_to_read(row))
