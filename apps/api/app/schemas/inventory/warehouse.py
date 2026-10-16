from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WarehouseCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    branch_id: Optional[str] = Field(default=None, max_length=36)
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="Main warehouse", min_length=1, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    zip_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=100)
    mobile: Optional[str] = Field(default=None, max_length=50)
    alternate_contact: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    website: Optional[str] = Field(default=None, max_length=255)
    invoice_layout: Optional[str] = Field(default=None, max_length=100)
    payment_option: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True
    is_default: bool = False
    sort_order: int = Field(default=0, ge=0)


class WarehouseUpdate(BaseModel):
    branch_id: Optional[str] = Field(default=None, max_length=36)
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    zip_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=100)
    mobile: Optional[str] = Field(default=None, max_length=50)
    alternate_contact: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    website: Optional[str] = Field(default=None, max_length=255)
    invoice_layout: Optional[str] = Field(default=None, max_length=100)
    payment_option: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)


class WarehouseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    code: str
    name: str
    type: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    mobile: Optional[str] = None
    alternate_contact: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    invoice_layout: Optional[str] = None
    payment_option: Optional[str] = None
    # Live count of this warehouse's inventory_locations rows — computed on
    # read (see location_service.warehouse_location_counts), never trust the
    # stored column value directly.
    locations_count: int = 0
    # Aggregate of on-hand units held in this warehouse (lib/api/inventory.ts reads it).
    total_units: int = 0
    is_active: bool
    is_default: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class WarehouseListMeta(BaseModel):
    count: int


class WarehouseListResponse(BaseModel):
    data: List[WarehouseRead]
    meta: WarehouseListMeta
    errors: List[str] = []


class WarehouseResponse(BaseModel):
    data: WarehouseRead
    errors: List[str] = []
