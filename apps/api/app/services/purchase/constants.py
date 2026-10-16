"""Purchase module constants."""

from __future__ import annotations

PO_STATUSES = frozenset({"draft", "confirmed", "partial_received", "completed", "cancelled"})

RECEIPT_STATUSES = frozenset({"draft", "posted", "cancelled"})

RECEIVE_TYPES = frozenset({"full", "partial", "over"})

PO_STATUS_LABELS = {
    "draft": "Draft",
    "confirmed": "Confirmed",
    "partial_received": "Partially Received",
    "completed": "Fully Received",
    "cancelled": "Cancelled",
}

# Transitions allowed without receipt posting
PO_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"cancelled"}),
    "partial_received": frozenset({"cancelled"}),
    "completed": frozenset(),
    "cancelled": frozenset(),
}

# ------------------------------------------------------------------------ rfq

RFQ_STATUSES = frozenset(
    {"draft", "sent", "vendor_response", "quotation", "approved", "po_created", "closed", "cancelled"}
)

RFQ_STATUS_LABELS = {
    "draft": "Draft",
    "sent": "Sent",
    "vendor_response": "Vendor Response",
    "quotation": "Quotation",
    "approved": "Approved",
    "po_created": "PO Created",
    "closed": "Closed",
    "cancelled": "Cancelled",
}

# "vendor_response" and the "sent"/"vendor_response" -> "quotation" transitions
# are only reachable internally (a supplier opening the portal, or submitting a
# quote) — never as a manually-requested PATCH target. See
# PurchaseRfqService._transition's `internal=True` exemption.
RFQ_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"sent", "cancelled"}),
    "sent": frozenset({"vendor_response", "quotation", "cancelled"}),
    "vendor_response": frozenset({"quotation", "cancelled"}),
    "quotation": frozenset({"approved", "closed", "cancelled"}),
    "approved": frozenset({"po_created", "cancelled"}),
    "po_created": frozenset(),
    "closed": frozenset(),
    "cancelled": frozenset(),
}

QUOTE_STATUSES = frozenset({"draft", "submitted", "accepted", "rejected"})

QUOTE_STATUS_LABELS = {
    "draft": "Draft",
    "submitted": "Submitted",
    "accepted": "Accepted",
    "rejected": "Rejected",
}

# ------------------------------------------------------------------ returns

RETURN_STATUSES = frozenset({"requested", "approved", "credited", "rejected", "cancelled"})

RETURN_REASONS = frozenset(
    {"defective", "wrong_item", "over_shipment", "warranty", "expired", "other"}
)

RETURN_STATUS_LABELS = {
    "requested": "Requested",
    "approved": "Approved",
    "credited": "Credited",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
}

# A return is a request until approved, credited (which posts the AP credit
# and pulls stock), rejected, or cancelled. Once credited/rejected/cancelled
# it is final.
RETURN_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "requested": frozenset({"approved", "rejected", "cancelled"}),
    "approved": frozenset({"credited", "cancelled"}),
    "credited": frozenset(),
    "rejected": frozenset(),
    "cancelled": frozenset(),
}
