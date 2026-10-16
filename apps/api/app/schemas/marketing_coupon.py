from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CouponStatus = Literal["active", "scheduled", "expired", "disabled"]
CouponDiscountType = Literal["percent", "fixed"]


class CouponRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    code: str
    name: str
    discount_type: str
    discount_value: Decimal
    discount_label: str
    status: str
    redemptions: int
    redemption_limit: Optional[int] = None
    starts_at: date
    ends_at: date
    min_order_amount: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime


class CouponListMeta(BaseModel):
    count: int
    active_count: int


class CouponListResponse(BaseModel):
    data: List[CouponRead]
    meta: CouponListMeta


class CouponResponse(BaseModel):
    data: CouponRead


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    discount_type: CouponDiscountType = "percent"
    discount_value: Decimal = Field(..., ge=0)
    discount_label: Optional[str] = Field(default=None, max_length=100)
    status: CouponStatus = "active"
    redemption_limit: Optional[int] = Field(default=None, ge=0)
    starts_at: date
    ends_at: date
    min_order_amount: Optional[Decimal] = Field(default=None, ge=0)


class CouponUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, max_length=255)
    discount_type: Optional[CouponDiscountType] = None
    discount_value: Optional[Decimal] = Field(default=None, ge=0)
    discount_label: Optional[str] = Field(default=None, max_length=100)
    status: Optional[CouponStatus] = None
    redemption_limit: Optional[int] = Field(default=None, ge=0)
    starts_at: Optional[date] = None
    ends_at: Optional[date] = None
    min_order_amount: Optional[Decimal] = Field(default=None, ge=0)
