from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StockCountCreate(BaseModel):
    warehouse_id: str = Field(min_length=1, max_length=36)
    notes: Optional[str] = Field(default=None, max_length=1000)


class StockCountLineUpdate(BaseModel):
    counted_qty: Optional[int] = Field(default=None, ge=0)
    counted_serials: Optional[List[str]] = None


class StockCountLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: str
    sku: str
    name: str
    expected_qty: int
    counted_qty: Optional[int] = None
    variance: Optional[int] = None
    tracking_type: str = "none"
    expected_serials: List[str] = []
    counted_serials: List[str] = []
    unit_cost: Optional[Decimal] = None
    notes: Optional[str] = None


class StockCountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    count_number: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    count_date: datetime
    counted_by: Optional[str] = None
    notes: Optional[str] = None
    posted_at: Optional[datetime] = None
    posted_by: Optional[str] = None
    line_count: int = 0
    variance_count: int = 0
    lines: List[StockCountLineRead] = []
    created_at: datetime
    updated_at: datetime


class StockCountListMeta(BaseModel):
    count: int


class StockCountListResponse(BaseModel):
    data: List[StockCountRead]
    meta: StockCountListMeta
    errors: List[str] = []


class StockCountResponse(BaseModel):
    data: StockCountRead
    errors: List[str] = []
