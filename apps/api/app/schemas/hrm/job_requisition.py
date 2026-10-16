from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobRequisitionCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=255)
    job_category_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    positions_count: int = Field(default=1, ge=1)
    budget_min: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    budget_max: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    skills_required: Optional[str] = None
    education_required: Optional[str] = None
    experience_required: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")

    @model_validator(mode="after")
    def validate_budget(self) -> JobRequisitionCreate:
        if (
            self.budget_min is not None
            and self.budget_max is not None
            and self.budget_max < self.budget_min
        ):
            raise ValueError("budget_max must be >= budget_min")
        return self


class JobRequisitionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    job_category_id: Optional[str] = Field(default=None, max_length=36)
    department_id: Optional[str] = Field(default=None, max_length=36)
    positions_count: Optional[int] = Field(default=None, ge=1)
    budget_min: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    budget_max: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    skills_required: Optional[str] = None
    education_required: Optional[str] = None
    experience_required: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")
    status: Optional[str] = Field(
        default=None,
        pattern="^(draft|pending_approval|approved|on_hold|closed)$",
    )


class JobRequisitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    requisition_code: Optional[str] = None
    title: str
    job_category_id: Optional[str] = None
    department_id: Optional[str] = None
    positions_count: int
    budget_min: Optional[Decimal] = None
    budget_max: Optional[Decimal] = None
    skills_required: Optional[str] = None
    education_required: Optional[str] = None
    experience_required: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approval_date: Optional[datetime] = None
    priority: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobRequisitionListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class JobRequisitionListResponse(BaseModel):
    data: List[JobRequisitionRead]
    meta: JobRequisitionListMeta
    errors: List[str] = []


class JobRequisitionResponse(BaseModel):
    data: JobRequisitionRead
    errors: List[str] = []
