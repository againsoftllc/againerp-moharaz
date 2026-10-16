"""Vendor order request status machine — SPEC.md §22.

Mirrors app.services.sales.constants' dict[str, frozenset[str]] pattern.
"""

from __future__ import annotations

from app.models.vendor.vendor_order_request import ORDER_REQUEST_STATUSES
from app.models.vendor.vendor_quotation import QUOTATION_STATUSES

ORDER_REQUEST_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"submitted", "cancelled"}),
    "submitted": frozenset({"under_review", "cancelled"}),
    "under_review": frozenset({"revision_required", "quotation_created", "approved", "rejected"}),
    "revision_required": frozenset({"submitted", "cancelled"}),
    "quotation_created": frozenset({"negotiation", "approved", "rejected"}),
    "negotiation": frozenset({"quotation_created", "approved", "rejected"}),
    "approved": frozenset({"converted_to_order"}),
    "rejected": frozenset(),
    "converted_to_order": frozenset(),
    "cancelled": frozenset(),
}

# SPEC.md §25-27 — "superseded" is reached only as a side effect of
# revising a quotation (vendor_quotation_service.create_revision), never via
# a direct transition call, so it has no inbound edge here on purpose.
QUOTATION_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"sent", "cancelled"}),
    "sent": frozenset({"viewed", "negotiation", "accepted", "rejected", "expired", "cancelled"}),
    "viewed": frozenset({"negotiation", "accepted", "rejected", "expired", "cancelled"}),
    "negotiation": frozenset({"sent", "accepted", "rejected", "cancelled"}),
    "accepted": frozenset(),
    "rejected": frozenset(),
    "expired": frozenset(),
    "cancelled": frozenset(),
    "superseded": frozenset(),
}


def can_transition(current: str, target: str) -> bool:
    return target in ORDER_REQUEST_TRANSITIONS.get(current, frozenset())


def can_transition_quotation(current: str, target: str) -> bool:
    return target in QUOTATION_TRANSITIONS.get(current, frozenset())


__all__ = [
    "ORDER_REQUEST_STATUSES",
    "ORDER_REQUEST_TRANSITIONS",
    "can_transition",
    "QUOTATION_STATUSES",
    "QUOTATION_TRANSITIONS",
    "can_transition_quotation",
]
