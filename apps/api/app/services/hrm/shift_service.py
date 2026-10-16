from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmShift
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.shift import ShiftCreate, ShiftUpdate


def list_shifts(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmShift]:
    query = db.query(HrmShift).filter(HrmShift.company_id == company_id)
    if status:
        query = query.filter(HrmShift.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmShift.name.ilike(like)) | (HrmShift.description.ilike(like))
        )
    return query.order_by(HrmShift.name.asc()).all()


def get_shift(db: Session, shift_id: str, company_id: Optional[str] = None) -> HrmShift:
    row = db.get(HrmShift, shift_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Shift not found")
    return row


def create_shift(
    db: Session, payload: ShiftCreate, *, created_by: Optional[str]
) -> HrmShift:
    name = payload.name.strip()
    dup = (
        db.query(HrmShift)
        .filter(
            HrmShift.company_id == payload.company_id,
            func.lower(HrmShift.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Shift name already exists")

    row = HrmShift(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        break_duration=payload.break_duration,
        break_start_time=payload.break_start_time,
        break_end_time=payload.break_end_time,
        grace_period=payload.grace_period,
        is_night_shift=payload.is_night_shift,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_shift(
    db: Session, shift_id: str, payload: ShiftUpdate, *, company_id: str
) -> HrmShift:
    row = get_shift(db, shift_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmShift)
            .filter(
                HrmShift.company_id == company_id,
                func.lower(HrmShift.name) == name.lower(),
                HrmShift.id != shift_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Shift name already exists")
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_shift(db: Session, shift_id: str, *, company_id: str) -> None:
    row = get_shift(db, shift_id, company_id=company_id)
    emp_count = (
        db.query(func.count(HrmEmployee.id))
        .filter(HrmEmployee.shift_id == shift_id)
        .scalar()
        or 0
    )
    if emp_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete shift with {emp_count} employee(s)",
        )
    db.delete(row)
    db.commit()
