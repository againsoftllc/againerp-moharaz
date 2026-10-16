from __future__ import annotations

from datetime import date
from typing import Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import (
    HrmAttendancePolicy,
    HrmAttendanceRecord,
    HrmShift,
)
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.attendance_record import (
    AttendanceRecordCreate,
    AttendanceRecordUpdate,
)


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _optional_shift(db: Session, shift_id: Optional[str], company_id: str) -> None:
    if not shift_id:
        return
    row = db.get(HrmShift, shift_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid shift_id")


def _optional_policy(db: Session, policy_id: Optional[str], company_id: str) -> None:
    if not policy_id:
        return
    row = db.get(HrmAttendancePolicy, policy_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid attendance_policy_id")


def list_attendance_records(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> Tuple[Sequence[HrmAttendanceRecord], int]:
    query = db.query(HrmAttendanceRecord).filter(
        HrmAttendanceRecord.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmAttendanceRecord.employee_id == employee_id)
    if status:
        query = query.filter(HrmAttendanceRecord.status == status)
    if date_from:
        query = query.filter(HrmAttendanceRecord.date >= date_from)
    if date_to:
        query = query.filter(HrmAttendanceRecord.date <= date_to)
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmAttendanceRecord.date.desc().nullslast())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_attendance_record(
    db: Session, record_id: str, company_id: Optional[str] = None
) -> HrmAttendanceRecord:
    row = db.get(HrmAttendanceRecord, record_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Attendance record not found")
    return row


def create_attendance_record(
    db: Session, payload: AttendanceRecordCreate, *, created_by: Optional[str]
) -> HrmAttendanceRecord:
    _require_employee(db, payload.employee_id, payload.company_id)
    _optional_shift(db, payload.shift_id, payload.company_id)
    _optional_policy(db, payload.attendance_policy_id, payload.company_id)

    existing = (
        db.query(HrmAttendanceRecord)
        .filter(
            HrmAttendanceRecord.company_id == payload.company_id,
            HrmAttendanceRecord.employee_id == payload.employee_id,
            HrmAttendanceRecord.date == payload.date,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="Attendance record already exists for this date"
        )

    data = payload.model_dump()
    data["created_by"] = created_by
    row = HrmAttendanceRecord(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_attendance_record(
    db: Session, record_id: str, payload: AttendanceRecordUpdate, *, company_id: str
) -> HrmAttendanceRecord:
    row = get_attendance_record(db, record_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "shift_id" in data:
        _optional_shift(db, data["shift_id"], company_id)
    if "attendance_policy_id" in data:
        _optional_policy(db, data["attendance_policy_id"], company_id)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_attendance_record(db: Session, record_id: str, *, company_id: str) -> None:
    row = get_attendance_record(db, record_id, company_id=company_id)
    db.delete(row)
    db.commit()
