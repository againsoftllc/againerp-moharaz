from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.payroll import (
    PayslipListMeta,
    PayslipListResponse,
    PayslipRead,
    PayslipResponse,
)
from app.services.hrm import payroll_service

router = APIRouter(prefix="/payslips", tags=["hrm-payslips"])


@router.get("", response_model=PayslipListResponse)
def list_payslips(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    payroll_run_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(generated|sent|downloaded|active)$"
    ),
) -> PayslipListResponse:
    data, total = payroll_service.list_payslips(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        payroll_run_id=payroll_run_id,
        status=status,
    )
    return PayslipListResponse(
        data=data,
        meta=PayslipListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{payslip_id}", response_model=PayslipResponse)
def get_payslip(
    payslip_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PayslipResponse:
    row = payroll_service.get_payslip(db, payslip_id, company_id=company_id)
    return PayslipResponse(data=PayslipRead.model_validate(row))


@router.post("/{payslip_id}/mark-sent", response_model=PayslipResponse)
def mark_payslip_sent(
    payslip_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayslipResponse:
    row = payroll_service.mark_payslip_sent(db, payslip_id, company_id=company_id)
    return PayslipResponse(data=PayslipRead.model_validate(row))


@router.post("/{payslip_id}/mark-downloaded", response_model=PayslipResponse)
def mark_payslip_downloaded(
    payslip_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayslipResponse:
    row = payroll_service.mark_payslip_downloaded(
        db, payslip_id, company_id=company_id
    )
    return PayslipResponse(data=PayslipRead.model_validate(row))
