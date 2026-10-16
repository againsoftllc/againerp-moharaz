from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SeoUrlRead(BaseModel):
    id: str
    company_id: str
    entity_type: str
    entity_id: Optional[str] = None
    title: str
    slug: str
    canonical_url: str
    status: str
    indexable: bool
    redirect_to: str
    views_30d: int
    created_at: datetime
    updated_at: datetime


class SeoUrlListMeta(BaseModel):
    count: int
    active_count: int
    redirect_count: int
    noindex_count: int
    draft_count: int
    views_30d_total: int


class SeoUrlListResponse(BaseModel):
    data: List[SeoUrlRead]
    meta: SeoUrlListMeta


class SeoUrlResponse(BaseModel):
    data: SeoUrlRead


class SeoUrlUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=1, max_length=500)
    canonical_url: Optional[str] = Field(default=None, max_length=500)
    status: Optional[str] = Field(default=None, pattern="^(active|redirect|noindex|draft)$")
    indexable: Optional[bool] = None
    redirect_to: Optional[str] = Field(default=None, max_length=500)
