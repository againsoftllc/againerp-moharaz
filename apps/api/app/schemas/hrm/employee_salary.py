from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeSalaryComponentIn(BaseModel):
    salary_component_id: str = Field(min_length=1, max_length=36)
    amount_override: Optional[Decimal] = None
    is_enabled: bool = True


class EmployeeSalaryComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    salary_component_id: str
    amount_override: Optional[Decimal] = None
    is_enabled: bool
    component_name: Optional[str] = None
    component_type: Optional[str] = None
    calculation_type: Optional[str] = None
    default_amount: Optional[Decimal] = None
    percentage_of_basic: Optional[Decimal] = None


class EmployeeSalaryCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    basic_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    is_active: bool = True
    notes: Optional[str] = None
    components: List[EmployeeSalaryComponentIn] = Field(default_factory=list)


class EmployeeSalaryUpdate(BaseModel):
    basic_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    calculation_status: Optional[str] = Field(
        default=None, pattern="^(pending|calculated)$"
    )
    components: Optional[List[EmployeeSalaryComponentIn]] = None


class EmployeeSalaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    basic_salary: Optional[Decimal] = None
    is_active: bool
    calculation_status: str
    notes: Optional[str] = None
    components: List[EmployeeSalaryComponentRead] = []
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeSalaryListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class EmployeeSalaryListResponse(BaseModel):
    data: List[EmployeeSalaryRead]
    meta: EmployeeSalaryListMeta
    errors: List[str] = []


class EmployeeSalaryResponse(BaseModel):
    data: EmployeeSalaryRead
    errors: List[str] = []
