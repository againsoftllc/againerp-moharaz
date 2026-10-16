from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CandidateCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    job_id: Optional[str] = Field(default=None, max_length=36)
    source_id: Optional[str] = Field(default=None, max_length=36)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: Optional[str] = Field(default=None, max_length=50)
    email: str = Field(min_length=3, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    current_company: Optional[str] = Field(default=None, max_length=50)
    current_position: Optional[str] = Field(default=None, max_length=50)
    experience_years: int = Field(default=0, ge=0)
    current_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    expected_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    notice_period: Optional[str] = Field(default=None, max_length=50)
    resume_path: Optional[str] = None
    cover_letter_path: Optional[str] = None
    coverletter_message: Optional[str] = None
    skills: Optional[str] = None
    education: Optional[str] = None
    portfolio_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    referral_employee_id: Optional[str] = Field(default=None, max_length=36)
    gender: Optional[str] = Field(default=None, pattern="^(male|female|other)$")
    date_of_birth: Optional[Date] = None
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=50)
    state: Optional[str] = Field(default=None, max_length=50)
    zip_code: Optional[str] = Field(default=None, max_length=50)
    country: Optional[str] = Field(default=None, max_length=50)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    custom_question: Optional[Dict[str, Any]] = None
    terms_condition_check: Optional[str] = Field(default=None, pattern="^(on|off)$")
    application_date: Optional[Date] = None


class CandidateUpdate(BaseModel):
    job_id: Optional[str] = Field(default=None, max_length=36)
    source_id: Optional[str] = Field(default=None, max_length=36)
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, min_length=3, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    current_company: Optional[str] = Field(default=None, max_length=50)
    current_position: Optional[str] = Field(default=None, max_length=50)
    experience_years: Optional[int] = Field(default=None, ge=0)
    current_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    expected_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    final_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    notice_period: Optional[str] = Field(default=None, max_length=50)
    resume_path: Optional[str] = None
    cover_letter_path: Optional[str] = None
    coverletter_message: Optional[str] = None
    skills: Optional[str] = None
    education: Optional[str] = None
    portfolio_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    referral_employee_id: Optional[str] = Field(default=None, max_length=36)
    gender: Optional[str] = Field(default=None, pattern="^(male|female|other)$")
    date_of_birth: Optional[Date] = None
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=50)
    state: Optional[str] = Field(default=None, max_length=50)
    zip_code: Optional[str] = Field(default=None, max_length=50)
    country: Optional[str] = Field(default=None, max_length=50)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    custom_question: Optional[Dict[str, Any]] = None
    terms_condition_check: Optional[str] = Field(default=None, pattern="^(on|off)$")
    status: Optional[str] = Field(
        default=None,
        pattern="^(new|screening|interview|offer|hired|rejected)$",
    )
    application_date: Optional[Date] = None


class CandidateStatusUpdate(BaseModel):
    status: str = Field(pattern="^(new|screening|interview|offer|hired|rejected)$")
    final_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))


class CandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    job_id: Optional[str] = None
    source_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    experience_years: int
    current_salary: Optional[Decimal] = None
    expected_salary: Optional[Decimal] = None
    final_salary: Optional[Decimal] = None
    notice_period: Optional[str] = None
    resume_path: Optional[str] = None
    cover_letter_path: Optional[str] = None
    coverletter_message: Optional[str] = None
    skills: Optional[str] = None
    education: Optional[str] = None
    portfolio_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    referral_employee_id: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[Date] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[int] = None
    is_archive: Optional[bool] = None
    is_employee: bool
    custom_question: Optional[Dict[str, Any]] = None
    terms_condition_check: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    status: str
    application_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CandidateListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class CandidateListResponse(BaseModel):
    data: List[CandidateRead]
    meta: CandidateListMeta
    errors: List[str] = []


class CandidateResponse(BaseModel):
    data: CandidateRead
    errors: List[str] = []
