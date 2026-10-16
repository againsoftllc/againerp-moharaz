from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.leave_policy import (
    LeavePolicyCreate,
    LeavePolicyListMeta,
    LeavePolicyListResponse,
    LeavePolicyRead,
    LeavePolicyResponse,
    LeavePolicyUpdate,
)
from app.services.hrm import leave_policy_service

router = APIRouter(prefix="/leave-policies", tags=["hrm-leave-policies"])


@router.get("", response_model=LeavePolicyListResponse)
def list_leave_policies(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    leave_type_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> LeavePolicyListResponse:
    rows = leave_policy_service.list_leave_policies(
        db,
        company_id=company_id,
        leave_type_id=leave_type_id,
        status=status,
        q=q,
    )
    data = [LeavePolicyRead.model_validate(r) for r in rows]
    return LeavePolicyListResponse(data=data, meta=LeavePolicyListMeta(count=len(data)))


@router.get("/{leave_policy_id}", response_model=LeavePolicyResponse)
def get_leave_policy(
    leave_policy_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LeavePolicyResponse:
    row = leave_policy_service.get_leave_policy(
        db, leave_policy_id, company_id=company_id
    )
    return LeavePolicyResponse(data=LeavePolicyRead.model_validate(row))


@router.post("", response_model=LeavePolicyResponse, status_code=201)
def create_leave_policy(
    payload: LeavePolicyCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> LeavePolicyResponse:
    row = leave_policy_service.create_leave_policy(db, payload, created_by=user.id)
    return LeavePolicyResponse(data=LeavePolicyRead.model_validate(row))


@router.patch("/{leave_policy_id}", response_model=LeavePolicyResponse)
def update_leave_policy(
    leave_policy_id: str,
    payload: LeavePolicyUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeavePolicyResponse:
    row = leave_policy_service.update_leave_policy(
        db, leave_policy_id, payload, company_id=company_id
    )
    return LeavePolicyResponse(data=LeavePolicyRead.model_validate(row))


@router.delete("/{leave_policy_id}", status_code=204)
def delete_leave_policy(
    leave_policy_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    leave_policy_service.delete_leave_policy(
        db, leave_policy_id, company_id=company_id
    )
    return Response(status_code=204)
