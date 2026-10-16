from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class ZktecoPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    receiver_enabled: bool
    allowed_serials: str
    raw_traffic_enabled: bool
    device_name: str
    device_serial_number: str
    firmware_version: str
    push_version: str
    server_address: str
    server_port: int
    https_enabled: bool
    connection_status: str
    connection_message: str
    last_device_seen_at: Optional[datetime]
    last_device_sn: str
    adms_base_url: str
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ZktecoPluginResponse(BaseModel):
    data: ZktecoPluginRead


class ZktecoPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    receiver_enabled: Optional[bool] = None
    allowed_serials: Optional[str] = None
    raw_traffic_enabled: Optional[bool] = None
    device_name: Optional[str] = None
    device_serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    push_version: Optional[str] = None
    server_address: Optional[str] = None
    server_port: Optional[int] = None
    https_enabled: Optional[bool] = None
    verify_connection: bool = False


class ZktecoPunchItem(BaseModel):
    id: int
    serial_number: str
    employee_code: str
    punch_time: str
    verify_mode: Optional[int] = None
    inout_mode: Optional[int] = None
    source_table: Optional[str] = None
    raw_payload: Optional[str] = None
    received_at: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    matched: bool = False


class ZktecoPunchSummary(BaseModel):
    total_punches: int
    today_punches: int
    device_count: int


class ZktecoPunchesData(BaseModel):
    items: List[ZktecoPunchItem]
    page: int
    page_size: int
    total: int
    summary: ZktecoPunchSummary


class ZktecoPunchesResponse(BaseModel):
    data: ZktecoPunchesData
