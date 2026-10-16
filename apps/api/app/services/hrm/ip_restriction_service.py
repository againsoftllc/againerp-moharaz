from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmIpRestriction
from app.schemas.hrm.ip_restriction import IpRestrictionCreate, IpRestrictionUpdate


def list_ip_restrictions(
    db: Session,
    *,
    company_id: str,
    q: Optional[str] = None,
):
    query = db.query(HrmIpRestriction).filter(
        HrmIpRestriction.company_id == company_id
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmIpRestriction.ip_address.ilike(like))
    return query.order_by(HrmIpRestriction.ip_address.asc()).all()


def get_ip_restriction(
    db: Session, restriction_id: str, company_id: Optional[str] = None
) -> HrmIpRestriction:
    row = db.get(HrmIpRestriction, restriction_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="IP restriction not found")
    return row


def create_ip_restriction(
    db: Session, payload: IpRestrictionCreate, *, created_by: Optional[str]
) -> HrmIpRestriction:
    ip = payload.ip_address.strip()
    dup = (
        db.query(HrmIpRestriction)
        .filter(
            HrmIpRestriction.company_id == payload.company_id,
            func.lower(HrmIpRestriction.ip_address) == ip.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="IP address already allowed")
    row = HrmIpRestriction(
        company_id=payload.company_id,
        ip_address=ip,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_ip_restriction(
    db: Session,
    restriction_id: str,
    payload: IpRestrictionUpdate,
    *,
    company_id: str,
) -> HrmIpRestriction:
    row = get_ip_restriction(db, restriction_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "ip_address" in data and data["ip_address"] is not None:
        ip = data["ip_address"].strip()
        dup = (
            db.query(HrmIpRestriction)
            .filter(
                HrmIpRestriction.company_id == company_id,
                func.lower(HrmIpRestriction.ip_address) == ip.lower(),
                HrmIpRestriction.id != restriction_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="IP address already allowed")
        data["ip_address"] = ip
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_ip_restriction(
    db: Session, restriction_id: str, *, company_id: str
) -> None:
    row = get_ip_restriction(db, restriction_id, company_id=company_id)
    db.delete(row)
    db.commit()
