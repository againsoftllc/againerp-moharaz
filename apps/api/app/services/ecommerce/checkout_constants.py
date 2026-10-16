"""Checkout payment plugin registry (STEP 06).

Shipping rates live in `checkout_shipping_availability`, tax in
`checkout_tax_availability`, coupon discounts in `marketing/coupon_service` —
all admin-driven.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

DEFAULT_COMPANY_ID = "default"


@dataclass(frozen=True)
class PaymentMethodOption:
    id: str
    label: str
    description: str
    requires_gateway: bool = False
    plugin_id: str = "builtin"


PAYMENT_METHODS: Dict[str, PaymentMethodOption] = {
    "cod": PaymentMethodOption(
        id="cod",
        label="Cash on Delivery",
        description="Pay when your order arrives",
        requires_gateway=False,
    ),
    "bkash": PaymentMethodOption(
        id="bkash",
        label="bKash",
        description="Mobile wallet — gateway plugin ready",
        requires_gateway=True,
        plugin_id="bkash",
    ),
    "sslcommerz": PaymentMethodOption(
        id="sslcommerz",
        label="Card / SSLCommerz",
        description="Visa, Mastercard — gateway plugin ready",
        requires_gateway=True,
        plugin_id="sslcommerz",
    ),
    "paypal": PaymentMethodOption(
        id="paypal",
        label="PayPal",
        description="Pay with PayPal balance or linked cards",
        requires_gateway=True,
        plugin_id="paypal",
    ),
    "stripe": PaymentMethodOption(
        id="stripe",
        label="Stripe",
        description="Cards via Stripe Checkout",
        requires_gateway=True,
        plugin_id="stripe",
    ),
    "nagad": PaymentMethodOption(
        id="nagad",
        label="Nagad",
        description="Mobile wallet — gateway plugin ready",
        requires_gateway=True,
        plugin_id="nagad",
    ),
    "bank": PaymentMethodOption(
        id="bank",
        label="Bank Transfer",
        description="Manual bank transfer",
        requires_gateway=False,
    ),
    "emi": PaymentMethodOption(
        id="emi",
        label="0% EMI / Card Installments",
        description="Bank EMI facility — pay in monthly installments (up to 12 months)",
        requires_gateway=True,
        plugin_id="emi",
    ),
}

PAYMENT_LABELS = {m.id: m.label for m in PAYMENT_METHODS.values()}


def list_payment_options() -> List[PaymentMethodOption]:
    return list(PAYMENT_METHODS.values())


