from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OfferTemplateCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    template_content: Optional[str] = None
    variables: Optional[List[str]] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class OfferTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    template_content: Optional[str] = None
    variables: Optional[List[str]] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class OfferTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    template_content: Optional[str] = None
    variables: Optional[List[str]] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OfferTemplateListMeta(BaseModel):
    count: int


class OfferTemplateListResponse(BaseModel):
    data: List[OfferTemplateRead]
    meta: OfferTemplateListMeta
    errors: List[str] = []


class OfferTemplateResponse(BaseModel):
    data: OfferTemplateRead
    errors: List[str] = []
