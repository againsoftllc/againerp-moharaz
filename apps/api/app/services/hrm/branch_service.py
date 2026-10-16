from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmBranch, HrmDepartment
from app.schemas.hrm.branch import BranchCreate, BranchUpdate


def list_branches(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmBranch]:
    query = db.query(HrmBranch).filter(HrmBranch.company_id == company_id)
    if status:
        query = query.filter(HrmBranch.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmBranch.name.ilike(like))
            | (HrmBranch.city.ilike(like))
            | (HrmBranch.email.ilike(like))
            | (HrmBranch.phone.ilike(like))
        )
    return query.order_by(HrmBranch.name.asc()).all()


def get_branch(db: Session, branch_id: str, company_id: Optional[str] = None) -> HrmBranch:
    row = db.get(HrmBranch, branch_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Branch not found")
    return row


def create_branch(db: Session, payload: BranchCreate, *, company_id: str, created_by: Optional[str]) -> HrmBranch:
    name = payload.name.strip()
    dup = (
        db.query(HrmBranch)
        .filter(
            HrmBranch.company_id == company_id,
            func.lower(HrmBranch.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Branch name already exists")

    row = HrmBranch(
        company_id=company_id,
        name=name,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        country=payload.country,
        zip_code=payload.zip_code,
        phone=payload.phone,
        email=payload.email,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_branch(db: Session, branch_id: str, payload: BranchUpdate, *, company_id: str) -> HrmBranch:
    row = get_branch(db, branch_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmBranch)
            .filter(
                HrmBranch.company_id == company_id,
                func.lower(HrmBranch.name) == name.lower(),
                HrmBranch.id != branch_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Branch name already exists")
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_branch(db: Session, branch_id: str, *, company_id: str) -> None:
    row = get_branch(db, branch_id, company_id=company_id)
    dept_count = (
        db.query(func.count(HrmDepartment.id))
        .filter(HrmDepartment.branch_id == branch_id)
        .scalar()
        or 0
    )
    if dept_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete branch with {dept_count} department(s)",
        )
    db.delete(row)
    db.commit()
