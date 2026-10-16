"""bKash Tokenized Checkout client — grant token, create, execute, query.

Docs: https://developer.bka.sh/docs/tokenized-checkout-overview
Sandbox test wallets (OTP 123456, PIN 12121):
  01770618567 (success), 01823074817 (insufficient balance)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict

import httpx
from sqlalchemy.orm import Session

from app.models.bkash_plugin import BkashPlugin

SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
PRODUCTION_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout"

# bKash id_token is valid for 1 hour; refresh a bit earlier.
TOKEN_TTL = timedelta(minutes=50)


class BkashError(Exception):
    """bKash API failure with the gateway's own message when available."""


@dataclass
class BkashVerifyResult:
    status: str  # connected | error | disconnected
    message: str = ""


def base_url(row: BkashPlugin) -> str:
    return PRODUCTION_BASE if row.environment == "production" else SANDBOX_BASE


def credentials_complete(row: BkashPlugin) -> bool:
    return bool(
        row.username.strip()
        and row.password.strip()
        and row.app_key.strip()
        and row.app_secret.strip()
    )


def _grant_token(row: BkashPlugin) -> str:
    """Call token/grant and return the id_token (no caching)."""
    res = httpx.post(
        f"{base_url(row)}/token/grant",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "username": row.username.strip(),
            "password": row.password.strip(),
        },
        json={
            "app_key": row.app_key.strip(),
            "app_secret": row.app_secret.strip(),
        },
        timeout=30.0,
    )
    body: Dict[str, Any] = {}
    try:
        body = res.json()
    except Exception:
        pass
    token = str(body.get("id_token") or "")
    status_code = str(body.get("statusCode") or "")
    if res.status_code != 200 or not token or (status_code and status_code != "0000"):
        message = str(
            body.get("statusMessage")
            or body.get("message")
            or f"bKash token grant failed (HTTP {res.status_code})"
        )
        raise BkashError(message)
    return token


def get_id_token(db: Session, row: BkashPlugin) -> str:
    """Return a cached id_token, granting a fresh one when expired."""
    now = datetime.utcnow()
    if row.id_token and row.token_expires_at and row.token_expires_at > now:
        return row.id_token
    token = _grant_token(row)
    row.id_token = token
    row.token_expires_at = now + TOKEN_TTL
    db.commit()
    return token


def _auth_headers(row: BkashPlugin, token: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": token,
        "X-APP-Key": row.app_key.strip(),
    }


def _post(row: BkashPlugin, token: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    res = httpx.post(
        f"{base_url(row)}{path}",
        headers=_auth_headers(row, token),
        json=payload,
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise BkashError(f"bKash returned non-JSON response (HTTP {res.status_code})") from exc
    if res.status_code != 200:
        raise BkashError(
            str(body.get("statusMessage") or body.get("message") or f"bKash HTTP {res.status_code}"),
        )
    return body


def create_payment(
    db: Session,
    row: BkashPlugin,
    *,
    amount: Decimal,
    invoice_number: str,
    payer_reference: str,
    callback_url: str,
) -> Dict[str, Any]:
    """tokenized/checkout/create — returns paymentID + bkashURL."""
    token = get_id_token(db, row)
    body = _post(
        row,
        token,
        "/create",
        {
            "mode": "0011",  # URL-based checkout
            "payerReference": payer_reference[:32] or "guest",
            "callbackURL": callback_url,
            "amount": f"{amount:.2f}",
            "currency": "BDT",
            "intent": "sale",
            "merchantInvoiceNumber": invoice_number[:32],
        },
    )
    if str(body.get("statusCode") or "") != "0000" or not body.get("bkashURL"):
        raise BkashError(str(body.get("statusMessage") or "bKash create payment failed"))
    return body


def execute_payment(db: Session, row: BkashPlugin, payment_id: str) -> Dict[str, Any]:
    """tokenized/checkout/execute — completes the payment after user consent."""
    token = get_id_token(db, row)
    return _post(row, token, "/execute", {"paymentID": payment_id})


def query_payment(db: Session, row: BkashPlugin, payment_id: str) -> Dict[str, Any]:
    """tokenized/checkout/payment/status — used when execute times out."""
    token = get_id_token(db, row)
    return _post(row, token, "/payment/status", {"paymentID": payment_id})


def verify_credentials(db: Session, row: BkashPlugin) -> BkashVerifyResult:
    """Grant a fresh token to prove username/password/app key/secret are valid."""
    if not credentials_complete(row):
        return BkashVerifyResult("disconnected", "Username, password, app key ও app secret সব লাগবে")
    try:
        token = _grant_token(row)
    except BkashError as exc:
        return BkashVerifyResult("error", str(exc))
    except httpx.HTTPError as exc:
        return BkashVerifyResult("error", f"bKash unreachable: {exc}")
    row.id_token = token
    row.token_expires_at = datetime.utcnow() + TOKEN_TTL
    db.commit()
    return BkashVerifyResult("connected", "bKash merchant credentials verified")
