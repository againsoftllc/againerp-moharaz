from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class BrandBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True
    description: Optional[str] = None
    website: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    logo_media_id: Optional[str] = None
    banner_media_id: Optional[str] = None
    channel: str = Field(default="catalog", pattern="^(catalog|dropshipping)$")


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    description: Optional[str] = None
    website: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    logo_media_id: Optional[str] = None
    banner_media_id: Optional[str] = None
    channel: Optional[str] = Field(default=None, pattern="^(catalog|dropshipping)$")

class BrandRead(BrandBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    product_count: int = 0
    created_at: datetime
    updated_at: datetime


class BrandListMeta(BaseModel):
    count: int


class BrandListResponse(BaseModel):
    data: List[BrandRead]
    meta: BrandListMeta
    errors: List[str] = []


class BrandResponse(BaseModel):
    data: BrandRead
    errors: List[str] = []


class BrandReorderRequest(BaseModel):
    ordered_ids: List[str] = Field(min_length=1)
