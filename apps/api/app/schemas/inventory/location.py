from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class LocationUpdate(BaseModel):
    warehouse_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    warehouse_id: str
    code: str
    name: str
    is_active: bool
    sort_order: int
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LocationListMeta(BaseModel):
    count: int


class LocationListResponse(BaseModel):
    data: List[LocationRead]
    meta: LocationListMeta
    errors: List[str] = []


class LocationResponse(BaseModel):
    data: LocationRead
    errors: List[str] = []
