from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class SupplierProductRead(BaseModel):
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

    model_config = {"from_attributes": True}


class SupplierProductCreate(BaseModel):
    supplier_id: str
    supplier_sku: str = Field(min_length=1, max_length=128)
    supplier_title: str = Field(min_length=1, max_length=255)
    supplier_price: Decimal = Field(ge=0)
    currency: str = "BDT"
    supplier_stock: Optional[int] = None
    stock_status: str = "unknown"
    lead_time_days: int = Field(default=7, ge=0)
    min_order_qty: int = Field(default=1, ge=1)
    warranty: Optional[str] = None
    api_source: str = "manual"
    sync_status: str = "manual"
    notes: Optional[str] = None


class SupplierProductUpdate(BaseModel):
    supplier_title: Optional[str] = None
    supplier_price: Optional[Decimal] = Field(default=None, ge=0)
    supplier_stock: Optional[int] = None
    stock_status: Optional[str] = None
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    min_order_qty: Optional[int] = Field(default=None, ge=1)
    warranty: Optional[str] = None
    sync_status: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SupplierLinkRead(BaseModel):
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
    margin_pct: Optional[int] = None

    model_config = {"from_attributes": True}


class SupplierLinkUpdate(BaseModel):
    is_preferred: Optional[bool] = None
    is_published: Optional[bool] = None
    conversion_factor: Optional[Decimal] = None
    sort_order: Optional[int] = None


class MapSupplierRequest(BaseModel):
    item_id: str
    supplier_id: str
    supplier_sku: str
    supplier_title: str
    supplier_price: Decimal = Field(ge=0)
    supplier_stock: Optional[int] = None
    stock_status: str = "unknown"
    lead_time_days: int = Field(default=7, ge=0)
    min_order_qty: int = Field(default=1, ge=1)
    warranty: Optional[str] = None
    is_preferred: bool = False
    is_published: bool = False
    conversion_factor: Decimal = Field(default=Decimal("1"), gt=0)
    api_source: str = "manual"
    currency: str = "BDT"


class MapSupplierResponse(BaseModel):
    supplier_product: SupplierProductRead
    link: SupplierLinkRead


class SupplierPriceListRead(BaseModel):
    id: str
    supplier_id: str
    supplier_product_id: Optional[str] = None
    item_id: Optional[str] = None
    unit_price: Decimal
    currency: str
    min_qty: int
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupplierPriceListCreate(BaseModel):
    supplier_id: str
    unit_price: Decimal = Field(ge=0)
    supplier_product_id: Optional[str] = None
    item_id: Optional[str] = None
    currency: str = "BDT"
    min_qty: int = Field(default=1, ge=1)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    notes: Optional[str] = None


class SupplierPerformanceRead(BaseModel):
    supplier_id: str
    rating: float
    lead_time_days: int
    payment_terms: str
    on_time_delivery_pct: float
    quality_reject_rate_pct: float
    price_variance_pct: float
    avg_lead_time_days: float
    purchase_order_count: int
    completed_po_count: int
    spend_total: Decimal
    linked_item_count: int
    catalog_sku_count: int
    has_stock_feed: bool
    api_ready_sources: List[str]


class PurchaseSuggestionRead(BaseModel):
    item_id: str
    item_sku: str
    item_name: str
    on_hand: int
    reorder_level: int
    suggested_qty: int
    supplier_id: str
    supplier_name: Optional[str] = None
    supplier_product_id: Optional[str] = None
    unit_cost: Optional[float] = None
    lead_time_days: Optional[int] = None
    is_preferred: bool
    reason: str


class SupplierProductListResponse(BaseModel):
    data: List[SupplierProductRead]
    meta: dict[str, int]


class SupplierLinkListResponse(BaseModel):
    data: List[SupplierLinkRead]


class SupplierPerformanceResponse(BaseModel):
    data: SupplierPerformanceRead


class PurchaseSuggestionListResponse(BaseModel):
    data: List[PurchaseSuggestionRead]


def link_to_read(enriched: dict[str, Any]) -> SupplierLinkRead:
    link = enriched["link"]
    sp = enriched.get("supplier_product")
    return SupplierLinkRead(
        id=link.id,
        item_id=link.item_id,
        supplier_id=link.supplier_id,
        supplier_product_id=link.supplier_product_id,
        is_preferred=link.is_preferred,
        is_published=link.is_published,
        conversion_factor=link.conversion_factor,
        sort_order=link.sort_order,
        created_at=link.created_at,
        updated_at=link.updated_at,
        supplier_name=enriched.get("supplier_name"),
        supplier_sku=sp.supplier_sku if sp else None,
        supplier_title=sp.supplier_title if sp else None,
        supplier_price=sp.supplier_price if sp else None,
        supplier_stock=sp.supplier_stock if sp else None,
        stock_status=sp.stock_status if sp else None,
        lead_time_days=sp.lead_time_days if sp else None,
        min_order_qty=sp.min_order_qty if sp else None,
        warranty=sp.warranty if sp else None,
        item_sku=enriched.get("item_sku"),
        item_name=enriched.get("item_name"),
        retail_price=enriched.get("retail_price"),
        margin_pct=enriched.get("margin_pct"),
    )
