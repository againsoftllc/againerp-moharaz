from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.leave_application import (
    LeaveApplicationCreate,
    LeaveApplicationDecision,
    LeaveApplicationListMeta,
    LeaveApplicationListResponse,
    LeaveApplicationRead,
    LeaveApplicationResponse,
    LeaveApplicationUpdate,
)
from app.services.hrm import leave_application_service

router = APIRouter(prefix="/leave-applications", tags=["hrm-leave-applications"])


@router.get("", response_model=LeaveApplicationListResponse)
def list_leave_applications(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|approved|rejected)$"
    ),
    leave_type_id: Optional[str] = Query(default=None),
) -> LeaveApplicationListResponse:
    rows, total = leave_application_service.list_leave_applications(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        status=status,
        leave_type_id=leave_type_id,
    )
    data = [LeaveApplicationRead.model_validate(r) for r in rows]
    return LeaveApplicationListResponse(
        data=data,
        meta=LeaveApplicationListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{application_id}", response_model=LeaveApplicationResponse)
def get_leave_application(
    application_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveApplicationResponse:
    row = leave_application_service.get_leave_application(
        db, application_id, company_id=company_id
    )
    return LeaveApplicationResponse(data=LeaveApplicationRead.model_validate(row))


@router.post("", response_model=LeaveApplicationResponse, status_code=201)
def create_leave_application(
    payload: LeaveApplicationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveApplicationResponse:
    payload.company_id = company_id
    row = leave_application_service.create_leave_application(
        db, payload, created_by=user.id
    )
    return LeaveApplicationResponse(data=LeaveApplicationRead.model_validate(row))


@router.patch("/{application_id}", response_model=LeaveApplicationResponse)
def update_leave_application(
    application_id: str,
    payload: LeaveApplicationUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveApplicationResponse:
    row = leave_application_service.update_leave_application(
        db, application_id, payload, company_id=company_id
    )
    return LeaveApplicationResponse(data=LeaveApplicationRead.model_validate(row))


@router.post("/{application_id}/approve", response_model=LeaveApplicationResponse)
def approve_leave_application(
    application_id: str,
    payload: LeaveApplicationDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveApplicationResponse:
    row = leave_application_service.decide_leave_application(
        db,
        application_id,
        company_id=company_id,
        decision="approved",
        payload=payload,
        decided_by=user.id,
    )
    return LeaveApplicationResponse(data=LeaveApplicationRead.model_validate(row))


@router.post("/{application_id}/reject", response_model=LeaveApplicationResponse)
def reject_leave_application(
    application_id: str,
    payload: LeaveApplicationDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveApplicationResponse:
    row = leave_application_service.decide_leave_application(
        db,
        application_id,
        company_id=company_id,
        decision="rejected",
        payload=payload,
        decided_by=user.id,
    )
    return LeaveApplicationResponse(data=LeaveApplicationRead.model_validate(row))


@router.delete("/{application_id}", status_code=204)
def delete_leave_application(
    application_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    leave_application_service.delete_leave_application(
        db, application_id, company_id=company_id
    )
    return Response(status_code=204)
