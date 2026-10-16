from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class MovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    thumbnail: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    stock_level_id: Optional[str] = None
    movement_type: str
    quantity: int
    qty_before: int
    qty_after: int
    source_warehouse_id: Optional[str] = None
    source_warehouse_name: Optional[str] = None
    dest_warehouse_id: Optional[str] = None
    dest_warehouse_name: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    posting_date: Optional[date] = None
    document_date: Optional[date] = None
    value_delta: Optional[Decimal] = None
    reverses_id: Optional[str] = None
    reversed_by_id: Optional[str] = None


class MovementListMeta(BaseModel):
    count: int
    total: int
    limit: int
    offset: int


class MovementListResponse(BaseModel):
    data: List[MovementRead]
    meta: MovementListMeta
    errors: List[str] = []
