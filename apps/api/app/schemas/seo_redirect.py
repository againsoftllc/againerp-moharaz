from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SeoRedirectRead(BaseModel):
    id: str
    company_id: str
    from_path: str
    to_path: Optional[str] = None
    redirect_type: str
    status: str
    hits_30d: int
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SeoRedirectListMeta(BaseModel):
    count: int
    active_count: int
    draft_count: int
    disabled_count: int
    hits_30d_total: int


class SeoRedirectListResponse(BaseModel):
    data: List[SeoRedirectRead]
    meta: SeoRedirectListMeta


class SeoRedirectResponse(BaseModel):
    data: SeoRedirectRead


class SeoRedirectCreate(BaseModel):
    from_path: str = Field(min_length=1, max_length=500)
    to_path: Optional[str] = Field(default=None, max_length=500)
    redirect_type: str = Field(default="301", pattern="^(301|302|307|308|410)$")
    status: str = Field(default="active", pattern="^(active|draft|disabled)$")
    note: Optional[str] = None


class SeoRedirectUpdate(BaseModel):
    from_path: Optional[str] = Field(default=None, min_length=1, max_length=500)
    to_path: Optional[str] = Field(default=None, max_length=500)
    redirect_type: Optional[str] = Field(default=None, pattern="^(301|302|307|308|410)$")
    status: Optional[str] = Field(default=None, pattern="^(active|draft|disabled)$")
    note: Optional[str] = None
