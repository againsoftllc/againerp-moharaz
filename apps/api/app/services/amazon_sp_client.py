"""Amazon Selling Partner API client (Againsoft) — LWA + SP-API, Elim-style."""

from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import httpx
from fastapi import HTTPException

from app.config import get_settings

AmazonRegion = Literal["na", "eu", "fe"]
AmazonEnv = Literal["sandbox", "production"]

TOKEN_URL = "https://api.amazon.com/auth/o2/token"

# Static sandbox Catalog Items mock requires this exact includedData set
# (see catalogItems_2022-04-01.json x-amzn-api-sandbox).
SANDBOX_CATALOG_INCLUDED_DATA = (
    "classifications,dimensions,identifiers,images,productTypes,"
    "relationships,salesRanks,summaries,vendorDetails"
)
# Static sandbox keyword search only matches this exact pair:
SANDBOX_CATALOG_KEYWORDS = "samsung,tv"
SANDBOX_CATALOG_ASIN = "B07N4M94X4"

_HOSTS: dict[tuple[str, str], str] = {
    ("sandbox", "na"): "https://sandbox.sellingpartnerapi-na.amazon.com",
    ("sandbox", "eu"): "https://sandbox.sellingpartnerapi-eu.amazon.com",
    ("sandbox", "fe"): "https://sandbox.sellingpartnerapi-fe.amazon.com",
    ("production", "na"): "https://sellingpartnerapi-na.amazon.com",
    ("production", "eu"): "https://sellingpartnerapi-eu.amazon.com",
    ("production", "fe"): "https://sellingpartnerapi-fe.amazon.com",
}

_token_lock = threading.Lock()
_cached_access_token: Optional[str] = None
_cached_expires_at: float = 0.0


class AmazonSpClientError(Exception):
    def __init__(self, message: str, status_code: int = 502, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def raise_http(exc: AmazonSpClientError) -> None:
    raise HTTPException(
        status_code=exc.status_code if 400 <= exc.status_code < 600 else 502,
        detail=str(exc),
    )


def is_configured() -> bool:
    s = get_settings()
    return bool(
        (s.amazon_sp_client_id or "").strip()
        and (s.amazon_sp_client_secret or "").strip()
        and (s.amazon_sp_refresh_token or "").strip()
    )


def _normalize_env(raw: str) -> AmazonEnv:
    return "production" if (raw or "").strip().lower() == "production" else "sandbox"


def _normalize_region(raw: str) -> AmazonRegion:
    r = (raw or "na").strip().lower()
    if r in ("na", "eu", "fe"):
        return r  # type: ignore[return-value]
    return "na"


def base_url(*, env: Optional[str] = None, region: Optional[str] = None) -> str:
    s = get_settings()
    e = _normalize_env(env or s.amazon_sp_env)
    r = _normalize_region(region or s.amazon_sp_region)
    return _HOSTS[(e, r)]


def _user_agent() -> str:
    name = (get_settings().amazon_sp_app_name or "Againsoft").strip() or "Againsoft"
    return f"{name}/1.0 (Language=Python; AgainERP)"


def clear_token_cache() -> None:
    global _cached_access_token, _cached_expires_at
    with _token_lock:
        _cached_access_token = None
        _cached_expires_at = 0.0


def get_access_token(*, force_refresh: bool = False) -> str:
    """Exchange LWA refresh token for access token (cached ~55 min)."""
    global _cached_access_token, _cached_expires_at

    if not is_configured():
        raise AmazonSpClientError(
            "Amazon SP-API is not configured (client id/secret/refresh token)",
            status_code=503,
        )

    with _token_lock:
        now = time.time()
        if (
            not force_refresh
            and _cached_access_token
            and now < _cached_expires_at - 60
        ):
            return _cached_access_token

        s = get_settings()
        try:
            with httpx.Client(timeout=20.0) as client:
                res = client.post(
                    TOKEN_URL,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": s.amazon_sp_refresh_token.strip(),
                        "client_id": s.amazon_sp_client_id.strip(),
                        "client_secret": s.amazon_sp_client_secret.strip(),
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
        except httpx.HTTPError as exc:
            raise AmazonSpClientError(f"Amazon LWA network error: {exc}") from exc

        try:
            data = res.json() if res.content else {}
        except Exception:
            data = {"raw": res.text}

        if res.status_code >= 400 or not isinstance(data, dict) or not data.get("access_token"):
            msg = (
                data.get("error_description")
                or data.get("error")
                or res.reason_phrase
                or f"HTTP {res.status_code}"
            )
            raise AmazonSpClientError(str(msg), status_code=res.status_code or 502, body=data)

        _cached_access_token = str(data["access_token"])
        expires_in = int(data.get("expires_in") or 3600)
        _cached_expires_at = now + expires_in
        return _cached_access_token


def amazon_request(
    method: str,
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
    json_body: Optional[dict[str, Any]] = None,
    env: Optional[str] = None,
    region: Optional[str] = None,
) -> dict[str, Any]:
    token = get_access_token()
    url = f"{base_url(env=env, region=region)}{path if path.startswith('/') else '/' + path}"
    headers = {
        "x-amz-access-token": token,
        "user-agent": _user_agent(),
        "accept": "application/json",
        "x-amz-date": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.request(method, url, headers=headers, params=params, json=json_body)
    except httpx.HTTPError as exc:
        raise AmazonSpClientError(f"Amazon SP-API network error: {exc}") from exc

    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {"raw": res.text}

    if res.status_code == 403 and isinstance(data, dict):
        # Token may have expired early — one retry after forced refresh
        errs = data.get("errors") or []
        detail = ""
        if isinstance(errs, list) and errs and isinstance(errs[0], dict):
            detail = str(errs[0].get("details") or errs[0].get("message") or "")
        if "token" in detail.lower() or "access" in detail.lower():
            clear_token_cache()
            token = get_access_token(force_refresh=True)
            headers["x-amz-access-token"] = token
            try:
                with httpx.Client(timeout=30.0) as client:
                    res = client.request(method, url, headers=headers, params=params, json=json_body)
                data = res.json() if res.content else {}
            except Exception as exc:
                raise AmazonSpClientError(f"Amazon SP-API retry failed: {exc}") from exc

    if res.status_code >= 400:
        message = f"HTTP {res.status_code}"
        if isinstance(data, dict):
            errs = data.get("errors")
            if isinstance(errs, list) and errs and isinstance(errs[0], dict):
                message = str(errs[0].get("message") or errs[0].get("code") or message)
                details = errs[0].get("details")
                if details:
                    message = f"{message}: {details}"
            elif data.get("message"):
                message = str(data["message"])
        raise AmazonSpClientError(message, status_code=res.status_code, body=data)

    if not isinstance(data, dict):
        raise AmazonSpClientError("Unexpected Amazon response shape", body=data)
    return data


def get_marketplace_participations(
    *,
    env: Optional[str] = None,
    region: Optional[str] = None,
) -> dict[str, Any]:
    return amazon_request(
        "GET",
        "/sellers/v1/marketplaceParticipations",
        env=env,
        region=region,
    )


def search_catalog_items(
    *,
    keywords: str,
    marketplace_ids: Optional[list[str]] = None,
    page_size: int = 10,
    included_data: Optional[list[str]] = None,
    env: Optional[str] = None,
    region: Optional[str] = None,
) -> dict[str, Any]:
    s = get_settings()
    mids = marketplace_ids or [s.amazon_sp_marketplace_id or "ATVPDKIKX0DER"]
    # Normalize "samsung tv" / "samsung, tv" → sandbox mock "samsung,tv"
    raw = (keywords or "").strip()
    parts = [p.strip() for p in re.split(r"[\s,]+", raw) if p.strip()]
    kw = ",".join(parts) if parts else raw
    data_csv = (
        ",".join(included_data)
        if included_data
        else SANDBOX_CATALOG_INCLUDED_DATA
    )
    params: dict[str, Any] = {
        "marketplaceIds": ",".join(mids),
        "keywords": kw,
        "includedData": data_csv,
        "pageSize": min(max(page_size, 1), 20),
    }
    return amazon_request(
        "GET",
        "/catalog/2022-04-01/items",
        params=params,
        env=env,
        region=region,
    )


def get_catalog_item(
    asin: str,
    *,
    marketplace_ids: Optional[list[str]] = None,
    included_data: Optional[list[str]] = None,
    env: Optional[str] = None,
    region: Optional[str] = None,
) -> dict[str, Any]:
    s = get_settings()
    mids = marketplace_ids or [s.amazon_sp_marketplace_id or "ATVPDKIKX0DER"]
    data = included_data or SANDBOX_CATALOG_INCLUDED_DATA.split(",")
    return amazon_request(
        "GET",
        f"/catalog/2022-04-01/items/{asin.strip()}",
        params={
            "marketplaceIds": ",".join(mids),
            "includedData": ",".join(data),
        },
        env=env,
        region=region,
    )
