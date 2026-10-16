from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LeaveBalanceCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    leave_type_id: str = Field(min_length=1, max_length=36)
    leave_policy_id: str = Field(min_length=1, max_length=36)
    year: str = Field(min_length=4, max_length=10)
    allocated_days: Decimal = Field(default=Decimal("0"))
    used_days: Decimal = Field(default=Decimal("0"))
    carried_forward: Decimal = Field(default=Decimal("0"))
    manual_adjustment: Decimal = Field(default=Decimal("0"))
    adjustment_reason: Optional[str] = None


class LeaveBalanceUpdate(BaseModel):
    allocated_days: Optional[Decimal] = None
    used_days: Optional[Decimal] = None
    carried_forward: Optional[Decimal] = None
    manual_adjustment: Optional[Decimal] = None
    adjustment_reason: Optional[str] = None
    year: Optional[str] = Field(default=None, min_length=4, max_length=10)
    leave_type_id: Optional[str] = Field(default=None, max_length=36)
    leave_policy_id: Optional[str] = Field(default=None, max_length=36)


class LeaveBalanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    leave_type_id: Optional[str] = None
    leave_policy_id: Optional[str] = None
    year: Optional[str] = None
    allocated_days: Decimal
    used_days: Decimal
    remaining_days: Decimal
    carried_forward: Decimal
    manual_adjustment: Decimal
    adjustment_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeaveBalanceListMeta(BaseModel):
    count: int


class LeaveBalanceListResponse(BaseModel):
    data: List[LeaveBalanceRead]
    meta: LeaveBalanceListMeta
    errors: List[str] = []


class LeaveBalanceResponse(BaseModel):
    data: LeaveBalanceRead
    errors: List[str] = []
