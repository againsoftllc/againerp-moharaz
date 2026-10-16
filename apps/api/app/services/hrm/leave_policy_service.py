from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmLeavePolicy, HrmLeaveType
from app.schemas.hrm.leave_policy import LeavePolicyCreate, LeavePolicyUpdate


def _require_leave_type(db: Session, leave_type_id: str, company_id: str) -> HrmLeaveType:
    row = db.get(HrmLeaveType, leave_type_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid leave_type_id")
    return row


def list_leave_policies(
    db: Session,
    *,
    company_id: str,
    leave_type_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmLeavePolicy]:
    query = db.query(HrmLeavePolicy).filter(HrmLeavePolicy.company_id == company_id)
    if leave_type_id:
        query = query.filter(HrmLeavePolicy.leave_type_id == leave_type_id)
    if status:
        query = query.filter(HrmLeavePolicy.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmLeavePolicy.name.ilike(like)) | (HrmLeavePolicy.description.ilike(like))
        )
    return query.order_by(HrmLeavePolicy.name.asc()).all()


def get_leave_policy(
    db: Session, leave_policy_id: str, company_id: Optional[str] = None
) -> HrmLeavePolicy:
    row = db.get(HrmLeavePolicy, leave_policy_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Leave policy not found")
    return row


def create_leave_policy(
    db: Session, payload: LeavePolicyCreate, *, created_by: Optional[str]
) -> HrmLeavePolicy:
    _require_leave_type(db, payload.leave_type_id, payload.company_id)
    name = payload.name.strip()
    if payload.max_days_per_application < payload.min_days_per_application:
        raise HTTPException(
            status_code=400,
            detail="max_days_per_application must be >= min_days_per_application",
        )

    dup = (
        db.query(HrmLeavePolicy)
        .filter(
            HrmLeavePolicy.company_id == payload.company_id,
            HrmLeavePolicy.leave_type_id == payload.leave_type_id,
            func.lower(HrmLeavePolicy.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=409, detail="Leave policy name already exists for this type"
        )

    row = HrmLeavePolicy(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        leave_type_id=payload.leave_type_id,
        accrual_type=payload.accrual_type,
        accrual_rate=payload.accrual_rate,
        carry_forward_limit=payload.carry_forward_limit,
        min_days_per_application=payload.min_days_per_application,
        max_days_per_application=payload.max_days_per_application,
        requires_approval=payload.requires_approval,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_leave_policy(
    db: Session, leave_policy_id: str, payload: LeavePolicyUpdate, *, company_id: str
) -> HrmLeavePolicy:
    row = get_leave_policy(db, leave_policy_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    next_type = data.get("leave_type_id", row.leave_type_id)
    next_name = row.name
    if "name" in data and data["name"] is not None:
        next_name = data["name"].strip()
        data["name"] = next_name
    if "leave_type_id" in data and data["leave_type_id"] is not None:
        _require_leave_type(db, data["leave_type_id"], company_id)

    min_d = data.get("min_days_per_application", row.min_days_per_application)
    max_d = data.get("max_days_per_application", row.max_days_per_application)
    if max_d < min_d:
        raise HTTPException(
            status_code=400,
            detail="max_days_per_application must be >= min_days_per_application",
        )

    if "name" in data or "leave_type_id" in data:
        dup = (
            db.query(HrmLeavePolicy)
            .filter(
                HrmLeavePolicy.company_id == company_id,
                HrmLeavePolicy.leave_type_id == next_type,
                func.lower(HrmLeavePolicy.name) == next_name.lower(),
                HrmLeavePolicy.id != leave_policy_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Leave policy name already exists for this type"
            )

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_leave_policy(db: Session, leave_policy_id: str, *, company_id: str) -> None:
    row = get_leave_policy(db, leave_policy_id, company_id=company_id)
    db.delete(row)
    db.commit()
