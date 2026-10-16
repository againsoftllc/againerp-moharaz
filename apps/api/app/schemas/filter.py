from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

FilterDisplayType = Literal["multi_select", "range", "boolean", "color", "dynamic"]
FilterSource = Literal["built_in", "attribute"]


class FilterBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    param_key: str = Field(min_length=1, max_length=255)
    display_type: FilterDisplayType = "multi_select"
    source: FilterSource = "attribute"
    attribute_id: Optional[str] = None
    attribute_name: str = "—"
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True
    storefront_visible: bool = True
    category_scope: str = "All categories"
    url_example: str = ""


class FilterCreate(FilterBase):
    pass


class FilterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    param_key: Optional[str] = Field(default=None, min_length=1, max_length=255)
    display_type: Optional[FilterDisplayType] = None
    source: Optional[FilterSource] = None
    attribute_id: Optional[str] = None
    attribute_name: Optional[str] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    storefront_visible: Optional[bool] = None
    category_scope: Optional[str] = None
    url_example: Optional[str] = None


class FilterRead(FilterBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    value_count: int = 0
    is_system: bool = False
    created_at: datetime
    updated_at: datetime


class FilterListMeta(BaseModel):
    count: int


class FilterListResponse(BaseModel):
    data: List[FilterRead]
    meta: FilterListMeta
    errors: List[str] = []


class FilterResponse(BaseModel):
    data: FilterRead
    errors: List[str] = []


class FilterReorderRequest(BaseModel):
    ordered_ids: List[str] = Field(min_length=1)
