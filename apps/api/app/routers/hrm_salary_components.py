from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.salary_component import (
    SalaryComponentCreate,
    SalaryComponentListMeta,
    SalaryComponentListResponse,
    SalaryComponentRead,
    SalaryComponentResponse,
    SalaryComponentUpdate,
)
from app.services.hrm import salary_component_service

router = APIRouter(prefix="/salary-components", tags=["hrm-salary-components"])


@router.get("", response_model=SalaryComponentListResponse)
def list_salary_components(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    type: Optional[str] = Query(default=None, pattern="^(earning|deduction)$"),
    q: Optional[str] = Query(default=None),
) -> SalaryComponentListResponse:
    rows = salary_component_service.list_salary_components(
        db, company_id=company_id, status=status, type=type, q=q
    )
    data = [SalaryComponentRead.model_validate(r) for r in rows]
    return SalaryComponentListResponse(
        data=data, meta=SalaryComponentListMeta(count=len(data))
    )


@router.get("/{component_id}", response_model=SalaryComponentResponse)
def get_salary_component(
    component_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalaryComponentResponse:
    row = salary_component_service.get_salary_component(
        db, component_id, company_id=company_id
    )
    return SalaryComponentResponse(data=SalaryComponentRead.model_validate(row))


@router.post("", response_model=SalaryComponentResponse, status_code=201)
def create_salary_component(
    payload: SalaryComponentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> SalaryComponentResponse:
    row = salary_component_service.create_salary_component(
        db, payload, created_by=user.id
    )
    return SalaryComponentResponse(data=SalaryComponentRead.model_validate(row))


@router.patch("/{component_id}", response_model=SalaryComponentResponse)
def update_salary_component(
    component_id: str,
    payload: SalaryComponentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalaryComponentResponse:
    row = salary_component_service.update_salary_component(
        db, component_id, payload, company_id=company_id
    )
    return SalaryComponentResponse(data=SalaryComponentRead.model_validate(row))


@router.delete("/{component_id}", status_code=204)
def delete_salary_component(
    component_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    salary_component_service.delete_salary_component(
        db, component_id, company_id=company_id
    )
    return Response(status_code=204)
