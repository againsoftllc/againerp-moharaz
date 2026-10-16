from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class SslcommerzPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    store_id: str
    store_password_set: bool
    checkout_enabled: bool
    connection_status: str
    connection_message: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class SslcommerzPluginResponse(BaseModel):
    data: SslcommerzPluginRead


class SslcommerzPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    store_id: Optional[str] = None
    store_password: Optional[str] = None
    checkout_enabled: Optional[bool] = None
    verify_connection: bool = False
