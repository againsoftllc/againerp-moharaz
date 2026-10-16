from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

StockPickingState = Literal["draft", "waiting", "confirmed", "assigned", "done", "cancel"]
StockMoveState = Literal[
    "draft", "waiting", "confirmed", "partially_available", "assigned", "done", "cancel"
]
StockPickingTypeCode = Literal["incoming", "outgoing", "internal"]


class StockPickingTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: StockPickingTypeCode
    sequence_code: str
    warehouse_name: Optional[str] = None


class StockMoveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    picking_id: str
    name: str
    product_id: Optional[str] = None
    product_uom_qty: Decimal
    quantity: Decimal
    sequence: int
    state: StockMoveState
    show_details: bool = False


class StockMoveUpdate(BaseModel):
    name: Optional[str] = None
    product_id: Optional[str] = None
    product_uom_qty: Optional[Decimal] = None
    quantity: Optional[Decimal] = None
    sequence: Optional[int] = None
    state: Optional[StockMoveState] = None
    show_details: Optional[bool] = None


class StockPickingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    picking_type_id: str
    picking_type_code: StockPickingTypeCode
    picking_type_name: str
    location_id: Optional[str] = None
    location_dest_id: Optional[str] = None
    scheduled_date: datetime
    date_deadline: Optional[datetime] = None
    origin: Optional[str] = None
    state: StockPickingState
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    carrier_tracking_ref: Optional[str] = None
    weight: Decimal
    priority: str = "0"
    note: Optional[str] = None
    move_ids: list[StockMoveRead] = Field(default_factory=list)
    scheduled_label: Optional[str] = None
    deadline_label: Optional[str] = None
    is_late: bool = False
    created_at: datetime
    updated_at: datetime


class StockPickingUpdate(BaseModel):
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    date_deadline: Optional[datetime] = None
    origin: Optional[str] = None
    state: Optional[StockPickingState] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    carrier_tracking_ref: Optional[str] = None
    weight: Optional[Decimal] = None
    priority: Optional[str] = None
    note: Optional[str] = None
    location_id: Optional[str] = None
    location_dest_id: Optional[str] = None
    move_ids: Optional[list[StockMoveUpdate]] = None


class StockPickingListMeta(BaseModel):
    count: int


class StockPickingListResponse(BaseModel):
    data: list[StockPickingRead]
    meta: StockPickingListMeta


class StockPickingResponse(BaseModel):
    data: StockPickingRead
