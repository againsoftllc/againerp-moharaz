from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmJobPosting, HrmJobType
from app.schemas.hrm.job_type import JobTypeCreate, JobTypeUpdate


def list_job_types(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmJobType]:
    query = db.query(HrmJobType).filter(HrmJobType.company_id == company_id)
    if status:
        query = query.filter(HrmJobType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmJobType.name.ilike(like)) | (HrmJobType.description.ilike(like))
        )
    return query.order_by(HrmJobType.name.asc()).all()


def get_job_type(
    db: Session, type_id: str, company_id: Optional[str] = None
) -> HrmJobType:
    row = db.get(HrmJobType, type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Job type not found")
    return row


def _assert_unique_name(
    db: Session, *, company_id: str, name: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmJobType).filter(
        HrmJobType.company_id == company_id,
        func.lower(HrmJobType.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(HrmJobType.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Job type name already exists")


def create_job_type(
    db: Session, payload: JobTypeCreate, *, created_by: Optional[str]
) -> HrmJobType:
    name = payload.name.strip()
    _assert_unique_name(db, company_id=payload.company_id, name=name)
    row = HrmJobType(
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


def update_job_type(
    db: Session, type_id: str, payload: JobTypeUpdate, *, company_id: str
) -> HrmJobType:
    row = get_job_type(db, type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        _assert_unique_name(db, company_id=company_id, name=name, exclude_id=type_id)
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_job_type(db: Session, type_id: str, *, company_id: str) -> None:
    row = get_job_type(db, type_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmJobPosting.id))
        .filter(HrmJobPosting.job_type_id == type_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete job type used by {usage} posting(s)",
        )
    db.delete(row)
    db.commit()
