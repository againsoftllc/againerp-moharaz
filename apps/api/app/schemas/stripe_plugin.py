from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel


class StripePluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    publishable_key: str
    publishable_key_set: bool
    publishable_key_hint: str
    secret_key_set: bool
    currency: str
    bdt_per_usd: Decimal
    checkout_enabled: bool
    connection_status: str
    connection_message: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class StripePluginResponse(BaseModel):
    data: StripePluginRead


class StripePluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    publishable_key: Optional[str] = None
    secret_key: Optional[str] = None
    currency: Optional[str] = None
    bdt_per_usd: Optional[Decimal] = None
    checkout_enabled: Optional[bool] = None
    verify_connection: bool = False
