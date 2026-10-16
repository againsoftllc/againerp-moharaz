from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LeavePolicyCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    leave_type_id: str = Field(min_length=1, max_length=36)
    accrual_type: str = Field(default="yearly", pattern="^(monthly|yearly)$")
    accrual_rate: Decimal = Field(default=Decimal("0"))
    carry_forward_limit: int = Field(default=0, ge=0)
    min_days_per_application: int = Field(default=1, ge=0)
    max_days_per_application: int = Field(default=30, ge=0)
    requires_approval: bool = True
    status: str = Field(default="active", pattern="^(active|inactive)$")


class LeavePolicyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    leave_type_id: Optional[str] = Field(default=None, max_length=36)
    accrual_type: Optional[str] = Field(default=None, pattern="^(monthly|yearly)$")
    accrual_rate: Optional[Decimal] = None
    carry_forward_limit: Optional[int] = Field(default=None, ge=0)
    min_days_per_application: Optional[int] = Field(default=None, ge=0)
    max_days_per_application: Optional[int] = Field(default=None, ge=0)
    requires_approval: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class LeavePolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    leave_type_id: Optional[str] = None
    accrual_type: str
    accrual_rate: Decimal
    carry_forward_limit: int
    min_days_per_application: int
    max_days_per_application: int
    requires_approval: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeavePolicyListMeta(BaseModel):
    count: int


class LeavePolicyListResponse(BaseModel):
    data: List[LeavePolicyRead]
    meta: LeavePolicyListMeta
    errors: List[str] = []


class LeavePolicyResponse(BaseModel):
    data: LeavePolicyRead
    errors: List[str] = []
