from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AwardCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    award_type_id: str = Field(min_length=1, max_length=36)
    award_date: date
    gift: Optional[str] = Field(default=None, max_length=50)
    monetary_value: Optional[Decimal] = None
    description: Optional[str] = None
    certificate: Optional[str] = Field(default=None, max_length=50)
    photo: Optional[str] = Field(default=None, max_length=50)


class AwardUpdate(BaseModel):
    employee_id: Optional[str] = Field(default=None, max_length=36)
    award_type_id: Optional[str] = Field(default=None, max_length=36)
    award_date: Optional[date] = None
    gift: Optional[str] = Field(default=None, max_length=50)
    monetary_value: Optional[Decimal] = None
    description: Optional[str] = None
    certificate: Optional[str] = Field(default=None, max_length=50)
    photo: Optional[str] = Field(default=None, max_length=50)


class AwardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    award_type_id: Optional[str] = None
    award_date: Optional[date] = None
    gift: Optional[str] = None
    monetary_value: Optional[Decimal] = None
    description: Optional[str] = None
    certificate: Optional[str] = None
    photo: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AwardListMeta(BaseModel):
    count: int


class AwardListResponse(BaseModel):
    data: List[AwardRead]
    meta: AwardListMeta
    errors: List[str] = []


class AwardResponse(BaseModel):
    data: AwardRead
    errors: List[str] = []
