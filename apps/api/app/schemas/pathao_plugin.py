from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class PathaoPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    environment: Literal["sandbox", "production"]
    client_id: str
    client_id_set: bool
    client_id_hint: str
    client_secret_set: bool
    username: str
    password_set: bool
    store_id: str
    pickup_address: str
    pickup_phone: str
    default_service: str
    item_type: str
    auto_create_shipment: bool
    sync_tracking: bool
    cod_enabled: bool
    webhook_url: str
    connection_status: str
    connection_message: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class PathaoPluginResponse(BaseModel):
    data: PathaoPluginRead


class PathaoPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    store_id: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_phone: Optional[str] = None
    default_service: Optional[str] = None
    item_type: Optional[str] = None
    auto_create_shipment: Optional[bool] = None
    sync_tracking: Optional[bool] = None
    cod_enabled: Optional[bool] = None
    webhook_url: Optional[str] = None
    verify_connection: bool = False
