from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.department import (
    DepartmentCreate,
    DepartmentListMeta,
    DepartmentListResponse,
    DepartmentRead,
    DepartmentResponse,
    DepartmentUpdate,
)
from app.services.hrm import department_service

router = APIRouter(prefix="/departments", tags=["hrm-departments"])


@router.get("", response_model=DepartmentListResponse)
def list_departments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    branch_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> DepartmentListResponse:
    rows = department_service.list_departments(
        db, company_id=company_id, branch_id=branch_id, status=status, q=q
    )
    data = [DepartmentRead.model_validate(r) for r in rows]
    return DepartmentListResponse(data=data, meta=DepartmentListMeta(count=len(data)))


@router.get("/{department_id}", response_model=DepartmentResponse)
def get_department(
    department_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> DepartmentResponse:
    row = department_service.get_department(db, department_id, company_id=company_id)
    return DepartmentResponse(data=DepartmentRead.model_validate(row))


@router.post("", response_model=DepartmentResponse, status_code=201)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> DepartmentResponse:
    payload.company_id = company_id
    row = department_service.create_department(db, payload, created_by=user.id)
    return DepartmentResponse(data=DepartmentRead.model_validate(row))


@router.patch("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> DepartmentResponse:
    row = department_service.update_department(
        db, department_id, payload, company_id=company_id
    )
    return DepartmentResponse(data=DepartmentRead.model_validate(row))


@router.delete("/{department_id}", status_code=204)
def delete_department(
    department_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    department_service.delete_department(db, department_id, company_id=company_id)
    return Response(status_code=204)
