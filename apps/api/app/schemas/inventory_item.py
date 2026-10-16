from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InventoryItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    item_id: str
    inventory_status: str
    track_stock: bool
    track_serial: bool
    track_batch: bool
    default_warehouse_id: Optional[str] = None
    base_uom: str
    purchase_uom: str
    sales_uom: str
    purchase_conversion: Decimal
    sales_conversion: Decimal
    qr_code: Optional[str] = None
    scanner_ready: bool
    reorder_level: int
    min_stock: int
    max_stock: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class InventoryItemUpdate(BaseModel):
    inventory_status: Optional[str] = Field(default=None, pattern="^(active|inactive|discontinued)$")
    track_stock: Optional[bool] = None
    track_serial: Optional[bool] = None
    track_batch: Optional[bool] = None
    default_warehouse_id: Optional[str] = None
    base_uom: Optional[str] = Field(default=None, max_length=20)
    purchase_uom: Optional[str] = Field(default=None, max_length=20)
    sales_uom: Optional[str] = Field(default=None, max_length=20)
    purchase_conversion: Optional[Decimal] = Field(default=None, gt=0)
    sales_conversion: Optional[Decimal] = Field(default=None, gt=0)
    qr_code: Optional[str] = Field(default=None, max_length=255)
    scanner_ready: Optional[bool] = None
    reorder_level: Optional[int] = Field(default=None, ge=0)
    min_stock: Optional[int] = Field(default=None, ge=0)
    max_stock: Optional[int] = Field(default=None, ge=0)


class InventoryItemResponse(BaseModel):
    data: InventoryItemRead


class InventoryItemListResponse(BaseModel):
    data: List[InventoryItemRead]
    meta: dict
