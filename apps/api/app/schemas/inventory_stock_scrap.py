from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

StockScrapState = Literal["draft", "done", "cancel"]


class StockScrapRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    date: datetime
    product_id: Optional[str] = None
    product_name: str
    scrap_qty: Decimal
    location_id: Optional[str] = None
    state: StockScrapState
    date_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StockScrapUpdate(BaseModel):
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    scrap_qty: Optional[Decimal] = None
    date: Optional[datetime] = None
    location_id: Optional[str] = None
    state: Optional[StockScrapState] = None


class StockScrapListMeta(BaseModel):
    count: int


class StockScrapListResponse(BaseModel):
    data: list[StockScrapRead]
    meta: StockScrapListMeta


class StockScrapResponse(BaseModel):
    data: StockScrapRead
