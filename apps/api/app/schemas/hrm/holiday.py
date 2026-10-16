from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class HolidayCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    start_date: Date
    end_date: Optional[Date] = None
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    is_recurring: bool = False
    is_paid: bool = True
    is_half_day: bool = False
    branch_ids: List[str] = Field(default_factory=list)


class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    is_recurring: Optional[bool] = None
    is_paid: Optional[bool] = None
    is_half_day: Optional[bool] = None
    branch_ids: Optional[List[str]] = None


class HolidayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_recurring: bool
    is_paid: bool
    is_half_day: bool
    branch_ids: List[str] = []
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class HolidayListMeta(BaseModel):
    count: int


class HolidayListResponse(BaseModel):
    data: List[HolidayRead]
    meta: HolidayListMeta
    errors: List[str] = []


class HolidayResponse(BaseModel):
    data: HolidayRead
    errors: List[str] = []
