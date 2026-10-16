from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    branch_id: str = Field(min_length=1, max_length=36)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    branch_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    branch_id: Optional[str] = None
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DepartmentListMeta(BaseModel):
    count: int


class DepartmentListResponse(BaseModel):
    data: List[DepartmentRead]
    meta: DepartmentListMeta
    errors: List[str] = []


class DepartmentResponse(BaseModel):
    data: DepartmentRead
    errors: List[str] = []
