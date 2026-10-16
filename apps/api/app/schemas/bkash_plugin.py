from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class BkashPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    username: str
    password_set: bool
    app_key_set: bool
    app_key_hint: str
    app_secret_set: bool
    checkout_enabled: bool
    auto_verify: bool
    connection_status: str
    connection_message: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class BkashPluginResponse(BaseModel):
    data: BkashPluginRead


class BkashPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    username: Optional[str] = None
    password: Optional[str] = None
    app_key: Optional[str] = None
    app_secret: Optional[str] = None
    checkout_enabled: Optional[bool] = None
    auto_verify: Optional[bool] = None
    verify_connection: bool = False
