from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class VendorNegotiationRequest(BaseModel):
    request_type: str = Field(default="other", max_length=20)
    message: str = Field(default="", max_length=1000)
    requested_price: Optional[Decimal] = None
    requested_quantity: Optional[int] = None
    requested_delivery_date: Optional[date] = None
    requested_payment_terms: Optional[str] = Field(default=None, max_length=100)


class VendorNegotiationRead(BaseModel):
    id: str
    quotation_id: str
    vendor_id: str
    request_type: str
    message: str
    requested_price: Optional[Decimal] = None
    requested_quantity: Optional[int] = None
    requested_delivery_date: Optional[date] = None
    requested_payment_terms: Optional[str] = None
    status: str
    admin_response: Optional[str] = None
    resulting_quotation_id: Optional[str] = None
    created_at: datetime


class VendorNegotiationListResponse(BaseModel):
    data: List[VendorNegotiationRead]


class VendorNegotiationResponse(BaseModel):
    data: VendorNegotiationRead


class VendorNegotiationDeclineRequest(BaseModel):
    admin_response: str = Field(default="", max_length=1000)


class VendorQuotationRevisionItem(BaseModel):
    item_id: str
    sku_snapshot: str
    name_snapshot: str
    unit_price: Decimal
    quantity: int = Field(gt=0)
    discount_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")


class VendorQuotationReviseRequest(BaseModel):
    items: Optional[List[VendorQuotationRevisionItem]] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    negotiation_id: Optional[str] = None
