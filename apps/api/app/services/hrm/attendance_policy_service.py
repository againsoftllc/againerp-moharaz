from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmAttendancePolicy
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.attendance_policy import (
    AttendancePolicyCreate,
    AttendancePolicyUpdate,
)


def list_attendance_policies(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmAttendancePolicy]:
    query = db.query(HrmAttendancePolicy).filter(
        HrmAttendancePolicy.company_id == company_id
    )
    if status:
        query = query.filter(HrmAttendancePolicy.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmAttendancePolicy.name.ilike(like))
            | (HrmAttendancePolicy.description.ilike(like))
        )
    return query.order_by(HrmAttendancePolicy.name.asc()).all()


def get_attendance_policy(
    db: Session, policy_id: str, company_id: Optional[str] = None
) -> HrmAttendancePolicy:
    row = db.get(HrmAttendancePolicy, policy_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Attendance policy not found")
    return row


def create_attendance_policy(
    db: Session, payload: AttendancePolicyCreate, *, created_by: Optional[str]
) -> HrmAttendancePolicy:
    name = payload.name.strip()
    dup = (
        db.query(HrmAttendancePolicy)
        .filter(
            HrmAttendancePolicy.company_id == payload.company_id,
            func.lower(HrmAttendancePolicy.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Attendance policy name already exists")

    row = HrmAttendancePolicy(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        late_arrival_grace=payload.late_arrival_grace,
        early_departure_grace=payload.early_departure_grace,
        half_day_threshold=payload.half_day_threshold,
        overtime_rate_per_hour=payload.overtime_rate_per_hour,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_attendance_policy(
    db: Session,
    policy_id: str,
    payload: AttendancePolicyUpdate,
    *,
    company_id: str,
) -> HrmAttendancePolicy:
    row = get_attendance_policy(db, policy_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmAttendancePolicy)
            .filter(
                HrmAttendancePolicy.company_id == company_id,
                func.lower(HrmAttendancePolicy.name) == name.lower(),
                HrmAttendancePolicy.id != policy_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Attendance policy name already exists"
            )
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_attendance_policy(db: Session, policy_id: str, *, company_id: str) -> None:
    row = get_attendance_policy(db, policy_id, company_id=company_id)
    emp_count = (
        db.query(func.count(HrmEmployee.id))
        .filter(HrmEmployee.attendance_policy_id == policy_id)
        .scalar()
        or 0
    )
    if emp_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete attendance policy with {emp_count} employee(s)",
        )
    db.delete(row)
    db.commit()
