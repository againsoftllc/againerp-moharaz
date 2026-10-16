from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class WebsiteBuilderDocumentRead(BaseModel):
    page_id: str
    company_id: str
    document: Dict[str, Any]
    version: int
    updated_by: str
    created_at: datetime
    updated_at: datetime


class WebsiteBuilderDocumentSave(BaseModel):
    document: Dict[str, Any] = Field(default_factory=dict)
    updated_by: str = Field(default="Admin", max_length=120)


class WebsiteBuilderDocumentResponse(BaseModel):
    data: WebsiteBuilderDocumentRead
    errors: List[str] = []
