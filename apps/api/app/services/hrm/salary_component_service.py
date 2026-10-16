from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.payroll import HrmEmployeeSalaryComponent, HrmSalaryComponent
from app.schemas.hrm.salary_component import SalaryComponentCreate, SalaryComponentUpdate


def list_salary_components(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    type: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmSalaryComponent]:
    query = db.query(HrmSalaryComponent).filter(
        HrmSalaryComponent.company_id == company_id
    )
    if status:
        query = query.filter(HrmSalaryComponent.status == status)
    if type:
        query = query.filter(HrmSalaryComponent.type == type)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmSalaryComponent.name.ilike(like))
            | (HrmSalaryComponent.description.ilike(like))
        )
    return query.order_by(HrmSalaryComponent.name.asc()).all()


def get_salary_component(
    db: Session, component_id: str, company_id: Optional[str] = None
) -> HrmSalaryComponent:
    row = db.get(HrmSalaryComponent, component_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Salary component not found")
    return row


def _assert_unique_name(
    db: Session, *, company_id: str, name: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmSalaryComponent).filter(
        HrmSalaryComponent.company_id == company_id,
        func.lower(HrmSalaryComponent.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(HrmSalaryComponent.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Salary component name already exists")


def create_salary_component(
    db: Session, payload: SalaryComponentCreate, *, created_by: Optional[str]
) -> HrmSalaryComponent:
    name = payload.name.strip()
    _assert_unique_name(db, company_id=payload.company_id, name=name)
    data = payload.model_dump()
    data["name"] = name
    data["created_by"] = created_by
    if data["calculation_type"] == "fixed":
        data["percentage_of_basic"] = None
    row = HrmSalaryComponent(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_salary_component(
    db: Session, component_id: str, payload: SalaryComponentUpdate, *, company_id: str
) -> HrmSalaryComponent:
    row = get_salary_component(db, component_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        _assert_unique_name(
            db, company_id=company_id, name=name, exclude_id=component_id
        )
        data["name"] = name

    calc = data.get("calculation_type", row.calculation_type)
    pct = data.get("percentage_of_basic", row.percentage_of_basic)
    if calc == "percentage" and pct is None:
        raise HTTPException(
            status_code=400,
            detail="percentage_of_basic is required when calculation_type=percentage",
        )
    if calc == "fixed":
        data["percentage_of_basic"] = None

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_salary_component(
    db: Session, component_id: str, *, company_id: str
) -> None:
    row = get_salary_component(db, component_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmEmployeeSalaryComponent.id))
        .filter(HrmEmployeeSalaryComponent.salary_component_id == component_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete salary component in use by {usage} employee salary row(s)",
        )
    db.delete(row)
    db.commit()
