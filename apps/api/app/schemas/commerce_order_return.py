from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class OrderReturnRead(BaseModel):
    id: str
    company_id: str
    return_number: str
    order_id: str
    order_number: str
    customer_name: str
    product_name: str
    sku: str
    quantity: int
    reason: str
    status: str
    amount: Decimal
    assigned_staff: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderReturnListMeta(BaseModel):
    count: int
    total_amount: Decimal


class OrderReturnListResponse(BaseModel):
    data: List[OrderReturnRead]
    meta: OrderReturnListMeta


class OrderReturnResponse(BaseModel):
    data: OrderReturnRead


class OrderReturnUpdate(BaseModel):
    status: Optional[str] = None
    assigned_staff: Optional[str] = None
    notes: Optional[str] = None
