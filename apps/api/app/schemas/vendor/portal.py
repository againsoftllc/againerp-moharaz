from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PortalLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class VendorUserRead(BaseModel):
    id: str
    email: str
    name: str
    phone: str
    role: str
    vendor_id: str
    vendor_name: Optional[str] = None
    is_active: bool
    accepted_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime


class VendorPortalSessionResponse(BaseModel):
    token: str
    expires_at: datetime
    user: VendorUserRead
    permissions: List[str]


class VendorPortalMeResponse(BaseModel):
    data: VendorUserRead
    permissions: List[str]
    # Company localisation so portal screens format money/dates like the ERP.
    company_format: Dict[str, Any] = Field(default_factory=dict)


class VendorPortalAcceptInviteRequest(BaseModel):
    token: str = Field(min_length=10, max_length=128)
    password: str = Field(min_length=8, max_length=200)


class VendorPortalChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class OkResponse(BaseModel):
    ok: bool = True


# ------------------------------------------------------ admin-side management


class VendorUserInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(default="", max_length=255)
    role: str = Field(default="staff", max_length=30)


class VendorUserAdminRead(VendorUserRead):
    has_password: bool
    invite_pending: bool
    invite_expires_at: Optional[datetime] = None
    invite_token: Optional[str] = None


class VendorUserListResponse(BaseModel):
    data: List[VendorUserAdminRead]


class VendorUserResponse(BaseModel):
    data: VendorUserAdminRead
