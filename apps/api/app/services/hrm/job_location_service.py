from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmJobLocation, HrmJobPosting
from app.schemas.hrm.job_location import JobLocationCreate, JobLocationUpdate


def list_job_locations(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    is_remote: Optional[bool] = None,
    q: Optional[str] = None,
) -> Sequence[HrmJobLocation]:
    query = db.query(HrmJobLocation).filter(HrmJobLocation.company_id == company_id)
    if status:
        query = query.filter(HrmJobLocation.status == status)
    if is_remote is not None:
        query = query.filter(HrmJobLocation.is_remote.is_(is_remote))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmJobLocation.name.ilike(like))
            | (HrmJobLocation.city.ilike(like))
            | (HrmJobLocation.country.ilike(like))
            | (HrmJobLocation.address.ilike(like))
        )
    return query.order_by(HrmJobLocation.name.asc()).all()


def get_job_location(
    db: Session, location_id: str, company_id: Optional[str] = None
) -> HrmJobLocation:
    row = db.get(HrmJobLocation, location_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Job location not found")
    return row


def _assert_unique_name(
    db: Session, *, company_id: str, name: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmJobLocation).filter(
        HrmJobLocation.company_id == company_id,
        func.lower(HrmJobLocation.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(HrmJobLocation.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Job location name already exists")


def create_job_location(
    db: Session, payload: JobLocationCreate, *, created_by: Optional[str]
) -> HrmJobLocation:
    name = payload.name.strip()
    _assert_unique_name(db, company_id=payload.company_id, name=name)
    data = payload.model_dump()
    data["name"] = name
    data["created_by"] = created_by
    row = HrmJobLocation(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_job_location(
    db: Session, location_id: str, payload: JobLocationUpdate, *, company_id: str
) -> HrmJobLocation:
    row = get_job_location(db, location_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        _assert_unique_name(
            db, company_id=company_id, name=name, exclude_id=location_id
        )
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_job_location(db: Session, location_id: str, *, company_id: str) -> None:
    row = get_job_location(db, location_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmJobPosting.id))
        .filter(HrmJobPosting.location_id == location_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete job location used by {usage} posting(s)",
        )
    db.delete(row)
    db.commit()
