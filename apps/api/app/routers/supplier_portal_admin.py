"""Admin-side management of supplier portal accounts."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.supplier_user import SupplierUser
from app.schemas.supplier.portal import (
    PortalInviteRequest,
    PortalUserAdminRead,
    PortalUserListResponse,
    PortalUserResponse,
)
from app.services.supplier import supplier_auth_service, supplier_service

router = APIRouter(prefix="/suppliers/{supplier_id}/portal-users", tags=["supplier-portal-admin"])


def _admin_read(
    db: Session, user: SupplierUser, *, include_token: bool = False
) -> PortalUserAdminRead:
    supplier = db.get(CommerceSupplier, user.supplier_id)
    return PortalUserAdminRead(
        id=user.id,
        email=user.email,
        name=user.name,
        supplier_id=user.supplier_id,
        supplier_name=supplier.name if supplier else None,
        is_active=user.is_active,
        accepted_at=user.accepted_at,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        has_password=bool(user.password_hash),
        invite_pending=bool(user.invite_token),
        invite_expires_at=user.invite_expires_at,
        invite_token=user.invite_token if include_token else None,
    )


@router.get("", response_model=PortalUserListResponse)
def list_portal_users(
    supplier_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PortalUserListResponse:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    rows = supplier_auth_service.list_users(db, supplier_id)
    return PortalUserListResponse(data=[_admin_read(db, r) for r in rows])


@router.post("", response_model=PortalUserResponse, status_code=201)
def invite_portal_user(
    supplier_id: str,
    payload: PortalInviteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PortalUserResponse:
    """Creates the invite and returns its token once.

    There is no email sender in this deployment, so the buyer copies the link
    to the supplier themselves.
    """
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    row = supplier_auth_service.invite_user(
        db,
        supplier_id=supplier_id,
        email=payload.email,
        name=payload.name,
        company_id=company_id,
        invited_by=user.id,
    )
    return PortalUserResponse(data=_admin_read(db, row, include_token=True))


@router.delete("/{portal_user_id}", response_model=PortalUserResponse)
def revoke_portal_user(
    supplier_id: str,
    portal_user_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> PortalUserResponse:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    row = supplier_auth_service.revoke_access(
        db, supplier_user_id=portal_user_id, supplier_id=supplier_id
    )
    return PortalUserResponse(data=_admin_read(db, row))
