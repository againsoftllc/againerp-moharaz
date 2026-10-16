from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StockQuantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    product_id: Optional[str] = None
    product_name: str
    product_categ_id: Optional[str] = None
    product_categ_name: Optional[str] = None
    lot_id: Optional[str] = None
    lot_name: Optional[str] = None
    location_id: Optional[str] = None
    quantity: Decimal
    inventory_quantity: Optional[Decimal] = None
    inventory_diff_quantity: Optional[Decimal] = None
    inventory_date: Optional[datetime] = None
    scheduled_date: Optional[datetime] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    accounting_date: Optional[datetime] = None
    inventory_date_label: Optional[str] = None
    scheduled_date_label: Optional[str] = None
    accounting_date_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StockQuantUpdate(BaseModel):
    inventory_quantity: Optional[Decimal] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    accounting_date: Optional[datetime] = None


class StockQuantListMeta(BaseModel):
    count: int


class StockQuantListResponse(BaseModel):
    data: list[StockQuantRead]
    meta: StockQuantListMeta


class StockQuantResponse(BaseModel):
    data: StockQuantRead


class StockQuantApplyAllResponse(BaseModel):
    applied: int = Field(description="Number of quant lines applied")

