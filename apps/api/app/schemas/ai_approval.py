from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class AiApprovalRead(BaseModel):
    id: str
    company_id: str
    agent: str
    tool: str
    summary: str
    reason: str
    risk: str
    status: str
    entity: str
    requested_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AiApprovalListMeta(BaseModel):
    count: int
    pending_count: int


class AiApprovalListResponse(BaseModel):
    data: List[AiApprovalRead]
    meta: AiApprovalListMeta


class AiApprovalResponse(BaseModel):
    data: AiApprovalRead


class AiApprovalUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
