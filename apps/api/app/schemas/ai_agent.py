from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel


class AiAgentRead(BaseModel):
    id: str
    company_id: str
    name: str
    domain: str
    status: str
    tools: int
    runs_today: int
    model: str
    description: str
    created_at: datetime
    updated_at: datetime


class AiAgentListMeta(BaseModel):
    count: int


class AiAgentListResponse(BaseModel):
    data: List[AiAgentRead]
    meta: AiAgentListMeta


class AiAgentResponse(BaseModel):
    data: AiAgentRead
