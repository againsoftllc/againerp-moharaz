from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class VendorCreditSummaryRead(BaseModel):
    credit_limit: Decimal
    outstanding: Decimal
    overdue: Decimal
    available_credit: Decimal
    utilization_percent: Decimal
    exceeded: bool


class VendorCreditSummaryResponse(BaseModel):
    data: VendorCreditSummaryRead
