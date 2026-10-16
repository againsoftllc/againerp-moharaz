"""Minimal Elim OpenAPI client (Taobao / 1688)."""

from __future__ import annotations

from typing import Any, Literal, Optional

import httpx
from fastapi import HTTPException

from app.config import get_settings

ElimPlatform = Literal["taobao", "alibaba"]


class ElimClientError(Exception):
    def __init__(self, message: str, status_code: int = 502, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _plugin_override() -> tuple[str, str] | None:
    """Custom (key, base_url) from the AgainDropAPI plugin row, when configured."""
    try:
        from app.database import SessionLocal
        from app.models.again_drop_api_plugin import AgainDropApiPlugin

        db = SessionLocal()
        try:
            row = db.get(AgainDropApiPlugin, "ada-default")
        finally:
            db.close()
    except Exception:
        return None
    if not row or not row.installed or not row.enabled:
        return None
    key = (row.api_key or "").strip()
    if row.use_server_key or not key:
        return None
    base = (row.base_url or "").strip().rstrip("/") or "https://openapi.elim.asia"
    return key, base


def _headers() -> dict[str, str]:
    override = _plugin_override()
    key = override[0] if override else (get_settings().elim_api_key or "").strip()
    if not key:
        raise ElimClientError(
            "AgainDrop API key is not configured (plugin or API server .env)",
            status_code=503,
        )
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": key,
    }


def _base_url() -> str:
    override = _plugin_override()
    if override:
        return override[1]
    return (get_settings().elim_base_url or "https://openapi.elim.asia").rstrip("/")


def elim_request(method: str, path: str, body: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    url = f"{_base_url()}{path if path.startswith('/') else '/' + path}"
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.request(method, url, headers=_headers(), json=body)
    except httpx.HTTPError as exc:
        raise ElimClientError(f"Elim network error: {exc}") from exc

    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {"raw": res.text}

    if res.status_code >= 400:
        message = (
            data.get("message")
            if isinstance(data, dict) and data.get("message")
            else res.reason_phrase or f"HTTP {res.status_code}"
        )
        raise ElimClientError(str(message), status_code=res.status_code, body=data)

    if not isinstance(data, dict):
        raise ElimClientError("Unexpected Elim response shape", body=data)
    return data


def elim_request_multipart(
    path: str,
    *,
    files: dict[str, tuple[str, bytes, str]],
    data: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Multipart POST (e.g. image upload)."""
    url = f"{_base_url()}{path if path.startswith('/') else '/' + path}"
    headers = _headers()
    headers.pop("Content-Type", None)
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(url, headers=headers, files=files, data=data or {})
    except httpx.HTTPError as exc:
        raise ElimClientError(f"Elim network error: {exc}") from exc

    try:
        payload = res.json() if res.content else {}
    except Exception:
        payload = {"raw": res.text}

    if res.status_code >= 400:
        message = (
            payload.get("message")
            if isinstance(payload, dict) and payload.get("message")
            else res.reason_phrase or f"HTTP {res.status_code}"
        )
        raise ElimClientError(str(message), status_code=res.status_code, body=payload)

    if not isinstance(payload, dict):
        raise ElimClientError("Unexpected Elim response shape", body=payload)
    return payload


def search_products(
    *,
    q: str,
    platform: ElimPlatform = "taobao",
    page: int = 1,
    size: int = 20,
    lang: str = "en",
) -> dict[str, Any]:
    return elim_request(
        "POST",
        "/v1/products/search",
        {
            "q": q,
            "platform": platform,
            "page": page,
            "size": min(max(size, 1), 40),
            "lang": lang,
        },
    )


def find_product(
    *,
    product_id: str,
    platform: ElimPlatform = "taobao",
    lang: str = "en",
) -> dict[str, Any]:
    return elim_request(
        "POST",
        "/v1/products/find",
        {"id": product_id, "platform": platform, "lang": lang},
    )


def upload_image(
    *,
    file_content: bytes,
    filename: str,
    content_type: str = "image/jpeg",
    platform: ElimPlatform = "alibaba",
) -> dict[str, Any]:
    """Upload local image — returns Elim image_id for search-img."""
    return elim_request_multipart(
        "/v1/products/upload-image",
        files={"file": (filename, file_content, content_type)},
        data={"platform": platform},
    )


def search_products_by_image(
    *,
    img_url: Optional[str] = None,
    img_id: Optional[str] = None,
    platform: ElimPlatform = "alibaba",
    page: int = 1,
    size: int = 20,
    lang: str = "en",
) -> dict[str, Any]:
    if not img_url and not img_id:
        raise ElimClientError("Either img_url or img_id is required", status_code=422)
    if img_url and img_id:
        raise ElimClientError("Use only one of img_url or img_id", status_code=422)
    body: dict[str, Any] = {
        "platform": platform,
        "page": page,
        "size": min(max(size, 1), 40),
        "lang": lang,
    }
    if img_url:
        body["img_url"] = img_url.strip()
    if img_id:
        body["img_id"] = img_id.strip()
    return elim_request("POST", "/v1/products/search-img", body)


def raise_http(exc: ElimClientError) -> None:
    raise HTTPException(
        status_code=exc.status_code if 400 <= exc.status_code < 600 else 502,
        detail=str(exc),
    )
