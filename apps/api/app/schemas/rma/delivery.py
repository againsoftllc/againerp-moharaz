from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

OUTCOME_PATTERN = "^(same_unit|same_product|different_product|cash_back)$"


class RmaDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rma_id: str
    delivery_number: str
    status: str
    # what the customer gets: same_unit | same_product | different_product | cash_back
    outcome: str = "same_unit"
    preset: str
    deliver_product: bool
    payment_state: str
    refund_amount: Optional[Decimal] = None
    refund_account_id: Optional[str] = None
    collect_settlement_id: Optional[str] = None
    refund_settlement_id: Optional[str] = None
    amount_total: Decimal
    amount_received: Decimal
    amount_due: Decimal
    payment_account_id: Optional[str] = None
    payment_reference: Optional[str] = None
    due_date: Optional[date] = None
    delivery_date: Optional[date] = None
    delivered_to: Optional[str] = None
    serial_delivered: Optional[str] = None
    notes: Optional[str] = None
    decision: Optional[str] = None
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_reason: Optional[str] = None
    posted_at: Optional[datetime] = None
    stock_posted: bool = False
    payment_number: Optional[str] = None
    receivable_number: Optional[str] = None
    print_count: int = 0
    last_printed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class RmaDeliveryResponse(BaseModel):
    data: RmaDeliveryRead


class RmaDeliveryListResponse(BaseModel):
    data: List[RmaDeliveryRead]


class RmaDeliveryUpdate(BaseModel):
    """What the customer gets, and the money that goes with it (charges collected now, cash back paid out)."""

    delivery_date: Optional[date] = None
    delivered_to: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    outcome: Optional[str] = Field(default=None, pattern=OUTCOME_PATTERN)
    # cash back: what is paid back and the account it is paid from
    refund_amount: Optional[Decimal] = Field(default=None, ge=0)
    refund_account_id: Optional[str] = Field(default=None, max_length=36)
    # charges collected NOW (the rest stays owed) and the account it goes into
    amount_received: Optional[Decimal] = Field(default=None, ge=0)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    payment_reference: Optional[str] = Field(default=None, max_length=100)


class RmaDeliveryDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|correction_requested)$")
    reason: Optional[str] = None


class RmaDeliveryCancel(BaseModel):
    reason: Optional[str] = None


class RmaDeliverySummary(BaseModel):
    total: Decimal
    paid: Decimal
    outstanding: Decimal
    receivable_id: Optional[str] = None
    receivable_number: Optional[str] = None
    can_deliver_product: bool
    deliver_blocker: Optional[str] = None
    can_cash_back: bool = True
    cash_back_blocker: Optional[str] = None
    # which unit type the RMA's held unit is (the three unit types must match it), and what the unit is
    unit_outcome: str = "same_unit"
    held_serial: Optional[str] = None
    held_sku: Optional[str] = None
    held_product_name: Optional[str] = None
    original_serial: Optional[str] = None
    original_product_name: Optional[str] = None
    refunded: Decimal = Decimal("0")
    charge_estimate: Decimal = Decimal("0")


class RmaDeliverySummaryResponse(BaseModel):
    data: RmaDeliverySummary


class RmaDeliveryChargeLine(BaseModel):
    kind: str
    description: str = ""
    amount: str = "0.00"


class RmaDeliveryCopyRead(BaseModel):
    delivery_no: str
    status: str
    status_label: str
    reprint: bool
    print_count: int
    printed_at: str
    printed_by: str
    rma_number: str
    delivery_date: Optional[str] = None
    customer_name: str = ""
    customer_phone: str = ""
    delivered_to: Optional[str] = None
    outcome: str = "same_unit"
    outcome_label: str = ""
    product_name: str = ""
    sku: str = ""
    original_product_name: str = ""
    serial_delivered: Optional[str] = None
    serial_original: Optional[str] = None
    serial_changed: bool = False
    problem: str = ""
    diagnosis: Optional[str] = None
    deliver_product: bool = False
    payment_state: str = "none"
    preset: str = "custom"
    charges: List[RmaDeliveryChargeLine] = []
    refund_amount: Optional[str] = None
    amount_total: str = "0.00"
    amount_received: str = "0.00"
    amount_due: str = "0.00"
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_number: Optional[str] = None
    invoice_number: Optional[str] = None
    due_date: Optional[str] = None
    approved_by: Optional[str] = None


class RmaDeliveryCopyResponse(BaseModel):
    data: RmaDeliveryCopyRead
