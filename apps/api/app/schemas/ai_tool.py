from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel


class AiToolRead(BaseModel):
    id: str
    company_id: str
    name: str
    agent: str
    category: str
    risk: str
    description: str
    created_at: datetime
    updated_at: datetime


class AiToolListMeta(BaseModel):
    count: int


class AiToolListResponse(BaseModel):
    data: List[AiToolRead]
    meta: AiToolListMeta


class AiToolResponse(BaseModel):
    data: AiToolRead
