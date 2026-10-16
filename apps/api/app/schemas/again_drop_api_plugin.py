from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AgainDropApiPluginRead(BaseModel):
    id: str
    installed: bool
    enabled: bool
    base_url: str
    api_key_set: bool
    api_key_hint: str
    use_server_key: bool
    server_key_available: bool
    environment: Literal["sandbox", "production"]
    timeout_ms: int
    retry_count: int
    default_platform: Literal["taobao", "alibaba"]
    default_lang: str
    connection_status: str
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AgainDropApiPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    use_server_key: Optional[bool] = None
    environment: Optional[Literal["sandbox", "production"]] = None
    timeout_ms: Optional[int] = Field(default=None, ge=1000, le=120000)
    retry_count: Optional[int] = Field(default=None, ge=0, le=5)
    default_platform: Optional[Literal["taobao", "alibaba"]] = None
    default_lang: Optional[str] = None


class AgainDropApiPluginResponse(BaseModel):
    data: AgainDropApiPluginRead


class AgainDropApiTestResult(BaseModel):
    ok: bool
    message: str
    latency_ms: int
    via: Literal["server", "plugin"]
    sample_count: int = 0


class AgainDropApiTestResponse(BaseModel):
    data: AgainDropApiTestResult
    plugin: AgainDropApiPluginRead
