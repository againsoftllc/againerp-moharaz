from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


SmsProviderId = Literal["bulksms-bd", "ssl-wireless", "zaman-it", "alpha-sms"]


class SmsGatewayPluginRead(BaseModel):
    id: str
    provider: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    api_key_set: bool = False
    api_key_hint: str = ""
    # the saved key, for the admin's show / hide toggle (this router is admin-only)
    api_key: str = ""
    api_secret_set: bool = False
    sender_id: str = ""
    base_url: str = ""
    connection_status: str = "disconnected"
    connection_message: str = ""
    verified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SmsGatewayPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    sender_id: Optional[str] = None
    base_url: Optional[str] = None
    verify_connection: bool = False
    test_phone: Optional[str] = Field(default=None, max_length=20)


class SmsGatewayPluginResponse(BaseModel):
    data: SmsGatewayPluginRead


class SmsGatewayTestRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
    message: Optional[str] = Field(default=None, max_length=500)


class SmsGatewayTestResponse(BaseModel):
    ok: bool
    message: str
