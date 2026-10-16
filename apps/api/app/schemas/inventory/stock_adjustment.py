from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StockAdjustmentSerialRead(BaseModel):
    id: str
    serial_id: Optional[str] = None
    serial_number: str
    action: str
    status: Optional[str] = None


class StockAdjustmentLineRead(BaseModel):
    id: str
    item_id: str
    sku: str
    name: str
    tracking_type: str
    system_qty: int
    physical_qty: int
    adjustment_qty: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    serials: List[StockAdjustmentSerialRead] = []


class StockAdjustmentEventRead(BaseModel):
    id: str
    action: str
    performed_by: Optional[str] = None
    performed_by_name: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime


class StockAdjustmentRead(BaseModel):
    id: str
    company_id: str
    adjustment_number: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    adjustment_date: date
    adjustment_type: str
    reason: str
    reason_label: str
    reason_details: Optional[str] = None
    reference_number: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    applied_by: Optional[str] = None
    applied_by_name: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    lines: List[StockAdjustmentLineRead] = []
    events: List[StockAdjustmentEventRead] = []


class StockAdjustmentLineCreate(BaseModel):
    item_id: str = Field(min_length=1, max_length=36)
    physical_qty: int = Field(ge=0)
    reason: Optional[str] = None
    notes: Optional[str] = None
    keep_serial_ids: List[str] = Field(default_factory=list)
    add_serial_numbers: List[str] = Field(default_factory=list)


class StockAdjustmentCreate(BaseModel):
    warehouse_id: str = Field(min_length=1, max_length=36)
    adjustment_date: Optional[date] = None
    reason: str = Field(min_length=1, max_length=40)
    reason_details: Optional[str] = None
    reference_number: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = None
    lines: List[StockAdjustmentLineCreate] = Field(min_length=1)


class StockAdjustmentListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class StockAdjustmentListResponse(BaseModel):
    data: List[StockAdjustmentRead]
    meta: StockAdjustmentListMeta


class StockAdjustmentResponse(BaseModel):
    data: StockAdjustmentRead
