from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.payroll import (
    PayrollRunCreate,
    PayrollRunListMeta,
    PayrollRunListResponse,
    PayrollRunRead,
    PayrollRunResponse,
    PayrollRunUpdate,
)
from app.services.hrm import payroll_service

router = APIRouter(prefix="/payroll-runs", tags=["hrm-payroll-runs"])


@router.get("", response_model=PayrollRunListResponse)
def list_payroll_runs(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|processing|completed|cancelled)$"
    ),
) -> PayrollRunListResponse:
    rows, total = payroll_service.list_payroll_runs(
        db, company_id=company_id, page=page, per_page=per_page, status=status
    )
    data = [PayrollRunRead.model_validate(r) for r in rows]
    return PayrollRunListResponse(
        data=data,
        meta=PayrollRunListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{run_id}", response_model=PayrollRunResponse)
def get_payroll_run(
    run_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollRunResponse:
    row = payroll_service.get_payroll_run(db, run_id, company_id=company_id)
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.post("", response_model=PayrollRunResponse, status_code=201)
def create_payroll_run(
    payload: PayrollRunCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> PayrollRunResponse:
    row = payroll_service.create_payroll_run(db, payload, created_by=user.id)
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.patch("/{run_id}", response_model=PayrollRunResponse)
def update_payroll_run(
    run_id: str,
    payload: PayrollRunUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollRunResponse:
    row = payroll_service.update_payroll_run(
        db, run_id, payload, company_id=company_id
    )
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.post("/{run_id}/calculate", response_model=PayrollRunResponse)
def calculate_payroll_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollRunResponse:
    row = payroll_service.calculate_payroll_run(
        db, run_id, company_id=company_id, created_by=user.id
    )
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.post("/{run_id}/complete", response_model=PayrollRunResponse)
def complete_payroll_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollRunResponse:
    row = payroll_service.complete_payroll_run(
        db, run_id, company_id=company_id, created_by=user.id
    )
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.post("/{run_id}/cancel", response_model=PayrollRunResponse)
def cancel_payroll_run(
    run_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PayrollRunResponse:
    row = payroll_service.cancel_payroll_run(db, run_id, company_id=company_id)
    return PayrollRunResponse(data=PayrollRunRead.model_validate(row))


@router.delete("/{run_id}", status_code=204)
def delete_payroll_run(
    run_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    payroll_service.delete_payroll_run(db, run_id, company_id=company_id)
    return Response(status_code=204)
