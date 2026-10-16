"""Alibaba.com (GGS-ISV) OAuth helpers.

Mirrors `cloudflare_oauth.py` patterns. Callback endpoint is prepared;
authorization-code → token exchange is intentionally not implemented yet.
"""

from __future__ import annotations

from app.config import get_settings

CALLBACK_PATH = "/api/v1/plugins/alibaba/oauth/callback"


def oauth_is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.alibaba_oauth_app_key.strip()
        and settings.alibaba_oauth_app_secret.strip()
    )


def tunnel_public_base() -> str:
    """Public HTTPS origin from Cloudflare Tunnel, if configured."""
    settings = get_settings()
    if not settings.cloudflare_tunnel_enabled:
        return ""
    return settings.cloudflare_tunnel_url.strip().rstrip("/")


def effective_redirect_uri() -> str:
    """
    Callback URL registered with Alibaba Open Platform.

    Prefer an explicit ALIBABA_OAUTH_REDIRECT_URI. When a tunnel is enabled and
    the redirect still points at localhost, rewrite to the tunnel origin so
    local OAuth works the same way for Alibaba / Amazon / Google / etc.
    """
    settings = get_settings()
    configured = settings.alibaba_oauth_redirect_uri.strip()
    tunnel = tunnel_public_base()
    if not tunnel:
        return configured or f"http://127.0.0.1:{settings.api_port}{CALLBACK_PATH}"

    local_markers = ("127.0.0.1", "localhost")
    if not configured or any(m in configured for m in local_markers):
        return f"{tunnel}{CALLBACK_PATH}"
    return configured


def web_redirect_base() -> str:
    settings = get_settings()
    origin = settings.alibaba_oauth_success_redirect.strip()
    if origin:
        return origin.rstrip("/")
    return settings.cors_origins.split(",")[0].strip().rstrip("/")


def oauth_status_payload() -> dict:
    settings = get_settings()
    return {
        "provider": "alibaba",
        "configured": oauth_is_configured(),
        "token_exchange_implemented": False,
        "redirect_uri": effective_redirect_uri(),
        "success_redirect": web_redirect_base(),
        "tunnel": {
            "enabled": bool(settings.cloudflare_tunnel_enabled),
            "url": tunnel_public_base() or None,
            "local_host": settings.cloudflare_tunnel_local_host,
            "local_port": settings.cloudflare_tunnel_local_port,
        },
    }
