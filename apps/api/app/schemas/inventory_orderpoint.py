from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

OrderpointTrigger = Literal["manual", "auto"]


class OrderpointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    product_id: Optional[str] = None
    product_name: str
    qty_on_hand: Decimal
    qty_forecast: Decimal
    route_name: str
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    trigger: OrderpointTrigger
    product_min_qty: Decimal
    product_max_qty: Decimal
    qty_multiple: Decimal
    qty_to_order: Decimal
    deadline: Optional[datetime] = None
    snoozed: bool = False
    deadline_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderpointUpdate(BaseModel):
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    trigger: Optional[OrderpointTrigger] = None
    product_min_qty: Optional[Decimal] = None
    product_max_qty: Optional[Decimal] = None
    qty_multiple: Optional[Decimal] = None
    qty_to_order: Optional[Decimal] = None
    deadline: Optional[datetime] = None
    snoozed: Optional[bool] = None


class OrderpointListMeta(BaseModel):
    count: int


class OrderpointListResponse(BaseModel):
    data: list[OrderpointRead]
    meta: OrderpointListMeta


class OrderpointResponse(BaseModel):
    data: OrderpointRead
