"""Vendor-facing portal API.

Every endpoint below is scoped by `identity.vendor_id`, which comes from the
session row. No endpoint accepts a vendor id from the client. Mirrors
app.routers.portal (the supplier portal) structurally.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.company_format import company_format_dict
from app.deps.vendor_portal_auth import VendorIdentity, require_vendor_user
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_user import VendorUser
from app.schemas.vendor.portal import (
    OkResponse,
    PortalLoginRequest,
    VendorPortalAcceptInviteRequest,
    VendorPortalChangePasswordRequest,
    VendorPortalMeResponse,
    VendorPortalSessionResponse,
    VendorUserRead,
)
from app.services.vendor import vendor_auth_service
from modules.vendor.permissions.permissions import permissions_for_role

router = APIRouter(prefix="/vendor-portal", tags=["vendor-portal"])


def _user_read(db: Session, user: VendorUser) -> VendorUserRead:
    vendor = db.get(Vendor, user.vendor_id)
    return VendorUserRead(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        vendor_id=user.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
        is_active=user.is_active,
        accepted_at=user.accepted_at,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


@router.post("/auth/login", response_model=VendorPortalSessionResponse)
def login(payload: PortalLoginRequest, db: Session = Depends(get_db)) -> VendorPortalSessionResponse:
    user, session = vendor_auth_service.login(db, email=payload.email, password=payload.password)
    return VendorPortalSessionResponse(
        token=session.token,
        expires_at=session.expires_at,
        user=_user_read(db, user),
        permissions=sorted(permissions_for_role(user.role)),
    )


@router.post("/auth/accept-invite", response_model=VendorPortalSessionResponse)
def accept_invite(
    payload: VendorPortalAcceptInviteRequest, db: Session = Depends(get_db)
) -> VendorPortalSessionResponse:
    user, session = vendor_auth_service.accept_invite(db, token=payload.token, password=payload.password)
    return VendorPortalSessionResponse(
        token=session.token,
        expires_at=session.expires_at,
        user=_user_read(db, user),
        permissions=sorted(permissions_for_role(user.role)),
    )


@router.get("/auth/me", response_model=VendorPortalMeResponse)
def me(
    identity: VendorIdentity = Depends(require_vendor_user), db: Session = Depends(get_db)
) -> VendorPortalMeResponse:
    return VendorPortalMeResponse(
        data=_user_read(db, identity.user),
        permissions=sorted(permissions_for_role(identity.user.role)),
        company_format=company_format_dict(db),
    )


@router.post("/auth/logout", response_model=OkResponse)
def logout(
    identity: VendorIdentity = Depends(require_vendor_user), db: Session = Depends(get_db)
) -> OkResponse:
    vendor_auth_service.logout(db, identity.session.token)
    return OkResponse()


@router.post("/auth/password", response_model=OkResponse)
def change_password(
    payload: VendorPortalChangePasswordRequest,
    identity: VendorIdentity = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> OkResponse:
    vendor_auth_service.change_password(
        db, identity.user, current=payload.current_password, new=payload.new_password
    )
    return OkResponse()
