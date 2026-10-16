from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StockLevelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    warehouse_id: str
    warehouse_name: str
    variant_id: str
    product_id: str
    item_id: Optional[str] = None
    sku: str
    name: str
    on_hand: int
    reserved: int
    available: int
    incoming: int
    min_qty: int
    max_qty: int
    reorder_level: int = 0
    unit_cost: Decimal
    status: str
    thumbnail: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StockLevelUpdate(BaseModel):
    """Legacy unused schema. Live PATCH uses schemas.inventory.stock_level.StockLevelUpdate (metadata only)."""

    on_hand: Optional[int] = Field(default=None, ge=0)
    reserved: Optional[int] = Field(default=None, ge=0)
    incoming: Optional[int] = Field(default=None, ge=0)
    min_qty: Optional[int] = Field(default=None, ge=0)
    max_qty: Optional[int] = Field(default=None, ge=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)


class StockListMeta(BaseModel):
    count: int
    total_units: int
    total_value: Decimal


class StockListResponse(BaseModel):
    data: List[StockLevelRead]
    meta: StockListMeta


class StockResponse(BaseModel):
    data: StockLevelRead
