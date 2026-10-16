from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WarehouseBase(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="Main warehouse", max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    locations_count: int = Field(default=0, ge=0)
    is_active: bool = True
    is_default: bool = False
    sort_order: int = Field(default=0, ge=0)


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    type: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    locations_count: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)


class WarehouseRead(WarehouseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    total_units: int = 0
    created_at: datetime
    updated_at: datetime


class WarehouseListMeta(BaseModel):
    count: int


class WarehouseListResponse(BaseModel):
    data: List[WarehouseRead]
    meta: WarehouseListMeta


class WarehouseResponse(BaseModel):
    data: WarehouseRead
