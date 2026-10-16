from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SeoMetaUpdate(BaseModel):
    meta_title: Optional[str] = Field(default=None, max_length=255)
    meta_description: Optional[str] = None
    og_image: Optional[str] = Field(default=None, max_length=500)
    canonical_url: Optional[str] = Field(default=None, max_length=500)
    indexable: Optional[bool] = None
    schema_type: Optional[str] = Field(default=None, max_length=50)


class SeoMetaRead(BaseModel):
    # `issues` comes off the model's property, which decodes issues_json.
    model_config = ConfigDict(from_attributes=True)

    id: str
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
    issues: List[str] = []
    created_at: datetime
    updated_at: datetime


class SeoMetaListMeta(BaseModel):
    count: int
    avg_score: int


class SeoMetaListResponse(BaseModel):
    data: List[SeoMetaRead]
    meta: SeoMetaListMeta


class SeoMetaResponse(BaseModel):
    data: SeoMetaRead
