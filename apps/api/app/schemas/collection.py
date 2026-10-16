from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CollectionType = Literal[
    "featured",
    "new_arrivals",
    "best_sellers",
    "trending",
    "custom",
    "dynamic",
    "rules",
]

CollectionStatus = Literal["draft", "active", "inactive", "archived"]


class CollectionBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    collection_type: CollectionType = "custom"
    status: CollectionStatus = "draft"
    sort_order: int = Field(default=0, ge=0)
    rule_summary: Optional[str] = None
    hero_image_url: Optional[str] = None
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    schedule_start: Optional[date] = None
    schedule_end: Optional[date] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    collection_type: Optional[CollectionType] = None
    status: Optional[CollectionStatus] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    rule_summary: Optional[str] = None
    hero_image_url: Optional[str] = None
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    schedule_start: Optional[date] = None
    schedule_end: Optional[date] = None


class CollectionRead(CollectionBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    product_count: int = 0
    is_system: bool = False
    created_at: datetime
    updated_at: datetime


class CollectionListMeta(BaseModel):
    count: int


class CollectionListResponse(BaseModel):
    data: List[CollectionRead]
    meta: CollectionListMeta
    errors: List[str] = []


class CollectionResponse(BaseModel):
    data: CollectionRead
    errors: List[str] = []


class CollectionReorderRequest(BaseModel):
    ordered_ids: List[str] = Field(min_length=1)
