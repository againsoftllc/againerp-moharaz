from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- contract types ---


class ContractTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    default_duration_months: Optional[int] = Field(default=None, ge=1)
    probation_period_months: int = Field(default=0, ge=0)
    notice_period_days: int = Field(default=0, ge=0)
    is_renewable: bool = True
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ContractTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    default_duration_months: Optional[int] = Field(default=None, ge=1)
    probation_period_months: Optional[int] = Field(default=None, ge=0)
    notice_period_days: Optional[int] = Field(default=None, ge=0)
    is_renewable: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ContractTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    default_duration_months: Optional[int] = None
    probation_period_months: int
    notice_period_days: int
    is_renewable: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ContractTypeListResponse(BaseModel):
    data: List[ContractTypeRead]
    meta: dict
    errors: List[str] = []


class ContractTypeResponse(BaseModel):
    data: ContractTypeRead
    errors: List[str] = []


# --- contract templates ---


class ContractTemplateCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    contract_type_id: Optional[str] = Field(default=None, max_length=36)
    template_content: Optional[str] = None
    variables: Optional[str] = None
    clauses: Optional[str] = None
    is_default: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ContractTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    contract_type_id: Optional[str] = Field(default=None, max_length=36)
    template_content: Optional[str] = None
    variables: Optional[str] = None
    clauses: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ContractTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    contract_type_id: Optional[str] = None
    template_content: Optional[str] = None
    variables: Optional[str] = None
    clauses: Optional[str] = None
    is_default: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ContractTemplateListResponse(BaseModel):
    data: List[ContractTemplateRead]
    meta: dict
    errors: List[str] = []


class ContractTemplateResponse(BaseModel):
    data: ContractTemplateRead
    errors: List[str] = []


# --- employee contracts ---


class EmployeeContractCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    contract_number: Optional[str] = Field(default=None, max_length=64)
    employee_id: Optional[str] = Field(default=None, max_length=36)
    contract_type_id: Optional[str] = Field(default=None, max_length=36)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    basic_salary: Decimal = Field(default=Decimal("0"), ge=0)
    allowances: Optional[str] = None
    benefits: Optional[str] = None
    terms_conditions: Optional[str] = None


class EmployeeContractUpdate(BaseModel):
    contract_number: Optional[str] = Field(default=None, max_length=64)
    employee_id: Optional[str] = Field(default=None, max_length=36)
    contract_type_id: Optional[str] = Field(default=None, max_length=36)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    basic_salary: Optional[Decimal] = Field(default=None, ge=0)
    allowances: Optional[str] = None
    benefits: Optional[str] = None
    terms_conditions: Optional[str] = None
    status: Optional[str] = Field(
        default=None, pattern="^(draft|active|expired|terminated)$"
    )


class EmployeeContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    contract_number: Optional[str] = None
    employee_id: Optional[str] = None
    contract_type_id: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    basic_salary: Decimal
    allowances: Optional[str] = None
    benefits: Optional[str] = None
    terms_conditions: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeContractListResponse(BaseModel):
    data: List[EmployeeContractRead]
    meta: dict
    errors: List[str] = []


class EmployeeContractResponse(BaseModel):
    data: EmployeeContractRead
    errors: List[str] = []


# --- contract renewals ---


class ContractRenewalCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    contract_id: Optional[str] = Field(default=None, max_length=36)
    renewal_number: Optional[str] = Field(default=None, max_length=50)
    current_end_date: Optional[Date] = None
    new_start_date: Optional[Date] = None
    new_end_date: Optional[Date] = None
    new_basic_salary: Decimal = Field(default=Decimal("0"), ge=0)
    new_allowances: Optional[str] = None
    new_benefits: Optional[str] = None
    new_terms_conditions: Optional[str] = None
    changes_summary: Optional[str] = None
    reason: Optional[str] = None


class ContractRenewalUpdate(BaseModel):
    contract_id: Optional[str] = Field(default=None, max_length=36)
    renewal_number: Optional[str] = Field(default=None, max_length=50)
    current_end_date: Optional[Date] = None
    new_start_date: Optional[Date] = None
    new_end_date: Optional[Date] = None
    new_basic_salary: Optional[Decimal] = Field(default=None, ge=0)
    new_allowances: Optional[str] = None
    new_benefits: Optional[str] = None
    new_terms_conditions: Optional[str] = None
    changes_summary: Optional[str] = None
    reason: Optional[str] = None
    status: Optional[str] = Field(
        default=None, pattern="^(pending|approved|rejected)$"
    )


class ContractRenewalDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    approval_notes: Optional[str] = None


class ContractRenewalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    contract_id: Optional[str] = None
    renewal_number: Optional[str] = None
    current_end_date: Optional[Date] = None
    new_start_date: Optional[Date] = None
    new_end_date: Optional[Date] = None
    new_basic_salary: Decimal
    new_allowances: Optional[str] = None
    new_benefits: Optional[str] = None
    new_terms_conditions: Optional[str] = None
    changes_summary: Optional[str] = None
    reason: Optional[str] = None
    status: str
    requested_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ContractRenewalListResponse(BaseModel):
    data: List[ContractRenewalRead]
    meta: dict
    errors: List[str] = []


class ContractRenewalResponse(BaseModel):
    data: ContractRenewalRead
    errors: List[str] = []
