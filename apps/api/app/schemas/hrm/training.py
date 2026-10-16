from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- training types ---
class TrainingTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    branch_id: Optional[str] = Field(default=None, max_length=36)


class TrainingTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    branch_id: Optional[str] = Field(default=None, max_length=36)


class TrainingTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    branch_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TrainingTypeListResponse(BaseModel):
    data: List[TrainingTypeRead]
    meta: dict
    errors: List[str] = []


class TrainingTypeResponse(BaseModel):
    data: TrainingTypeRead
    errors: List[str] = []


# --- programs ---
class TrainingProgramCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    training_type_id: Optional[str] = Field(default=None, max_length=36)
    description: Optional[str] = None
    duration: Optional[int] = None
    cost: Optional[Decimal] = None
    capacity: Optional[int] = None
    materials: Optional[str] = Field(default=None, max_length=50)
    prerequisites: Optional[str] = None
    is_mandatory: bool = False
    is_self_enrollment: bool = False


class TrainingProgramUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    training_type_id: Optional[str] = Field(default=None, max_length=36)
    description: Optional[str] = None
    duration: Optional[int] = None
    cost: Optional[Decimal] = None
    capacity: Optional[int] = None
    materials: Optional[str] = Field(default=None, max_length=50)
    prerequisites: Optional[str] = None
    is_mandatory: Optional[bool] = None
    is_self_enrollment: Optional[bool] = None


class TrainingProgramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    training_type_id: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    cost: Optional[Decimal] = None
    capacity: Optional[int] = None
    status: str
    materials: Optional[str] = None
    prerequisites: Optional[str] = None
    is_mandatory: bool
    is_self_enrollment: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TrainingProgramListResponse(BaseModel):
    data: List[TrainingProgramRead]
    meta: dict
    errors: List[str] = []


class TrainingProgramResponse(BaseModel):
    data: TrainingProgramRead
    errors: List[str] = []


# --- sessions ---
class TrainingSessionCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    training_program_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=255)
    location_type: str = Field(default="physical", pattern="^(physical|virtual)$")
    meeting_link: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = Field(default=None, max_length=50)
    recurrence_count: Optional[int] = None


class TrainingSessionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=255)
    location_type: Optional[str] = Field(default=None, pattern="^(physical|virtual)$")
    meeting_link: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_pattern: Optional[str] = Field(default=None, max_length=50)
    recurrence_count: Optional[int] = None


class TrainingSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    training_program_id: Optional[str] = None
    name: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    location_type: str
    meeting_link: Optional[str] = None
    status: str
    notes: Optional[str] = None
    is_recurring: bool
    recurrence_pattern: Optional[str] = None
    recurrence_count: Optional[int] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TrainingSessionListResponse(BaseModel):
    data: List[TrainingSessionRead]
    meta: dict
    errors: List[str] = []


class TrainingSessionResponse(BaseModel):
    data: TrainingSessionRead
    errors: List[str] = []


# --- session attendance ---
class SessionAttendanceCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    training_session_id: str = Field(min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    is_present: bool = False
    notes: Optional[str] = None


class SessionAttendanceUpdate(BaseModel):
    is_present: Optional[bool] = None
    notes: Optional[str] = None


class SessionAttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    training_session_id: Optional[str] = None
    employee_id: Optional[str] = None
    is_present: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SessionAttendanceListResponse(BaseModel):
    data: List[SessionAttendanceRead]
    meta: dict
    errors: List[str] = []


class SessionAttendanceResponse(BaseModel):
    data: SessionAttendanceRead
    errors: List[str] = []


# --- employee trainings ---
class EmployeeTrainingCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    training_program_id: str = Field(min_length=1, max_length=36)
    assigned_date: Optional[Date] = None
    notes: Optional[str] = None


class EmployeeTrainingUpdate(BaseModel):
    notes: Optional[str] = None
    certification: Optional[str] = Field(default=None, max_length=50)
    score: Optional[Decimal] = None
    is_passed: Optional[bool] = None
    feedback: Optional[str] = None
    completion_date: Optional[Date] = None


class EmployeeTrainingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    training_program_id: Optional[str] = None
    status: str
    assigned_date: Optional[Date] = None
    completion_date: Optional[Date] = None
    certification: Optional[str] = None
    score: Optional[Decimal] = None
    is_passed: Optional[bool] = None
    feedback: Optional[str] = None
    notes: Optional[str] = None
    assigned_by: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeTrainingListResponse(BaseModel):
    data: List[EmployeeTrainingRead]
    meta: dict
    errors: List[str] = []


class EmployeeTrainingResponse(BaseModel):
    data: EmployeeTrainingRead
    errors: List[str] = []


# --- assessments ---
class TrainingAssessmentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    training_program_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(quiz|practical|presentation)$")
    passing_score: Decimal = Field(default=Decimal("70.00"))
    criteria: Optional[str] = None


class TrainingAssessmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(quiz|practical|presentation)$")
    passing_score: Optional[Decimal] = None
    criteria: Optional[str] = None


class TrainingAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    training_program_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    type: Optional[str] = None
    passing_score: Decimal
    criteria: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TrainingAssessmentListResponse(BaseModel):
    data: List[TrainingAssessmentRead]
    meta: dict
    errors: List[str] = []


class TrainingAssessmentResponse(BaseModel):
    data: TrainingAssessmentRead
    errors: List[str] = []


# --- assessment results ---
class AssessmentResultCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_training_id: str = Field(min_length=1, max_length=36)
    training_assessment_id: str = Field(min_length=1, max_length=36)
    score: Decimal = Field(default=Decimal("0"))
    is_passed: Optional[bool] = None
    feedback: Optional[str] = None
    assessment_date: Optional[Date] = None


class AssessmentResultUpdate(BaseModel):
    score: Optional[Decimal] = None
    is_passed: Optional[bool] = None
    feedback: Optional[str] = None
    assessment_date: Optional[Date] = None


class AssessmentResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_training_id: Optional[str] = None
    training_assessment_id: Optional[str] = None
    score: Decimal
    is_passed: bool
    feedback: Optional[str] = None
    assessment_date: Optional[Date] = None
    assessed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssessmentResultListResponse(BaseModel):
    data: List[AssessmentResultRead]
    meta: dict
    errors: List[str] = []


class AssessmentResultResponse(BaseModel):
    data: AssessmentResultRead
    errors: List[str] = []
