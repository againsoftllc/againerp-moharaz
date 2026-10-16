from __future__ import annotations

import json
from decimal import Decimal
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmEmployee
from app.models.hrm.payroll import (
    HrmEmployeeSalary,
    HrmEmployeeSalaryComponent,
    HrmSalaryComponent,
)
from app.schemas.hrm.employee_salary import (
    EmployeeSalaryComponentIn,
    EmployeeSalaryComponentRead,
    EmployeeSalaryCreate,
    EmployeeSalaryRead,
    EmployeeSalaryUpdate,
)


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _validate_components(
    db: Session, company_id: str, components: list[EmployeeSalaryComponentIn]
) -> None:
    seen: set[str] = set()
    for item in components:
        cid = item.salary_component_id
        if cid in seen:
            raise HTTPException(
                status_code=400, detail=f"Duplicate salary_component_id: {cid}"
            )
        seen.add(cid)
        row = db.get(HrmSalaryComponent, cid)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail=f"Invalid salary_component_id: {cid}")
        if row.status != "active":
            raise HTTPException(
                status_code=400, detail=f"Salary component is inactive: {cid}"
            )


def _component_reads(
    db: Session, salary_id: str
) -> list[EmployeeSalaryComponentRead]:
    rows = (
        db.query(HrmEmployeeSalaryComponent, HrmSalaryComponent)
        .outerjoin(
            HrmSalaryComponent,
            HrmSalaryComponent.id == HrmEmployeeSalaryComponent.salary_component_id,
        )
        .filter(HrmEmployeeSalaryComponent.employee_salary_id == salary_id)
        .order_by(HrmSalaryComponent.name.asc().nullslast())
        .all()
    )
    result: list[EmployeeSalaryComponentRead] = []
    for link, comp in rows:
        result.append(
            EmployeeSalaryComponentRead(
                id=link.id,
                salary_component_id=link.salary_component_id,
                amount_override=link.amount_override,
                is_enabled=link.is_enabled,
                component_name=comp.name if comp else None,
                component_type=comp.type if comp else None,
                calculation_type=comp.calculation_type if comp else None,
                default_amount=comp.default_amount if comp else None,
                percentage_of_basic=comp.percentage_of_basic if comp else None,
            )
        )
    return result


def _to_read(db: Session, row: HrmEmployeeSalary) -> EmployeeSalaryRead:
    return EmployeeSalaryRead(
        id=row.id,
        company_id=row.company_id,
        employee_id=row.employee_id,
        basic_salary=row.basic_salary,
        is_active=row.is_active,
        calculation_status=row.calculation_status,
        notes=row.notes,
        components=_component_reads(db, row.id),
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_components(
    db: Session,
    *,
    company_id: str,
    salary_id: str,
    components: list[EmployeeSalaryComponentIn],
) -> None:
    existing = (
        db.query(HrmEmployeeSalaryComponent)
        .filter(HrmEmployeeSalaryComponent.employee_salary_id == salary_id)
        .all()
    )
    for link in existing:
        db.delete(link)
    db.flush()
    for item in components:
        db.add(
            HrmEmployeeSalaryComponent(
                company_id=company_id,
                employee_salary_id=salary_id,
                salary_component_id=item.salary_component_id,
                amount_override=item.amount_override,
                is_enabled=item.is_enabled,
            )
        )


def _json_component_ids(components: list[EmployeeSalaryComponentIn]) -> str:
    return json.dumps([c.salary_component_id for c in components])


def _deactivate_other_active(
    db: Session, *, company_id: str, employee_id: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmEmployeeSalary).filter(
        HrmEmployeeSalary.company_id == company_id,
        HrmEmployeeSalary.employee_id == employee_id,
        HrmEmployeeSalary.is_active.is_(True),
    )
    if exclude_id:
        query = query.filter(HrmEmployeeSalary.id != exclude_id)
    for row in query.all():
        row.is_active = False


def _sync_employee_base_salary(
    db: Session, employee: HrmEmployee, basic_salary: Optional[Decimal]
) -> None:
    if basic_salary is not None:
        employee.base_salary = basic_salary


def list_employee_salaries(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Tuple[list[EmployeeSalaryRead], int]:
    query = db.query(HrmEmployeeSalary).filter(
        HrmEmployeeSalary.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmEmployeeSalary.employee_id == employee_id)
    if is_active is not None:
        query = query.filter(HrmEmployeeSalary.is_active.is_(is_active))
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmEmployeeSalary.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return [_to_read(db, r) for r in rows], total


def get_employee_salary(
    db: Session, salary_id: str, company_id: Optional[str] = None
) -> EmployeeSalaryRead:
    row = db.get(HrmEmployeeSalary, salary_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee salary not found")
    return _to_read(db, row)


def create_employee_salary(
    db: Session, payload: EmployeeSalaryCreate, *, created_by: Optional[str]
) -> EmployeeSalaryRead:
    employee = _require_employee(db, payload.employee_id, payload.company_id)
    _validate_components(db, payload.company_id, payload.components)

    basic = payload.basic_salary
    if basic is None and employee.base_salary is not None:
        basic = employee.base_salary

    if payload.is_active:
        _deactivate_other_active(
            db, company_id=payload.company_id, employee_id=payload.employee_id
        )

    row = HrmEmployeeSalary(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        basic_salary=basic,
        components=_json_component_ids(payload.components),
        is_active=payload.is_active,
        calculation_status="pending",
        notes=payload.notes,
        created_by=created_by,
    )
    db.add(row)
    db.flush()
    _sync_components(
        db,
        company_id=payload.company_id,
        salary_id=row.id,
        components=payload.components,
    )
    if payload.is_active:
        _sync_employee_base_salary(db, employee, basic)
    db.commit()
    db.refresh(row)
    return _to_read(db, row)


def update_employee_salary(
    db: Session, salary_id: str, payload: EmployeeSalaryUpdate, *, company_id: str
) -> EmployeeSalaryRead:
    row = db.get(HrmEmployeeSalary, salary_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Employee salary not found")

    data = payload.model_dump(exclude_unset=True)
    components = data.pop("components", None)

    if components is not None:
        typed = [EmployeeSalaryComponentIn.model_validate(c) for c in components]
        _validate_components(db, company_id, typed)
        _sync_components(
            db, company_id=company_id, salary_id=row.id, components=typed
        )
        row.components = _json_component_ids(typed)
        row.calculation_status = "pending"

    become_active = data.get("is_active", row.is_active)
    if become_active and row.employee_id:
        _deactivate_other_active(
            db,
            company_id=company_id,
            employee_id=row.employee_id,
            exclude_id=row.id,
        )

    for key, value in data.items():
        setattr(row, key, value)

    if row.is_active and row.employee_id and (
        "basic_salary" in data or become_active
    ):
        employee = _require_employee(db, row.employee_id, company_id)
        _sync_employee_base_salary(db, employee, row.basic_salary)

    db.commit()
    db.refresh(row)
    return _to_read(db, row)


def delete_employee_salary(db: Session, salary_id: str, *, company_id: str) -> None:
    row = db.get(HrmEmployeeSalary, salary_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Employee salary not found")
    db.delete(row)
    db.commit()
