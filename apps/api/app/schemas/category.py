from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    caption: str = Field(default="", max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    parent_id: Optional[str] = None
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True
    show_in_top_menu: bool = False
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    show_price_comparison: bool = True
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    icon_media_id: Optional[str] = None
    banner_media_id: Optional[str] = None
    china_search_keyword: Optional[str] = Field(default=None, max_length=200)
    channel: str = Field(default="catalog", pattern="^(catalog|dropshipping)$")


class CategoryCreate(CategoryBase):
    """Slug is optional — when omitted, the API uses the generated category id."""

    slug: Optional[str] = Field(default=None, max_length=255)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    caption: Optional[str] = Field(default=None, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    parent_id: Optional[str] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    show_in_top_menu: Optional[bool] = None
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    show_price_comparison: Optional[bool] = None
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    icon_media_id: Optional[str] = None
    banner_media_id: Optional[str] = None
    china_search_keyword: Optional[str] = Field(default=None, max_length=200)
    channel: Optional[str] = Field(default=None, pattern="^(catalog|dropshipping)$")


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    path: str
    depth: int
    product_count: int = 0
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CategoryTreeNode(CategoryRead):
    children: List["CategoryTreeNode"] = []


class CategoryListMeta(BaseModel):
    count: int


class CategoryListResponse(BaseModel):
    data: List[CategoryRead]
    meta: CategoryListMeta
    errors: List[str] = []


class CategoryResponse(BaseModel):
    data: CategoryRead
    errors: List[str] = []


class CategoryTreeResponse(BaseModel):
    data: List[CategoryTreeNode]
    errors: List[str] = []


class CategoryReorderRequest(BaseModel):
    parent_id: Optional[str] = None
    ordered_ids: List[str] = Field(min_length=1)
