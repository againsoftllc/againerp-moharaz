from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.paypal_plugin import PaypalPlugin
from app.schemas.paypal_plugin import (
    PaypalPluginRead,
    PaypalPluginResponse,
    PaypalPluginUpdate,
)
from app.services.cloudflare_client import _mask_hint
from app.services.paypal_client import verify_credentials

router = APIRouter(prefix="/plugins/paypal", tags=["plugins-paypal"])

DEFAULT_ID = "paypal-default"


def _get_or_create(db: Session) -> PaypalPlugin:
    row = db.get(PaypalPlugin, DEFAULT_ID)
    if row:
        return row
    row = PaypalPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: PaypalPlugin) -> PaypalPluginRead:
    return PaypalPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        client_id=row.client_id if len(row.client_id) <= 12 else "",
        client_id_set=bool(row.client_id),
        client_id_hint=_mask_hint(row.client_id),
        client_secret_set=bool(row.client_secret),
        currency=(row.currency or "USD").upper(),
        bdt_per_usd=row.bdt_per_usd or Decimal("110"),
        checkout_enabled=row.checkout_enabled,
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=PaypalPluginResponse)
def get_paypal_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> PaypalPluginResponse:
    return PaypalPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=PaypalPluginResponse)
def install_paypal_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PaypalPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return PaypalPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=PaypalPluginResponse)
def uninstall_paypal_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PaypalPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.client_id = ""
    row.client_secret = ""
    row.currency = "USD"
    row.bdt_per_usd = Decimal("110")
    row.checkout_enabled = True
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.access_token = ""
    row.token_expires_at = None
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return PaypalPluginResponse(data=_to_read(row))


@router.patch("", response_model=PaypalPluginResponse)
def update_paypal_plugin(
    payload: PaypalPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> PaypalPluginResponse:
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
    if payload.currency is not None:
        row.currency = payload.currency.strip().upper()[:3] or "USD"
    if payload.bdt_per_usd is not None and payload.bdt_per_usd > 0:
        row.bdt_per_usd = payload.bdt_per_usd
    if payload.checkout_enabled is not None:
        row.checkout_enabled = payload.checkout_enabled

    if credentials_changed:
        row.access_token = ""
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
    return PaypalPluginResponse(data=_to_read(row))
