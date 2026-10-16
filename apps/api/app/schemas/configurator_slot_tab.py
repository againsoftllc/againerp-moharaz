from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ConfiguratorSlotTabBase(BaseModel):
    profile_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    sort_order: int = 0


class ConfiguratorSlotTabCreate(ConfiguratorSlotTabBase):
    pass


class ConfiguratorSlotTabUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    sort_order: Optional[int] = None


class ConfiguratorSlotTabRead(ConfiguratorSlotTabBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    slot_count: int = 0
    created_at: datetime


class ConfiguratorSlotTabListResponse(BaseModel):
    data: List[ConfiguratorSlotTabRead]
    meta: dict


class ConfiguratorSlotTabResponse(BaseModel):
    data: ConfiguratorSlotTabRead
