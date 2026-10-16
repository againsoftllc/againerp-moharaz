from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.leave_balance import (
    LeaveBalanceCreate,
    LeaveBalanceListMeta,
    LeaveBalanceListResponse,
    LeaveBalanceRead,
    LeaveBalanceResponse,
    LeaveBalanceUpdate,
)
from app.services.hrm import leave_balance_service

router = APIRouter(prefix="/leave-balances", tags=["hrm-leave-balances"])


@router.get("", response_model=LeaveBalanceListResponse)
def list_leave_balances(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    leave_type_id: Optional[str] = Query(default=None),
    year: Optional[str] = Query(default=None),
) -> LeaveBalanceListResponse:
    rows = leave_balance_service.list_leave_balances(
        db,
        company_id=company_id,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        year=year,
    )
    data = [LeaveBalanceRead.model_validate(r) for r in rows]
    return LeaveBalanceListResponse(
        data=data, meta=LeaveBalanceListMeta(count=len(data))
    )


@router.get("/{balance_id}", response_model=LeaveBalanceResponse)
def get_leave_balance(
    balance_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveBalanceResponse:
    row = leave_balance_service.get_leave_balance(
        db, balance_id, company_id=company_id
    )
    return LeaveBalanceResponse(data=LeaveBalanceRead.model_validate(row))


@router.post("", response_model=LeaveBalanceResponse, status_code=201)
def create_leave_balance(
    payload: LeaveBalanceCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> LeaveBalanceResponse:
    row = leave_balance_service.create_leave_balance(db, payload, created_by=user.id)
    return LeaveBalanceResponse(data=LeaveBalanceRead.model_validate(row))


@router.patch("/{balance_id}", response_model=LeaveBalanceResponse)
def update_leave_balance(
    balance_id: str,
    payload: LeaveBalanceUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LeaveBalanceResponse:
    row = leave_balance_service.update_leave_balance(
        db, balance_id, payload, company_id=company_id
    )
    return LeaveBalanceResponse(data=LeaveBalanceRead.model_validate(row))


@router.delete("/{balance_id}", status_code=204)
def delete_leave_balance(
    balance_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    leave_balance_service.delete_leave_balance(
        db, balance_id, company_id=company_id
    )
    return Response(status_code=204)
