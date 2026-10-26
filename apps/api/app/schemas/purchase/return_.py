from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

RETURN_STATUS_PATTERN = "^(requested|approved|credited|rejected|cancelled)$"
RETURN_REASON_PATTERN = "^(defective|wrong_item|over_shipment|warranty|expired|other)$"


class PurchaseReturnLineRead(BaseModel):
    id: str
    purchase_order_line_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity_returned: int
    unit_cost: Decimal
    tax_rate: Decimal
    line_total: Decimal
    reason: Optional[str] = None
    notes: Optional[str] = None
    serial_numbers: List[str] = []


class PurchaseReturnRead(BaseModel):
    id: str
    company_id: str
    return_number: str
    purchase_order_id: str
    po_number: Optional[str] = None
    purchase_receipt_id: Optional[str] = None
    receipt_number: Optional[str] = None
    supplier_id: str
    supplier_name: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    reason: str
    return_date: date
    requested_by: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Decimal
    tax_amount: Decimal
    credit_amount: Decimal
    payable_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    credited_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseReturnLineRead] = []


class PurchaseReturnListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseReturnListResponse(BaseModel):
    data: List[PurchaseReturnRead]
    meta: PurchaseReturnListMeta


class PurchaseReturnResponse(BaseModel):
    data: PurchaseReturnRead


class PurchaseReturnLineCreate(BaseModel):
    purchase_order_line_id: str = Field(min_length=1, max_length=36)
    quantity_returned: int = Field(gt=0)
    reason: Optional[str] = Field(default=None, pattern=RETURN_REASON_PATTERN)
    notes: Optional[str] = None
    # Serial-tracked products: exactly one serial per returned unit, in stock at the return's warehouse
    serial_numbers: List[str] = Field(default_factory=list)


class PurchaseReturnCreate(BaseModel):
    purchase_order_id: str = Field(min_length=1, max_length=36)
    purchase_receipt_id: Optional[str] = Field(default=None, max_length=36)
    # The location the goods go back from; defaults to the purchase order's warehouse
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    reason: str = Field(default="other", pattern=RETURN_REASON_PATTERN)
    return_date: Optional[date] = None
    requested_by: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    lines: List[PurchaseReturnLineCreate] = Field(min_length=1)


class PurchaseReturnRejectRequest(BaseModel):
    notes: Optional[str] = None
