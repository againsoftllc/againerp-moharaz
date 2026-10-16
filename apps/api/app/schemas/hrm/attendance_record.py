from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AttendanceRecordCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    biometric_id: Optional[str] = Field(default=None, max_length=50)
    shift_id: Optional[str] = Field(default=None, max_length=36)
    attendance_policy_id: Optional[str] = Field(default=None, max_length=36)
    date: Date
    clock_in: Optional[str] = Field(default=None, max_length=255)
    clock_out: Optional[str] = Field(default=None, max_length=255)
    total_hours: Decimal = Field(default=Decimal("0"))
    break_hours: Decimal = Field(default=Decimal("0"))
    overtime_hours: Decimal = Field(default=Decimal("0"))
    overtime_amount: Decimal = Field(default=Decimal("0"))
    is_late: bool = False
    is_early_departure: bool = False
    is_absent: bool = False
    is_holiday: bool = False
    is_weekend: bool = False
    status: str = Field(
        default="present",
        pattern="^(present|absent|half_day|on_leave|holiday)$",
    )
    notes: Optional[str] = None


class AttendanceRecordUpdate(BaseModel):
    shift_id: Optional[str] = Field(default=None, max_length=36)
    attendance_policy_id: Optional[str] = Field(default=None, max_length=36)
    clock_in: Optional[str] = Field(default=None, max_length=255)
    clock_out: Optional[str] = Field(default=None, max_length=255)
    total_hours: Optional[Decimal] = None
    break_hours: Optional[Decimal] = None
    overtime_hours: Optional[Decimal] = None
    overtime_amount: Optional[Decimal] = None
    is_late: Optional[bool] = None
    is_early_departure: Optional[bool] = None
    is_absent: Optional[bool] = None
    is_holiday: Optional[bool] = None
    is_weekend: Optional[bool] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(present|absent|half_day|on_leave|holiday)$",
    )
    notes: Optional[str] = None


class AttendanceRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    biometric_id: Optional[str] = None
    shift_id: Optional[str] = None
    attendance_policy_id: Optional[str] = None
    date: Optional[Date] = None
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    total_hours: Decimal
    break_hours: Decimal
    overtime_hours: Decimal
    overtime_amount: Decimal
    is_late: bool
    is_early_departure: bool
    is_absent: bool
    is_holiday: bool
    is_weekend: bool
    status: str
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AttendanceRecordListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class AttendanceRecordListResponse(BaseModel):
    data: List[AttendanceRecordRead]
    meta: AttendanceRecordListMeta
    errors: List[str] = []


class AttendanceRecordResponse(BaseModel):
    data: AttendanceRecordRead
    errors: List[str] = []
