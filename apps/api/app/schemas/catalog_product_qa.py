from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProductQaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    question_number: str
    product_id: str
    product_name: str
    product_sku: str
    product_brand: Optional[str] = None
    product_category: Optional[str] = None
    product_image_url: Optional[str] = None
    customer_name: str
    question: str
    answer: Optional[str] = None
    answered_by: Optional[str] = None
    status: str
    is_verified: bool
    created_at: datetime
    updated_at: datetime


class ProductQaListMeta(BaseModel):
    count: int
    pending_count: int


class ProductQaListResponse(BaseModel):
    data: List[ProductQaRead]
    meta: ProductQaListMeta


class ProductQaResponse(BaseModel):
    data: ProductQaRead


class ProductQaCreate(BaseModel):
    product_id: str
    customer_name: str = Field(min_length=1, max_length=255)
    question: str = Field(min_length=1)
    answer: Optional[str] = None
    answered_by: Optional[str] = None
    status: str = "pending"
    is_verified: bool = False


class ProductQaUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    question: Optional[str] = Field(default=None, min_length=1)
    answer: Optional[str] = None
    answered_by: Optional[str] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = None
