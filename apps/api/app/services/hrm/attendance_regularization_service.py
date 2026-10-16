from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmAttendanceRecord, HrmAttendanceRegularization
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.attendance_regularization import (
    AttendanceRegularizationCreate,
    AttendanceRegularizationDecision,
    AttendanceRegularizationUpdate,
)


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_record(
    db: Session, record_id: str, company_id: str, employee_id: str
) -> HrmAttendanceRecord:
    row = db.get(HrmAttendanceRecord, record_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid attendance_record_id")
    if row.employee_id and row.employee_id != employee_id:
        raise HTTPException(
            status_code=400, detail="attendance_record_id does not belong to employee"
        )
    return row


def list_regularizations(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[Sequence[HrmAttendanceRegularization], int]:
    query = db.query(HrmAttendanceRegularization).filter(
        HrmAttendanceRegularization.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmAttendanceRegularization.employee_id == employee_id)
    if status:
        query = query.filter(HrmAttendanceRegularization.status == status)
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmAttendanceRegularization.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_regularization(
    db: Session, regularization_id: str, company_id: Optional[str] = None
) -> HrmAttendanceRegularization:
    row = db.get(HrmAttendanceRegularization, regularization_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Regularization not found")
    return row


def create_regularization(
    db: Session,
    payload: AttendanceRegularizationCreate,
    *,
    created_by: Optional[str],
) -> HrmAttendanceRegularization:
    _require_employee(db, payload.employee_id, payload.company_id)
    record = _require_record(
        db, payload.attendance_record_id, payload.company_id, payload.employee_id
    )

    row = HrmAttendanceRegularization(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        attendance_record_id=payload.attendance_record_id,
        date=payload.date,
        requested_clock_in=payload.requested_clock_in,
        requested_clock_out=payload.requested_clock_out,
        original_clock_in=record.clock_in,
        original_clock_out=record.clock_out,
        reason=payload.reason,
        status="pending",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_regularization(
    db: Session,
    regularization_id: str,
    payload: AttendanceRegularizationUpdate,
    *,
    company_id: str,
) -> HrmAttendanceRegularization:
    row = get_regularization(db, regularization_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending regularizations can be edited")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def decide_regularization(
    db: Session,
    regularization_id: str,
    *,
    company_id: str,
    decision: str,
    payload: AttendanceRegularizationDecision,
    decided_by: str,
) -> HrmAttendanceRegularization:
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    row = get_regularization(db, regularization_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Regularization already decided")

    row.status = decision
    row.manager_comments = payload.manager_comments
    row.approved_by = decided_by
    row.approved_at = datetime.utcnow()

    if decision == "approved" and row.attendance_record_id:
        record = db.get(HrmAttendanceRecord, row.attendance_record_id)
        if record:
            if row.requested_clock_in is not None:
                record.clock_in = row.requested_clock_in
            if row.requested_clock_out is not None:
                record.clock_out = row.requested_clock_out
            record.is_absent = False
            if record.status == "absent":
                record.status = "present"

    db.commit()
    db.refresh(row)
    return row


def delete_regularization(
    db: Session, regularization_id: str, *, company_id: str
) -> None:
    row = get_regularization(db, regularization_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(
            status_code=409, detail="Only pending regularizations can be deleted"
        )
    db.delete(row)
    db.commit()
