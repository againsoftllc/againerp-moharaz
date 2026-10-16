from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InterviewCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    candidate_id: str = Field(min_length=1, max_length=36)
    job_id: Optional[str] = Field(default=None, max_length=36)
    round_id: Optional[str] = Field(default=None, max_length=36)
    interview_type_id: Optional[str] = Field(default=None, max_length=36)
    scheduled_date: Optional[str] = Field(default=None, max_length=255)
    scheduled_time: Optional[str] = Field(default=None, max_length=255)
    duration: int = Field(default=60, ge=15, le=480)
    location: Optional[str] = Field(default=None, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=50)
    interviewers: List[str] = Field(default_factory=list)


class InterviewUpdate(BaseModel):
    round_id: Optional[str] = Field(default=None, max_length=36)
    interview_type_id: Optional[str] = Field(default=None, max_length=36)
    scheduled_date: Optional[str] = Field(default=None, max_length=255)
    scheduled_time: Optional[str] = Field(default=None, max_length=255)
    duration: Optional[int] = Field(default=None, ge=15, le=480)
    location: Optional[str] = Field(default=None, max_length=255)
    meeting_link: Optional[str] = Field(default=None, max_length=50)
    interviewers: Optional[List[str]] = None


class InterviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    round_id: Optional[str] = None
    interview_type_id: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    duration: int
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    interviewers: List[str] = []
    status: str
    feedback_submitted: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InterviewListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class InterviewListResponse(BaseModel):
    data: List[InterviewRead]
    meta: InterviewListMeta
    errors: List[str] = []


class InterviewResponse(BaseModel):
    data: InterviewRead
    errors: List[str] = []


class InterviewFeedbackCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    interview_id: str = Field(min_length=1, max_length=36)
    interviewer_id: Optional[str] = Field(default=None, max_length=36)
    technical_rating: Optional[int] = Field(default=None, ge=1, le=5)
    communication_rating: Optional[int] = Field(default=None, ge=1, le=5)
    cultural_fit_rating: Optional[int] = Field(default=None, ge=1, le=5)
    overall_rating: Optional[int] = Field(default=None, ge=1, le=5)
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    comments: Optional[str] = None
    recommendation: Optional[str] = Field(
        default=None,
        pattern="^(strong_hire|hire|maybe|reject|strong_reject)$",
    )


class InterviewFeedbackUpdate(BaseModel):
    technical_rating: Optional[int] = Field(default=None, ge=1, le=5)
    communication_rating: Optional[int] = Field(default=None, ge=1, le=5)
    cultural_fit_rating: Optional[int] = Field(default=None, ge=1, le=5)
    overall_rating: Optional[int] = Field(default=None, ge=1, le=5)
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    comments: Optional[str] = None
    recommendation: Optional[str] = Field(
        default=None,
        pattern="^(strong_hire|hire|maybe|reject|strong_reject)$",
    )


class InterviewFeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    interview_id: Optional[str] = None
    interviewer_id: Optional[str] = None
    technical_rating: Optional[int] = None
    communication_rating: Optional[int] = None
    cultural_fit_rating: Optional[int] = None
    overall_rating: Optional[int] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    comments: Optional[str] = None
    recommendation: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InterviewFeedbackListMeta(BaseModel):
    count: int


class InterviewFeedbackListResponse(BaseModel):
    data: List[InterviewFeedbackRead]
    meta: InterviewFeedbackListMeta
    errors: List[str] = []


class InterviewFeedbackResponse(BaseModel):
    data: InterviewFeedbackRead
    errors: List[str] = []
