from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SeoRedirectCreate(BaseModel):
    from_path: str = Field(min_length=1, max_length=500)
    # A 410 announces the page is gone for good, so it carries no destination.
    to_path: Optional[str] = Field(default=None, max_length=500)
    redirect_type: str = Field(default="301", max_length=10)
    status: str = Field(default="active", max_length=20)
    note: Optional[str] = None


class SeoRedirectUpdate(BaseModel):
    from_path: Optional[str] = Field(default=None, min_length=1, max_length=500)
    to_path: Optional[str] = Field(default=None, max_length=500)
    redirect_type: Optional[str] = Field(default=None, max_length=10)
    status: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = None


class SeoRedirectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
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
