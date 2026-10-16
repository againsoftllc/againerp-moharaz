"""Alibaba.com plugin routes — OAuth callback prepared (no token exchange yet)."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, RedirectResponse

from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.services.alibaba_oauth import (
    oauth_status_payload,
    web_redirect_base,
)

router = APIRouter(prefix="/plugins/alibaba", tags=["plugins-alibaba"])


@router.get("/oauth/status")
def alibaba_oauth_status(
    _user: AuthUser = Depends(get_current_user),
) -> dict:
    """Dev/admin status: redirect URI, tunnel, whether app key is set."""
    return {"data": oauth_status_payload()}


@router.get("/oauth/callback")
async def alibaba_oauth_callback(
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
    error_description: str = Query(default=""),
    error_code: str = Query(default=""),
):
    """
    Public OAuth redirect target for Alibaba.com (GGS-ISV).

    Accepts the authorization callback so Cloudflare Tunnel + Alibaba console
    redirect URIs can be verified. Does NOT exchange `code` for tokens yet.
    """
    base = web_redirect_base()
    err = (error or error_code or "").strip()
    if err:
        message = quote((error_description or err)[:200], safe="")
        return RedirectResponse(
            f"{base}?oauth=error&provider=alibaba&message={message}",
            status_code=302,
        )

    if not code.strip():
        # Allow bare GET for tunnel/callback reachability checks
        return JSONResponse(
            {
                "ok": True,
                "provider": "alibaba",
                "stage": "callback_ready",
                "token_exchange_implemented": False,
                "detail": "Callback endpoint is reachable. Pass ?code=… from Alibaba OAuth.",
                "status": oauth_status_payload(),
            }
        )

    # Acknowledge receipt only — do not put the auth code in the browser URL
    state_flag = "1" if state.strip() else "0"
    return RedirectResponse(
        f"{base}?oauth=received&provider=alibaba&code_present=1&state_present={state_flag}",
        status_code=302,
    )
