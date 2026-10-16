from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class VendorProductRead(BaseModel):
    id: str
    item_id: Optional[str] = None
    name: str
    sku: str
    model: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    thumbnail: Optional[str] = None
    short_description: Optional[str] = None
    warranty: Optional[str] = None

    stock_mode: str
    stock_status: str
    stock_label: str
    available_quantity: Optional[int] = None  # only populated when stock_mode == "exact"

    list_price: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    price_source: str

    min_order_quantity: int
    max_order_quantity: Optional[int] = None
    orderable: bool


class VendorProductListResponse(BaseModel):
    data: List[VendorProductRead]
    total: int


class VendorProductResponse(BaseModel):
    data: VendorProductRead
