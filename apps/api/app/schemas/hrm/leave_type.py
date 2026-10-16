from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LeaveTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    max_days_per_year: int = Field(default=0, ge=0)
    is_paid: bool = True
    color: str = Field(default="#3B82F6", max_length=50)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    max_days_per_year: Optional[int] = Field(default=None, ge=0)
    is_paid: Optional[bool] = None
    color: Optional[str] = Field(default=None, max_length=50)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class LeaveTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    max_days_per_year: int
    is_paid: bool
    color: str
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeaveTypeListMeta(BaseModel):
    count: int


class LeaveTypeListResponse(BaseModel):
    data: List[LeaveTypeRead]
    meta: LeaveTypeListMeta
    errors: List[str] = []


class LeaveTypeResponse(BaseModel):
    data: LeaveTypeRead
    errors: List[str] = []
