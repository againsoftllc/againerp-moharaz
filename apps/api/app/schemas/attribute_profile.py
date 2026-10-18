from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


def slugify_code(name: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", name.lower().strip())) or "item"


class AttributeFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    group_id: str
    name: str
    code: str
    field_type: str
    sort_order: int
    is_required: bool
    is_filterable: bool
    is_comparable: bool
    is_searchable: bool
    is_visible: bool
    is_active: bool
    filter_display_type: str = "multi_select"
    storefront_filter_visible: bool = True
    unit: Optional[str] = None
    help_text: Optional[str] = None
    predefined_values: List[str] = []


class AttributeGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    profile_id: str
    name: str
    code: str
    sort_order: int
    is_active: bool
    description: Optional[str] = None
    attributes: List[AttributeFieldRead] = []


class AttributeProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True
    icon_url: Optional[str] = None
    image_url: Optional[str] = None
    category_labels: List[str] = []


class AttributeProfileCreate(AttributeProfileBase):
    pass


class AttributeProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    icon_url: Optional[str] = None
    image_url: Optional[str] = None
    category_labels: Optional[List[str]] = None


class AttributeProfileRead(AttributeProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    product_count: int = 0
    group_count: int = 0
    attribute_count: int = 0
    created_at: datetime
    updated_at: datetime


class AttributeProfileDetailRead(AttributeProfileRead):
    groups: List[AttributeGroupRead] = []


class AttributeProfileListMeta(BaseModel):
    count: int


class AttributeProfileListResponse(BaseModel):
    data: List[AttributeProfileRead]
    groups: List[AttributeGroupRead] = []
    attributes: List[AttributeFieldRead] = []
    meta: AttributeProfileListMeta
    errors: List[str] = []


class AttributeProfileResponse(BaseModel):
    data: AttributeProfileDetailRead
    errors: List[str] = []


class AttributeProfileReorderRequest(BaseModel):
    ordered_ids: List[str] = Field(min_length=1)


# A filter is either single-select (radio buttons: one value at a time) or multi-select (checkboxes: several).
# Older rows may still hold range / boolean / color / dynamic - those read as single-select.
FILTER_DISPLAY_TYPES = ("single_select", "multi_select")


class BulkAttributeItem(BaseModel):
    id: Optional[str] = None
    name: str
    field_type: Optional[str] = None  # text | dropdown | multi_select …; None keeps the current type
    filterable: bool = False
    filter_display_type: str = "single_select"
    storefront_filter_visible: bool = True
    predefined_values: List[str] = []

    def normalized_display_type(self) -> str:
        return "multi_select" if (self.filter_display_type or "").strip().lower() == "multi_select" else "single_select"


class BulkAttributeGroupItem(BaseModel):
    id: Optional[str] = None
    name: str
    attributes: List[BulkAttributeItem] = []


class AttributeProfileBulkSaveRequest(BaseModel):
    profile_name: str = Field(min_length=1)
    image_url: Optional[str] = None
    groups: List[BulkAttributeGroupItem] = []


class AttributeValueUsageItem(BaseModel):
    attribute_id: str
    value: str
    product_count: int


class AttributeValueUsageResponse(BaseModel):
    data: List[AttributeValueUsageItem] = []
    errors: List[str] = []


def parse_json_list(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def dump_json_list(values: Optional[List[str]]) -> str:
    return json.dumps(values or [])
