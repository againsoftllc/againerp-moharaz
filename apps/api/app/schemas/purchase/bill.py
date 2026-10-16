from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class PurchaseBillCreate(BaseModel):
    purchase_order_id: str
    vendor_invoice_number: Optional[str] = None
    bill_date: date
    due_date: Optional[date] = None
    notes: Optional[str] = None


class PurchaseBillLineUpdate(BaseModel):
    id: str
    quantity_bill: int = Field(ge=0)
    unit_price_bill: Decimal = Field(ge=0)


class PurchaseBillLineRead(BaseModel):
    id: str
    purchase_order_line_id: str
    sku: str
    name: str
    quantity_po: int
    quantity_receipt: int
    quantity_bill: int
    unit_price_po: Decimal
    unit_price_bill: Decimal
    line_total: Decimal

    model_config = {"from_attributes": True}


class PurchaseBillRead(BaseModel):
    id: str
    company_id: str
    bill_number: str
    vendor_invoice_number: Optional[str] = None
    purchase_order_id: str
    po_number: Optional[str] = None
    purchase_receipt_id: Optional[str] = None
    receipt_number: Optional[str] = None
    supplier_id: str
    supplier_name: Optional[str] = None
    bill_date: date
    due_date: Optional[date] = None
    status: str
    match_status: str
    subtotal: Decimal
    total: Decimal
    payable_id: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: str = "Default"
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    posted_by: Optional[str] = None
    posted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseBillLineRead] = Field(default_factory=list)


class PurchaseBillListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseBillListResponse(BaseModel):
    data: List[PurchaseBillRead]
    meta: PurchaseBillListMeta


class PurchaseBillResponse(BaseModel):
    data: PurchaseBillRead


class PurchaseBillPostResult(BaseModel):
    data: PurchaseBillRead
    matched_existing_payable: bool
