from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

STOCK_STATUS_PATTERN = "^(in_stock|low|out|unknown)$"


class SupplierProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    supplier_id: str
    supplier_sku: str
    supplier_title: str
    supplier_price: Decimal
    currency: str
    supplier_stock: Optional[int] = None
    stock_status: str
    lead_time_days: int
    min_order_qty: int
    warranty: Optional[str] = None
    api_source: str
    sync_status: str
    is_active: bool
    notes: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class SupplierProductUpdate(BaseModel):
    supplier_price: Optional[Decimal] = Field(default=None, ge=0)
    supplier_stock: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = Field(default=None, pattern=STOCK_STATUS_PATTERN)
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    min_order_qty: Optional[int] = Field(default=None, ge=1)
    warranty: Optional[str] = Field(default=None, max_length=128)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SupplierProductListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class SupplierProductListResponse(BaseModel):
    data: List[SupplierProductRead]
    meta: SupplierProductListMeta


class SupplierLinkRead(BaseModel):
    """A supplier product mapped onto an inventory item."""

    id: str
    item_id: str
    supplier_id: str
    supplier_product_id: Optional[str] = None
    is_preferred: bool
    is_published: bool
    conversion_factor: Decimal
    sort_order: int
    created_at: datetime
    updated_at: datetime
    # Joined for display — the grid shows these without a second request.
    supplier_name: Optional[str] = None
    supplier_sku: Optional[str] = None
    supplier_title: Optional[str] = None
    supplier_price: Optional[Decimal] = None
    supplier_stock: Optional[int] = None
    stock_status: Optional[str] = None
    lead_time_days: Optional[int] = None
    min_order_qty: Optional[int] = None
    warranty: Optional[str] = None
    item_sku: Optional[str] = None
    item_name: Optional[str] = None
    retail_price: Optional[float] = None
    margin_pct: Optional[float] = None


class SupplierLinkListResponse(BaseModel):
    data: List[SupplierLinkRead]


class SupplierLinkUpdate(BaseModel):
    is_preferred: Optional[bool] = None
    is_published: Optional[bool] = None
    conversion_factor: Optional[Decimal] = Field(default=None, gt=0)
    sort_order: Optional[int] = Field(default=None, ge=0)


class MapSupplierInput(BaseModel):
    """Upsert a supplier product and link it to an item in one call."""

    item_id: str = Field(min_length=1, max_length=36)
    supplier_id: str = Field(min_length=1, max_length=36)
    supplier_sku: str = Field(min_length=1, max_length=128)
    supplier_title: str = Field(min_length=1, max_length=255)
    supplier_price: Decimal = Field(ge=0)
    supplier_stock: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = Field(default=None, pattern=STOCK_STATUS_PATTERN)
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    min_order_qty: Optional[int] = Field(default=None, ge=1)
    warranty: Optional[str] = Field(default=None, max_length=128)
    is_preferred: Optional[bool] = None
    is_published: Optional[bool] = None
    conversion_factor: Optional[Decimal] = Field(default=None, gt=0)
    api_source: Optional[str] = Field(default=None, max_length=32)
    currency: Optional[str] = Field(default=None, max_length=3)


class MapSupplierResponse(BaseModel):
    supplier_product: SupplierProductRead
    link: SupplierLinkRead
