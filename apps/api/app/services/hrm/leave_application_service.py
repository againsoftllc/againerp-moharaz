from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmLeaveApplication, HrmLeavePolicy, HrmLeaveType
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.leave_application import (
    LeaveApplicationCreate,
    LeaveApplicationDecision,
    LeaveApplicationUpdate,
)


def _inclusive_days(start: date, end: date) -> int:
    return (end - start).days + 1


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


def _require_policy(
    db: Session, leave_policy_id: str, company_id: str, leave_type_id: Optional[str]
) -> HrmLeavePolicy:
    row = db.get(HrmLeavePolicy, leave_policy_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid leave_policy_id")
    if leave_type_id and row.leave_type_id and row.leave_type_id != leave_type_id:
        raise HTTPException(
            status_code=400, detail="leave_policy_id does not match leave_type_id"
        )
    return row


def _validate_dates_and_policy(
    start: date, end: date, policy: HrmLeavePolicy
) -> int:
    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")
    total = _inclusive_days(start, end)
    if total < policy.min_days_per_application:
        raise HTTPException(
            status_code=400,
            detail=f"total_days must be >= {policy.min_days_per_application}",
        )
    if policy.max_days_per_application and total > policy.max_days_per_application:
        raise HTTPException(
            status_code=400,
            detail=f"total_days must be <= {policy.max_days_per_application}",
        )
    return total


def list_leave_applications(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    leave_type_id: Optional[str] = None,
) -> Tuple[Sequence[HrmLeaveApplication], int]:
    query = db.query(HrmLeaveApplication).filter(
        HrmLeaveApplication.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmLeaveApplication.employee_id == employee_id)
    if status:
        query = query.filter(HrmLeaveApplication.status == status)
    if leave_type_id:
        query = query.filter(HrmLeaveApplication.leave_type_id == leave_type_id)
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmLeaveApplication.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_leave_application(
    db: Session, application_id: str, company_id: Optional[str] = None
) -> HrmLeaveApplication:
    row = db.get(HrmLeaveApplication, application_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Leave application not found")
    return row


def create_leave_application(
    db: Session, payload: LeaveApplicationCreate, *, created_by: Optional[str]
) -> HrmLeaveApplication:
    _require_employee(db, payload.employee_id, payload.company_id)
    _require_leave_type(db, payload.leave_type_id, payload.company_id)
    policy = _require_policy(
        db, payload.leave_policy_id, payload.company_id, payload.leave_type_id
    )
    total = _validate_dates_and_policy(payload.start_date, payload.end_date, policy)

    row = HrmLeaveApplication(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        leave_type_id=payload.leave_type_id,
        leave_policy_id=payload.leave_policy_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        total_days=total,
        reason=payload.reason,
        attachment=payload.attachment,
        status="pending",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_leave_application(
    db: Session,
    application_id: str,
    payload: LeaveApplicationUpdate,
    *,
    company_id: str,
) -> HrmLeaveApplication:
    row = get_leave_application(db, application_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending applications can be edited")

    data = payload.model_dump(exclude_unset=True)
    leave_type_id = data.get("leave_type_id", row.leave_type_id)
    leave_policy_id = data.get("leave_policy_id", row.leave_policy_id)
    start = data.get("start_date", row.start_date)
    end = data.get("end_date", row.end_date)

    if leave_type_id:
        _require_leave_type(db, leave_type_id, company_id)
    policy = _require_policy(db, leave_policy_id, company_id, leave_type_id)
    if not start or not end:
        raise HTTPException(status_code=400, detail="start_date and end_date required")
    total = _validate_dates_and_policy(start, end, policy)

    for key, value in data.items():
        setattr(row, key, value)
    row.total_days = total
    db.commit()
    db.refresh(row)
    return row


def decide_leave_application(
    db: Session,
    application_id: str,
    *,
    company_id: str,
    decision: str,
    payload: LeaveApplicationDecision,
    decided_by: str,
) -> HrmLeaveApplication:
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    row = get_leave_application(db, application_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Application already decided")
    row.status = decision
    row.manager_comments = payload.manager_comments
    row.approved_by = decided_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_leave_application(
    db: Session, application_id: str, *, company_id: str
) -> None:
    row = get_leave_application(db, application_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending applications can be deleted")
    db.delete(row)
    db.commit()
