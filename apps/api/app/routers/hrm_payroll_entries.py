from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.payroll import (
    PayrollEntryListMeta,
    PayrollEntryListResponse,
    PayrollEntryResponse,
    PayrollEntryUpdate,
)
from app.services.hrm import payroll_service

router = APIRouter(prefix="/payroll-entries", tags=["hrm-payroll-entries"])


@router.get("", response_model=PayrollEntryListResponse)
def list_payroll_entries(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    payroll_run_id: Optional[str] = Query(default=None),
    employee_id: Optional[str] = Query(default=None),
) -> PayrollEntryListResponse:
    data, total = payroll_service.list_payroll_entries(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        payroll_run_id=payroll_run_id,
        employee_id=employee_id,
    )
    return PayrollEntryListResponse(
        data=data,
        meta=PayrollEntryListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{entry_id}", response_model=PayrollEntryResponse)
def get_payroll_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollEntryResponse:
    data = payroll_service.get_payroll_entry(db, entry_id, company_id=company_id)
    return PayrollEntryResponse(data=data)


@router.patch("/{entry_id}", response_model=PayrollEntryResponse)
def update_payroll_entry(
    entry_id: str,
    payload: PayrollEntryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollEntryResponse:
    data = payroll_service.update_payroll_entry(
        db, entry_id, payload, company_id=company_id
    )
    return PayrollEntryResponse(data=data)
