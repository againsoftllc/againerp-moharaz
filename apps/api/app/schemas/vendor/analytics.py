from __future__ import annotations

from decimal import Decimal
from typing import List

from pydantic import BaseModel


class VendorAnalyticsOverviewRead(BaseModel):
    total_vendors: int
    active_vendors: int
    new_vendors_30d: int
    active_order_requests: int
    total_revenue: Decimal
    average_order_value: Decimal
    order_count: int
    cancellation_rate: Decimal
    total_outstanding: Decimal
    dormant_vendors: int


class VendorAnalyticsOverviewResponse(BaseModel):
    data: VendorAnalyticsOverviewRead


class VendorRankRowRead(BaseModel):
    vendor_id: str
    vendor_name: str
    revenue: Decimal
    order_count: int


class VendorRankingResponse(BaseModel):
    data: List[VendorRankRowRead]


class VendorScoreRead(BaseModel):
    score: int
    tier: str
    payment_reliability: int
    order_frequency: int
    cancellation_penalty: int


class VendorScoreResponse(BaseModel):
    data: VendorScoreRead
