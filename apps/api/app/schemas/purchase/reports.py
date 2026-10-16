from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class PurchasePriceLine(BaseModel):
    id: str
    sku: str
    name: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    on_hand: int = 0
    stock_cost: Decimal = Decimal("0")
    default_purchase_price: Optional[Decimal] = None
    last_purchase_price: Optional[Decimal] = None
    avg_purchase_price: Optional[Decimal] = None
    min_purchase_price: Optional[Decimal] = None
    max_purchase_price: Optional[Decimal] = None
    last_purchase_date: Optional[date] = None
    last_po_number: Optional[str] = None
    days_since_last: Optional[int] = None
    po_count: int = 0
    qty_purchased: int = 0
    total_spend: Decimal = Decimal("0")
    vs_avg: Optional[Decimal] = None
    vs_default: Optional[Decimal] = None


class PurchasePriceMeta(BaseModel):
    count: int
    sku_count: int
    total_on_hand: int
    total_spend: Decimal
    last_above_avg_count: int = 0
    last_below_avg_count: int = 0
    last_above_default_count: int = 0
    last_below_default_count: int = 0
    missing_default_count: int = 0
    never_purchased_count: int = 0
    stale_90d_count: int = 0


class PurchasePriceResponse(BaseModel):
    data: List[PurchasePriceLine]
    meta: PurchasePriceMeta
    errors: List[str] = []
