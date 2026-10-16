from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.stripe_plugin import StripePlugin
from app.schemas.stripe_plugin import (
    StripePluginRead,
    StripePluginResponse,
    StripePluginUpdate,
)
from app.services.cloudflare_client import _mask_hint
from app.services.stripe_client import verify_credentials

router = APIRouter(prefix="/plugins/stripe", tags=["plugins-stripe"])

DEFAULT_ID = "stripe-default"


def _get_or_create(db: Session) -> StripePlugin:
    row = db.get(StripePlugin, DEFAULT_ID)
    if row:
        return row
    row = StripePlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: StripePlugin) -> StripePluginRead:
    return StripePluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        publishable_key="",
        publishable_key_set=bool(row.publishable_key),
        publishable_key_hint=_mask_hint(row.publishable_key),
        secret_key_set=bool(row.secret_key),
        currency=(row.currency or "USD").upper(),
        bdt_per_usd=row.bdt_per_usd or Decimal("110"),
        checkout_enabled=row.checkout_enabled,
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=StripePluginResponse)
def get_stripe_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> StripePluginResponse:
    return StripePluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=StripePluginResponse)
def install_stripe_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> StripePluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return StripePluginResponse(data=_to_read(row))


@router.delete("/install", response_model=StripePluginResponse)
def uninstall_stripe_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> StripePluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.publishable_key = ""
    row.secret_key = ""
    row.currency = "USD"
    row.bdt_per_usd = Decimal("110")
    row.checkout_enabled = True
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return StripePluginResponse(data=_to_read(row))


@router.patch("", response_model=StripePluginResponse)
def update_stripe_plugin(
    payload: StripePluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> StripePluginResponse:
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
    if payload.publishable_key is not None and payload.publishable_key.strip():
        row.publishable_key = payload.publishable_key.strip()
        credentials_changed = True
    if payload.secret_key is not None and payload.secret_key.strip():
        row.secret_key = payload.secret_key.strip()
        credentials_changed = True
    if payload.currency is not None:
        row.currency = payload.currency.strip().upper()[:3] or "USD"
    if payload.bdt_per_usd is not None and payload.bdt_per_usd > 0:
        row.bdt_per_usd = payload.bdt_per_usd
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
    return StripePluginResponse(data=_to_read(row))
