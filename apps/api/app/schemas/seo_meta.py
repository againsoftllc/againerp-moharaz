from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SeoMetaRead(BaseModel):
    id: str
    company_id: str
    entity_type: str
    title: str
    url: str
    meta_title: str
    meta_description: str
    og_image: Optional[str] = None
    canonical_url: Optional[str] = None
    indexable: bool
    schema_type: str
    score: int
    issues: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SeoMetaListMeta(BaseModel):
    count: int
    avg_score: float


class SeoMetaListResponse(BaseModel):
    data: List[SeoMetaRead]
    meta: SeoMetaListMeta


class SeoMetaResponse(BaseModel):
    data: SeoMetaRead


class SeoMetaUpdate(BaseModel):
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    og_image: Optional[str] = None
    canonical_url: Optional[str] = None
    indexable: Optional[bool] = None
    schema_type: Optional[str] = None
