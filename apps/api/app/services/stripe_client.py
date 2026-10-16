"""Stripe Checkout Sessions API — create session + retrieve.

Docs: https://docs.stripe.com/payments/checkout
Test keys: https://dashboard.stripe.com/test/apikeys
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict
from urllib.parse import urlencode

import httpx

from app.models.stripe_plugin import StripePlugin

STRIPE_API = "https://api.stripe.com/v1"


class StripeError(Exception):
    """Stripe API failure with the gateway's own message when available."""


@dataclass
class StripeVerifyResult:
    status: str  # connected | error | disconnected
    message: str = ""


def credentials_complete(row: StripePlugin) -> bool:
    return bool(row.secret_key.strip())


def charge_amount(row: StripePlugin, amount_bdt: Decimal) -> Decimal:
    """Convert store BDT total to Stripe charge currency (default USD)."""
    currency = (row.currency or "USD").upper()
    if currency == "BDT":
        return amount_bdt.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rate = row.bdt_per_usd if row.bdt_per_usd and row.bdt_per_usd > 0 else Decimal("110")
    return (amount_bdt / rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_minor_units(amount: Decimal, currency: str) -> int:
    """Stripe expects the smallest currency unit (cents for USD)."""
    zero_decimal = {"BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}
    if currency.upper() in zero_decimal:
        return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _auth_headers(secret_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {secret_key.strip()}",
        "Content-Type": "application/x-www-form-urlencoded",
    }


def _error_message(body: Dict[str, Any], status_code: int) -> str:
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err.get("code") or f"Stripe HTTP {status_code}")
    return f"Stripe HTTP {status_code}"


def create_checkout_session(
    row: StripePlugin,
    *,
    amount: Decimal,
    currency: str,
    product_name: str,
    success_url: str,
    cancel_url: str,
    client_reference_id: str,
    customer_email: str = "",
    metadata: Dict[str, str] | None = None,
) -> Dict[str, Any]:
    """POST /v1/checkout/sessions — returns id + url."""
    cur = currency.upper()[:3]
    data: Dict[str, str] = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": client_reference_id[:200],
        "line_items[0][price_data][currency]": cur.lower(),
        "line_items[0][price_data][product_data][name]": (product_name or "Order")[:120],
        "line_items[0][price_data][unit_amount]": str(_to_minor_units(amount, cur)),
        "line_items[0][quantity]": "1",
    }
    if customer_email and "@" in customer_email:
        data["customer_email"] = customer_email[:200]
    if metadata:
        for i, (k, v) in enumerate(metadata.items()):
            data[f"metadata[{k}]"] = str(v)[:500]

    res = httpx.post(
        f"{STRIPE_API}/checkout/sessions",
        headers=_auth_headers(row.secret_key),
        content=urlencode(data),
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise StripeError(f"Stripe returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code not in (200, 201) or not body.get("id") or not body.get("url"):
        raise StripeError(_error_message(body, res.status_code))
    return body


def retrieve_session(row: StripePlugin, session_id: str) -> Dict[str, Any]:
    res = httpx.get(
        f"{STRIPE_API}/checkout/sessions/{session_id.strip()}",
        headers=_auth_headers(row.secret_key),
        timeout=30.0,
    )
    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise StripeError(f"Stripe returned non-JSON (HTTP {res.status_code})") from exc
    if res.status_code != 200:
        raise StripeError(_error_message(body, res.status_code))
    return body


def verify_credentials(row: StripePlugin) -> StripeVerifyResult:
    if not credentials_complete(row):
        return StripeVerifyResult("disconnected", "Secret Key is required")
    key = row.secret_key.strip()
    if row.environment == "sandbox" and not key.startswith("sk_test_"):
        return StripeVerifyResult(
            "error",
            "Sandbox environment expects a test secret key (sk_test_…)",
        )
    if row.environment == "production" and not key.startswith("sk_live_"):
        return StripeVerifyResult(
            "error",
            "Production environment expects a live secret key (sk_live_…)",
        )
    try:
        res = httpx.get(
            f"{STRIPE_API}/balance",
            headers=_auth_headers(key),
            timeout=20.0,
        )
        body = res.json() if res.content else {}
    except httpx.HTTPError as exc:
        return StripeVerifyResult("error", f"Stripe unreachable: {exc}")
    except Exception as exc:
        return StripeVerifyResult("error", str(exc))
    if res.status_code == 200:
        return StripeVerifyResult("connected", "Stripe credentials verified")
    return StripeVerifyResult("error", _error_message(body if isinstance(body, dict) else {}, res.status_code))
