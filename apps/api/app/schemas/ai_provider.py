from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class AiProviderRead(BaseModel):
    id: str
    company_id: str
    name: str
    models: List[str] = Field(default_factory=list)
    status: str
    latency_ms: int
    spend_pct: int
    created_at: datetime
    updated_at: datetime


class AiProviderListMeta(BaseModel):
    count: int


class AiProviderListResponse(BaseModel):
    data: List[AiProviderRead]
    meta: AiProviderListMeta


class AiProviderResponse(BaseModel):
    data: AiProviderRead
