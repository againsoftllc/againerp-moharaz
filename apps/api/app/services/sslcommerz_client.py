"""SSLCommerz Hosted Checkout client — init session + validate payment.

Docs: https://developer.sslcommerz.com/doc/v4/
Sandbox store (public demo): store_id=testbox store_passwd=qwerty
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict

import httpx

from app.models.sslcommerz_plugin import SslcommerzPlugin

SANDBOX_INIT = "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
SANDBOX_VALIDATE = "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
PRODUCTION_INIT = "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
PRODUCTION_VALIDATE = "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"


class SslcommerzError(Exception):
    """SSLCommerz API failure with the gateway's own message when available."""


@dataclass
class SslcommerzVerifyResult:
    status: str  # connected | error | disconnected
    message: str = ""


def init_url(row: SslcommerzPlugin) -> str:
    return PRODUCTION_INIT if row.environment == "production" else SANDBOX_INIT


def validate_url(row: SslcommerzPlugin) -> str:
    return PRODUCTION_VALIDATE if row.environment == "production" else SANDBOX_VALIDATE


def credentials_complete(row: SslcommerzPlugin) -> bool:
    return bool(row.store_id.strip() and row.store_password.strip())


def init_payment(
    row: SslcommerzPlugin,
    *,
    amount: Decimal,
    tran_id: str,
    success_url: str,
    fail_url: str,
    cancel_url: str,
    ipn_url: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    customer_address: str = "Dhaka",
    customer_city: str = "Dhaka",
    product_name: str = "Order",
) -> Dict[str, Any]:
    """Create a hosted checkout session — returns sessionkey + GatewayPageURL."""
    payload = {
        "store_id": row.store_id.strip(),
        "store_passwd": row.store_password.strip(),
        "total_amount": f"{amount:.2f}",
        "currency": "BDT",
        "tran_id": tran_id[:30],
        "success_url": success_url,
        "fail_url": fail_url,
        "cancel_url": cancel_url,
        "ipn_url": ipn_url,
        "cus_name": (customer_name or "Customer")[:50],
        "cus_email": (customer_email or "customer@example.com")[:50],
        "cus_add1": (customer_address or "Dhaka")[:50],
        "cus_city": (customer_city or "Dhaka")[:50],
        "cus_country": "Bangladesh",
        "cus_phone": (customer_phone or "01700000000")[:20],
        "shipping_method": "NO",
        "product_name": (product_name or "Order")[:50],
        "product_category": "general",
        "product_profile": "general",
    }
    try:
        res = httpx.post(init_url(row), data=payload, timeout=30.0)
    except httpx.HTTPError as exc:
        raise SslcommerzError(f"SSLCommerz unreachable: {exc}") from exc

    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise SslcommerzError(f"SSLCommerz returned non-JSON (HTTP {res.status_code})") from exc

    status = str(body.get("status") or "").upper()
    gateway = str(body.get("GatewayPageURL") or "")
    if status != "SUCCESS" or not gateway:
        raise SslcommerzError(
            str(body.get("failedreason") or body.get("error") or "SSLCommerz init failed"),
        )
    return body


def validate_payment(row: SslcommerzPlugin, val_id: str) -> Dict[str, Any]:
    """Confirm a completed payment with SSLCommerz validation API."""
    params = {
        "val_id": val_id.strip(),
        "store_id": row.store_id.strip(),
        "store_passwd": row.store_password.strip(),
        "format": "json",
        "v": 1,
    }
    try:
        res = httpx.get(validate_url(row), params=params, timeout=30.0)
    except httpx.HTTPError as exc:
        raise SslcommerzError(f"SSLCommerz unreachable: {exc}") from exc

    try:
        body: Dict[str, Any] = res.json()
    except Exception as exc:
        raise SslcommerzError(f"SSLCommerz returned non-JSON (HTTP {res.status_code})") from exc
    return body


def verify_credentials(row: SslcommerzPlugin) -> SslcommerzVerifyResult:
    """Init a tiny disposable session to prove store_id / store_passwd are valid."""
    if not credentials_complete(row):
        return SslcommerzVerifyResult("disconnected", "Store ID ও Store Password দুটোই লাগবে")
    try:
        body = init_payment(
            row,
            amount=Decimal("10.00"),
            tran_id=f"VERIFY{uuid_short()}",
            success_url="https://example.com/success",
            fail_url="https://example.com/fail",
            cancel_url="https://example.com/cancel",
            ipn_url="https://example.com/ipn",
            customer_name="Verify",
            customer_email="verify@example.com",
            customer_phone="01700000000",
            product_name="Credential check",
        )
    except SslcommerzError as exc:
        # SSLCommerz checks the store credentials before the amount, so a store with a higher minimum than
        # this 10 BDT test still proves the Store ID / password are right.
        if "amount is not allowed" in str(exc).lower():
            return SslcommerzVerifyResult("connected", "SSLCommerz store credentials verified")
        return SslcommerzVerifyResult("error", str(exc))
    if body.get("sessionkey"):
        return SslcommerzVerifyResult("connected", "SSLCommerz store credentials verified")
    return SslcommerzVerifyResult("error", "Unexpected SSLCommerz response")


def uuid_short() -> str:
    import uuid as _uuid

    return _uuid.uuid4().hex[:12].upper()
