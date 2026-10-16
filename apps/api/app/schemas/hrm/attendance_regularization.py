from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AttendanceRegularizationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    attendance_record_id: str = Field(min_length=1, max_length=36)
    date: Date
    requested_clock_in: Optional[str] = Field(default=None, max_length=255)
    requested_clock_out: Optional[str] = Field(default=None, max_length=255)
    reason: Optional[str] = None


class AttendanceRegularizationUpdate(BaseModel):
    requested_clock_in: Optional[str] = Field(default=None, max_length=255)
    requested_clock_out: Optional[str] = Field(default=None, max_length=255)
    reason: Optional[str] = None


class AttendanceRegularizationDecision(BaseModel):
    manager_comments: Optional[str] = None


class AttendanceRegularizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    attendance_record_id: Optional[str] = None
    date: Optional[Date] = None
    requested_clock_in: Optional[str] = None
    requested_clock_out: Optional[str] = None
    original_clock_in: Optional[str] = None
    original_clock_out: Optional[str] = None
    reason: Optional[str] = None
    status: str
    manager_comments: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AttendanceRegularizationListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class AttendanceRegularizationListResponse(BaseModel):
    data: List[AttendanceRegularizationRead]
    meta: AttendanceRegularizationListMeta
    errors: List[str] = []


class AttendanceRegularizationResponse(BaseModel):
    data: AttendanceRegularizationRead
    errors: List[str] = []
