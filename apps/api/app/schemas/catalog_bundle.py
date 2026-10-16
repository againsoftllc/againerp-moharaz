from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

BundleStatus = Literal["draft", "published", "archived"]
BundlePricingMode = Literal["fixed", "sum_discount"]


class BundleComponent(BaseModel):
    id: str
    product_id: str
    product_name: str
    sku: str = ""
    quantity: int = Field(default=1, ge=1)
    unit_price: Decimal = Decimal("0")
    is_optional: bool = False
    thumbnail: Optional[str] = None


class BundleBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    sku: str = Field(default="", max_length=64)
    status: BundleStatus = "draft"
    pricing_mode: BundlePricingMode = "sum_discount"
    bundle_price: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    stock: int = Field(default=0, ge=0)
    thumbnail: Optional[str] = None
    category: str = Field(default="General", max_length=120)
    description: Optional[str] = None
    components: List[BundleComponent] = Field(default_factory=list)


class BundleCreate(BundleBase):
    pass


class BundleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    sku: Optional[str] = Field(default=None, max_length=64)
    status: Optional[BundleStatus] = None
    pricing_mode: Optional[BundlePricingMode] = None
    bundle_price: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = None
    stock: Optional[int] = Field(default=None, ge=0)
    thumbnail: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = None
    components: Optional[List[BundleComponent]] = None


class BundleRead(BundleBase):
    model_config = ConfigDict(from_attributes=True)

    # Derived from component stock, which may be negative under the
    # "Allow negative stock" policy.
    stock: int = 0

    id: str
    company_id: str
    retail_total: Decimal = Decimal("0")
    component_count: int = 0
    components_summary: str = "0 items"
    created_at: datetime
    updated_at: datetime


class BundleListMeta(BaseModel):
    count: int


class BundleListResponse(BaseModel):
    data: List[BundleRead]
    meta: BundleListMeta
    errors: List[str] = []


class BundleResponse(BaseModel):
    data: BundleRead
    errors: List[str] = []
