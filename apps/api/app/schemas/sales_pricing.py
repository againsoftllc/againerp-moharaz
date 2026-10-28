from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class CustomerGroupRead(BaseModel):
    id: str
    code: str
    name: str
    price_type_id: Optional[str] = None
    discount_type_id: Optional[str] = None
    is_active: bool
    sort_order: int = 0
    customer_count: int = 0


class CustomerGroupSave(BaseModel):
    code: Optional[str] = Field(None, max_length=40)
    name: Optional[str] = Field(None, max_length=120)
    price_type_id: Optional[str] = None
    discount_type_id: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CustomerGroupListResponse(BaseModel):
    data: List[CustomerGroupRead]


class CustomerGroupResponse(BaseModel):
    data: CustomerGroupRead


class PriceTypeItemRow(BaseModel):
    item_id: str
    min_qty: int = 1
    price: Decimal
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    sku: Optional[str] = None  # read only
    name: Optional[str] = None
    list_price: Optional[Decimal] = None


class PriceTypeRead(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    allow_change: bool
    lower_limit_pct: Optional[Decimal] = None
    upper_limit_pct: Optional[Decimal] = None
    is_active: bool
    items: List[PriceTypeItemRow] = Field(default_factory=list)


class PriceTypeSave(BaseModel):
    code: Optional[str] = Field(None, max_length=40)
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = None
    allow_change: Optional[bool] = None
    lower_limit_pct: Optional[Decimal] = None
    upper_limit_pct: Optional[Decimal] = None
    is_active: Optional[bool] = None
    items: Optional[List[PriceTypeItemRow]] = None


class PriceTypeListResponse(BaseModel):
    data: List[PriceTypeRead]


class PriceTypeResponse(BaseModel):
    data: PriceTypeRead


class DiscountTypeItemRow(BaseModel):
    item_id: Optional[str] = None
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    min_qty: int = 1
    discount_pct: Decimal
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    target_label: Optional[str] = None  # read only: product / brand / category name


class DiscountTypeRead(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    max_pct: Optional[Decimal] = None
    is_active: bool
    items: List[DiscountTypeItemRow] = Field(default_factory=list)


class DiscountTypeSave(BaseModel):
    code: Optional[str] = Field(None, max_length=40)
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = None
    max_pct: Optional[Decimal] = None
    is_active: Optional[bool] = None
    items: Optional[List[DiscountTypeItemRow]] = None


class DiscountTypeListResponse(BaseModel):
    data: List[DiscountTypeRead]


class DiscountTypeResponse(BaseModel):
    data: DiscountTypeRead


class PricingRuleRead(BaseModel):
    id: str
    name: str
    price_type_id: Optional[str] = None
    discount_type_id: Optional[str] = None
    customer_group: Optional[str] = None
    warehouse_id: Optional[str] = None
    user_id: Optional[str] = None
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    priority: int = 0
    is_active: bool


class PricingRuleSave(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    price_type_id: Optional[str] = None
    discount_type_id: Optional[str] = None
    customer_group: Optional[str] = None
    warehouse_id: Optional[str] = None
    user_id: Optional[str] = None
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class PricingRuleListResponse(BaseModel):
    data: List[PricingRuleRead]


class PricingRuleResponse(BaseModel):
    data: PricingRuleRead


class PriceQuoteRead(BaseModel):
    item_id: str
    quantity: int
    list_price: Decimal
    price: Decimal
    source: str
    price_type_id: Optional[str] = None
    price_type_name: Optional[str] = None
    allow_change: bool = True
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    discount_pct: Decimal = Decimal("0")
    discount_type_id: Optional[str] = None
    discount_type_name: Optional[str] = None
    max_discount_pct: Optional[Decimal] = None
    rule_names: List[str] = Field(default_factory=list)


class PriceQuoteResponse(BaseModel):
    data: PriceQuoteRead
