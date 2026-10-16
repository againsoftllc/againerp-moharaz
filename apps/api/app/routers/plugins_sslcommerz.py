from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.sslcommerz_plugin import SslcommerzPlugin
from app.schemas.sslcommerz_plugin import (
    SslcommerzPluginRead,
    SslcommerzPluginResponse,
    SslcommerzPluginUpdate,
)
from app.services.sslcommerz_client import verify_credentials

router = APIRouter(prefix="/plugins/sslcommerz", tags=["plugins-sslcommerz"])

DEFAULT_ID = "sslcommerz-default"


def _get_or_create(db: Session) -> SslcommerzPlugin:
    row = db.get(SslcommerzPlugin, DEFAULT_ID)
    if row:
        return row
    row = SslcommerzPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: SslcommerzPlugin) -> SslcommerzPluginRead:
    return SslcommerzPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        store_id=row.store_id,
        store_password_set=bool(row.store_password),
        checkout_enabled=row.checkout_enabled,
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=SslcommerzPluginResponse)
def get_sslcommerz_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> SslcommerzPluginResponse:
    return SslcommerzPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=SslcommerzPluginResponse)
def install_sslcommerz_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SslcommerzPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return SslcommerzPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=SslcommerzPluginResponse)
def uninstall_sslcommerz_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SslcommerzPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.store_id = ""
    row.store_password = ""
    row.checkout_enabled = True
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return SslcommerzPluginResponse(data=_to_read(row))


@router.patch("", response_model=SslcommerzPluginResponse)
def update_sslcommerz_plugin(
    payload: SslcommerzPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SslcommerzPluginResponse:
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
    if payload.store_id is not None:
        row.store_id = payload.store_id.strip()
        credentials_changed = True
    if payload.store_password is not None and payload.store_password.strip():
        row.store_password = payload.store_password.strip()
        credentials_changed = True
    if payload.checkout_enabled is not None:
        row.checkout_enabled = payload.checkout_enabled

    if credentials_changed:
        row.connection_status = "disconnected"
        row.connection_message = ""

    if payload.verify_connection:
        result = verify_credentials(row)
        row.connection_status = result.status
        row.connection_message = result.message
        if result.status == "connected":
            row.verified_at = datetime.utcnow()
        elif result.status == "error":
            db.commit()
            raise HTTPException(status_code=400, detail=result.message)

    db.commit()
    db.refresh(row)
    return SslcommerzPluginResponse(data=_to_read(row))
