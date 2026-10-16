from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field


class WarrantyBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sort_order: int = Field(default=0, ge=0)


class WarrantyCreate(WarrantyBase):
    pass


class WarrantyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)


class WarrantyRead(WarrantyBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    created_at: datetime
    updated_at: datetime


class WarrantyListMeta(BaseModel):
    count: int


class WarrantyListResponse(BaseModel):
    data: List[WarrantyRead]
    meta: WarrantyListMeta
    errors: List[str] = []


class WarrantyResponse(BaseModel):
    data: WarrantyRead
    errors: List[str] = []
