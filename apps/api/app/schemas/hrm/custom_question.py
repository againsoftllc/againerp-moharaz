from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CustomQuestionCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    question: str = Field(min_length=1)
    required: bool = False


class CustomQuestionUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=1)
    required: Optional[bool] = None


class CustomQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    question: Optional[str] = None
    required: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CustomQuestionListMeta(BaseModel):
    count: int


class CustomQuestionListResponse(BaseModel):
    data: List[CustomQuestionRead]
    meta: CustomQuestionListMeta
    errors: List[str] = []


class CustomQuestionResponse(BaseModel):
    data: CustomQuestionRead
    errors: List[str] = []
