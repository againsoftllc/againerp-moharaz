from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class VendorQuotationItemRead(BaseModel):
    id: str
    item_id: str
    sku_snapshot: str
    name_snapshot: str
    unit_price: Decimal
    quantity: int
    discount_amount: Decimal
    tax_amount: Decimal
    line_total: Decimal


class VendorQuotationRead(BaseModel):
    id: str
    quotation_number: str
    order_request_id: str
    vendor_id: str
    vendor_name: Optional[str] = None
    status: str
    revision_number: int = 1
    previous_quotation_id: Optional[str] = None
    superseded_by_id: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    grand_total: Decimal
    payment_terms: str
    delivery_terms: str
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    viewed_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: List[VendorQuotationItemRead]


class VendorQuotationListResponse(BaseModel):
    data: List[VendorQuotationRead]
    total: int


class VendorQuotationResponse(BaseModel):
    data: VendorQuotationRead


class VendorQuotationCreateRequest(BaseModel):
    payment_terms: Optional[str] = None
    delivery_terms: str = ""
    valid_until: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class VendorQuotationTransitionRequest(BaseModel):
    status: str
