from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    item_id: str
    warehouse_id: str
    stock_level_id: Optional[str] = None
    movement_type: str
    quantity: int
    qty_before: int
    qty_after: int
    source_warehouse_id: Optional[str] = None
    dest_warehouse_id: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime


class StockMovementCreate(BaseModel):
    item_id: str
    warehouse_id: str
    movement_type: str = Field(pattern="^(in|out|transfer|adjustment|opening)$")
    quantity: int = Field(ge=0)
    source_warehouse_id: Optional[str] = None
    dest_warehouse_id: Optional[str] = None
    reference: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    stock_level_id: Optional[str] = None


class StockMovementListMeta(BaseModel):
    count: int


class StockMovementListResponse(BaseModel):
    data: List[StockMovementRead]
    meta: StockMovementListMeta


class StockMovementResponse(BaseModel):
    data: StockMovementRead
