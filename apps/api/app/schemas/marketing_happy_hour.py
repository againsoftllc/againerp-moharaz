from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


HappyHourStatus = Literal["draft", "scheduled", "running", "ended", "disabled"]


class HappyHourDealInput(BaseModel):
    product_slug: str = Field(..., min_length=1, max_length=200)
    offer_price: float = Field(..., gt=0)
    note: Optional[str] = Field(default=None, max_length=255)
    sort_order: int = 0


class HappyHourDealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_slug: str
    offer_price: float
    note: Optional[str] = None
    sort_order: int


class HappyHourSectionInput(BaseModel):
    key: Optional[str] = Field(default=None, max_length=120)
    label: str = Field(..., min_length=1, max_length=160)
    sort_order: int = 0
    deals: List[HappyHourDealInput] = []


class HappyHourSectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    label: str
    sort_order: int
    deals: List[HappyHourDealRead] = []


class HappyHourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    slug: str
    title: str
    subtitle: Optional[str] = None
    description: str
    outlet_label: str
    starts_at: datetime
    ends_at: datetime
    daily_start_hour: int
    daily_end_hour: int
    status: str
    terms: List[str] = []
    sort_order: int
    sections: List[HappyHourSectionRead] = []
    created_at: datetime
    updated_at: datetime


class HappyHourListMeta(BaseModel):
    count: int


class HappyHourListResponse(BaseModel):
    data: List[HappyHourRead]
    meta: HappyHourListMeta


class HappyHourResponse(BaseModel):
    data: HappyHourRead


class HappyHourCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=160)
    title: str = Field(..., min_length=1, max_length=255)
    subtitle: Optional[str] = Field(default=None, max_length=255)
    description: str = ""
    outlet_label: str = Field(default="Online Only", max_length=120)
    starts_at: datetime
    ends_at: datetime
    daily_start_hour: int = Field(default=22, ge=0, le=24)
    daily_end_hour: int = Field(default=24, ge=0, le=24)
    status: HappyHourStatus = "draft"
    terms: List[str] = []
    sort_order: int = 0
    sections: List[HappyHourSectionInput] = []


class HappyHourUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=1, max_length=160)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subtitle: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    outlet_label: Optional[str] = Field(default=None, max_length=120)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    daily_start_hour: Optional[int] = Field(default=None, ge=0, le=24)
    daily_end_hour: Optional[int] = Field(default=None, ge=0, le=24)
    status: Optional[HappyHourStatus] = None
    terms: Optional[List[str]] = None
    sort_order: Optional[int] = None
    sections: Optional[List[HappyHourSectionInput]] = None
