"""PayPal Orders API v2 — OAuth, create order, capture.

Docs: https://developer.paypal.com/docs/checkout/standard/integrate/
Sandbox: https://developer.paypal.com/dashboard/ → Apps & Credentials
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List

import httpx
from sqlalchemy.orm import Session

from app.models.paypal_plugin import PaypalPlugin

SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
PRODUCTION_BASE = "https://api-m.paypal.com"
TOKEN_TTL = timedelta(minutes=50)


class PaypalError(Exception):
    """PayPal API failure with the gateway's own message when available."""


@dataclass
class PaypalVerifyResult:
    status: str  # connected | error | disconnected
    message: str = ""


def api_base(row: PaypalPlugin) -> str:
    return PRODUCTION_BASE if row.environment == "production" else SANDBOX_BASE


def credentials_complete(row: PaypalPlugin) -> bool:
    return bool(row.client_id.strip() and row.client_secret.strip())


def charge_amount_usd(row: PaypalPlugin, amount_bdt: Decimal) -> Decimal:
    """Convert store BDT total to PayPal charge currency (default USD)."""
    rate = row.bdt_per_usd if row.bdt_per_usd and row.bdt_per_usd > 0 else Decimal("110")
    return (amount_bdt / rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _request_access_token(row: PaypalPlugin) -> str:
    res = httpx.post(
        f"{api_base(row)}/v1/oauth2/token",
        data={"grant_type": "client_credentials"},
        auth=(row.client_id.strip(), row.client_secret.strip()),
        headers={"Accept": "application/json", "Accept-Language": "en_US"},
        timeout=30.0,
    )
    try:
        body = res.json()
    except Exception:
        body = {}
    token = str(body.get("access_token") or "")
    if res.status_code != 200 or not token:
        message = (
            body.get("error_description")
            or body.get("error")
            or f"PayPal token grant failed (HTTP {res.status_code})"
        )
        raise PaypalError(str(message))
    return token


def get_access_token(db: Session, row: PaypalPlugin) -> str:
    now = datetime.utcnow()
    if row.access_token and row.token_expires_at and row.token_expires_at > now:
        return row.access_token
    token = _request_access_token(row)
    row.access_token = token
    row.token_expires_at = now + TOKEN_TTL
    db.commit()
    return token


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _api_error_message(body: Dict[str, Any], status_code: int) -> str:
    details = body.get("details")
    if isinstance(details, list) and details:
        first = details[0]
        if isinstance(first, dict):
            return str(first.get("description") or first.get("issue") or body.get("message") or status_code)
    return str(body.get("message") or body.get("error_description") or f"PayPal HTTP {status_code}")


def create_order(
    db: Session,
    row: PaypalPlugin,
    *,
    amount: Decimal,
    currency: str,
    invoice_id: str,
    description: str,
    return_url: str,
    cancel_url: str,
) -> Dict[str, Any]:
    """POST /v2/checkout/orders — returns id + approve link."""
    token = get_access_token(db, row)
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": invoice_id[:50],
                "description": (description or invoice_id)[:127],
                "invoice_id": invoice_id[:50],
                "amount": {
                    "currency_code": currency.upper()[:3],
                    "value": f"{amount:.2f}",
                },
            },
        ],
        "application_context": {
            "brand_name": "AgainERP",
            "landing_page": "LOGIN",
            "user_preference": "IMMEDIATE_PAYMENT_REQUIRED",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
            "return_url": return_url,
            "cancel_url": cancel_url,
        },
    }
    res = httpx.post(
        f"{api_base(row)}/v2/checkout/orders",
        headers=_headers(token),
        json=payload,
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PaypalError(f"PayPal returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code not in (200, 201) or not body.get("id"):
        raise PaypalError(_api_error_message(body, res.status_code))
    return body


def capture_order(db: Session, row: PaypalPlugin, paypal_order_id: str) -> Dict[str, Any]:
    token = get_access_token(db, row)
    res = httpx.post(
        f"{api_base(row)}/v2/checkout/orders/{paypal_order_id}/capture",
        headers=_headers(token),
        json={},
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PaypalError(f"PayPal returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code not in (200, 201):
        raise PaypalError(_api_error_message(body, res.status_code))
    return body


def get_order(db: Session, row: PaypalPlugin, paypal_order_id: str) -> Dict[str, Any]:
    token = get_access_token(db, row)
    res = httpx.get(
        f"{api_base(row)}/v2/checkout/orders/{paypal_order_id}",
        headers=_headers(token),
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise PaypalError(f"PayPal returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code != 200:
        raise PaypalError(_api_error_message(body, res.status_code))
    return body


def approve_url_from_order(body: Dict[str, Any]) -> str:
    links: List[Any] = body.get("links") or []
    for link in links:
        if isinstance(link, dict) and link.get("rel") == "approve":
            return str(link.get("href") or "")
    return ""


def capture_id_from_body(body: Dict[str, Any]) -> str:
    try:
        units = body.get("purchase_units") or []
        payments = (units[0] or {}).get("payments") or {}
        captures = payments.get("captures") or []
        return str((captures[0] or {}).get("id") or "")
    except Exception:
        return ""


def payer_email_from_body(body: Dict[str, Any]) -> str:
    payer = body.get("payer") or {}
    return str(payer.get("email_address") or "")


def verify_credentials(db: Session, row: PaypalPlugin) -> PaypalVerifyResult:
    if not credentials_complete(row):
        return PaypalVerifyResult("disconnected", "Client ID and Client Secret are both required")
    try:
        token = _request_access_token(row)
    except PaypalError as exc:
        return PaypalVerifyResult("error", str(exc))
    except httpx.HTTPError as exc:
        return PaypalVerifyResult("error", f"PayPal unreachable: {exc}")
    row.access_token = token
    row.token_expires_at = datetime.utcnow() + TOKEN_TTL
    db.commit()
    return PaypalVerifyResult("connected", "PayPal credentials verified")
