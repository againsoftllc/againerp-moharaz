from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RoleSummary(BaseModel):
    id: str
    name: str
    slug: str


class PermissionOverride(BaseModel):
    module: str = Field(min_length=1, max_length=50)
    action: str = Field(min_length=1, max_length=20)
    allow: bool


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
    # Sign-in security (services/core/auth_security.py)
    must_change_password: bool = False
    password_change_due: bool = False
    password_changed_at: Optional[datetime] = None
    password_expires_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    locked_until: Optional[datetime] = None
    # Beyond the roles (services/core/access_scope.py)
    permission_overrides: List[PermissionOverride] = Field(default_factory=list)
    # Cash / bank accounts the user may use; empty = every account.
    payment_account_ids: List[str] = Field(default_factory=list)


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
    # the member sets their own password at the first sign-in
    must_change_password: bool = False
    payment_account_ids: Optional[List[str]] = None


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
    must_change_password: Optional[bool] = None
    # replace-all: every override the user should have after the save
    permission_overrides: Optional[List[PermissionOverride]] = None
    payment_account_ids: Optional[List[str]] = None


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


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class SessionRead(BaseModel):
    id: str
    device: str
    ip: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    current: bool = False


class SessionListResponse(BaseModel):
    data: List[SessionRead]


class PermissionModuleRow(BaseModel):
    id: str
    label: str
    group: str = ""
    enabled: bool = True  # the company has this module
    from_roles: List[str] = Field(default_factory=list)
    effective: List[str] = Field(default_factory=list)


class UserPermissionsRead(BaseModel):
    actions: List[str]
    system_manager: bool
    modules: List[PermissionModuleRow]
    overrides: List[PermissionOverride]


class UserPermissionsResponse(BaseModel):
    data: UserPermissionsRead
