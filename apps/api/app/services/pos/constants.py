"""POS module constants — operational layer over Sales / Inventory / Finance."""

from __future__ import annotations

from decimal import Decimal

SESSION_STATUSES = frozenset({"open", "closed"})

CART_STATUSES = frozenset({"active", "held", "completed", "voided"})

# Stored on pos_payments. "split" is UI-only (multiple rows), not a method.
PAYMENT_METHODS = frozenset(
    {
        "cash",
        "card",
        "bank",
        "bank_transfer",
        "mobile_wallet",
        "mobile_banking",
        "store_credit",
        "other",
    }
)

PAYMENT_METHOD_LABELS = {
    "cash": "Cash",
    "card": "Card",
    "bank": "Bank",
    "bank_transfer": "Bank",
    "mobile_wallet": "Mobile Banking",
    "mobile_banking": "Mobile Banking",
    "store_credit": "Store credit",
    "other": "Other",
}

RETURN_STATUSES = frozenset({"draft", "posted", "voided"})

SYNC_STATUSES = frozenset({"synced", "pending", "failed"})

TERMINAL_STATUSES = frozenset({"active", "inactive", "maintenance"})

CASH_DIRECTIONS = frozenset({"in", "out"})

CASH_IN_REASONS = frozenset({"drawer_add", "owner_deposit", "opening_adjustment", "other"})

CASH_OUT_REASONS = frozenset({"expense", "supplier_payment", "petty_cash", "other"})

DEFAULT_WALK_IN_CUSTOMER_CODE = "WALK-IN"

DEFAULT_POS_SETTINGS = {
    "default_customer_id": None,
    "default_warehouse_id": None,
    "default_tax_rate": 0,
    "default_payment_method": "cash",
    "receipt_size": "80mm",
    "receipt_footer": "Thank you for your purchase.",
    "return_policy": "Returns accepted with receipt within 7 days.",
    "show_warranty": True,
    "allow_discount": True,
    "allow_price_override": False,
    "require_customer": False,
    "require_opening_cash": True,
    "require_closing_cash": True,
    "logo_url": None,
}


def expected_drawer_cash(
    *,
    opening: Decimal,
    cash_sales: Decimal,
    cash_in: Decimal,
    cash_refunds: Decimal,
    cash_out: Decimal,
) -> Decimal:
    """Opening + cash sales + cash in − cash refunds − cash out."""
    return opening + cash_sales + cash_in - cash_refunds - cash_out
