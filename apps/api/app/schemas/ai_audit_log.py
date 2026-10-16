from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel


class AiAuditLogRead(BaseModel):
    id: str
    company_id: str
    action: str
    agent: str
    user: str
    summary: str
    tokens: int
    logged_at: datetime
    created_at: datetime


class AiAuditLogListMeta(BaseModel):
    count: int


class AiAuditLogListResponse(BaseModel):
    data: List[AiAuditLogRead]
    meta: AiAuditLogListMeta


class AiAuditLogResponse(BaseModel):
    data: AiAuditLogRead
