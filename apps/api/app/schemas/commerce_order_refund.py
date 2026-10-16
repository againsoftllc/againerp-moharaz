from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class OrderRefundRead(BaseModel):
    id: str
    company_id: str
    refund_number: str
    order_id: str
    order_number: str
    customer_name: str
    amount: Decimal
    method: str
    reason: str
    status: str
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderRefundListMeta(BaseModel):
    count: int
    total_amount: Decimal


class OrderRefundListResponse(BaseModel):
    data: List[OrderRefundRead]
    meta: OrderRefundListMeta


class OrderRefundResponse(BaseModel):
    data: OrderRefundRead


class OrderRefundUpdate(BaseModel):
    status: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None
