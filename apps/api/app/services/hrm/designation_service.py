from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmDepartment, HrmDesignation, HrmEmployee
from app.schemas.hrm.designation import DesignationCreate, DesignationUpdate


def _require_department(db: Session, department_id: str, company_id: str) -> HrmDepartment:
    row = db.get(HrmDepartment, department_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid department_id")
    return row


def list_designations(
    db: Session,
    *,
    company_id: str,
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmDesignation]:
    query = db.query(HrmDesignation).filter(HrmDesignation.company_id == company_id)
    if department_id:
        query = query.filter(HrmDesignation.department_id == department_id)
    if status:
        query = query.filter(HrmDesignation.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmDesignation.name.ilike(like)) | (HrmDesignation.description.ilike(like))
        )
    return query.order_by(HrmDesignation.name.asc()).all()


def get_designation(
    db: Session, designation_id: str, company_id: Optional[str] = None
) -> HrmDesignation:
    row = db.get(HrmDesignation, designation_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Designation not found")
    return row


def create_designation(
    db: Session, payload: DesignationCreate, *, created_by: Optional[str]
) -> HrmDesignation:
    name = payload.name.strip()
    _require_department(db, payload.department_id, payload.company_id)

    dup = (
        db.query(HrmDesignation)
        .filter(
            HrmDesignation.company_id == payload.company_id,
            HrmDesignation.department_id == payload.department_id,
            func.lower(HrmDesignation.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=409, detail="Designation name already exists in this department"
        )

    row = HrmDesignation(
        company_id=payload.company_id,
        name=name,
        department_id=payload.department_id,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_designation(
    db: Session, designation_id: str, payload: DesignationUpdate, *, company_id: str
) -> HrmDesignation:
    row = get_designation(db, designation_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    next_dept = data.get("department_id", row.department_id)
    next_name = row.name
    if "name" in data and data["name"] is not None:
        next_name = data["name"].strip()
        data["name"] = next_name
    if "department_id" in data and data["department_id"] is not None:
        _require_department(db, data["department_id"], company_id)

    if "name" in data or "department_id" in data:
        dup = (
            db.query(HrmDesignation)
            .filter(
                HrmDesignation.company_id == company_id,
                HrmDesignation.department_id == next_dept,
                func.lower(HrmDesignation.name) == next_name.lower(),
                HrmDesignation.id != designation_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail="Designation name already exists in this department",
            )

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_designation(db: Session, designation_id: str, *, company_id: str) -> None:
    row = get_designation(db, designation_id, company_id=company_id)
    emp_count = (
        db.query(func.count(HrmEmployee.id))
        .filter(HrmEmployee.designation_id == designation_id)
        .scalar()
        or 0
    )
    if emp_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete designation with {emp_count} employee(s)",
        )
    db.delete(row)
    db.commit()
