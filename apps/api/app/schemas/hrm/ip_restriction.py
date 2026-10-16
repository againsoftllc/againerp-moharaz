from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class IpRestrictionCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    ip_address: str = Field(min_length=1, max_length=64)


class IpRestrictionUpdate(BaseModel):
    ip_address: Optional[str] = Field(default=None, min_length=1, max_length=64)


class IpRestrictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    ip_address: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IpRestrictionListResponse(BaseModel):
    data: List[IpRestrictionRead]
    meta: dict
    errors: List[str] = []


class IpRestrictionResponse(BaseModel):
    data: IpRestrictionRead
    errors: List[str] = []
