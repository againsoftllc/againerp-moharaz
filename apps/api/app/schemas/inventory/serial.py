from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SerialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    serial_number: str
    item_id: Optional[str] = None
    product_id: Optional[str] = None
    sku: str
    product_name: str
    thumbnail: Optional[str] = None
    status: str
    warehouse_id: Optional[str] = None
    warehouse_name: Optional[str] = None
    source_type: str
    source_id: Optional[str] = None
    supplier_id: Optional[str] = None
    received_at: Optional[datetime] = None
    sold_at: Optional[datetime] = None
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str
    # Null means the product's warranty text could not be read — not "no warranty".
    warranty_expires_on: Optional[date] = None
    rma_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Trace view: where the unit came from and where it went (computed on read).
    supplier_name: Optional[str] = None
    source_label: str = ""
    source_number: Optional[str] = None
    order_kind: Optional[str] = None
    returned_at: Optional[datetime] = None
    last_note: Optional[str] = None
    # Staff who received/purchased the unit and who sold it.
    received_by_name: Optional[str] = None
    sold_by_name: Optional[str] = None
    # What this exact unit was bought for and sold for (the purchase/sales line
    # prices already on those documents — not a recomputed cost).
    purchase_unit_cost: Optional[Decimal] = None
    sold_unit_price: Optional[Decimal] = None


class SerialRegisterRequest(BaseModel):
    """Bulk registration — one item, many units."""

    serial_numbers: List[str] = Field(min_length=1)
    item_id: Optional[str] = None
    sku: Optional[str] = None
    warehouse_id: Optional[str] = None
    source_type: str = Field(default="manual", max_length=20)
    source_id: Optional[str] = None
    supplier_id: Optional[str] = None
    notes: Optional[str] = None


class SerialAssignRequest(BaseModel):
    serial_numbers: List[str] = Field(min_length=1)
    order_number: str = Field(min_length=1, max_length=50)


class SerialUpdate(BaseModel):
    status: Optional[str] = Field(default=None, max_length=20)
    warehouse_id: Optional[str] = None
    notes: Optional[str] = None


class SerialResultRead(BaseModel):
    """Per-serial outcome; a batch reports rather than fails."""

    serial_number: str
    outcome: str
    detail: str = ""
    serial_id: Optional[str] = None


class SerialBatchResponse(BaseModel):
    data: List[SerialResultRead]
    created: int
    duplicates: int
    rejected: int


class SerialListMeta(BaseModel):
    count: int
    total: int
    # Rows matching the request filters (item/status/warehouse/q); `total` stays company-wide.
    total_matching: int = 0
    in_stock: int = 0
    in_transit: int = 0
    lost: int = 0
    damaged: int = 0
    sold: int = 0
    in_service: int = 0
    replaced: int = 0
    scrapped: int = 0


class SerialListResponse(BaseModel):
    data: List[SerialRead]
    meta: SerialListMeta


class SerialResponse(BaseModel):
    data: SerialRead


class SerialLookupResponse(BaseModel):
    """What intake needs to decide a warranty claim from a serial alone."""

    data: Optional[SerialRead] = None
    warranty_status: Optional[str] = None
    warranty_note: Optional[str] = None
    purchased_on: Optional[date] = None
    open_rma_id: Optional[str] = None
    open_rma_number: Optional[str] = None


class ScanProductHit(BaseModel):
    item_id: Optional[str] = None
    sku: str
    name: str
    barcode: Optional[str] = None
    serial_number: Optional[str] = None
    serial_status: Optional[str] = None
    match: str


class ScanProductResponse(BaseModel):
    data: Optional[ScanProductHit] = None
