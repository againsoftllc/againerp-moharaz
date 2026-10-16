from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class BuilderPluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    enabled_builders: List[str]
    default_profile_slug: str
    admin_builders_href: str = "/catalog/product-configurator"
    created_at: datetime
    updated_at: datetime


class BuilderPluginResponse(BaseModel):
    data: BuilderPluginRead


class BuilderPluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    enabled_builders: Optional[List[str]] = Field(default=None)
    default_profile_slug: Optional[str] = Field(default=None, max_length=100)
