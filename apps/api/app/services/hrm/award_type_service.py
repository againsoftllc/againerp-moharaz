from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmAward, HrmAwardType
from app.schemas.hrm.award_type import AwardTypeCreate, AwardTypeUpdate


def list_award_types(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmAwardType]:
    query = db.query(HrmAwardType).filter(HrmAwardType.company_id == company_id)
    if status:
        query = query.filter(HrmAwardType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmAwardType.name.ilike(like)) | (HrmAwardType.description.ilike(like))
        )
    return query.order_by(HrmAwardType.name.asc()).all()


def get_award_type(
    db: Session, award_type_id: str, company_id: Optional[str] = None
) -> HrmAwardType:
    row = db.get(HrmAwardType, award_type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Award type not found")
    return row


def create_award_type(
    db: Session, payload: AwardTypeCreate, *, created_by: Optional[str]
) -> HrmAwardType:
    name = payload.name.strip()
    dup = (
        db.query(HrmAwardType)
        .filter(
            HrmAwardType.company_id == payload.company_id,
            func.lower(HrmAwardType.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Award type name already exists")

    row = HrmAwardType(
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


def update_award_type(
    db: Session, award_type_id: str, payload: AwardTypeUpdate, *, company_id: str
) -> HrmAwardType:
    row = get_award_type(db, award_type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmAwardType)
            .filter(
                HrmAwardType.company_id == company_id,
                func.lower(HrmAwardType.name) == name.lower(),
                HrmAwardType.id != award_type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Award type name already exists")
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_award_type(db: Session, award_type_id: str, *, company_id: str) -> None:
    row = get_award_type(db, award_type_id, company_id=company_id)
    award_count = (
        db.query(func.count(HrmAward.id))
        .filter(HrmAward.award_type_id == award_type_id)
        .scalar()
        or 0
    )
    if award_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete award type with {award_count} award(s)",
        )
    db.delete(row)
    db.commit()
