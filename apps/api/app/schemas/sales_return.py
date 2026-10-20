from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

RETURN_STATUS_PATTERN = "^(draft|confirmed|credited|cancelled)$"
RETURN_REASON_PATTERN = "^(defective|wrong_item|customer_changed_mind|warranty|damaged_in_transit|other)$"


class SalesReturnLineRead(BaseModel):
    id: str
    sales_order_line_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity_returned: int
    unit_price: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    line_total: Decimal
    reason: Optional[str] = None
    notes: Optional[str] = None
    serial_numbers: List[str] = []


class SalesReturnRead(BaseModel):
    id: str
    company_id: str
    return_number: str
    sales_order_id: str
    order_number: Optional[str] = None
    invoice_number: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    reason: str
    return_date: date
    requested_by: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    credit_amount: Decimal
    receivable_id: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    credited_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[SalesReturnLineRead] = []


class SalesReturnListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class SalesReturnListResponse(BaseModel):
    data: List[SalesReturnRead]
    meta: SalesReturnListMeta


class SalesReturnResponse(BaseModel):
    data: SalesReturnRead


class SalesReturnLineCreate(BaseModel):
    sales_order_line_id: str = Field(min_length=1, max_length=36)
    quantity_returned: int = Field(gt=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    reason: Optional[str] = Field(default=None, pattern=RETURN_REASON_PATTERN)
    notes: Optional[str] = None
    # Which serial units come back (partial return of a serial-tracked line);
    # omitted = the first N of the line's serials.
    serial_numbers: Optional[List[str]] = None


class SalesReturnCreate(BaseModel):
    sales_order_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(default="other", pattern=RETURN_REASON_PATTERN)
    return_date: Optional[date] = None
    requested_by: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    # Where the units are received. Left out: the RMA store for a faulty / damaged return, else the order's own warehouse.
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    lines: List[SalesReturnLineCreate] = Field(min_length=1)
    # Confirm and credit in the same request: stock comes back and the credit
    # note posts immediately (the Sales drawer's Return tab uses this).
    auto_credit: bool = False
