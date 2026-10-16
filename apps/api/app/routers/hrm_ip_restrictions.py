from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.ip_restriction import (
    IpRestrictionCreate,
    IpRestrictionListResponse,
    IpRestrictionRead,
    IpRestrictionResponse,
    IpRestrictionUpdate,
)
from app.services.hrm import ip_restriction_service as svc

router = APIRouter(prefix="/ip-restrictions", tags=["hrm-ip-restrictions"])


@router.get("", response_model=IpRestrictionListResponse)
def list_ip_restrictions(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_ip_restrictions(db, company_id=company_id, q=q)
    data = [IpRestrictionRead.model_validate(r) for r in rows]
    return IpRestrictionListResponse(data=data, meta={"count": len(data)})


@router.post("", response_model=IpRestrictionResponse, status_code=201)
def create_ip_restriction(
    payload: IpRestrictionCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_ip_restriction(db, payload, created_by=user.id)
    return IpRestrictionResponse(data=IpRestrictionRead.model_validate(row))


@router.patch("/{restriction_id}", response_model=IpRestrictionResponse)
def update_ip_restriction(
    restriction_id: str,
    payload: IpRestrictionUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_ip_restriction(
        db, restriction_id, payload, company_id=company_id
    )
    return IpRestrictionResponse(data=IpRestrictionRead.model_validate(row))


@router.delete("/{restriction_id}", status_code=204)
def delete_ip_restriction(
    restriction_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_ip_restriction(db, restriction_id, company_id=company_id)
    return Response(status_code=204)
