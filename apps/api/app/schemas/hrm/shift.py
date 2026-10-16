from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ShiftCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    start_time: Optional[str] = Field(default=None, max_length=255)
    end_time: Optional[str] = Field(default=None, max_length=255)
    break_duration: int = Field(default=0, ge=0)
    break_start_time: Optional[str] = Field(default=None, max_length=255)
    break_end_time: Optional[str] = Field(default=None, max_length=255)
    grace_period: int = Field(default=0, ge=0)
    is_night_shift: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    start_time: Optional[str] = Field(default=None, max_length=255)
    end_time: Optional[str] = Field(default=None, max_length=255)
    break_duration: Optional[int] = Field(default=None, ge=0)
    break_start_time: Optional[str] = Field(default=None, max_length=255)
    break_end_time: Optional[str] = Field(default=None, max_length=255)
    grace_period: Optional[int] = Field(default=None, ge=0)
    is_night_shift: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ShiftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    break_duration: int
    break_start_time: Optional[str] = None
    break_end_time: Optional[str] = None
    grace_period: int
    is_night_shift: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ShiftListMeta(BaseModel):
    count: int


class ShiftListResponse(BaseModel):
    data: List[ShiftRead]
    meta: ShiftListMeta
    errors: List[str] = []


class ShiftResponse(BaseModel):
    data: ShiftRead
    errors: List[str] = []
