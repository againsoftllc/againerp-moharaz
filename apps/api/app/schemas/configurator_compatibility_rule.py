from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CompatibilityRuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: Optional[str] = Field(default=None, max_length=255)
    configurator_profile_id: str = Field(min_length=1, max_length=64)
    configurator_profile_name: str = Field(default="Builder", max_length=255)
    description: Optional[str] = None
    priority: int = Field(default=10, ge=0)
    active: bool = True
    body: Dict[str, Any] = Field(default_factory=dict)


class CompatibilityRuleCreate(CompatibilityRuleBase):
    pass


class CompatibilityRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    code: Optional[str] = Field(default=None, max_length=255)
    configurator_profile_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    configurator_profile_name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=0)
    active: Optional[bool] = None
    body: Optional[Dict[str, Any]] = None


class CompatibilityRuleRead(BaseModel):
    id: str
    company_id: str
    name: str
    code: str
    configurator_profile_id: str
    configurator_profile_name: str
    description: Optional[str] = None
    priority: int
    active: bool
    body: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class CompatibilityRuleListMeta(BaseModel):
    count: int


class CompatibilityRuleListResponse(BaseModel):
    data: List[CompatibilityRuleRead]
    meta: CompatibilityRuleListMeta
    errors: List[str] = []


class CompatibilityRuleResponse(BaseModel):
    data: CompatibilityRuleRead
    errors: List[str] = []
