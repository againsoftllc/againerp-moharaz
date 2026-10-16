from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.configurator_template import BuildComponentPick

BuildStatus = Literal["draft", "saved", "ordered", "abandoned"]
CompatibilityStatus = Literal["compatible", "warning", "incompatible"]


class ConfiguratorBuildRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    profile_id: str
    profile_name: str = ""
    name: str
    build_code: str
    customer_name: Optional[str] = None
    user_name: Optional[str] = None
    components: List[BuildComponentPick] = []
    total_price: Decimal = Decimal("0")
    compatibility_status: CompatibilityStatus = "compatible"
    status: BuildStatus = "draft"
    created_at: datetime
    updated_at: datetime


class ConfiguratorBuildUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    status: Optional[BuildStatus] = None
    compatibility_status: Optional[CompatibilityStatus] = None


class ConfiguratorBuildListMeta(BaseModel):
    count: int


class ConfiguratorBuildListResponse(BaseModel):
    data: List[ConfiguratorBuildRead]
    meta: ConfiguratorBuildListMeta
    errors: List[str] = []


class ConfiguratorBuildResponse(BaseModel):
    data: ConfiguratorBuildRead
    errors: List[str] = []


class ConfiguratorBuildBulkStatusRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    status: BuildStatus
