from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AttendancePolicyCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    late_arrival_grace: int = Field(default=0, ge=0)
    early_departure_grace: int = Field(default=0, ge=0)
    half_day_threshold: Decimal = Field(default=Decimal("0"))
    overtime_rate_per_hour: Decimal = Field(default=Decimal("0"))
    status: str = Field(default="active", pattern="^(active|inactive)$")


class AttendancePolicyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    late_arrival_grace: Optional[int] = Field(default=None, ge=0)
    early_departure_grace: Optional[int] = Field(default=None, ge=0)
    half_day_threshold: Optional[Decimal] = None
    overtime_rate_per_hour: Optional[Decimal] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class AttendancePolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    late_arrival_grace: int
    early_departure_grace: int
    half_day_threshold: Decimal
    overtime_rate_per_hour: Decimal
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AttendancePolicyListMeta(BaseModel):
    count: int


class AttendancePolicyListResponse(BaseModel):
    data: List[AttendancePolicyRead]
    meta: AttendancePolicyListMeta
    errors: List[str] = []


class AttendancePolicyResponse(BaseModel):
    data: AttendancePolicyRead
    errors: List[str] = []
