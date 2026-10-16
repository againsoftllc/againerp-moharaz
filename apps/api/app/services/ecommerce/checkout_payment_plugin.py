"""Payment provider plugin interface — no gateway integration in STEP 06."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional, Protocol

from app.models.commerce_order import CommerceOrder
from app.services.ecommerce.checkout_constants import PAYMENT_METHODS


@dataclass(frozen=True)
class PreparedPayment:
    payment_method: str
    amount: Decimal
    status: str
    provider: str
    requires_action: bool
    client_payload: Dict[str, Any]


class CheckoutPaymentPlugin(Protocol):
    plugin_id: str

    def prepare(self, order: CommerceOrder, amount: Decimal) -> PreparedPayment: ...


class ManualPaymentPlugin:
    """Non-gateway methods (COD, bank transfer)."""

    def __init__(self, method_id: str) -> None:
        self.plugin_id = f"manual_{method_id}"
        self._method_id = method_id

    def prepare(self, order: CommerceOrder, amount: Decimal) -> PreparedPayment:
        status = "awaiting_payment" if self._method_id == "bank" else "awaiting_collection"
        return PreparedPayment(
            payment_method=self._method_id,
            amount=amount,
            status=status,
            provider=self._method_id,
            requires_action=False,
            client_payload={"message": f"Complete payment via {self._method_id}"},
        )


class GatewayStubPaymentPlugin:
    """Gateway-ready stub — does not call external APIs."""

    def __init__(self, method_id: str) -> None:
        self.plugin_id = f"gateway_stub_{method_id}"
        self._method_id = method_id

    def prepare(self, order: CommerceOrder, amount: Decimal) -> PreparedPayment:
        option = PAYMENT_METHODS.get(self._method_id)
        next_action = None
        if self._method_id == "bkash":
            next_action = "bkash_create"
        elif self._method_id == "sslcommerz":
            next_action = "sslcommerz_create"
        elif self._method_id == "paypal":
            next_action = "paypal_create"
        elif self._method_id == "stripe":
            next_action = "stripe_create"
        elif self._method_id == "emi":
            next_action = "emi_facility"
        return PreparedPayment(
            payment_method=self._method_id,
            amount=amount,
            status="pending_gateway",
            provider=option.plugin_id if option else self._method_id,
            requires_action=True,
            client_payload={
                "redirect_url": None,
                "next_action": next_action,
                "message": (
                    "Redirect to bKash to complete payment"
                    if next_action == "bkash_create"
                    else "Redirect to SSLCommerz to complete payment"
                    if next_action == "sslcommerz_create"
                    else "Redirect to PayPal to complete payment"
                    if next_action == "paypal_create"
                    else "Redirect to Stripe to complete payment"
                    if next_action == "stripe_create"
                    else "Complete 0% EMI via bank card installments"
                    if next_action == "emi_facility"
                    else f"Payment gateway plugin required for {self._method_id}"
                ),
                "order_id": order.id,
                "order_number": order.order_number,
            },
        )


def get_payment_plugin(method_id: str) -> CheckoutPaymentPlugin:
    option = PAYMENT_METHODS.get(method_id)
    if not option:
        return ManualPaymentPlugin("cod")
    if option.requires_gateway:
        return GatewayStubPaymentPlugin(method_id)
    return ManualPaymentPlugin(method_id)
