from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EcommerceCategoryLinkRead(BaseModel):
    category_id: str
    is_primary: bool
    sort_order: int


class EcommerceMediaLinkRead(BaseModel):
    media_id: str
    url: str
    name: str
    sort_order: int
    is_primary: bool
    is_featured: bool


class EcommerceItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    item_id: str
    catalog_product_id: Optional[str] = None
    publish_status: str
    visibility: str
    featured: bool
    sort_order: int
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    specifications_json: Optional[str] = None
    primary_category_id: Optional[str] = None
    brand_id: Optional[str] = None
    slug: str
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: List[str] = Field(default_factory=list)
    schema_ready: bool
    selling_price: Decimal
    compare_at_price: Optional[Decimal] = None
    special_price: Optional[Decimal] = None
    thumbnail_url: Optional[str] = None
    featured_media_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    categories: List[EcommerceCategoryLinkRead] = Field(default_factory=list)
    media: List[EcommerceMediaLinkRead] = Field(default_factory=list)

    @field_validator("seo_keywords", mode="before")
    @classmethod
    def parse_keywords(cls, value: object) -> List[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            try:
                data = json.loads(value)
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
                return []
        return []


class EcommerceItemUpdate(BaseModel):
    publish_status: Optional[str] = Field(
        default=None,
        pattern="^(draft|review|published|hidden|archived)$",
    )
    visibility: Optional[str] = Field(default=None, pattern="^(public|private)$")
    featured: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    specifications_json: Optional[str] = None
    primary_category_id: Optional[str] = None
    brand_id: Optional[str] = None
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    seo_keywords: Optional[List[str]] = None
    schema_ready: Optional[bool] = None
    selling_price: Optional[Decimal] = Field(default=None, ge=0)
    compare_at_price: Optional[Decimal] = Field(default=None, ge=0)
    special_price: Optional[Decimal] = Field(default=None, ge=0)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    featured_media_id: Optional[str] = None
    category_ids: Optional[List[str]] = None


class EcommerceItemResponse(BaseModel):
    data: EcommerceItemRead


class EcommerceItemListResponse(BaseModel):
    data: List[EcommerceItemRead]
    meta: dict
