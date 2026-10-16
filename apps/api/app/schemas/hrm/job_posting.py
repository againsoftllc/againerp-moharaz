from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobPostingCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=255)
    job_type_id: Optional[str] = Field(default=None, max_length=36)
    location_id: Optional[str] = Field(default=None, max_length=36)
    branch_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    min_experience: Optional[Decimal] = Field(default=Decimal("0"), ge=Decimal("0"))
    max_experience: Optional[Decimal] = Field(default=Decimal("0"), ge=Decimal("0"))
    min_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    max_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    description: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[Date] = None
    start_date: Optional[Date] = None
    positions: int = Field(default=1, ge=1)
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    skills: Optional[List[str]] = None
    applicant: Optional[Dict[str, Any]] = None
    visibility: Optional[Dict[str, Any]] = None
    custom_question: Optional[List[str]] = None
    application_type: str = Field(default="existing", pattern="^(existing|custom)$")
    application_url: Optional[str] = None
    is_featured: bool = False

    @model_validator(mode="after")
    def validate_ranges(self) -> JobPostingCreate:
        if (
            self.min_experience is not None
            and self.max_experience is not None
            and self.max_experience < self.min_experience
        ):
            raise ValueError("max_experience must be >= min_experience")
        if (
            self.min_salary is not None
            and self.max_salary is not None
            and self.max_salary < self.min_salary
        ):
            raise ValueError("max_salary must be >= min_salary")
        if self.application_type == "custom" and not self.application_url:
            raise ValueError("application_url is required when application_type=custom")
        return self


class JobPostingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    job_type_id: Optional[str] = Field(default=None, max_length=36)
    location_id: Optional[str] = Field(default=None, max_length=36)
    branch_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    min_experience: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    max_experience: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    min_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    max_salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    description: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[Date] = None
    start_date: Optional[Date] = None
    positions: Optional[int] = Field(default=None, ge=1)
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")
    skills: Optional[List[str]] = None
    applicant: Optional[Dict[str, Any]] = None
    visibility: Optional[Dict[str, Any]] = None
    custom_question: Optional[List[str]] = None
    application_type: Optional[str] = Field(
        default=None, pattern="^(existing|custom)$"
    )
    application_url: Optional[str] = None
    is_featured: Optional[bool] = None


class JobPostingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    job_code: Optional[str] = None
    code: Optional[str] = None
    title: str
    job_type_id: Optional[str] = None
    location_id: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    min_experience: Optional[Decimal] = None
    max_experience: Optional[Decimal] = None
    min_salary: Optional[Decimal] = None
    max_salary: Optional[Decimal] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[Date] = None
    start_date: Optional[Date] = None
    positions: int
    priority: str
    skills: Optional[List[str]] = None
    applicant: Optional[Dict[str, Any]] = None
    visibility: Optional[Dict[str, Any]] = None
    custom_question: Optional[List[str]] = None
    application_type: str
    application_url: Optional[str] = None
    is_published: bool
    publish_date: Optional[datetime] = None
    is_featured: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobPostingListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class JobPostingListResponse(BaseModel):
    data: List[JobPostingRead]
    meta: JobPostingListMeta
    errors: List[str] = []


class JobPostingResponse(BaseModel):
    data: JobPostingRead
    errors: List[str] = []
