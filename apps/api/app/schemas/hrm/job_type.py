from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class JobTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class JobTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobTypeListMeta(BaseModel):
    count: int


class JobTypeListResponse(BaseModel):
    data: List[JobTypeRead]
    meta: JobTypeListMeta
    errors: List[str] = []


class JobTypeResponse(BaseModel):
    data: JobTypeRead
    errors: List[str] = []
