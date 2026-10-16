"""Sales module constants."""

from __future__ import annotations

QUOTATION_STATUSES = frozenset({"draft", "sent", "approved", "rejected"})

SALES_ORDER_STATUSES = frozenset({"draft", "confirmed", "processing", "completed", "cancelled"})

# Orders that may be fully edited (lines, customer, notes) via PUT.
EDITABLE_SALES_ORDER_STATUSES = frozenset({"draft", "confirmed", "processing"})

EDITABLE_QUOTATION_STATUSES = frozenset({"draft", "sent"})

DELIVERY_STATUSES = frozenset({"pending", "partial", "delivered"})

DELIVERY_NOTE_STATUSES = frozenset({"draft", "posted", "cancelled"})

QUOTATION_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"sent", "rejected"}),
    "sent": frozenset({"approved", "rejected"}),
    "approved": frozenset(),
    "rejected": frozenset(),
}

SALES_ORDER_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"processing", "cancelled"}),
    "processing": frozenset({"completed", "cancelled"}),
    "completed": frozenset(),
    "cancelled": frozenset(),
}

# Odoo/SAP sales return: draft → confirmed (return receipt) → credited (credit memo).
SALES_RETURN_STATUSES = frozenset({"draft", "confirmed", "credited", "cancelled"})

SALES_RETURN_REASONS = frozenset(
    {"defective", "wrong_item", "customer_changed_mind", "warranty", "damaged_in_transit", "other"}
)

SALES_RETURN_STATUS_LABELS = {
    "draft": "Draft",
    "confirmed": "Confirmed",
    "credited": "Credited",
    "cancelled": "Cancelled",
}

SALES_RETURN_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"credited", "cancelled"}),
    "credited": frozenset(),
    "cancelled": frozenset(),
}
