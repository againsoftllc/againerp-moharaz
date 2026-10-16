from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.employee_salary import (
    EmployeeSalaryCreate,
    EmployeeSalaryListMeta,
    EmployeeSalaryListResponse,
    EmployeeSalaryResponse,
    EmployeeSalaryUpdate,
)
from app.services.hrm import employee_salary_service

router = APIRouter(prefix="/employee-salaries", tags=["hrm-employee-salaries"])


@router.get("", response_model=EmployeeSalaryListResponse)
def list_employee_salaries(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
) -> EmployeeSalaryListResponse:
    data, total = employee_salary_service.list_employee_salaries(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        employee_id=employee_id,
        is_active=is_active,
    )
    return EmployeeSalaryListResponse(
        data=data,
        meta=EmployeeSalaryListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{salary_id}", response_model=EmployeeSalaryResponse)
def get_employee_salary(
    salary_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeSalaryResponse:
    data = employee_salary_service.get_employee_salary(
        db, salary_id, company_id=company_id
    )
    return EmployeeSalaryResponse(data=data)


@router.post("", response_model=EmployeeSalaryResponse, status_code=201)
def create_employee_salary(
    payload: EmployeeSalaryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> EmployeeSalaryResponse:
    data = employee_salary_service.create_employee_salary(
        db, payload, created_by=user.id
    )
    return EmployeeSalaryResponse(data=data)


@router.patch("/{salary_id}", response_model=EmployeeSalaryResponse)
def update_employee_salary(
    salary_id: str,
    payload: EmployeeSalaryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeSalaryResponse:
    data = employee_salary_service.update_employee_salary(
        db, salary_id, payload, company_id=company_id
    )
    return EmployeeSalaryResponse(data=data)


@router.delete("/{salary_id}", status_code=204)
def delete_employee_salary(
    salary_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    employee_salary_service.delete_employee_salary(
        db, salary_id, company_id=company_id
    )
    return Response(status_code=204)
