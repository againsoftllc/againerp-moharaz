from __future__ import annotations

import re
from typing import Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.hrm.org import (
    HrmBranch,
    HrmDepartment,
    HrmDesignation,
    HrmEmployee,
)
from app.schemas.hrm.employee import EmployeeCreate, EmployeeUpdate
from app.services.core.sequence_service import next_number as allocate_number

_CODE_RE = re.compile(r"^EMP(\d+)$", re.I)


def _next_employee_code(db: Session, company_id: str) -> str:
    def seed() -> int:
        max_n = 0
        for (code,) in (
            db.query(HrmEmployee.employee_code)
            .filter(HrmEmployee.company_id == company_id)
            .all()
        ):
            m = _CODE_RE.match((code or "").strip())
            if m:
                max_n = max(max_n, int(m.group(1)))
        return max_n + 1

    return allocate_number(
        db,
        company_id,
        "hrm.employee",
        initial=seed,
        is_taken=lambda code: db.query(HrmEmployee.id)
        .filter(HrmEmployee.employee_code == code)
        .first()
        is not None,
    )


def _require_org_fk(
    db: Session,
    *,
    company_id: str,
    branch_id: Optional[str],
    department_id: Optional[str],
    designation_id: Optional[str],
) -> None:
    if branch_id:
        row = db.get(HrmBranch, branch_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid branch_id")
    if department_id:
        row = db.get(HrmDepartment, department_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid department_id")
        if branch_id and row.branch_id and row.branch_id != branch_id:
            raise HTTPException(
                status_code=400, detail="department_id does not belong to branch_id"
            )
    if designation_id:
        row = db.get(HrmDesignation, designation_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid designation_id")
        if department_id and row.department_id and row.department_id != department_id:
            raise HTTPException(
                status_code=400,
                detail="designation_id does not belong to department_id",
            )


def _require_auth_user(db: Session, auth_user_id: Optional[str]) -> None:
    if not auth_user_id:
        return
    user = db.get(AuthUser, auth_user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid auth_user_id")


def _require_reporting_to(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str],
    reporting_to: Optional[str],
) -> None:
    if not reporting_to:
        return
    if employee_id and reporting_to == employee_id:
        raise HTTPException(status_code=400, detail="Employee cannot report to themselves")
    manager = db.get(HrmEmployee, reporting_to)
    if not manager or manager.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid reporting_to")
    # Prevent cycles: walk manager chain; if we hit employee_id, reject.
    if employee_id:
        seen: set[str] = set()
        cur: Optional[str] = reporting_to
        while cur:
            if cur == employee_id:
                raise HTTPException(
                    status_code=400,
                    detail="reporting_to would create a circular reporting line",
                )
            if cur in seen:
                break
            seen.add(cur)
            parent = db.get(HrmEmployee, cur)
            cur = parent.reporting_to if parent else None


def list_employees(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_status: Optional[str] = None,
    branch_id: Optional[str] = None,
    department_id: Optional[str] = None,
    designation_id: Optional[str] = None,
    q: Optional[str] = None,
) -> Tuple[Sequence[HrmEmployee], int]:
    query = db.query(HrmEmployee).filter(HrmEmployee.company_id == company_id)
    if employee_status:
        query = query.filter(HrmEmployee.employee_status == employee_status)
    if branch_id:
        query = query.filter(HrmEmployee.branch_id == branch_id)
    if department_id:
        query = query.filter(HrmEmployee.department_id == department_id)
    if designation_id:
        query = query.filter(HrmEmployee.designation_id == designation_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmEmployee.name.ilike(like))
            | (HrmEmployee.email.ilike(like))
            | (HrmEmployee.employee_code.ilike(like))
            | (HrmEmployee.phone.ilike(like))
        )
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmEmployee.name.asc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_employee(
    db: Session, employee_id: str, company_id: Optional[str] = None
) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


def create_employee(
    db: Session, payload: EmployeeCreate, *, created_by: Optional[str]
) -> HrmEmployee:
    _require_org_fk(
        db,
        company_id=payload.company_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        designation_id=payload.designation_id,
    )
    _require_auth_user(db, payload.auth_user_id)
    _require_reporting_to(
        db,
        company_id=payload.company_id,
        employee_id=None,
        reporting_to=payload.reporting_to,
    )

    code = (payload.employee_code or "").strip() or _next_employee_code(
        db, payload.company_id
    )
    dup = (
        db.query(HrmEmployee)
        .filter(
            HrmEmployee.company_id == payload.company_id,
            func.lower(HrmEmployee.employee_code) == code.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="employee_code already exists")

    if payload.auth_user_id:
        taken = (
            db.query(HrmEmployee)
            .filter(HrmEmployee.auth_user_id == payload.auth_user_id)
            .first()
        )
        if taken:
            raise HTTPException(status_code=409, detail="auth_user_id already linked")

    if payload.email:
        email_dup = (
            db.query(HrmEmployee)
            .filter(
                HrmEmployee.company_id == payload.company_id,
                func.lower(HrmEmployee.email) == payload.email.strip().lower(),
            )
            .first()
        )
        if email_dup:
            raise HTTPException(status_code=409, detail="email already exists")

    data = payload.model_dump()
    data["employee_code"] = code
    data["name"] = payload.name.strip()
    if payload.email:
        data["email"] = payload.email.strip()
    data["created_by"] = created_by
    # shift/policy tables may be empty — clear if not needed for v1 validation
    row = HrmEmployee(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_employee(
    db: Session, employee_id: str, payload: EmployeeUpdate, *, company_id: str
) -> HrmEmployee:
    row = get_employee(db, employee_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    branch_id = data.get("branch_id", row.branch_id)
    department_id = data.get("department_id", row.department_id)
    designation_id = data.get("designation_id", row.designation_id)
    _require_org_fk(
        db,
        company_id=company_id,
        branch_id=branch_id,
        department_id=department_id,
        designation_id=designation_id,
    )

    if "auth_user_id" in data:
        _require_auth_user(db, data["auth_user_id"])
        if data["auth_user_id"]:
            taken = (
                db.query(HrmEmployee)
                .filter(
                    HrmEmployee.auth_user_id == data["auth_user_id"],
                    HrmEmployee.id != employee_id,
                )
                .first()
            )
            if taken:
                raise HTTPException(status_code=409, detail="auth_user_id already linked")

    if "reporting_to" in data:
        _require_reporting_to(
            db,
            company_id=company_id,
            employee_id=employee_id,
            reporting_to=data["reporting_to"],
        )

    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "email" in data and data["email"]:
        email = data["email"].strip()
        email_dup = (
            db.query(HrmEmployee)
            .filter(
                HrmEmployee.company_id == company_id,
                func.lower(HrmEmployee.email) == email.lower(),
                HrmEmployee.id != employee_id,
            )
            .first()
        )
        if email_dup:
            raise HTTPException(status_code=409, detail="email already exists")
        data["email"] = email

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_employee(db: Session, employee_id: str, *, company_id: str) -> None:
    row = get_employee(db, employee_id, company_id=company_id)
    db.delete(row)
    db.commit()
