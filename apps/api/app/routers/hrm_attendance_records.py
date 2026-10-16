from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.attendance_record import (
    AttendanceRecordCreate,
    AttendanceRecordListMeta,
    AttendanceRecordListResponse,
    AttendanceRecordRead,
    AttendanceRecordResponse,
    AttendanceRecordUpdate,
)
from app.services.hrm import attendance_record_service

router = APIRouter(prefix="/attendance-records", tags=["hrm-attendance-records"])


@router.get("", response_model=AttendanceRecordListResponse)
def list_attendance_records(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(present|absent|half_day|on_leave|holiday)$"
    ),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> AttendanceRecordListResponse:
    rows, total = attendance_record_service.list_attendance_records(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
    data = [AttendanceRecordRead.model_validate(r) for r in rows]
    return AttendanceRecordListResponse(
        data=data,
        meta=AttendanceRecordListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{record_id}", response_model=AttendanceRecordResponse)
def get_attendance_record(
    record_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRecordResponse:
    row = attendance_record_service.get_attendance_record(
        db, record_id, company_id=company_id
    )
    return AttendanceRecordResponse(data=AttendanceRecordRead.model_validate(row))


@router.post("", response_model=AttendanceRecordResponse, status_code=201)
def create_attendance_record(
    payload: AttendanceRecordCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRecordResponse:
    payload.company_id = company_id
    row = attendance_record_service.create_attendance_record(
        db, payload, created_by=user.id
    )
    return AttendanceRecordResponse(data=AttendanceRecordRead.model_validate(row))


@router.patch("/{record_id}", response_model=AttendanceRecordResponse)
def update_attendance_record(
    record_id: str,
    payload: AttendanceRecordUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AttendanceRecordResponse:
    row = attendance_record_service.update_attendance_record(
        db, record_id, payload, company_id=company_id
    )
    return AttendanceRecordResponse(data=AttendanceRecordRead.model_validate(row))


@router.delete("/{record_id}", status_code=204)
def delete_attendance_record(
    record_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    attendance_record_service.delete_attendance_record(
        db, record_id, company_id=company_id
    )
    return Response(status_code=204)
