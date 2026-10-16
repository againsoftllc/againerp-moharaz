from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

STOCK_STATUSES = "^(in_stock|low_stock|out_of_stock|overstock)$"


class StockLevelUpdate(BaseModel):
    """Patchable stock-line metadata. Quantity fields are not writable here."""

    min_qty: Optional[int] = Field(default=None, ge=0)
    max_qty: Optional[int] = Field(default=None, ge=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)


class StockLevelAdjust(BaseModel):
    """Deprecated request body. POST /stock/{id}/adjust returns 410."""

    movement_type: str = Field(pattern="^(in|out|transfer|adjustment)$")
    quantity: int = Field(ge=0)
    dest_warehouse_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    reference: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None


class StockLevelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    warehouse_code: Optional[str] = None
    product_id: str
    variant_id: str
    item_id: Optional[str] = None
    sku: str
    name: str
    on_hand: int
    reserved: int
    available: int
    incoming: int
    projected: int = 0
    tracking_type: str = "none"
    min_qty: int
    max_qty: int
    reorder_level: int
    unit_cost: Decimal
    stock_value: Decimal
    status: str
    thumbnail: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StockLevelListMeta(BaseModel):
    count: int
    total: int
    limit: int
    offset: int
    # Rollups consumed by useInventoryStock() in lib/api/use-inventory.ts.
    total_units: int = 0
    total_value: Decimal = Decimal("0")


class InventoryDashboardAlert(BaseModel):
    sku: str
    product: str
    stock: int
    threshold: int
    status: str


class InventoryDashboardRead(BaseModel):
    total_skus: int
    total_units: int
    total_value: Decimal
    low_stock_count: int
    out_of_stock_count: int
    warehouse_count: int
    movement_count_7d: int
    alerts: List[InventoryDashboardAlert] = Field(default_factory=list)


class InventoryDashboardResponse(BaseModel):
    data: InventoryDashboardRead
    errors: List[str] = []


class ReorderSuggestionRead(BaseModel):
    item_id: str
    sku: str
    name: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    on_hand: int
    reserved: int
    available: int
    incoming: int
    projected: int = 0
    reorder_level: int
    max_qty: int
    suggested_qty: int
    preferred_supplier_id: Optional[str] = None
    preferred_supplier_name: Optional[str] = None


class ReorderSuggestionListResponse(BaseModel):
    data: List[ReorderSuggestionRead]
    meta: StockLevelListMeta
    errors: List[str] = []


class StockLevelListResponse(BaseModel):
    data: List[StockLevelRead]
    meta: StockLevelListMeta
    errors: List[str] = []


class StockLevelResponse(BaseModel):
    data: StockLevelRead
    errors: List[str] = []
