from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RoleSummary(BaseModel):
    id: str
    name: str
    slug: str


class UserRead(BaseModel):
    id: str
    email: str
    username: str
    name: str
    role: str
    is_active: bool
    role_ids: List[str] = Field(default_factory=list)
    roles: List[RoleSummary] = Field(default_factory=list)
    # Warehouses the user may work in; empty = every warehouse.
    warehouse_ids: List[str] = Field(default_factory=list)
    default_warehouse_id: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    company_slug: Optional[str] = None


class UserListMeta(BaseModel):
    count: int


class UserListResponse(BaseModel):
    data: List[UserRead]
    meta: UserListMeta


class MentionableUserRead(BaseModel):
    id: str
    username: str
    name: str
    role: str


class MentionableUserListResponse(BaseModel):
    data: List[MentionableUserRead]


class UserResponse(BaseModel):
    data: UserRead


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    name: str = Field(min_length=1, max_length=255)
    role: Optional[str] = Field(default=None)  # legacy single role slug/label
    role_ids: Optional[List[str]] = None
    warehouse_ids: Optional[List[str]] = None
    default_warehouse_id: Optional[str] = None
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    email: Optional[str] = Field(default=None, min_length=3, max_length=255)
    name: Optional[str] = None
    username: Optional[str] = Field(default=None, min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    role: Optional[str] = None
    role_ids: Optional[List[str]] = None
    warehouse_ids: Optional[List[str]] = None
    default_warehouse_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime
    user: UserRead
    permissions: Dict[str, List[str]] = Field(default_factory=dict)
    enabled_modules: Optional[List[str]] = None


class MeResponse(BaseModel):
    data: UserRead
    permissions: Dict[str, List[str]] = Field(default_factory=dict)
    enabled_modules: Optional[List[str]] = None


class LogoutResponse(BaseModel):
    ok: bool = True
