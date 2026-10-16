from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CandidateAssessmentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    candidate_id: str = Field(min_length=1, max_length=36)
    assessment_name: str = Field(min_length=1, max_length=50)
    score: Optional[int] = Field(default=None, ge=0)
    max_score: Optional[int] = Field(default=None, ge=1)
    pass_fail_status: str = Field(
        default="pending", pattern="^(pass|fail|pending)$"
    )
    comments: Optional[str] = None
    assessment_date: Optional[Date] = None

    @model_validator(mode="after")
    def validate_scores(self) -> CandidateAssessmentCreate:
        if (
            self.score is not None
            and self.max_score is not None
            and self.score > self.max_score
        ):
            raise ValueError("score must be <= max_score")
        return self


class CandidateAssessmentUpdate(BaseModel):
    assessment_name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    score: Optional[int] = Field(default=None, ge=0)
    max_score: Optional[int] = Field(default=None, ge=1)
    pass_fail_status: Optional[str] = Field(
        default=None, pattern="^(pass|fail|pending)$"
    )
    comments: Optional[str] = None
    assessment_date: Optional[Date] = None


class CandidateAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    candidate_id: Optional[str] = None
    assessment_name: Optional[str] = None
    score: Optional[int] = None
    max_score: Optional[int] = None
    pass_fail_status: str
    comments: Optional[str] = None
    conducted_by: Optional[str] = None
    assessment_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CandidateAssessmentListMeta(BaseModel):
    count: int


class CandidateAssessmentListResponse(BaseModel):
    data: List[CandidateAssessmentRead]
    meta: CandidateAssessmentListMeta
    errors: List[str] = []


class CandidateAssessmentResponse(BaseModel):
    data: CandidateAssessmentRead
    errors: List[str] = []
