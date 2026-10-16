from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SmartPcBuilderPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime


class SmartPcBuilderPluginResponse(BaseModel):
    data: SmartPcBuilderPluginRead


class SmartPcBuilderPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
