from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.time_entry import (
    TimeEntryCreate,
    TimeEntryDecision,
    TimeEntryListMeta,
    TimeEntryListResponse,
    TimeEntryRead,
    TimeEntryResponse,
    TimeEntryUpdate,
)
from app.services.hrm import time_entry_service

router = APIRouter(prefix="/time-entries", tags=["hrm-time-entries"])


@router.get("", response_model=TimeEntryListResponse)
def list_time_entries(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|approved|rejected)$"
    ),
) -> TimeEntryListResponse:
    rows, total = time_entry_service.list_time_entries(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        status=status,
    )
    data = [TimeEntryRead.model_validate(r) for r in rows]
    return TimeEntryListResponse(
        data=data,
        meta=TimeEntryListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{entry_id}", response_model=TimeEntryResponse)
def get_time_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> TimeEntryResponse:
    row = time_entry_service.get_time_entry(db, entry_id, company_id=company_id)
    return TimeEntryResponse(data=TimeEntryRead.model_validate(row))


@router.post("", response_model=TimeEntryResponse, status_code=201)
def create_time_entry(
    payload: TimeEntryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> TimeEntryResponse:
    row = time_entry_service.create_time_entry(db, payload, created_by=user.id)
    return TimeEntryResponse(data=TimeEntryRead.model_validate(row))


@router.patch("/{entry_id}", response_model=TimeEntryResponse)
def update_time_entry(
    entry_id: str,
    payload: TimeEntryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> TimeEntryResponse:
    row = time_entry_service.update_time_entry(
        db, entry_id, payload, company_id=company_id
    )
    return TimeEntryResponse(data=TimeEntryRead.model_validate(row))


@router.post("/{entry_id}/approve", response_model=TimeEntryResponse)
def approve_time_entry(
    entry_id: str,
    payload: TimeEntryDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> TimeEntryResponse:
    row = time_entry_service.decide_time_entry(
        db,
        entry_id,
        company_id=company_id,
        decision="approved",
        payload=payload,
        decided_by=user.id,
    )
    return TimeEntryResponse(data=TimeEntryRead.model_validate(row))


@router.post("/{entry_id}/reject", response_model=TimeEntryResponse)
def reject_time_entry(
    entry_id: str,
    payload: TimeEntryDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> TimeEntryResponse:
    row = time_entry_service.decide_time_entry(
        db,
        entry_id,
        company_id=company_id,
        decision="rejected",
        payload=payload,
        decided_by=user.id,
    )
    return TimeEntryResponse(data=TimeEntryRead.model_validate(row))


@router.delete("/{entry_id}", status_code=204)
def delete_time_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    time_entry_service.delete_time_entry(db, entry_id, company_id=company_id)
    return Response(status_code=204)
