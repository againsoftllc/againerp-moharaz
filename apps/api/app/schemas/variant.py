from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class VariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    product_name: str
    product_sku: str
    variant_label: str
    variant_sku: str
    price: Decimal
    stock: int
    status: str
    category: str
    is_default: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class VariantListMeta(BaseModel):
    count: int


class VariantListResponse(BaseModel):
    data: List[VariantRead]
    meta: VariantListMeta
    errors: List[str] = []


class VariantResponse(BaseModel):
    data: VariantRead
    errors: List[str] = []


class VariantUpsert(BaseModel):
    id: Optional[str] = None
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(ge=0)
    purchase_price: Optional[Decimal] = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0)
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")
    is_default: bool = False
    sort_order: int = 0
    image_id: Optional[str] = None
    options_json: Optional[str] = None


class VariantBulkReplace(BaseModel):
    variants: List[VariantUpsert] = Field(default_factory=list)
