from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InterviewRoundCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    job_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    sequence_number: int = Field(default=1, ge=1)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class InterviewRoundUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    sequence_number: Optional[int] = Field(default=None, ge=1)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class InterviewRoundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    job_id: Optional[str] = None
    name: str
    sequence_number: int
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InterviewRoundListMeta(BaseModel):
    count: int


class InterviewRoundListResponse(BaseModel):
    data: List[InterviewRoundRead]
    meta: InterviewRoundListMeta
    errors: List[str] = []


class InterviewRoundResponse(BaseModel):
    data: InterviewRoundRead
    errors: List[str] = []
