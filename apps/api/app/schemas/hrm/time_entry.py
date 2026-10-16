from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TimeEntryCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    date: Date
    hours: Decimal = Field(ge=Decimal("0.5"), le=Decimal("24"))
    description: Optional[str] = None
    project: Optional[str] = Field(default=None, max_length=50)


class TimeEntryUpdate(BaseModel):
    date: Optional[Date] = None
    hours: Optional[Decimal] = Field(default=None, ge=Decimal("0.5"), le=Decimal("24"))
    description: Optional[str] = None
    project: Optional[str] = Field(default=None, max_length=50)


class TimeEntryDecision(BaseModel):
    manager_comments: Optional[str] = None


class TimeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    date: Optional[Date] = None
    hours: Decimal
    description: Optional[str] = None
    project: Optional[str] = None
    status: str
    manager_comments: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TimeEntryListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class TimeEntryListResponse(BaseModel):
    data: List[TimeEntryRead]
    meta: TimeEntryListMeta
    errors: List[str] = []


class TimeEntryResponse(BaseModel):
    data: TimeEntryRead
    errors: List[str] = []
