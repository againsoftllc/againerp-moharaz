from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmInterview, HrmInterviewType
from app.schemas.hrm.interview_type import InterviewTypeCreate, InterviewTypeUpdate


def list_interview_types(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmInterviewType]:
    query = db.query(HrmInterviewType).filter(HrmInterviewType.company_id == company_id)
    if status:
        query = query.filter(HrmInterviewType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmInterviewType.name.ilike(like))
            | (HrmInterviewType.description.ilike(like))
        )
    return query.order_by(HrmInterviewType.name.asc()).all()


def get_interview_type(
    db: Session, type_id: str, company_id: Optional[str] = None
) -> HrmInterviewType:
    row = db.get(HrmInterviewType, type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Interview type not found")
    return row


def create_interview_type(
    db: Session, payload: InterviewTypeCreate, *, created_by: Optional[str]
) -> HrmInterviewType:
    name = payload.name.strip()
    dup = (
        db.query(HrmInterviewType)
        .filter(
            HrmInterviewType.company_id == payload.company_id,
            func.lower(HrmInterviewType.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Interview type name already exists")
    row = HrmInterviewType(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_interview_type(
    db: Session, type_id: str, payload: InterviewTypeUpdate, *, company_id: str
) -> HrmInterviewType:
    row = get_interview_type(db, type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmInterviewType)
            .filter(
                HrmInterviewType.company_id == company_id,
                func.lower(HrmInterviewType.name) == name.lower(),
                HrmInterviewType.id != type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Interview type name already exists"
            )
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_interview_type(db: Session, type_id: str, *, company_id: str) -> None:
    row = get_interview_type(db, type_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmInterview.id))
        .filter(HrmInterview.interview_type_id == type_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete interview type used by {usage} interview(s)",
        )
    db.delete(row)
    db.commit()
