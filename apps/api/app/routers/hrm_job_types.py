from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.job_type import (
    JobTypeCreate,
    JobTypeListMeta,
    JobTypeListResponse,
    JobTypeRead,
    JobTypeResponse,
    JobTypeUpdate,
)
from app.services.hrm import job_type_service

router = APIRouter(prefix="/job-types", tags=["hrm-job-types"])


@router.get("", response_model=JobTypeListResponse)
def list_job_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> JobTypeListResponse:
    rows = job_type_service.list_job_types(
        db, company_id=company_id, status=status, q=q
    )
    data = [JobTypeRead.model_validate(r) for r in rows]
    return JobTypeListResponse(data=data, meta=JobTypeListMeta(count=len(data)))


@router.get("/{type_id}", response_model=JobTypeResponse)
def get_job_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> JobTypeResponse:
    row = job_type_service.get_job_type(db, type_id, company_id=company_id)
    return JobTypeResponse(data=JobTypeRead.model_validate(row))


@router.post("", response_model=JobTypeResponse, status_code=201)
def create_job_type(
    payload: JobTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> JobTypeResponse:
    row = job_type_service.create_job_type(db, payload, created_by=user.id)
    return JobTypeResponse(data=JobTypeRead.model_validate(row))


@router.patch("/{type_id}", response_model=JobTypeResponse)
def update_job_type(
    type_id: str,
    payload: JobTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobTypeResponse:
    row = job_type_service.update_job_type(
        db, type_id, payload, company_id=company_id
    )
    return JobTypeResponse(data=JobTypeRead.model_validate(row))


@router.delete("/{type_id}", status_code=204)
def delete_job_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    job_type_service.delete_job_type(db, type_id, company_id=company_id)
    return Response(status_code=204)
