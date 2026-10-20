from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

PRESET_PATTERN = "^(without_payment|payment_received|payment_payable|product_payment_received|product_payment_payable|custom)$"


class RmaDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rma_id: str
    delivery_number: str
    status: str
    preset: str
    deliver_product: bool
    payment_state: str
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
    """A delivery is the hand-over only; money is a settlement."""

    delivery_date: Optional[date] = None
    delivered_to: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None


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
    held_serial: Optional[str] = None
    charge_estimate: Decimal = Decimal("0")


class RmaDeliverySummaryResponse(BaseModel):
    data: RmaDeliverySummary


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
    product_name: str = ""
    sku: str = ""
    serial_delivered: Optional[str] = None
    serial_original: Optional[str] = None
    serial_changed: bool = False
    problem: str = ""
    diagnosis: Optional[str] = None
    deliver_product: bool = False
    payment_state: str = "none"
    preset: str = "custom"
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
