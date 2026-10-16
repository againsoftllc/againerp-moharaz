from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.configurator_profile import ConfiguratorStatus


class BuildComponentPick(BaseModel):
    category_id: str
    category_name: str
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int = 1


class ConfiguratorTemplateBase(BaseModel):
    profile_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    components: List[BuildComponentPick] = []
    is_featured: bool = False
    status: ConfiguratorStatus = "draft"


class ConfiguratorTemplateCreate(ConfiguratorTemplateBase):
    pass


class ConfiguratorTemplateUpdate(BaseModel):
    profile_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    components: Optional[List[BuildComponentPick]] = None
    is_featured: Optional[bool] = None
    status: Optional[ConfiguratorStatus] = None


class ConfiguratorTemplateRead(ConfiguratorTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    profile_name: str = ""
    use_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConfiguratorTemplateListMeta(BaseModel):
    count: int


class ConfiguratorTemplateListResponse(BaseModel):
    data: List[ConfiguratorTemplateRead]
    meta: ConfiguratorTemplateListMeta
    errors: List[str] = []


class ConfiguratorTemplateResponse(BaseModel):
    data: ConfiguratorTemplateRead
    errors: List[str] = []


class ConfiguratorTemplateBulkStatusRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    status: ConfiguratorStatus
