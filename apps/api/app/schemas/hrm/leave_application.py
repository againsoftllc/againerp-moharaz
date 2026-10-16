from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LeaveApplicationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    leave_type_id: str = Field(min_length=1, max_length=36)
    leave_policy_id: str = Field(min_length=1, max_length=36)
    start_date: date
    end_date: date
    reason: Optional[str] = None
    attachment: Optional[str] = Field(default=None, max_length=50)


class LeaveApplicationUpdate(BaseModel):
    leave_type_id: Optional[str] = Field(default=None, max_length=36)
    leave_policy_id: Optional[str] = Field(default=None, max_length=36)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None
    attachment: Optional[str] = Field(default=None, max_length=50)


class LeaveApplicationDecision(BaseModel):
    manager_comments: Optional[str] = None


class LeaveApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    leave_type_id: Optional[str] = None
    leave_policy_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_days: int
    reason: Optional[str] = None
    attachment: Optional[str] = None
    status: str
    manager_comments: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeaveApplicationListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class LeaveApplicationListResponse(BaseModel):
    data: List[LeaveApplicationRead]
    meta: LeaveApplicationListMeta
    errors: List[str] = []


class LeaveApplicationResponse(BaseModel):
    data: LeaveApplicationRead
    errors: List[str] = []
