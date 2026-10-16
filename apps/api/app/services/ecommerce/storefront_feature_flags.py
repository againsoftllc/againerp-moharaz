"""Resolve storefront feature flags from AgainERP Center entitlements.

When Center credentials are not configured, flags default to enabled (single-tenant
local / unbound deployments). When bound, Center module codes + feature_flags gate
PC Builder, wishlist, EMI, and China import.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cache: dict[str, Any] = {"fetched_at": 0.0, "payload": None}


def invalidate_entitlements_cache() -> None:
    with _lock:
        _cache["fetched_at"] = 0.0
        _cache["payload"] = None


def _default_flags(*, bound: bool = False) -> dict[str, Any]:
    return {
        "bound": bound,
        "client_slug": None,
        "plan": None,
        "enabled_modules": [],
        "feature_flags": {
            "pc_builder": True,
            "wishlist": True,
            "emi": True,
            "china_import": True,
        },
        # Unbound (no Center configured) or fetch-failed — default permissive, same as every
        # other flag above, rather than locking out AI because Center happened to be unreachable.
        "ai_enabled": True,
        "ai_access_status": None,
    }


def _fetch_center_entitlements() -> dict[str, Any] | None:
    settings = get_settings()
    base = (settings.againerp_center_url or "").strip().rstrip("/")
    client_id = (settings.againerp_client_id or "").strip()
    api_key = (settings.againerp_client_api_key or "").strip()
    if not base or not client_id or not api_key:
        return None
    try:
        with httpx.Client(timeout=8.0) as client:
            res = client.get(
                f"{base}/api/v1/client/entitlements",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-Client-Id": client_id,
                },
            )
        if res.status_code >= 400:
            logger.warning("Center entitlements HTTP %s: %s", res.status_code, res.text[:200])
            return None
        data = res.json()
        return data if isinstance(data, dict) else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Center entitlements fetch failed: %s", exc)
        return None


def _flag_from_payload(payload: dict[str, Any], key: str, *, module_codes: set[str], default: bool) -> bool:
    flags = payload.get("feature_flags") if isinstance(payload.get("feature_flags"), dict) else {}
    # Explicit storefront.* overrides first
    storefront_key = f"storefront.{key}"
    if storefront_key in flags:
        return bool(flags[storefront_key])
    module_key = {
        "pc_builder": "module.configurator",
        "wishlist": "module.customers",
        "emi": "storefront.emi",
        "china_import": "storefront.china_import",
    }.get(key)
    if module_key and module_key in flags:
        return bool(flags[module_key])
    if key == "pc_builder":
        return "configurator" in module_codes
    if key == "wishlist":
        return "customers" in module_codes
    if key == "emi":
        # Soft gate: on by default when orders/catalog exist unless explicitly disabled
        return ("orders" in module_codes) or ("catalog" in module_codes) or default
    if key == "china_import":
        return "suppliers" in module_codes or bool(flags.get("module.suppliers"))
    return default


def resolve_storefront_feature_flags(*, force_refresh: bool = False) -> dict[str, Any]:
    settings = get_settings()
    ttl = max(5, int(settings.againerp_entitlements_cache_ttl_seconds or 60))
    now = time.time()

    with _lock:
        cached = _cache.get("payload")
        fetched_at = float(_cache.get("fetched_at") or 0.0)
        if not force_refresh and cached is not None and (now - fetched_at) < ttl:
            return cached

    payload = _fetch_center_entitlements()
    if payload is None:
        result = _default_flags(bound=False)
        # Prefer configured slug even when unbound / fetch failed
        slug = (settings.againerp_client_slug or "").strip() or None
        result["client_slug"] = slug
        with _lock:
            _cache["payload"] = result
            _cache["fetched_at"] = now
        return result

    enabled = payload.get("enabled_modules") or []
    module_codes = {str(c) for c in enabled if c}
    # Also treat modules[].enabled as source of truth when list empty
    if not module_codes and isinstance(payload.get("modules"), list):
        module_codes = {
            str(m.get("code"))
            for m in payload["modules"]
            if isinstance(m, dict) and (m.get("enabled") or m.get("status") == "enabled")
        }

    flags = {
        "pc_builder": _flag_from_payload(payload, "pc_builder", module_codes=module_codes, default=True),
        "wishlist": _flag_from_payload(payload, "wishlist", module_codes=module_codes, default=True),
        "emi": _flag_from_payload(payload, "emi", module_codes=module_codes, default=True),
        "china_import": _flag_from_payload(payload, "china_import", module_codes=module_codes, default=False),
    }

    result = {
        "bound": True,
        "client_slug": payload.get("slug") or (settings.againerp_client_slug or None),
        "plan": payload.get("plan"),
        "enabled_modules": sorted(module_codes),
        "feature_flags": flags,
        "center_feature_flags": payload.get("feature_flags")
        if isinstance(payload.get("feature_flags"), dict)
        else {},
        # Surfaced alongside the storefront flags above rather than a second HTTP round-trip
        # to the same /client/entitlements payload — see app/services/ai/entitlements.py.
        "ai_enabled": payload.get("ai_enabled"),
        "ai_access_status": payload.get("ai_access_status"),
    }
    with _lock:
        _cache["payload"] = result
        _cache["fetched_at"] = now
    return result


def require_storefront_flag(flag: str) -> None:
    """Raise HTTP 403 via FastAPI if flag is off. Call from routers."""
    from fastapi import HTTPException

    resolved = resolve_storefront_feature_flags()
    flags = resolved.get("feature_flags") or {}
    if not flags.get(flag, True):
        raise HTTPException(
            status_code=403,
            detail=f"Feature '{flag}' is not enabled for this storefront",
        )
