from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    is_required: bool = False
    description: Optional[str] = None


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_required: Optional[bool] = None
    description: Optional[str] = None


class DocumentTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    is_required: bool
    description: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentTypeListMeta(BaseModel):
    count: int


class DocumentTypeListResponse(BaseModel):
    data: List[DocumentTypeRead]
    meta: DocumentTypeListMeta
    errors: List[str] = []


class DocumentTypeResponse(BaseModel):
    data: DocumentTypeRead
    errors: List[str] = []
