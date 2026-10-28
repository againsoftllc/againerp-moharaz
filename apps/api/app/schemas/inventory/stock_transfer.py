from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class StockTransferSerialRead(BaseModel):
    id: str
    serial_id: str
    serial_number: str
    status: str
    shipped_at: Optional[datetime] = None
    received_at: Optional[datetime] = None


class StockTransferLineRead(BaseModel):
    id: str
    item_id: str
    sku: str
    name: str
    tracking_type: str
    quantity: int
    shipped_qty: int
    received_qty: int
    remaining_qty: int
    available_qty: Optional[int] = None
    unit_cost: Optional[Decimal] = None  # the source warehouse's cost: what the transfer is worth
    notes: Optional[str] = None
    serials: List[StockTransferSerialRead] = []


class StockTransferEventRead(BaseModel):
    id: str
    action: str
    performed_by: Optional[str] = None
    performed_by_name: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime


class StockTransferRead(BaseModel):
    id: str
    company_id: str
    transfer_number: str
    from_warehouse_id: str
    from_warehouse_name: Optional[str] = None
    to_warehouse_id: str
    to_warehouse_name: Optional[str] = None
    transfer_date: date
    reference_number: Optional[str] = None
    status: str
    requested_by: Optional[str] = None
    requested_by_name: Optional[str] = None
    shipped_by: Optional[str] = None
    shipped_by_name: Optional[str] = None
    received_by: Optional[str] = None
    received_by_name: Optional[str] = None
    notes: Optional[str] = None
    shipped_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    lines: List[StockTransferLineRead] = []
    events: List[StockTransferEventRead] = []


class StockTransferLineCreate(BaseModel):
    item_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(gt=0)
    serial_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class StockTransferCreate(BaseModel):
    from_warehouse_id: str = Field(min_length=1, max_length=36)
    to_warehouse_id: str = Field(min_length=1, max_length=36)
    transfer_date: Optional[date] = None
    reference_number: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = None
    lines: List[StockTransferLineCreate] = Field(min_length=1)


class StockTransferReceiveLine(BaseModel):
    line_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(gt=0)
    serial_ids: List[str] = Field(default_factory=list)


class StockTransferReceive(BaseModel):
    lines: List[StockTransferReceiveLine] = Field(min_length=1)


class StockTransferListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class StockTransferListResponse(BaseModel):
    data: List[StockTransferRead]
    meta: StockTransferListMeta


class StockTransferResponse(BaseModel):
    data: StockTransferRead
