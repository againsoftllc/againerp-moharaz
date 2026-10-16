from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.attendance_policy import (
    AttendancePolicyCreate,
    AttendancePolicyListMeta,
    AttendancePolicyListResponse,
    AttendancePolicyRead,
    AttendancePolicyResponse,
    AttendancePolicyUpdate,
)
from app.services.hrm import attendance_policy_service

router = APIRouter(prefix="/attendance-policies", tags=["hrm-attendance-policies"])


@router.get("", response_model=AttendancePolicyListResponse)
def list_attendance_policies(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> AttendancePolicyListResponse:
    rows = attendance_policy_service.list_attendance_policies(
        db, company_id=company_id, status=status, q=q
    )
    data = [AttendancePolicyRead.model_validate(r) for r in rows]
    return AttendancePolicyListResponse(
        data=data, meta=AttendancePolicyListMeta(count=len(data))
    )


@router.get("/{policy_id}", response_model=AttendancePolicyResponse)
def get_attendance_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> AttendancePolicyResponse:
    row = attendance_policy_service.get_attendance_policy(
        db, policy_id, company_id=company_id
    )
    return AttendancePolicyResponse(data=AttendancePolicyRead.model_validate(row))


@router.post("", response_model=AttendancePolicyResponse, status_code=201)
def create_attendance_policy(
    payload: AttendancePolicyCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> AttendancePolicyResponse:
    row = attendance_policy_service.create_attendance_policy(
        db, payload, created_by=user.id
    )
    return AttendancePolicyResponse(data=AttendancePolicyRead.model_validate(row))


@router.patch("/{policy_id}", response_model=AttendancePolicyResponse)
def update_attendance_policy(
    policy_id: str,
    payload: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AttendancePolicyResponse:
    row = attendance_policy_service.update_attendance_policy(
        db, policy_id, payload, company_id=company_id
    )
    return AttendancePolicyResponse(data=AttendancePolicyRead.model_validate(row))


@router.delete("/{policy_id}", status_code=204)
def delete_attendance_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    attendance_policy_service.delete_attendance_policy(
        db, policy_id, company_id=company_id
    )
    return Response(status_code=204)
