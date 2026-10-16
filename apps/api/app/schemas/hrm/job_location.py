from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobLocationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=50)
    state: Optional[str] = Field(default=None, max_length=50)
    country: Optional[str] = Field(default=None, max_length=50)
    postal_code: Optional[str] = Field(default=None, max_length=50)
    is_remote: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class JobLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=50)
    state: Optional[str] = Field(default=None, max_length=50)
    country: Optional[str] = Field(default=None, max_length=50)
    postal_code: Optional[str] = Field(default=None, max_length=50)
    is_remote: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class JobLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    is_remote: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobLocationListMeta(BaseModel):
    count: int


class JobLocationListResponse(BaseModel):
    data: List[JobLocationRead]
    meta: JobLocationListMeta
    errors: List[str] = []


class JobLocationResponse(BaseModel):
    data: JobLocationRead
    errors: List[str] = []
