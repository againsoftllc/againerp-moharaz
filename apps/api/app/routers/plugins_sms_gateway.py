from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.sms_gateway_plugin import (
    SMS_PROVIDER_DEFAULTS,
    SMS_PROVIDER_IDS,
    SmsGatewayPlugin,
)
from app.schemas.sms_gateway_plugin import (
    SmsGatewayPluginRead,
    SmsGatewayPluginResponse,
    SmsGatewayPluginUpdate,
    SmsGatewayTestRequest,
    SmsGatewayTestResponse,
)
from app.services.cloudflare_client import _mask_hint
from app.services.sms_gateway_client import verify_credentials

router = APIRouter(prefix="/plugins/sms-gateway", tags=["plugins-sms-gateway"])


def _resolve_provider(plugin_id: str) -> str:
    provider = SMS_PROVIDER_IDS.get(plugin_id)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Unknown SMS plugin: {plugin_id}")
    return provider


def _get_or_create(db: Session, plugin_id: str) -> SmsGatewayPlugin:
    provider = _resolve_provider(plugin_id)
    row = db.get(SmsGatewayPlugin, plugin_id)
    if row:
        return row
    defaults = SMS_PROVIDER_DEFAULTS.get(provider) or {}
    row = SmsGatewayPlugin(
        id=plugin_id,
        provider=provider,
        base_url=str(defaults.get("base_url") or ""),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: SmsGatewayPlugin) -> SmsGatewayPluginRead:
    return SmsGatewayPluginRead(
        id=row.id,
        provider=row.provider,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        environment="production" if row.environment == "production" else "sandbox",
        api_key_set=bool(row.api_key),
        api_key_hint=_mask_hint(row.api_key),
        api_key=row.api_key or "",
        api_secret_set=bool(row.api_secret),
        sender_id=row.sender_id or "",
        base_url=row.base_url or "",
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _disable_siblings(db: Session, keep_id: str) -> None:
    """Only one SMS gateway should drive OTP at a time."""
    siblings = (
        db.query(SmsGatewayPlugin)
        .filter(SmsGatewayPlugin.id != keep_id, SmsGatewayPlugin.enabled.is_(True))
        .all()
    )
    for sibling in siblings:
        sibling.enabled = False


@router.get("/{plugin_id}", response_model=SmsGatewayPluginResponse)
def get_sms_plugin(
    plugin_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> SmsGatewayPluginResponse:
    return SmsGatewayPluginResponse(data=_to_read(_get_or_create(db, plugin_id)))


@router.post("/{plugin_id}/install", response_model=SmsGatewayPluginResponse)
def install_sms_plugin(
    plugin_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SmsGatewayPluginResponse:
    row = _get_or_create(db, plugin_id)
    row.installed = True
    row.enabled = True
    _disable_siblings(db, plugin_id)
    db.commit()
    db.refresh(row)
    return SmsGatewayPluginResponse(data=_to_read(row))


@router.delete("/{plugin_id}/install", response_model=SmsGatewayPluginResponse)
def uninstall_sms_plugin(
    plugin_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SmsGatewayPluginResponse:
    row = _get_or_create(db, plugin_id)
    row.installed = False
    row.enabled = False
    row.environment = "sandbox"
    row.api_key = ""
    row.api_secret = ""
    row.sender_id = ""
    defaults = SMS_PROVIDER_DEFAULTS.get(row.provider) or {}
    row.base_url = str(defaults.get("base_url") or "")
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return SmsGatewayPluginResponse(data=_to_read(row))


@router.patch("/{plugin_id}", response_model=SmsGatewayPluginResponse)
def update_sms_plugin(
    plugin_id: str,
    payload: SmsGatewayPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SmsGatewayPluginResponse:
    row = _get_or_create(db, plugin_id)
    if not row.installed:
        row.installed = True
        row.enabled = True

    credentials_changed = False
    if payload.enabled is not None:
        row.enabled = payload.enabled
        if payload.enabled:
            _disable_siblings(db, plugin_id)
    if payload.environment is not None:
        if payload.environment != row.environment:
            credentials_changed = True
        row.environment = payload.environment
    if payload.api_key is not None and payload.api_key.strip():
        row.api_key = payload.api_key.strip()
        credentials_changed = True
    if payload.api_secret is not None and payload.api_secret.strip():
        row.api_secret = payload.api_secret.strip()
        credentials_changed = True
    if payload.sender_id is not None:
        row.sender_id = payload.sender_id.strip()
        credentials_changed = True
    if payload.base_url is not None:
        row.base_url = payload.base_url.strip()
        credentials_changed = True

    if credentials_changed:
        row.connection_status = "disconnected"
        row.connection_message = ""

    if payload.verify_connection:
        result = verify_credentials(row, test_phone=payload.test_phone)
        row.connection_status = "connected" if result.ok else "error"
        row.connection_message = result.message
        if result.ok:
            row.verified_at = datetime.utcnow()
        else:
            db.commit()
            raise HTTPException(status_code=400, detail=result.message)

    db.commit()
    db.refresh(row)
    return SmsGatewayPluginResponse(data=_to_read(row))


@router.post("/{plugin_id}/test", response_model=SmsGatewayTestResponse)
def test_sms_plugin(
    plugin_id: str,
    payload: SmsGatewayTestRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> SmsGatewayTestResponse:
    row = _get_or_create(db, plugin_id)
    if not row.installed:
        raise HTTPException(status_code=400, detail="Install the SMS plugin first")
    result = verify_credentials(row, test_phone=payload.phone)
    row.connection_status = "connected" if result.ok else "error"
    row.connection_message = result.message
    if result.ok:
        row.verified_at = datetime.utcnow()
    db.commit()
    if not result.ok:
        raise HTTPException(status_code=400, detail=result.message)
    return SmsGatewayTestResponse(ok=True, message=result.message)
