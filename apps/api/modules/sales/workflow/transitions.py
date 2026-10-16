"""Sales workflow status transitions."""

from __future__ import annotations

from app.services.sales.constants import (
    QUOTATION_STATUSES,
    QUOTATION_TRANSITIONS,
    SALES_ORDER_STATUSES,
    SALES_ORDER_TRANSITIONS,
)

__all__ = [
    "QUOTATION_STATUSES",
    "QUOTATION_TRANSITIONS",
    "SALES_ORDER_STATUSES",
    "SALES_ORDER_TRANSITIONS",
]
