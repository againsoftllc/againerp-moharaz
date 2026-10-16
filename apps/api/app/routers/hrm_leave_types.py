from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.leave_type import (
    LeaveTypeCreate,
    LeaveTypeListMeta,
    LeaveTypeListResponse,
    LeaveTypeRead,
    LeaveTypeResponse,
    LeaveTypeUpdate,
)
from app.services.hrm import leave_type_service

router = APIRouter(prefix="/leave-types", tags=["hrm-leave-types"])


@router.get("", response_model=LeaveTypeListResponse)
def list_leave_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> LeaveTypeListResponse:
    rows = leave_type_service.list_leave_types(
        db, company_id=company_id, status=status, q=q
    )
    data = [LeaveTypeRead.model_validate(r) for r in rows]
    return LeaveTypeListResponse(data=data, meta=LeaveTypeListMeta(count=len(data)))


@router.get("/{leave_type_id}", response_model=LeaveTypeResponse)
def get_leave_type(
    leave_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveTypeResponse:
    row = leave_type_service.get_leave_type(db, leave_type_id, company_id=company_id)
    return LeaveTypeResponse(data=LeaveTypeRead.model_validate(row))


@router.post("", response_model=LeaveTypeResponse, status_code=201)
def create_leave_type(
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> LeaveTypeResponse:
    row = leave_type_service.create_leave_type(db, payload, created_by=user.id)
    return LeaveTypeResponse(data=LeaveTypeRead.model_validate(row))


@router.patch("/{leave_type_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    leave_type_id: str,
    payload: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveTypeResponse:
    row = leave_type_service.update_leave_type(
        db, leave_type_id, payload, company_id=company_id
    )
    return LeaveTypeResponse(data=LeaveTypeRead.model_validate(row))


@router.delete("/{leave_type_id}", status_code=204)
def delete_leave_type(
    leave_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    leave_type_service.delete_leave_type(db, leave_type_id, company_id=company_id)
    return Response(status_code=204)
