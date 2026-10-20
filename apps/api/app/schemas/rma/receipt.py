from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

OUTCOME_PATTERN = "^(replacement|repaired|returned_unrepaired|other)$"


class RmaReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rma_id: str
    claim_id: str
    receipt_number: str
    status: str
    supplier_id: str
    supplier_name: str
    sent_serial: Optional[str] = None
    received_serial: Optional[str] = None
    outcome: str
    outcome_note: Optional[str] = None
    supplier_delivery_ref: Optional[str] = None
    received_date: Optional[date] = None
    received_by: Optional[str] = None
    condition_notes: Optional[str] = None
    accessories_received: Optional[str] = None
    warehouse_id: Optional[str] = None
    decision: Optional[str] = None
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_reason: Optional[str] = None
    posted_at: Optional[datetime] = None
    print_count: int = 0
    last_printed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class RmaReceiptResponse(BaseModel):
    data: RmaReceiptRead


class RmaReceiptListResponse(BaseModel):
    data: List[RmaReceiptRead]


class RmaReceiptUpdate(BaseModel):
    outcome: Optional[str] = Field(default=None, pattern=OUTCOME_PATTERN)
    outcome_note: Optional[str] = None
    supplier_delivery_ref: Optional[str] = Field(default=None, max_length=128)
    received_date: Optional[date] = None
    received_by: Optional[str] = Field(default=None, max_length=100)
    condition_notes: Optional[str] = None
    accessories_received: Optional[str] = None
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    # Different from the serial that was sent: needs the serial-change permission and must be new to the registry.
    received_serial: Optional[str] = Field(default=None, max_length=128)


class RmaReceiptDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|correction_requested)$")
    reason: Optional[str] = None


class RmaReceiptCancel(BaseModel):
    reason: Optional[str] = None


class RmaReceiptCopyRead(BaseModel):
    receipt_no: str
    status: str
    status_label: str
    reprint: bool
    print_count: int
    printed_at: str
    printed_by: str
    rma_number: str
    claim_number: str = ""
    supplier_name: str
    supplier_reference: Optional[str] = None
    supplier_delivery_ref: Optional[str] = None
    product_name: str = ""
    sku: str = ""
    serial_sent: Optional[str] = None
    serial_received: Optional[str] = None
    serial_changed: bool = False
    outcome: str
    outcome_label: str
    outcome_note: Optional[str] = None
    received_date: Optional[str] = None
    received_by: Optional[str] = None
    condition_notes: Optional[str] = None
    accessories_received: Optional[str] = None
    received_into: Optional[str] = None
    approved_by: Optional[str] = None


class RmaReceiptCopyResponse(BaseModel):
    data: RmaReceiptCopyRead
