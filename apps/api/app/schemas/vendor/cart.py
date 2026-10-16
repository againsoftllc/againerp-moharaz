from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class VendorCartLineRead(BaseModel):
    item_id: str
    sku: str
    name: str
    quantity: int
    list_price: Decimal
    unit_price: Decimal
    line_total: Decimal
    stock_status: str
    orderable: bool
    issue: Optional[str] = None


class VendorCartRead(BaseModel):
    cart_id: str
    lines: List[VendorCartLineRead]
    subtotal: Decimal
    min_order_quantity: int
    has_blocking_issues: bool


class VendorCartResponse(BaseModel):
    data: VendorCartRead


class VendorCartSetItemRequest(BaseModel):
    item_id: str
    quantity: int = Field(ge=0)


class VendorCartSubmitRequest(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=1000)
    delivery_address: Optional[str] = Field(default=None, max_length=1000)
    requested_delivery_date: Optional[date] = None
