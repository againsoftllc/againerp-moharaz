from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


OfferStatus = Literal["draft", "scheduled", "running", "ended", "disabled"]


class OfferSectionInput(BaseModel):
    key: Optional[str] = Field(default=None, max_length=120)
    label: str = Field(..., min_length=1, max_length=160)
    category_slug: str = Field(..., min_length=1, max_length=160)
    sort_order: int = 0


class OfferSectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    label: str
    category_slug: str
    sort_order: int


class OfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    slug: str
    title: str
    description: str
    image_url: Optional[str] = None
    outlet_label: str
    starts_at: datetime
    ends_at: datetime
    status: str
    sort_order: int
    products_limit: int = 12
    sections: List[OfferSectionRead] = []
    created_at: datetime
    updated_at: datetime


class OfferListMeta(BaseModel):
    count: int


class OfferListResponse(BaseModel):
    data: List[OfferRead]
    meta: OfferListMeta


class OfferResponse(BaseModel):
    data: OfferRead


class OfferCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=160)
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    image_url: Optional[str] = Field(default=None, max_length=500)
    outlet_label: str = Field(default="All Outlet", max_length=120)
    starts_at: datetime
    ends_at: datetime
    status: OfferStatus = "draft"
    sort_order: int = 0
    products_limit: int = Field(default=12, ge=1, le=48)
    sections: List[OfferSectionInput] = []


class OfferUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=1, max_length=160)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    outlet_label: Optional[str] = Field(default=None, max_length=120)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: Optional[OfferStatus] = None
    sort_order: Optional[int] = None
    products_limit: Optional[int] = Field(default=None, ge=1, le=48)
    sections: Optional[List[OfferSectionInput]] = None
