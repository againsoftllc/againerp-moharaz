from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class InventoryDashboardKpis(BaseModel):
    total_skus: int
    total_units: int
    total_value: Decimal
    low_stock_count: int
    out_of_stock_count: int
    warehouse_count: int
    movement_count_7d: int


class InventoryDashboardResponse(BaseModel):
    data: InventoryDashboardKpis


class UomRead(BaseModel):
    id: str
    code: str
    name: str
    is_base: bool
    is_active: bool


class UomListResponse(BaseModel):
    data: List[UomRead]
    meta: dict
