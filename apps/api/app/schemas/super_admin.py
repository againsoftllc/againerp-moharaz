from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.auth import UserRead


class SuperAdminLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class SuperAdminRead(BaseModel):
    id: str
    email: str
    username: str
    name: str
    is_active: bool


class SuperAdminLoginResponse(BaseModel):
    token: str
    expires_at: datetime
    user: SuperAdminRead


class SuperAdminMeResponse(BaseModel):
    data: SuperAdminRead


class SuperAdminLogoutResponse(BaseModel):
    ok: bool = True


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    status: str
    plan_id: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
    enabled_modules: Optional[List[str]] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("enabled_modules", mode="before")
    @classmethod
    def _parse_enabled_modules(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return None
        return v


class CompanyListMeta(BaseModel):
    count: int


class CompanyListResponse(BaseModel):
    data: List[CompanyRead]
    meta: CompanyListMeta


class CompanyResponse(BaseModel):
    data: CompanyRead


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    plan_id: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
    enabled_modules: Optional[List[str]] = None


class CompanySuspendRequest(BaseModel):
    reason: Optional[str] = None


class ModuleInfo(BaseModel):
    id: str
    label: str


class ModuleListResponse(BaseModel):
    data: List[ModuleInfo]


class ImpersonateResponse(BaseModel):
    token: str
    expires_at: datetime
    user: UserRead
    permissions: dict[str, List[str]] = Field(default_factory=dict)


class DashboardStats(BaseModel):
    total: int
    trialing: int
    active: int
    suspended: int
    cancelled: int


class DashboardStatsResponse(BaseModel):
    data: DashboardStats


class SubscriptionPlanRead(BaseModel):
    id: str
    slug: str
    name: str
    price_amount: float
    price_interval: str
    max_users: Optional[int] = None
    is_trial_default: bool
    is_active: bool


class SubscriptionPlanListResponse(BaseModel):
    data: List[SubscriptionPlanRead]


class SubscriptionPlanResponse(BaseModel):
    data: SubscriptionPlanRead


class SubscriptionPlanCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=255)
    price_amount: float = 0
    price_interval: str = "monthly"
    max_users: Optional[int] = None
    is_trial_default: bool = False
    is_active: bool = True


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = None
    price_amount: Optional[float] = None
    price_interval: Optional[str] = None
    max_users: Optional[int] = None
    is_trial_default: Optional[bool] = None
    is_active: Optional[bool] = None
