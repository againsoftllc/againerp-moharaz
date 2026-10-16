"""Pathao Courier Merchant API client — OAuth token + stores verify.

Sandbox: https://courier-api-sandbox.pathao.com
Production: https://api-hermes.pathao.com
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.pathao_plugin import PathaoPlugin

SANDBOX_BASE = "https://courier-api-sandbox.pathao.com"
PRODUCTION_BASE = "https://api-hermes.pathao.com"
TOKEN_TTL = timedelta(minutes=50)


class PathaoError(Exception):
    """Pathao API failure with the gateway's own message when available."""


@dataclass
class PathaoVerifyResult:
    status: str  # connected | error | disconnected
    message: str = ""
    stores: Optional[List[Dict[str, Any]]] = None


def api_base(row: PathaoPlugin) -> str:
    return PRODUCTION_BASE if row.environment == "production" else SANDBOX_BASE


def credentials_complete(row: PathaoPlugin) -> bool:
    return bool(
        row.client_id.strip()
        and row.client_secret.strip()
        and row.username.strip()
        and row.password.strip()
    )


def _error_message(body: Dict[str, Any], status_code: int) -> str:
    if isinstance(body, dict):
        for key in ("message", "error_description", "error", "msg"):
            val = body.get(key)
            if val:
                return str(val)
        errors = body.get("errors")
        if isinstance(errors, dict) and errors:
            first = next(iter(errors.values()))
            if isinstance(first, list) and first:
                return str(first[0])
            return str(first)
    return f"Pathao HTTP {status_code}"


def issue_token(row: PathaoPlugin) -> Dict[str, Any]:
    """POST /aladdin/api/v1/issue-token — password grant."""
    res = httpx.post(
        f"{api_base(row)}/aladdin/api/v1/issue-token",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={
            "client_id": row.client_id.strip(),
            "client_secret": row.client_secret.strip(),
            "grant_type": "password",
            "username": row.username.strip(),
            "password": row.password.strip(),
        },
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PathaoError(f"Pathao returned non-JSON (HTTP {res.status_code})") from exc

    # Some responses wrap token under data
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    access = str(data.get("access_token") or "")
    if res.status_code not in (200, 201) or not access:
        raise PathaoError(_error_message(body, res.status_code))
    return {
        "access_token": access,
        "refresh_token": str(data.get("refresh_token") or ""),
        "expires_in": int(data.get("expires_in") or 3600),
        "token_type": str(data.get("token_type") or "Bearer"),
    }


def get_access_token(db: Session, row: PathaoPlugin) -> str:
    now = datetime.utcnow()
    if row.access_token and row.token_expires_at and row.token_expires_at > now:
        return row.access_token
    tok = issue_token(row)
    row.access_token = tok["access_token"]
    row.refresh_token = tok["refresh_token"]
    row.token_expires_at = now + TOKEN_TTL
    db.commit()
    return row.access_token


def list_stores(db: Session, row: PathaoPlugin) -> List[Dict[str, Any]]:
    token = get_access_token(db, row)
    res = httpx.get(
        f"{api_base(row)}/aladdin/api/v1/stores",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PathaoError(f"Pathao returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code != 200:
        raise PathaoError(_error_message(body, res.status_code))
    data = body.get("data")
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]
    if isinstance(data, list):
        return data
    return []


def create_order(db: Session, row: PathaoPlugin, payload: Dict[str, Any]) -> Dict[str, Any]:
    """POST /aladdin/api/v1/orders — create a Pathao consignment."""
    token = get_access_token(db, row)
    res = httpx.post(
        f"{api_base(row)}/aladdin/api/v1/orders",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
        json=payload,
        timeout=45.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PathaoError(f"Pathao returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code not in (200, 201):
        raise PathaoError(_error_message(body, res.status_code))
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    if not isinstance(data, dict):
        raise PathaoError("Pathao order response missing data")
    return data


def verify_credentials(db: Session, row: PathaoPlugin) -> PathaoVerifyResult:
    if not credentials_complete(row):
        return PathaoVerifyResult(
            "disconnected",
            "Client ID, Client Secret, Username, and Password are required",
        )
    try:
        stores = list_stores(db, row)
    except PathaoError as exc:
        return PathaoVerifyResult("error", str(exc))
    except httpx.HTTPError as exc:
        return PathaoVerifyResult("error", f"Pathao unreachable: {exc}")
    except Exception as exc:
        return PathaoVerifyResult("error", str(exc))

    store_hint = ""
    if stores:
        first = stores[0]
        sid = first.get("store_id") or first.get("id") or ""
        name = first.get("store_name") or first.get("name") or ""
        store_hint = f" — found {len(stores)} store(s)"
        if sid:
            store_hint += f", e.g. {sid}"
            if name:
                store_hint += f" ({name})"
    return PathaoVerifyResult("connected", f"Pathao credentials verified{store_hint}", stores=stores)
