from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class VendorPriceListRead(BaseModel):
    id: str
    code: str
    name: str
    currency: str
    is_active: bool
    created_at: datetime


class VendorPriceListWrite(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    currency: str = "BDT"
    is_active: bool = True


class VendorPriceListListResponse(BaseModel):
    data: List[VendorPriceListRead]


class VendorPriceListResponse(BaseModel):
    data: VendorPriceListRead


class VendorPriceListItemRead(BaseModel):
    id: str
    price_list_id: str
    item_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit_price: Decimal
    min_qty: int
    max_qty: Optional[int] = None
    is_active: bool


class VendorPriceListItemWrite(BaseModel):
    item_id: str
    unit_price: Decimal
    min_qty: int = 1
    max_qty: Optional[int] = None
    is_active: bool = True


class VendorPriceListItemListResponse(BaseModel):
    data: List[VendorPriceListItemRead]


class VendorPriceListItemResponse(BaseModel):
    data: VendorPriceListItemRead
