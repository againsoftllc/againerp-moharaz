from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

PARTY_TYPE_PATTERN = "^(customer|dealer|supplier|other)$"
DIRECTION_PATTERN = "^(in|out)$"
PURPOSE_PATTERN = "^(parts_service|damage_compensation|repair_labour|refund_settlement|replacement_price_difference|other)$"


class RmaSettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rma_id: str
    settlement_number: str
    status: str
    party_type: str
    party_id: Optional[str] = None
    party_name: str
    direction: str
    amount: Decimal
    purpose: str
    purpose_note: Optional[str] = None
    payment_account_id: Optional[str] = None
    payment_method: Optional[str] = None
    transaction_date: Optional[date] = None
    reference: Optional[str] = None
    created_by_name: Optional[str] = None
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_reason: Optional[str] = None
    posted_at: Optional[datetime] = None
    counter_account_code: Optional[str] = None
    payment_number: Optional[str] = None
    journal_number: Optional[str] = None
    receivable_number: Optional[str] = None
    reverses_id: Optional[str] = None
    reversed_by_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RmaSettlementResponse(BaseModel):
    data: RmaSettlementRead


class RmaSettlementListResponse(BaseModel):
    data: List[RmaSettlementRead]


class RmaSettlementCreate(BaseModel):
    party_type: str = Field(default="customer", pattern=PARTY_TYPE_PATTERN)
    party_id: Optional[str] = Field(default=None, max_length=36)
    party_name: Optional[str] = Field(default=None, max_length=255)
    direction: str = Field(default="in", pattern=DIRECTION_PATTERN)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    purpose: str = Field(default="parts_service", pattern=PURPOSE_PATTERN)
    purpose_note: Optional[str] = None
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    transaction_date: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=100)


class RmaSettlementUpdate(BaseModel):
    party_type: Optional[str] = Field(default=None, pattern=PARTY_TYPE_PATTERN)
    party_id: Optional[str] = Field(default=None, max_length=36)
    party_name: Optional[str] = Field(default=None, max_length=255)
    direction: Optional[str] = Field(default=None, pattern=DIRECTION_PATTERN)
    amount: Optional[Decimal] = Field(default=None, ge=0)
    purpose: Optional[str] = Field(default=None, pattern=PURPOSE_PATTERN)
    purpose_note: Optional[str] = None
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    transaction_date: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=100)


class RmaSettlementDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|correction_requested)$")
    reason: Optional[str] = None


class RmaSettlementCancel(BaseModel):
    reason: Optional[str] = None


class RmaSettlementReverse(BaseModel):
    reason: str


class RmaSettlementSummary(BaseModel):
    total: Decimal
    paid: Decimal
    outstanding: Decimal
    receivable_id: Optional[str] = None
    receivable_number: Optional[str] = None
    money_in: Decimal
    money_out: Decimal
    net: Decimal
    pending_count: int
    can_settle: bool
    blocker: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str = ""


class RmaSettlementSummaryResponse(BaseModel):
    data: RmaSettlementSummary
