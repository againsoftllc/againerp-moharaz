from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmBranch, HrmDepartment, HrmDesignation
from app.schemas.hrm.department import DepartmentCreate, DepartmentUpdate


def _require_branch(db: Session, branch_id: str, company_id: str) -> HrmBranch:
    row = db.get(HrmBranch, branch_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid branch_id")
    return row


def list_departments(
    db: Session,
    *,
    company_id: str,
    branch_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmDepartment]:
    query = db.query(HrmDepartment).filter(HrmDepartment.company_id == company_id)
    if branch_id:
        query = query.filter(HrmDepartment.branch_id == branch_id)
    if status:
        query = query.filter(HrmDepartment.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmDepartment.name.ilike(like)) | (HrmDepartment.description.ilike(like))
        )
    return query.order_by(HrmDepartment.name.asc()).all()


def get_department(
    db: Session, department_id: str, company_id: Optional[str] = None
) -> HrmDepartment:
    row = db.get(HrmDepartment, department_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Department not found")
    return row


def create_department(
    db: Session, payload: DepartmentCreate, *, created_by: Optional[str]
) -> HrmDepartment:
    name = payload.name.strip()
    _require_branch(db, payload.branch_id, payload.company_id)

    dup = (
        db.query(HrmDepartment)
        .filter(
            HrmDepartment.company_id == payload.company_id,
            HrmDepartment.branch_id == payload.branch_id,
            func.lower(HrmDepartment.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Department name already exists in this branch")

    row = HrmDepartment(
        company_id=payload.company_id,
        name=name,
        branch_id=payload.branch_id,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_department(
    db: Session, department_id: str, payload: DepartmentUpdate, *, company_id: str
) -> HrmDepartment:
    row = get_department(db, department_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    next_branch = data.get("branch_id", row.branch_id)
    next_name = row.name
    if "name" in data and data["name"] is not None:
        next_name = data["name"].strip()
        data["name"] = next_name
    if "branch_id" in data and data["branch_id"] is not None:
        _require_branch(db, data["branch_id"], company_id)

    if "name" in data or "branch_id" in data:
        dup = (
            db.query(HrmDepartment)
            .filter(
                HrmDepartment.company_id == company_id,
                HrmDepartment.branch_id == next_branch,
                func.lower(HrmDepartment.name) == next_name.lower(),
                HrmDepartment.id != department_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Department name already exists in this branch"
            )

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_department(db: Session, department_id: str, *, company_id: str) -> None:
    row = get_department(db, department_id, company_id=company_id)
    desig_count = (
        db.query(func.count(HrmDesignation.id))
        .filter(HrmDesignation.department_id == department_id)
        .scalar()
        or 0
    )
    if desig_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete department with {desig_count} designation(s)",
        )
    db.delete(row)
    db.commit()
