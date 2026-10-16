from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class VendorOrderRequestItemRead(BaseModel):
    id: str
    item_id: str
    sku_snapshot: str
    name_snapshot: str
    unit_price: Decimal
    quantity: int
    discount_amount: Decimal
    tax_amount: Decimal
    line_total: Decimal


class VendorOrderRequestRead(BaseModel):
    """Vendor-safe view — never includes internal_note."""

    id: str
    order_request_number: str
    vendor_id: str
    vendor_name: Optional[str] = None
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    grand_total: Decimal
    payment_terms: str
    requested_delivery_date: Optional[date] = None
    delivery_address: Optional[str] = None
    vendor_note: Optional[str] = None
    requires_credit_approval: bool = False
    created_at: datetime
    updated_at: datetime
    items: List[VendorOrderRequestItemRead]


class VendorOrderRequestAdminRead(VendorOrderRequestRead):
    internal_note: Optional[str] = None


class VendorOrderRequestListResponse(BaseModel):
    data: List[VendorOrderRequestRead]
    total: int


class VendorOrderRequestAdminListResponse(BaseModel):
    data: List[VendorOrderRequestAdminRead]
    total: int


class VendorOrderRequestResponse(BaseModel):
    data: VendorOrderRequestRead


class VendorOrderRequestAdminResponse(BaseModel):
    data: VendorOrderRequestAdminRead


class VendorOrderRequestItemWrite(BaseModel):
    item_id: str
    unit_price: Decimal
    quantity: int = Field(gt=0)
    discount_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")


class VendorOrderRequestAdminUpdate(BaseModel):
    """Admin edit — SPEC §23. Any field omitted is left unchanged; passing
    `items` replaces the entire line set (covers edit qty / change price /
    apply discount / add / remove product in one call)."""

    payment_terms: Optional[str] = None
    shipping_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    requested_delivery_date: Optional[date] = None
    delivery_address: Optional[str] = None
    vendor_note: Optional[str] = None
    internal_note: Optional[str] = None
    items: Optional[List[VendorOrderRequestItemWrite]] = None


class VendorOrderRequestTransitionRequest(BaseModel):
    status: str
    note: Optional[str] = Field(default=None, max_length=1000)


class VendorOrderRequestAdminCreate(BaseModel):
    """Staff creates an order request on a vendor's behalf — starts at
    'under_review' (already staff-reviewed by construction), so a quotation
    can be created immediately without the vendor submitting anything first."""

    vendor_id: str
    payment_terms: Optional[str] = None
    requested_delivery_date: Optional[date] = None
    delivery_address: Optional[str] = None
    vendor_note: Optional[str] = None
    internal_note: Optional[str] = None
    items: List[VendorOrderRequestItemWrite] = Field(min_length=1)
