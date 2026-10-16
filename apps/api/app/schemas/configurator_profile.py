from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ConfiguratorProfileType = Literal[
    "pc_builder",
    "laptop_builder",
    "cctv_builder",
    "networking_builder",
    "server_builder",
    "solar_builder",
    "custom",
]

ConfiguratorStatus = Literal["active", "draft", "archived"]


class ConfiguratorProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    profile_type: ConfiguratorProfileType = "custom"
    description: Optional[str] = None
    is_default: bool = False
    status: ConfiguratorStatus = "draft"


class ConfiguratorProfileCreate(ConfiguratorProfileBase):
    pass


class ConfiguratorProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    profile_type: Optional[ConfiguratorProfileType] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[ConfiguratorStatus] = None


class ConfiguratorProfileRead(ConfiguratorProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    category_count: int = 0
    rule_count: int = 0
    template_count: int = 0
    build_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConfiguratorProfileListMeta(BaseModel):
    count: int


class ConfiguratorProfileListResponse(BaseModel):
    data: List[ConfiguratorProfileRead]
    meta: ConfiguratorProfileListMeta
    errors: List[str] = []


class ConfiguratorProfileResponse(BaseModel):
    data: ConfiguratorProfileRead
    errors: List[str] = []


class ConfiguratorProfileBulkStatusRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    status: ConfiguratorStatus
