from __future__ import annotations

from datetime import datetime
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.cloudflare_plugin import CloudflarePlugin
from app.schemas.cloudflare_plugin import (
    CloudflareOAuthAuthorizeEnvelope,
    CloudflareOAuthAuthorizeResponse,
    CloudflarePluginRead,
    CloudflarePluginResponse,
    CloudflarePluginUpdate,
)
from app.models.platform_setting import PlatformSetting
from app.services.cloudflare_client import (
    _mask_hint,
    resolve_account_from_token,
    verify_account_token,
    verify_images,
    verify_r2_bucket,
)
from app.services.cloudflare_oauth import (
    CloudflareOAuthError,
    OAUTH_CLIENT_ID_KEY,
    OAUTH_CLIENT_SECRET_KEY,
    build_authorize_url,
    create_oauth_state,
    exchange_authorization_code,
    fetch_primary_account_id,
    oauth_client_id,
    oauth_is_configured,
    verify_oauth_state,
    web_redirect_base,
)
from app.services.cloudflare_r2_provision import provision_r2_after_connect

router = APIRouter(prefix="/plugins/cloudflare", tags=["plugins-cloudflare"])

DEFAULT_ID = "cf-default"


def _get_or_create(db: Session) -> CloudflarePlugin:
    row = db.get(CloudflarePlugin, DEFAULT_ID)
    if row:
        return row
    row = CloudflarePlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _upsert_platform_setting(
    db: Session,
    key: str,
    value: str,
    description: str,
    *,
    is_secret: bool = True,
) -> None:
    value = value.strip()
    if not value:
        return
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = value
        row.description = description
        row.is_secret = is_secret
    else:
        db.add(
            PlatformSetting(
                key=key,
                value=value,
                description=description,
                is_secret=is_secret,
            )
        )


def _oauth_secret_set(db: Session, key: str) -> bool:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return bool(row and (row.value or "").strip())


def _to_read(row: CloudflarePlugin, db: Optional[Session] = None) -> CloudflarePluginRead:
    auth_method = row.auth_method if row.auth_method in {"manual", "oauth"} else "manual"
    client_id = oauth_client_id()
    secret_set = False
    if db is not None:
        secret_set = _oauth_secret_set(db, OAUTH_CLIENT_SECRET_KEY)
    else:
        secret_set = bool(oauth_is_configured() and client_id)
    return CloudflarePluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        account_status=row.account_status,
        account_id=row.account_id,
        account_name=row.account_name,
        auth_method=auth_method,
        oauth_available=oauth_is_configured(),
        oauth_client_id_set=bool(client_id),
        oauth_client_secret_set=secret_set,
        oauth_client_id=client_id,
        api_token_set=bool(row.api_token),
        api_token_hint=row.api_token_hint,
        media_storage=row.media_storage if row.media_storage in {"local", "r2"} else "local",
        r2_status=row.r2_status,
        r2_bucket=row.r2_bucket,
        r2_access_key_set=bool(row.r2_access_key_id),
        r2_public_base_url=row.r2_public_base_url,
        images_status=row.images_status,
        images_account_hash=row.images_account_hash,
        images_api_token_set=bool(row.images_api_token),
        images_api_token_hint=row.images_api_token_hint,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=CloudflarePluginResponse)
def get_cloudflare_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> CloudflarePluginResponse:
    row = _get_or_create(db)
    return CloudflarePluginResponse(data=_to_read(row, db))


@router.post("/provision-r2", response_model=CloudflarePluginResponse)
async def provision_cloudflare_r2(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> CloudflarePluginResponse:
    """Re-run R2 bucket + media_storage wiring using the current Cloudflare token."""
    row = _get_or_create(db)
    if not row.installed:
        raise HTTPException(status_code=400, detail="Install Cloudflare plugin first")
    if row.account_status != "connected" or not row.api_token.strip():
        raise HTTPException(
            status_code=400,
            detail="Connect Cloudflare first (OAuth or API token), then provision R2",
        )
    message = await provision_r2_after_connect(db, row)
    db.refresh(row)
    if row.r2_status != "connected":
        raise HTTPException(status_code=400, detail=message)
    return CloudflarePluginResponse(data=_to_read(row, db))


@router.get("/oauth/authorize", response_model=CloudflareOAuthAuthorizeEnvelope)
def start_cloudflare_oauth(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> CloudflareOAuthAuthorizeEnvelope:
    if not oauth_is_configured():
        raise HTTPException(
            status_code=400,
            detail="Cloudflare OAuth is not configured. Set CLOUDFLARE_OAUTH_CLIENT_ID and CLOUDFLARE_OAUTH_CLIENT_SECRET in API .env",
        )
    row = _get_or_create(db)
    if not row.installed:
        row.installed = True
        row.enabled = True
        db.commit()
    state = create_oauth_state()
    url = build_authorize_url(state)
    return CloudflareOAuthAuthorizeEnvelope(data=CloudflareOAuthAuthorizeResponse(url=url))


@router.get("/oauth/callback")
async def cloudflare_oauth_callback(
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
    error_description: str = Query(default=""),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    base = web_redirect_base()
    if error:
        message = quote(error_description or error)
        return RedirectResponse(url=f"{base}?oauth=error&message={message}")
    if not code or not state or not verify_oauth_state(state):
        return RedirectResponse(url=f"{base}?oauth=error&message=Invalid%20OAuth%20state")

    row = _get_or_create(db)
    try:
        token_payload = await exchange_authorization_code(code)
        access_token = str(token_payload.get("access_token") or "")
        refresh_token = str(token_payload.get("refresh_token") or "")
        account_id, account_name = await fetch_primary_account_id(access_token)
        row.installed = True
        row.enabled = True
        row.auth_method = "oauth"
        row.api_token = access_token
        row.api_token_hint = _mask_hint(access_token)
        row.oauth_refresh_token = refresh_token
        row.account_id = account_id
        row.account_name = account_name
        verify = await verify_account_token(account_id, access_token)
        row.account_status = verify.status
        if verify.status == "connected":
            row.verified_at = datetime.utcnow()
        else:
            raise CloudflareOAuthError(verify.message or "Cloudflare verification failed")
        db.commit()
        # Auto-wire R2 bucket + media_storage after a fresh OAuth connect.
        try:
            await provision_r2_after_connect(db, row)
        except Exception:
            pass
    except (CloudflareOAuthError, HTTPException) as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        return RedirectResponse(url=f"{base}?oauth=error&message={quote(str(detail))}")
    except Exception:
        return RedirectResponse(url=f"{base}?oauth=error&message=Cloudflare%20connection%20failed")

    return RedirectResponse(url=f"{base}?oauth=success")


@router.post("/install", response_model=CloudflarePluginResponse)
def install_cloudflare_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> CloudflarePluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return CloudflarePluginResponse(data=_to_read(row, db))


@router.delete("/install", response_model=CloudflarePluginResponse)
def uninstall_cloudflare_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> CloudflarePluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.account_status = "disconnected"
    row.account_id = ""
    row.account_name = ""
    row.auth_method = "manual"
    row.api_token = ""
    row.api_token_hint = ""
    row.oauth_refresh_token = ""
    row.media_storage = "local"
    row.r2_status = "disconnected"
    row.r2_bucket = ""
    row.r2_access_key_id = ""
    row.r2_secret_access_key = ""
    row.r2_public_base_url = ""
    row.images_status = "disconnected"
    row.images_account_hash = ""
    row.images_api_token = ""
    row.images_api_token_hint = ""
    row.verified_at = None
    db.commit()
    db.refresh(row)
    return CloudflarePluginResponse(data=_to_read(row, db))


@router.patch("", response_model=CloudflarePluginResponse)
async def update_cloudflare_plugin(
    payload: CloudflarePluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> CloudflarePluginResponse:
    row = _get_or_create(db)
    if not row.installed:
        raise HTTPException(status_code=400, detail="Install Cloudflare plugin first")

    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.account_id is not None:
        row.account_id = payload.account_id.strip()
    if payload.api_token is not None:
        row.api_token = payload.api_token.strip()
        row.api_token_hint = _mask_hint(row.api_token)
        row.auth_method = "manual"
        row.oauth_refresh_token = ""
    if payload.oauth_client_id is not None:
        _upsert_platform_setting(
            db,
            OAUTH_CLIENT_ID_KEY,
            payload.oauth_client_id,
            "Cloudflare OAuth Client ID (Connect with Cloudflare)",
            is_secret=False,
        )
    if payload.oauth_client_secret is not None:
        _upsert_platform_setting(
            db,
            OAUTH_CLIENT_SECRET_KEY,
            payload.oauth_client_secret,
            "Cloudflare OAuth Client Secret (Connect with Cloudflare)",
            is_secret=True,
        )
    if payload.media_storage is not None:
        if payload.media_storage == "r2" and row.account_status != "connected":
            raise HTTPException(status_code=400, detail="Verify Cloudflare account before using R2 storage")
        if payload.media_storage == "r2" and row.r2_status != "connected":
            raise HTTPException(status_code=400, detail="Connect R2 storage before switching media storage")
        row.media_storage = payload.media_storage
    if payload.r2_bucket is not None:
        row.r2_bucket = payload.r2_bucket.strip()
    if payload.r2_access_key_id is not None:
        row.r2_access_key_id = payload.r2_access_key_id.strip()
    if payload.r2_secret_access_key is not None:
        row.r2_secret_access_key = payload.r2_secret_access_key.strip()
    if payload.r2_public_base_url is not None:
        row.r2_public_base_url = payload.r2_public_base_url.strip()
    if payload.images_account_hash is not None:
        row.images_account_hash = payload.images_account_hash.strip()
    if payload.images_api_token is not None:
        row.images_api_token = payload.images_api_token.strip()
        row.images_api_token_hint = _mask_hint(row.images_api_token)

    if payload.verify_account:
        if row.api_token.strip() and not row.account_id.strip():
            resolved_id, resolved_name = await resolve_account_from_token(row.api_token)
            if resolved_id:
                row.account_id = resolved_id
            if resolved_name:
                row.account_name = resolved_name
        result = await verify_account_token(row.account_id, row.api_token)
        row.account_status = result.status
        if result.status == "connected":
            row.verified_at = datetime.utcnow()
            if row.api_token.strip():
                resolved_id, resolved_name = await resolve_account_from_token(row.api_token)
                if resolved_id and not row.account_id.strip():
                    row.account_id = resolved_id
                if resolved_name:
                    row.account_name = resolved_name
            row.installed = True
            row.enabled = True
            if row.api_token.strip():
                _upsert_platform_setting(
                    db,
                    "cloudflare_api_token",
                    row.api_token,
                    "Cloudflare API token for R2 / automation",
                    is_secret=True,
                )
            if row.account_id.strip():
                _upsert_platform_setting(
                    db,
                    "cloudflare_account_id",
                    row.account_id,
                    "Cloudflare Account ID",
                    is_secret=False,
                )
            try:
                await provision_r2_after_connect(db, row)
            except Exception:
                pass
        elif result.status == "error":
            raise HTTPException(status_code=400, detail=result.message)

    if payload.verify_r2:
        result = await verify_r2_bucket(row)
        row.r2_status = result.status
        if result.status == "error":
            raise HTTPException(status_code=400, detail=result.message)
        if result.status == "connected" and row.media_storage != "r2":
            # Keep explicit local preference unless account just connected R2 via verify.
            pass

    if payload.verify_images:
        result = await verify_images(row)
        row.images_status = result.status
        if result.status == "error":
            raise HTTPException(status_code=400, detail=result.message)

    db.commit()
    db.refresh(row)
    return CloudflarePluginResponse(data=_to_read(row, db))
