from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmLeavePolicy, HrmLeaveType
from app.schemas.hrm.leave_type import LeaveTypeCreate, LeaveTypeUpdate


def list_leave_types(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmLeaveType]:
    query = db.query(HrmLeaveType).filter(HrmLeaveType.company_id == company_id)
    if status:
        query = query.filter(HrmLeaveType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmLeaveType.name.ilike(like)) | (HrmLeaveType.description.ilike(like))
        )
    return query.order_by(HrmLeaveType.name.asc()).all()


def get_leave_type(
    db: Session, leave_type_id: str, company_id: Optional[str] = None
) -> HrmLeaveType:
    row = db.get(HrmLeaveType, leave_type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Leave type not found")
    return row


def create_leave_type(
    db: Session, payload: LeaveTypeCreate, *, created_by: Optional[str]
) -> HrmLeaveType:
    name = payload.name.strip()
    dup = (
        db.query(HrmLeaveType)
        .filter(
            HrmLeaveType.company_id == payload.company_id,
            func.lower(HrmLeaveType.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Leave type name already exists")

    row = HrmLeaveType(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        max_days_per_year=payload.max_days_per_year,
        is_paid=payload.is_paid,
        color=payload.color,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_leave_type(
    db: Session, leave_type_id: str, payload: LeaveTypeUpdate, *, company_id: str
) -> HrmLeaveType:
    row = get_leave_type(db, leave_type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmLeaveType)
            .filter(
                HrmLeaveType.company_id == company_id,
                func.lower(HrmLeaveType.name) == name.lower(),
                HrmLeaveType.id != leave_type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Leave type name already exists")
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_leave_type(db: Session, leave_type_id: str, *, company_id: str) -> None:
    row = get_leave_type(db, leave_type_id, company_id=company_id)
    policy_count = (
        db.query(func.count(HrmLeavePolicy.id))
        .filter(HrmLeavePolicy.leave_type_id == leave_type_id)
        .scalar()
        or 0
    )
    if policy_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete leave type with {policy_count} policy(ies)",
        )
    db.delete(row)
    db.commit()
