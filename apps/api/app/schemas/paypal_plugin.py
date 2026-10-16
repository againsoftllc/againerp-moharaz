from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel


class PaypalPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    client_id: str
    client_id_set: bool
    client_id_hint: str
    client_secret_set: bool
    currency: str
    bdt_per_usd: Decimal
    checkout_enabled: bool
    connection_status: str
    connection_message: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class PaypalPluginResponse(BaseModel):
    data: PaypalPluginRead


class PaypalPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    currency: Optional[str] = None
    bdt_per_usd: Optional[Decimal] = None
    checkout_enabled: Optional[bool] = None
    verify_connection: bool = False
