from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.attendance_regularization import (
    AttendanceRegularizationCreate,
    AttendanceRegularizationDecision,
    AttendanceRegularizationListMeta,
    AttendanceRegularizationListResponse,
    AttendanceRegularizationRead,
    AttendanceRegularizationResponse,
    AttendanceRegularizationUpdate,
)
from app.services.hrm import attendance_regularization_service

router = APIRouter(
    prefix="/attendance-regularizations", tags=["hrm-attendance-regularizations"]
)


@router.get("", response_model=AttendanceRegularizationListResponse)
def list_regularizations(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|approved|rejected)$"
    ),
) -> AttendanceRegularizationListResponse:
    rows, total = attendance_regularization_service.list_regularizations(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        status=status,
    )
    data = [AttendanceRegularizationRead.model_validate(r) for r in rows]
    return AttendanceRegularizationListResponse(
        data=data,
        meta=AttendanceRegularizationListMeta(
            count=total, page=page, per_page=per_page
        ),
    )


@router.get("/{regularization_id}", response_model=AttendanceRegularizationResponse)
def get_regularization(
    regularization_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRegularizationResponse:
    row = attendance_regularization_service.get_regularization(
        db, regularization_id, company_id=company_id
    )
    return AttendanceRegularizationResponse(
        data=AttendanceRegularizationRead.model_validate(row)
    )


@router.post("", response_model=AttendanceRegularizationResponse, status_code=201)
def create_regularization(
    payload: AttendanceRegularizationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> AttendanceRegularizationResponse:
    row = attendance_regularization_service.create_regularization(
        db, payload, created_by=user.id
    )
    return AttendanceRegularizationResponse(
        data=AttendanceRegularizationRead.model_validate(row)
    )


@router.patch("/{regularization_id}", response_model=AttendanceRegularizationResponse)
def update_regularization(
    regularization_id: str,
    payload: AttendanceRegularizationUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRegularizationResponse:
    row = attendance_regularization_service.update_regularization(
        db, regularization_id, payload, company_id=company_id
    )
    return AttendanceRegularizationResponse(
        data=AttendanceRegularizationRead.model_validate(row)
    )


@router.post(
    "/{regularization_id}/approve", response_model=AttendanceRegularizationResponse
)
def approve_regularization(
    regularization_id: str,
    payload: AttendanceRegularizationDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRegularizationResponse:
    row = attendance_regularization_service.decide_regularization(
        db,
        regularization_id,
        company_id=company_id,
        decision="approved",
        payload=payload,
        decided_by=user.id,
    )
    return AttendanceRegularizationResponse(
        data=AttendanceRegularizationRead.model_validate(row)
    )


@router.post(
    "/{regularization_id}/reject", response_model=AttendanceRegularizationResponse
)
def reject_regularization(
    regularization_id: str,
    payload: AttendanceRegularizationDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRegularizationResponse:
    row = attendance_regularization_service.decide_regularization(
        db,
        regularization_id,
        company_id=company_id,
        decision="rejected",
        payload=payload,
        decided_by=user.id,
    )
    return AttendanceRegularizationResponse(
        data=AttendanceRegularizationRead.model_validate(row)
    )


@router.delete("/{regularization_id}", status_code=204)
def delete_regularization(
    regularization_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    attendance_regularization_service.delete_regularization(
        db, regularization_id, company_id=company_id
    )
    return Response(status_code=204)
