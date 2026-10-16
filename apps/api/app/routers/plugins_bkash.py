from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.bkash_plugin import BkashPlugin
from app.schemas.bkash_plugin import (
    BkashPluginRead,
    BkashPluginResponse,
    BkashPluginUpdate,
)
from app.services.bkash_client import verify_credentials
from app.services.cloudflare_client import _mask_hint

router = APIRouter(prefix="/plugins/bkash", tags=["plugins-bkash"])

DEFAULT_ID = "bkash-default"


def _get_or_create(db: Session) -> BkashPlugin:
    row = db.get(BkashPlugin, DEFAULT_ID)
    if row:
        return row
    row = BkashPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: BkashPlugin) -> BkashPluginRead:
    return BkashPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        username=row.username,
        password_set=bool(row.password),
        app_key_set=bool(row.app_key),
        app_key_hint=_mask_hint(row.app_key),
        app_secret_set=bool(row.app_secret),
        checkout_enabled=row.checkout_enabled,
        auto_verify=row.auto_verify,
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=BkashPluginResponse)
def get_bkash_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> BkashPluginResponse:
    return BkashPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=BkashPluginResponse)
def install_bkash_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> BkashPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return BkashPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=BkashPluginResponse)
def uninstall_bkash_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> BkashPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.username = ""
    row.password = ""
    row.app_key = ""
    row.app_secret = ""
    row.checkout_enabled = True
    row.auto_verify = True
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.id_token = ""
    row.token_expires_at = None
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return BkashPluginResponse(data=_to_read(row))


@router.patch("", response_model=BkashPluginResponse)
def update_bkash_plugin(
    payload: BkashPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> BkashPluginResponse:
    row = _get_or_create(db)
    # Saving config implies the merchant wants the plugin — auto-install instead
    # of failing when the browser's localStorage and the DB row disagree.
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
    if payload.username is not None:
        row.username = payload.username.strip()
        credentials_changed = True
    if payload.password is not None and payload.password.strip():
        row.password = payload.password.strip()
        credentials_changed = True
    if payload.app_key is not None and payload.app_key.strip():
        row.app_key = payload.app_key.strip()
        credentials_changed = True
    if payload.app_secret is not None and payload.app_secret.strip():
        row.app_secret = payload.app_secret.strip()
        credentials_changed = True
    if payload.checkout_enabled is not None:
        row.checkout_enabled = payload.checkout_enabled
    if payload.auto_verify is not None:
        row.auto_verify = payload.auto_verify

    if credentials_changed:
        # Force a fresh grant on next call — old cached token belongs to old creds/env.
        row.id_token = ""
        row.token_expires_at = None
        row.connection_status = "disconnected"
        row.connection_message = ""

    if payload.verify_connection:
        result = verify_credentials(db, row)
        row.connection_status = result.status
        row.connection_message = result.message
        if result.status == "connected":
            row.verified_at = datetime.utcnow()
        elif result.status == "error":
            db.commit()
            raise HTTPException(status_code=400, detail=result.message)

    db.commit()
    db.refresh(row)
    return BkashPluginResponse(data=_to_read(row))
