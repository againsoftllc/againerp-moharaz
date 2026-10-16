from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OfferCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    candidate_id: str = Field(min_length=1, max_length=36)
    job_id: Optional[str] = Field(default=None, max_length=36)
    offer_date: Optional[Date] = None
    position: Optional[str] = Field(default=None, max_length=50)
    department_id: Optional[str] = Field(default=None, max_length=36)
    salary: Decimal = Field(ge=Decimal("0"))
    bonus: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    equity: Optional[str] = Field(default=None, max_length=50)
    benefits: Optional[str] = None
    start_date: Optional[Date] = None
    expiration_date: Optional[Date] = None
    offer_letter_path: Optional[str] = None

    @model_validator(mode="after")
    def validate_dates(self) -> OfferCreate:
        if (
            self.start_date
            and self.expiration_date
            and self.expiration_date < self.start_date
        ):
            raise ValueError("expiration_date must be >= start_date")
        return self


class OfferUpdate(BaseModel):
    position: Optional[str] = Field(default=None, max_length=50)
    department_id: Optional[str] = Field(default=None, max_length=36)
    salary: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    bonus: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    equity: Optional[str] = Field(default=None, max_length=50)
    benefits: Optional[str] = None
    start_date: Optional[Date] = None
    expiration_date: Optional[Date] = None
    offer_letter_path: Optional[str] = None


class OfferDecline(BaseModel):
    decline_reason: Optional[str] = None


class OfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    offer_date: Optional[Date] = None
    position: Optional[str] = None
    department_id: Optional[str] = None
    salary: Decimal
    bonus: Optional[Decimal] = None
    equity: Optional[str] = None
    benefits: Optional[str] = None
    start_date: Optional[Date] = None
    expiration_date: Optional[Date] = None
    offer_letter_path: Optional[str] = None
    status: str
    response_date: Optional[Date] = None
    decline_reason: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OfferListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class OfferListResponse(BaseModel):
    data: List[OfferRead]
    meta: OfferListMeta
    errors: List[str] = []


class OfferResponse(BaseModel):
    data: OfferRead
    errors: List[str] = []
