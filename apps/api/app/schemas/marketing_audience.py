from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AudienceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    members: int
    growth: str
    source: str
    created_at: datetime
    updated_at: datetime


class AudienceListMeta(BaseModel):
    count: int
    total_members: int


class AudienceListResponse(BaseModel):
    data: List[AudienceRead]
    meta: AudienceListMeta


class AudienceResponse(BaseModel):
    data: AudienceRead


class AudienceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    members: Optional[int] = Field(default=None, ge=0)
    growth: Optional[str] = Field(default=None, max_length=100)
    source: Optional[str] = Field(default=None, max_length=255)
