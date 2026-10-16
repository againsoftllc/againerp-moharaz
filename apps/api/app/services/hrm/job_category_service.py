from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmJobCategory, HrmJobRequisition
from app.schemas.hrm.job_category import JobCategoryCreate, JobCategoryUpdate


def list_job_categories(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmJobCategory]:
    query = db.query(HrmJobCategory).filter(HrmJobCategory.company_id == company_id)
    if status:
        query = query.filter(HrmJobCategory.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmJobCategory.name.ilike(like)) | (HrmJobCategory.description.ilike(like))
        )
    return query.order_by(HrmJobCategory.name.asc()).all()


def get_job_category(
    db: Session, category_id: str, company_id: Optional[str] = None
) -> HrmJobCategory:
    row = db.get(HrmJobCategory, category_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Job category not found")
    return row


def _assert_unique_name(
    db: Session, *, company_id: str, name: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmJobCategory).filter(
        HrmJobCategory.company_id == company_id,
        func.lower(HrmJobCategory.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(HrmJobCategory.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Job category name already exists")


def create_job_category(
    db: Session, payload: JobCategoryCreate, *, created_by: Optional[str]
) -> HrmJobCategory:
    name = payload.name.strip()
    _assert_unique_name(db, company_id=payload.company_id, name=name)
    row = HrmJobCategory(
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


def update_job_category(
    db: Session, category_id: str, payload: JobCategoryUpdate, *, company_id: str
) -> HrmJobCategory:
    row = get_job_category(db, category_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        _assert_unique_name(
            db, company_id=company_id, name=name, exclude_id=category_id
        )
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_job_category(db: Session, category_id: str, *, company_id: str) -> None:
    row = get_job_category(db, category_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmJobRequisition.id))
        .filter(HrmJobRequisition.job_category_id == category_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete job category used by {usage} requisition(s)",
        )
    db.delete(row)
    db.commit()
