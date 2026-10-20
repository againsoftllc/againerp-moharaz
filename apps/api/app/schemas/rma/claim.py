from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RmaClaimRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rma_id: str
    claim_number: str
    status: str
    supplier_id: str
    supplier_name: str
    supplier_reference: Optional[str] = None
    purchase_receipt_no: Optional[str] = None
    purchase_bill_no: Optional[str] = None
    vendor_invoice_no: Optional[str] = None
    sku: str = ""
    product_name: str = ""
    serial_number: Optional[str] = None
    quantity: int = 1
    problem: str = ""
    diagnosis: Optional[str] = None
    accessories_sent: Optional[str] = None
    notes: Optional[str] = None
    dispatch_date: Optional[date] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    expected_return_date: Optional[date] = None
    decision: Optional[str] = None
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_reason: Optional[str] = None
    dispatched_by_name: Optional[str] = None
    dispatched_at: Optional[datetime] = None
    print_count: int = 0
    last_printed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class RmaClaimResponse(BaseModel):
    data: RmaClaimRead


class RmaClaimListResponse(BaseModel):
    data: List[RmaClaimRead]


class RmaClaimCreate(BaseModel):
    # Only when the purchase trace found no supplier: needs the RMA override permission and a reason.
    supplier_id: Optional[str] = Field(default=None, max_length=36)
    override_reason: Optional[str] = None


class RmaClaimUpdate(BaseModel):
    supplier_reference: Optional[str] = Field(default=None, max_length=128)
    problem: Optional[str] = None
    diagnosis: Optional[str] = None
    accessories_sent: Optional[str] = None
    notes: Optional[str] = None
    dispatch_date: Optional[date] = None
    courier: Optional[str] = Field(default=None, max_length=100)
    tracking_number: Optional[str] = Field(default=None, max_length=100)
    expected_return_date: Optional[date] = None


class RmaClaimDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|correction_requested)$")
    reason: Optional[str] = None


class RmaClaimDispatch(BaseModel):
    dispatch_date: Optional[date] = None
    courier: Optional[str] = Field(default=None, max_length=100)
    tracking_number: Optional[str] = Field(default=None, max_length=100)
    expected_return_date: Optional[date] = None
    note: Optional[str] = None


class RmaClaimCancel(BaseModel):
    reason: Optional[str] = None


class RmaClaimCopyRead(BaseModel):
    claim_no: str
    status: str
    status_label: str
    reprint: bool
    print_count: int
    printed_at: str
    printed_by: str
    rma_number: str
    supplier_name: str
    supplier_reference: Optional[str] = None
    product_name: str = ""
    sku: str = ""
    serial_number: Optional[str] = None
    quantity: int = 1
    problem: str = ""
    diagnosis: Optional[str] = None
    accessories_sent: Optional[str] = None
    purchase_receipt_no: Optional[str] = None
    purchase_bill_no: Optional[str] = None
    vendor_invoice_no: Optional[str] = None
    sold_on: Optional[str] = None
    dispatch_date: Optional[str] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    expected_return_date: Optional[str] = None
    approved_by: Optional[str] = None
    dispatched_by: Optional[str] = None


class RmaClaimCopyResponse(BaseModel):
    data: RmaClaimCopyRead
