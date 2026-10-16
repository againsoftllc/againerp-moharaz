from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    sku: str
    barcode: Optional[str] = None
    name: str
    item_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    # Service module extension (populated when module="service" / item_type="service")
    description: Optional[str] = None
    category: Optional[str] = None
    unit_type: Optional[str] = None
    rate: Optional[Decimal] = None
    show_in_client_portal: Optional[bool] = None
    image_url: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None


class ItemListMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class ItemListResponse(BaseModel):
    data: List[ItemRead]
    meta: ItemListMeta


class ItemResponse(BaseModel):
    data: ItemRead


class ItemCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    item_type: str = Field(default="physical", pattern="^(physical|digital|service|bundle)$")
    status: str = Field(default="draft", pattern="^(draft|active|archived)$")
    company_id: str = Field(default="default", max_length=36)
    barcode: Optional[str] = Field(default=None, max_length=100)
    register_module: Optional[str] = Field(
        default=None,
        pattern="^(service|manufacturing)$",
        description="Ensure module extension row on create",
    )
    # Service module extension fields (used when item_type/register_module == "service")
    description: Optional[str] = Field(default=None, max_length=4000)
    category: Optional[str] = Field(default=None, max_length=50)
    unit_type: Optional[str] = Field(default=None, max_length=30)
    rate: Optional[Decimal] = Field(default=None, ge=0)
    show_in_client_portal: bool = Field(default=False)
    image_url: Optional[str] = Field(default=None, max_length=500)


class ItemUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, min_length=1, max_length=100)
    barcode: Optional[str] = Field(default=None, max_length=100)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    item_type: Optional[str] = Field(default=None, pattern="^(physical|digital|service|bundle)$")
    status: Optional[str] = Field(default=None, pattern="^(draft|active|archived)$")
    # Service module extension fields
    description: Optional[str] = Field(default=None, max_length=4000)
    category: Optional[str] = Field(default=None, max_length=50)
    unit_type: Optional[str] = Field(default=None, max_length=30)
    rate: Optional[Decimal] = Field(default=None, ge=0)
    show_in_client_portal: Optional[bool] = Field(default=None)
    image_url: Optional[str] = Field(default=None, max_length=500)
