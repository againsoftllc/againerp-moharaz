from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.designation import (
    DesignationCreate,
    DesignationListMeta,
    DesignationListResponse,
    DesignationRead,
    DesignationResponse,
    DesignationUpdate,
)
from app.services.hrm import designation_service

router = APIRouter(prefix="/designations", tags=["hrm-designations"])


@router.get("", response_model=DesignationListResponse)
def list_designations(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    department_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> DesignationListResponse:
    rows = designation_service.list_designations(
        db,
        company_id=company_id,
        department_id=department_id,
        status=status,
        q=q,
    )
    data = [DesignationRead.model_validate(r) for r in rows]
    return DesignationListResponse(data=data, meta=DesignationListMeta(count=len(data)))


@router.get("/{designation_id}", response_model=DesignationResponse)
def get_designation(
    designation_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> DesignationResponse:
    row = designation_service.get_designation(db, designation_id, company_id=company_id)
    return DesignationResponse(data=DesignationRead.model_validate(row))


@router.post("", response_model=DesignationResponse, status_code=201)
def create_designation(
    payload: DesignationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> DesignationResponse:
    payload.company_id = company_id
    row = designation_service.create_designation(db, payload, created_by=user.id)
    return DesignationResponse(data=DesignationRead.model_validate(row))


@router.patch("/{designation_id}", response_model=DesignationResponse)
def update_designation(
    designation_id: str,
    payload: DesignationUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> DesignationResponse:
    row = designation_service.update_designation(
        db, designation_id, payload, company_id=company_id
    )
    return DesignationResponse(data=DesignationRead.model_validate(row))


@router.delete("/{designation_id}", status_code=204)
def delete_designation(
    designation_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    designation_service.delete_designation(db, designation_id, company_id=company_id)
    return Response(status_code=204)
