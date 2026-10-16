from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class BiometricPunchRead(BaseModel):
    id: str
    time: str
    status: str  # Clock In | Clock Out
    verify_type: str
    terminal: str
    punch_time: Optional[str] = None
    employee_code: Optional[str] = None
    serial_number: Optional[str] = None
    matched: bool = True


class BiometricDayRecordRead(BaseModel):
    id: str
    employee_id: Optional[str] = None
    employee_name: str
    employee_code: str
    designation: str = ""
    date: str
    clock_in: str = ""
    clock_out: str = ""
    total_entries: int = 0
    punches: List[BiometricPunchRead] = []
    status: str = Field(description="synced|pending|failed")
    terminal: str = ""
    attendance_record_id: Optional[str] = None


class BiometricDayListResponse(BaseModel):
    data: List[BiometricDayRecordRead]
    meta: dict
    errors: List[str] = []


class BiometricSyncRequest(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    date: Date
    employee_id: Optional[str] = Field(default=None, max_length=36)


class BiometricSyncResult(BaseModel):
    synced: int = 0
    skipped: int = 0
    unmatched: int = 0
    attendance_record_ids: List[str] = []


class BiometricSyncResponse(BaseModel):
    data: BiometricSyncResult
    errors: List[str] = []


class BiometricUnmatchedCode(BaseModel):
    employee_code: str
    punch_count: int
    last_punch_at: Optional[str] = None
    serial_numbers: List[str] = []


class BiometricUnmatchedListResponse(BaseModel):
    data: List[BiometricUnmatchedCode]
    meta: dict
    errors: List[str] = []
