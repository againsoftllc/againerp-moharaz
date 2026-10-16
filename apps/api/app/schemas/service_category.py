from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    parent_id: Optional[str] = None
    name: str
    created_at: datetime
    updated_at: datetime


class ServiceCategoryListResponse(BaseModel):
    data: List[ServiceCategoryRead]


class ServiceCategoryResponse(BaseModel):
    data: ServiceCategoryRead


class ServiceCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    company_id: str = Field(default="default", max_length=36)
    parent_id: Optional[str] = Field(default=None, max_length=36)
