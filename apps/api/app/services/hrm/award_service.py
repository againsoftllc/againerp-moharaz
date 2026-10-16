from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmAward, HrmAwardType, HrmEmployee
from app.schemas.hrm.award import AwardCreate, AwardUpdate


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_award_type(db: Session, award_type_id: str, company_id: str) -> HrmAwardType:
    row = db.get(HrmAwardType, award_type_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid award_type_id")
    return row


def list_awards(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    award_type_id: Optional[str] = None,
) -> Sequence[HrmAward]:
    query = db.query(HrmAward).filter(HrmAward.company_id == company_id)
    if employee_id:
        query = query.filter(HrmAward.employee_id == employee_id)
    if award_type_id:
        query = query.filter(HrmAward.award_type_id == award_type_id)
    return query.order_by(HrmAward.award_date.desc().nullslast(), HrmAward.created_at.desc()).all()


def get_award(db: Session, award_id: str, company_id: Optional[str] = None) -> HrmAward:
    row = db.get(HrmAward, award_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Award not found")
    return row


def create_award(
    db: Session, payload: AwardCreate, *, created_by: Optional[str]
) -> HrmAward:
    _require_employee(db, payload.employee_id, payload.company_id)
    _require_award_type(db, payload.award_type_id, payload.company_id)

    row = HrmAward(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        award_type_id=payload.award_type_id,
        award_date=payload.award_date,
        gift=payload.gift,
        monetary_value=payload.monetary_value,
        description=payload.description,
        certificate=payload.certificate,
        photo=payload.photo,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_award(
    db: Session, award_id: str, payload: AwardUpdate, *, company_id: str
) -> HrmAward:
    row = get_award(db, award_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "employee_id" in data and data["employee_id"] is not None:
        _require_employee(db, data["employee_id"], company_id)
    if "award_type_id" in data and data["award_type_id"] is not None:
        _require_award_type(db, data["award_type_id"], company_id)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_award(db: Session, award_id: str, *, company_id: str) -> None:
    row = get_award(db, award_id, company_id=company_id)
    db.delete(row)
    db.commit()
