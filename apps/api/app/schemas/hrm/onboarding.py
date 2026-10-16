from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OnboardingChecklistCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    is_default: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class OnboardingChecklistUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class OnboardingChecklistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    is_default: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OnboardingChecklistListMeta(BaseModel):
    count: int


class OnboardingChecklistListResponse(BaseModel):
    data: List[OnboardingChecklistRead]
    meta: OnboardingChecklistListMeta
    errors: List[str] = []


class OnboardingChecklistResponse(BaseModel):
    data: OnboardingChecklistRead
    errors: List[str] = []


class ChecklistItemCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    checklist_id: str = Field(min_length=1, max_length=36)
    task_name: str = Field(min_length=1)
    description: Optional[str] = None
    category: str = Field(
        default="other",
        pattern="^(documentation|it_setup|training|hr|facilities|other)$",
    )
    assigned_to_role: Optional[str] = Field(default=None, max_length=50)
    due_day: int = Field(default=1, ge=0)
    is_required: bool = True
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ChecklistItemUpdate(BaseModel):
    task_name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    category: Optional[str] = Field(
        default=None,
        pattern="^(documentation|it_setup|training|hr|facilities|other)$",
    )
    assigned_to_role: Optional[str] = Field(default=None, max_length=50)
    due_day: Optional[int] = Field(default=None, ge=0)
    is_required: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    checklist_id: Optional[str] = None
    task_name: Optional[str] = None
    description: Optional[str] = None
    category: str
    assigned_to_role: Optional[str] = None
    due_day: int
    is_required: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ChecklistItemListMeta(BaseModel):
    count: int


class ChecklistItemListResponse(BaseModel):
    data: List[ChecklistItemRead]
    meta: ChecklistItemListMeta
    errors: List[str] = []


class ChecklistItemResponse(BaseModel):
    data: ChecklistItemRead
    errors: List[str] = []


class CandidateOnboardingCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    candidate_id: Optional[str] = Field(default=None, max_length=36)
    employee_id: Optional[str] = Field(default=None, max_length=36)
    checklist_id: str = Field(min_length=1, max_length=36)
    start_date: Optional[Date] = None
    buddy_employee_id: Optional[str] = Field(default=None, max_length=36)


class CandidateOnboardingUpdate(BaseModel):
    employee_id: Optional[str] = Field(default=None, max_length=36)
    checklist_id: Optional[str] = Field(default=None, max_length=36)
    start_date: Optional[Date] = None
    buddy_employee_id: Optional[str] = Field(default=None, max_length=36)
    status: Optional[str] = Field(
        default=None, pattern="^(pending|in_progress|completed)$"
    )


class CandidateOnboardingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    candidate_id: Optional[str] = None
    employee_id: Optional[str] = None
    checklist_id: Optional[str] = None
    start_date: Optional[Date] = None
    buddy_employee_id: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CandidateOnboardingListMeta(BaseModel):
    count: int


class CandidateOnboardingListResponse(BaseModel):
    data: List[CandidateOnboardingRead]
    meta: CandidateOnboardingListMeta
    errors: List[str] = []


class CandidateOnboardingResponse(BaseModel):
    data: CandidateOnboardingRead
    errors: List[str] = []
