from __future__ import annotations

from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmLeaveBalance, HrmLeavePolicy, HrmLeaveType
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.leave_balance import LeaveBalanceCreate, LeaveBalanceUpdate


def _remaining(
    allocated: Decimal,
    used: Decimal,
    carried: Decimal,
    adjustment: Decimal,
) -> Decimal:
    return allocated + carried + adjustment - used


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_leave_type(db: Session, leave_type_id: str, company_id: str) -> HrmLeaveType:
    row = db.get(HrmLeaveType, leave_type_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid leave_type_id")
    return row


def _require_policy(db: Session, leave_policy_id: str, company_id: str) -> HrmLeavePolicy:
    row = db.get(HrmLeavePolicy, leave_policy_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid leave_policy_id")
    return row


def list_leave_balances(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    leave_type_id: Optional[str] = None,
    year: Optional[str] = None,
) -> Sequence[HrmLeaveBalance]:
    query = db.query(HrmLeaveBalance).filter(HrmLeaveBalance.company_id == company_id)
    if employee_id:
        query = query.filter(HrmLeaveBalance.employee_id == employee_id)
    if leave_type_id:
        query = query.filter(HrmLeaveBalance.leave_type_id == leave_type_id)
    if year:
        query = query.filter(HrmLeaveBalance.year == year)
    return query.order_by(HrmLeaveBalance.year.desc(), HrmLeaveBalance.created_at.desc()).all()


def get_leave_balance(
    db: Session, balance_id: str, company_id: Optional[str] = None
) -> HrmLeaveBalance:
    row = db.get(HrmLeaveBalance, balance_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Leave balance not found")
    return row


def create_leave_balance(
    db: Session, payload: LeaveBalanceCreate, *, created_by: Optional[str]
) -> HrmLeaveBalance:
    _require_employee(db, payload.employee_id, payload.company_id)
    _require_leave_type(db, payload.leave_type_id, payload.company_id)
    _require_policy(db, payload.leave_policy_id, payload.company_id)

    remaining = _remaining(
        payload.allocated_days,
        payload.used_days,
        payload.carried_forward,
        payload.manual_adjustment,
    )
    row = HrmLeaveBalance(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        leave_type_id=payload.leave_type_id,
        leave_policy_id=payload.leave_policy_id,
        year=payload.year,
        allocated_days=payload.allocated_days,
        used_days=payload.used_days,
        remaining_days=remaining,
        carried_forward=payload.carried_forward,
        manual_adjustment=payload.manual_adjustment,
        adjustment_reason=payload.adjustment_reason,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_leave_balance(
    db: Session, balance_id: str, payload: LeaveBalanceUpdate, *, company_id: str
) -> HrmLeaveBalance:
    row = get_leave_balance(db, balance_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "leave_type_id" in data and data["leave_type_id"] is not None:
        _require_leave_type(db, data["leave_type_id"], company_id)
    if "leave_policy_id" in data and data["leave_policy_id"] is not None:
        _require_policy(db, data["leave_policy_id"], company_id)

    for key, value in data.items():
        setattr(row, key, value)
    row.remaining_days = _remaining(
        row.allocated_days,
        row.used_days,
        row.carried_forward,
        row.manual_adjustment,
    )
    db.commit()
    db.refresh(row)
    return row


def delete_leave_balance(db: Session, balance_id: str, *, company_id: str) -> None:
    row = get_leave_balance(db, balance_id, company_id=company_id)
    db.delete(row)
    db.commit()
