from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.configurator_profile import ConfiguratorStatus

SelectionMode = Literal["single", "multiple"]
SlotKind = Literal["product", "service", "toggle"]
DefaultSort = Literal["popular", "low", "high"]
SlotCondition = Dict[str, Any]  # {f: field_code, op: has|eq|neq|in, v?: value}


class ConfiguratorCategoryBase(BaseModel):
    profile_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    sort_order: int = 0
    is_required: bool = False
    selection_mode: SelectionMode = "single"
    catalog_category_slug: str = ""
    attribute_profile_id: Optional[str] = None
    status: ConfiguratorStatus = "draft"
    tab_id: Optional[str] = None
    kind: SlotKind = "product"
    icon: str = "settings_input_component"
    conditions: List[SlotCondition] = []
    specs: List[str] = []
    min_select: int = Field(default=0, ge=0, le=8)
    max_select: int = Field(default=1, ge=1, le=10)
    default_sort: DefaultSort = "popular"


class ConfiguratorCategoryCreate(ConfiguratorCategoryBase):
    pass


class ConfiguratorCategoryUpdate(BaseModel):
    profile_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_required: Optional[bool] = None
    selection_mode: Optional[SelectionMode] = None
    catalog_category_slug: Optional[str] = None
    attribute_profile_id: Optional[str] = None
    status: Optional[ConfiguratorStatus] = None
    tab_id: Optional[str] = None
    kind: Optional[SlotKind] = None
    icon: Optional[str] = None
    conditions: Optional[List[SlotCondition]] = None
    specs: Optional[List[str]] = None
    min_select: Optional[int] = Field(default=None, ge=0, le=8)
    max_select: Optional[int] = Field(default=None, ge=1, le=10)
    default_sort: Optional[DefaultSort] = None


class ConfiguratorCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    profile_id: str
    profile_name: str = ""
    name: str
    slug: str
    description: Optional[str] = None
    sort_order: int = 0
    is_required: bool = False
    selection_mode: SelectionMode = "single"
    catalog_category_slug: str = ""
    attribute_profile_id: Optional[str] = None
    status: ConfiguratorStatus = "draft"
    product_count: int = 0
    tab_id: Optional[str] = None
    kind: SlotKind = "product"
    icon: str = "settings_input_component"
    conditions: List[SlotCondition] = []
    specs: List[str] = []
    min_select: int = 0
    max_select: int = 1
    default_sort: DefaultSort = "popular"
    created_at: datetime
    updated_at: datetime


class ConfiguratorCategoryListMeta(BaseModel):
    count: int


class ConfiguratorCategoryListResponse(BaseModel):
    data: List[ConfiguratorCategoryRead]
    meta: ConfiguratorCategoryListMeta
    errors: List[str] = []


class ConfiguratorCategoryResponse(BaseModel):
    data: ConfiguratorCategoryRead
    errors: List[str] = []


class ConfiguratorCategoryBulkStatusRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    status: ConfiguratorStatus
