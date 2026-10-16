from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.employee import (
    EmployeeCreate,
    EmployeeListMeta,
    EmployeeListResponse,
    EmployeeRead,
    EmployeeResponse,
    EmployeeUpdate,
)
from app.services.hrm import employee_service

router = APIRouter(prefix="/employees", tags=["hrm-employees"])


@router.get("", response_model=EmployeeListResponse)
def list_employees(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_status: Optional[str] = Query(
        default=None, pattern="^(active|inactive|terminated|probation)$"
    ),
    branch_id: Optional[str] = Query(default=None),
    department_id: Optional[str] = Query(default=None),
    designation_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Search name, email, code, phone"),
) -> EmployeeListResponse:
    rows, total = employee_service.list_employees(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_status=employee_status,
        branch_id=branch_id,
        department_id=department_id,
        designation_id=designation_id,
        q=q,
    )
    data = [EmployeeRead.model_validate(r) for r in rows]
    return EmployeeListResponse(
        data=data,
        meta=EmployeeListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeResponse:
    row = employee_service.get_employee(db, employee_id, company_id=company_id)
    return EmployeeResponse(data=EmployeeRead.model_validate(row))


@router.post("", response_model=EmployeeResponse, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeResponse:
    payload.company_id = company_id
    row = employee_service.create_employee(db, payload, created_by=user.id)
    return EmployeeResponse(data=EmployeeRead.model_validate(row))


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeResponse:
    row = employee_service.update_employee(
        db, employee_id, payload, company_id=company_id
    )
    return EmployeeResponse(data=EmployeeRead.model_validate(row))


@router.delete("/{employee_id}", status_code=204)
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    employee_service.delete_employee(db, employee_id, company_id=company_id)
    return Response(status_code=204)
