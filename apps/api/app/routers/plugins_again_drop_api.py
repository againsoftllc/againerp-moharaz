"""AgainDropAPI (Dropshipping) plugin — DB-persisted Elim connection config."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.again_drop_api_plugin import AgainDropApiPlugin
from app.models.auth_user import AuthUser
from app.schemas.again_drop_api_plugin import (
    AgainDropApiPluginRead,
    AgainDropApiPluginResponse,
    AgainDropApiPluginUpdate,
    AgainDropApiTestResponse,
    AgainDropApiTestResult,
)
from app.services.elim_client import ElimClientError, search_products

router = APIRouter(prefix="/plugins/again-drop-api", tags=["plugins-again-drop-api"])

DEFAULT_ID = "ada-default"


def _mask_hint(secret: str) -> str:
    secret = secret.strip()
    if not secret:
        return ""
    return f"…{secret[-4:]}" if len(secret) > 4 else "…"


def get_or_create(db: Session) -> AgainDropApiPlugin:
    row = db.get(AgainDropApiPlugin, DEFAULT_ID)
    if row:
        return row
    row = AgainDropApiPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: AgainDropApiPlugin) -> AgainDropApiPluginRead:
    settings = get_settings()
    return AgainDropApiPluginRead(
        id=row.id,
        installed=row.installed,
        enabled=row.enabled,
        base_url=row.base_url,
        api_key_set=bool(row.api_key),
        api_key_hint=row.api_key_hint,
        use_server_key=row.use_server_key,
        server_key_available=bool((settings.elim_api_key or "").strip()),
        environment="production" if row.environment == "production" else "sandbox",
        timeout_ms=row.timeout_ms,
        retry_count=row.retry_count,
        default_platform="alibaba" if row.default_platform == "alibaba" else "taobao",
        default_lang=row.default_lang,
        connection_status=row.connection_status,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=AgainDropApiPluginResponse)
def get_again_drop_api_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> AgainDropApiPluginResponse:
    return AgainDropApiPluginResponse(data=_to_read(get_or_create(db)))


@router.post("/install", response_model=AgainDropApiPluginResponse)
def install_again_drop_api_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> AgainDropApiPluginResponse:
    row = get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return AgainDropApiPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=AgainDropApiPluginResponse)
def uninstall_again_drop_api_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> AgainDropApiPluginResponse:
    row = get_or_create(db)
    row.installed = False
    row.enabled = False
    row.api_key = ""
    row.api_key_hint = ""
    row.use_server_key = True
    row.connection_status = "disconnected"
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return AgainDropApiPluginResponse(data=_to_read(row))


@router.patch("", response_model=AgainDropApiPluginResponse)
def update_again_drop_api_plugin(
    payload: AgainDropApiPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> AgainDropApiPluginResponse:
    row = get_or_create(db)
    if not row.installed:
        row.installed = True
        row.enabled = True

    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.base_url is not None:
        row.base_url = payload.base_url.strip().rstrip("/") or "https://openapi.elim.asia"
    if payload.api_key is not None:
        key = payload.api_key.strip()
        row.api_key = key
        row.api_key_hint = _mask_hint(key)
        # Entering a real key switches to it; clearing falls back to the server key.
        row.use_server_key = not bool(key)
    if payload.use_server_key is not None:
        row.use_server_key = payload.use_server_key
    if payload.environment is not None:
        row.environment = payload.environment
    if payload.timeout_ms is not None:
        row.timeout_ms = payload.timeout_ms
    if payload.retry_count is not None:
        row.retry_count = payload.retry_count
    if payload.default_platform is not None:
        row.default_platform = payload.default_platform
    if payload.default_lang is not None:
        row.default_lang = payload.default_lang.strip() or "en"

    db.commit()
    db.refresh(row)
    return AgainDropApiPluginResponse(data=_to_read(row))


@router.post("/test", response_model=AgainDropApiTestResponse)
def test_again_drop_api_connection(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> AgainDropApiTestResponse:
    from datetime import datetime

    row = get_or_create(db)
    via = "server" if row.use_server_key or not row.api_key else "plugin"
    started = time.monotonic()
    try:
        data = search_products(
            q="phone",
            platform="alibaba" if row.default_platform == "alibaba" else "taobao",
            page=1,
            size=1,
            lang=row.default_lang or "en",
        )
        items = data.get("items") or []
        count = len(items) if isinstance(items, list) else 0
        latency = int((time.monotonic() - started) * 1000)
        row.connection_status = "connected"
        row.verified_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        result = AgainDropApiTestResult(
            ok=True,
            message=f"AgainDrop API key OK · {count} sample result(s)",
            latency_ms=latency,
            via=via,
            sample_count=count,
        )
    except ElimClientError as exc:
        latency = int((time.monotonic() - started) * 1000)
        row.connection_status = "error"
        db.commit()
        db.refresh(row)
        result = AgainDropApiTestResult(
            ok=False,
            message=str(exc),
            latency_ms=latency,
            via=via,
        )
    return AgainDropApiTestResponse(data=result, plugin=_to_read(row))
