from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CampaignRead(BaseModel):
    id: str
    company_id: str
    code: str
    name: str
    type: str
    status: str
    audience: str
    channels: List[str]
    starts_at: date
    ends_at: Optional[date] = None
    goal: str
    progress: int
    revenue: Decimal
    created_at: datetime
    updated_at: datetime


class CampaignListMeta(BaseModel):
    count: int
    running_count: int


class CampaignListResponse(BaseModel):
    data: List[CampaignRead]
    meta: CampaignListMeta


class CampaignResponse(BaseModel):
    data: CampaignRead


class CampaignUpdate(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = Field(default=None, max_length=255)
    goal: Optional[str] = Field(default=None, max_length=255)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
