from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JourneyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    trigger: str
    steps: int
    enrolled: int
    completed: int
    status: str
    created_at: datetime
    updated_at: datetime


class JourneyListMeta(BaseModel):
    count: int
    active_count: int


class JourneyListResponse(BaseModel):
    data: List[JourneyRead]
    meta: JourneyListMeta


class JourneyResponse(BaseModel):
    data: JourneyRead


class JourneyUpdate(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = Field(default=None, max_length=255)
    trigger: Optional[str] = Field(default=None, max_length=255)
    steps: Optional[int] = Field(default=None, ge=1)
    enrolled: Optional[int] = Field(default=None, ge=0)
    completed: Optional[int] = Field(default=None, ge=0)
