from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobCategoryCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class JobCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class JobCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobCategoryListMeta(BaseModel):
    count: int


class JobCategoryListResponse(BaseModel):
    data: List[JobCategoryRead]
    meta: JobCategoryListMeta
    errors: List[str] = []


class JobCategoryResponse(BaseModel):
    data: JobCategoryRead
    errors: List[str] = []
