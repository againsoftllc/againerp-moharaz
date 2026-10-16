from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    employee_code: Optional[str] = Field(
        default=None, max_length=64, description="Optional; auto EMP###### if omitted"
    )
    biometric_emp_id: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=50)
    date_of_birth: Optional[date] = None
    gender: Optional[str] = Field(default=None, pattern="^(male|female|other)$")
    marital_status: Optional[str] = Field(
        default=None, pattern="^(single|married|divorced|widowed)$"
    )
    nationality: Optional[str] = Field(default=None, max_length=100)
    blood_group: Optional[str] = Field(default=None, max_length=20)
    branch_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    designation_id: Optional[str] = Field(default=None, max_length=36)
    reporting_to: Optional[str] = Field(
        default=None, max_length=36, description="Manager employee id"
    )
    shift_id: Optional[str] = Field(default=None, max_length=36)
    shift_name: Optional[str] = Field(default=None, max_length=100)
    attendance_policy_id: Optional[str] = Field(default=None, max_length=36)
    date_of_joining: Optional[date] = None
    probation_end_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    last_working_day: Optional[date] = None
    base_salary: Optional[Decimal] = None
    hours_per_day: Optional[Decimal] = None
    days_per_week: Optional[Decimal] = None
    rate_per_hour: Optional[Decimal] = None
    employment_type: Optional[str] = Field(default=None, max_length=50)
    employee_status: str = Field(
        default="active", pattern="^(active|inactive|terminated|probation)$"
    )
    address_line_1: Optional[str] = Field(default=None, max_length=255)
    address_line_2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_relationship: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_number: Optional[str] = Field(default=None, max_length=50)
    bank_name: Optional[str] = Field(default=None, max_length=255)
    account_holder_name: Optional[str] = Field(default=None, max_length=255)
    account_number: Optional[str] = Field(default=None, max_length=64)
    bank_identifier_code: Optional[str] = Field(default=None, max_length=64)
    bank_branch: Optional[str] = Field(default=None, max_length=255)
    tax_payer_id: Optional[str] = Field(default=None, max_length=50)
    photo: Optional[str] = Field(default=None, description="Profile photo URL from media library")
    create_login: bool = False
    account_role: Optional[str] = Field(
        default=None, pattern="^(employee|hr|admin)$"
    )
    language: Optional[str] = Field(default=None, max_length=50)
    account_status: Optional[str] = Field(
        default=None, pattern="^(active|inactive)$"
    )
    auth_user_id: Optional[str] = Field(default=None, max_length=36)


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    biometric_emp_id: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=50)
    date_of_birth: Optional[date] = None
    gender: Optional[str] = Field(default=None, pattern="^(male|female|other)$")
    marital_status: Optional[str] = Field(
        default=None, pattern="^(single|married|divorced|widowed)$"
    )
    nationality: Optional[str] = Field(default=None, max_length=100)
    blood_group: Optional[str] = Field(default=None, max_length=20)
    branch_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    designation_id: Optional[str] = Field(default=None, max_length=36)
    reporting_to: Optional[str] = Field(default=None, max_length=36)
    shift_id: Optional[str] = Field(default=None, max_length=36)
    shift_name: Optional[str] = Field(default=None, max_length=100)
    attendance_policy_id: Optional[str] = Field(default=None, max_length=36)
    date_of_joining: Optional[date] = None
    probation_end_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    last_working_day: Optional[date] = None
    base_salary: Optional[Decimal] = None
    hours_per_day: Optional[Decimal] = None
    days_per_week: Optional[Decimal] = None
    rate_per_hour: Optional[Decimal] = None
    employment_type: Optional[str] = Field(default=None, max_length=50)
    employee_status: Optional[str] = Field(
        default=None, pattern="^(active|inactive|terminated|probation)$"
    )
    address_line_1: Optional[str] = Field(default=None, max_length=255)
    address_line_2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_relationship: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_number: Optional[str] = Field(default=None, max_length=50)
    bank_name: Optional[str] = Field(default=None, max_length=255)
    account_holder_name: Optional[str] = Field(default=None, max_length=255)
    account_number: Optional[str] = Field(default=None, max_length=64)
    bank_identifier_code: Optional[str] = Field(default=None, max_length=64)
    bank_branch: Optional[str] = Field(default=None, max_length=255)
    tax_payer_id: Optional[str] = Field(default=None, max_length=50)
    photo: Optional[str] = Field(default=None, description="Profile photo URL from media library")
    create_login: Optional[bool] = None
    account_role: Optional[str] = Field(
        default=None, pattern="^(employee|hr|admin)$"
    )
    language: Optional[str] = Field(default=None, max_length=50)
    account_status: Optional[str] = Field(
        default=None, pattern="^(active|inactive)$"
    )
    auth_user_id: Optional[str] = Field(default=None, max_length=36)


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_code: str
    name: str
    email: Optional[str] = None
    biometric_emp_id: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None
    blood_group: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    reporting_to: Optional[str] = None
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    attendance_policy_id: Optional[str] = None
    date_of_joining: Optional[date] = None
    probation_end_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    last_working_day: Optional[date] = None
    base_salary: Optional[Decimal] = None
    hours_per_day: Optional[Decimal] = None
    days_per_week: Optional[Decimal] = None
    rate_per_hour: Optional[Decimal] = None
    employment_type: Optional[str] = None
    employee_status: str
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    bank_identifier_code: Optional[str] = None
    bank_branch: Optional[str] = None
    tax_payer_id: Optional[str] = None
    photo: Optional[str] = None
    create_login: bool = False
    account_role: Optional[str] = None
    language: Optional[str] = None
    account_status: Optional[str] = None
    auth_user_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class EmployeeListResponse(BaseModel):
    data: List[EmployeeRead]
    meta: EmployeeListMeta
    errors: List[str] = []


class EmployeeResponse(BaseModel):
    data: EmployeeRead
    errors: List[str] = []
