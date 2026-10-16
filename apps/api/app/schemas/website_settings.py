from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WebsiteSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    site_name: str
    tagline: str
    logo_url: str
    logo_mobile_url: str
    favicon_url: str
    address: str
    contact_phone: str
    contact_email: str
    whatsapp_number: str
    copyright_text: str
    created_at: datetime
    updated_at: datetime


class WebsiteSettingsUpdate(BaseModel):
    site_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    tagline: Optional[str] = Field(default=None, max_length=255)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    logo_mobile_url: Optional[str] = Field(default=None, max_length=500)
    favicon_url: Optional[str] = Field(default=None, max_length=500)
    address: Optional[str] = None
    contact_phone: Optional[str] = Field(default=None, max_length=50)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    whatsapp_number: Optional[str] = Field(default=None, max_length=50)
    copyright_text: Optional[str] = Field(default=None, max_length=255)


class WebsiteSettingsResponse(BaseModel):
    data: WebsiteSettingsRead
    errors: List[str] = []
