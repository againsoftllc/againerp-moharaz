from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.job_location import (
    JobLocationCreate,
    JobLocationListMeta,
    JobLocationListResponse,
    JobLocationRead,
    JobLocationResponse,
    JobLocationUpdate,
)
from app.services.hrm import job_location_service

router = APIRouter(prefix="/job-locations", tags=["hrm-job-locations"])


@router.get("", response_model=JobLocationListResponse)
def list_job_locations(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    is_remote: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> JobLocationListResponse:
    rows = job_location_service.list_job_locations(
        db, company_id=company_id, status=status, is_remote=is_remote, q=q
    )
    data = [JobLocationRead.model_validate(r) for r in rows]
    return JobLocationListResponse(data=data, meta=JobLocationListMeta(count=len(data)))


@router.get("/{location_id}", response_model=JobLocationResponse)
def get_job_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> JobLocationResponse:
    row = job_location_service.get_job_location(
        db, location_id, company_id=company_id
    )
    return JobLocationResponse(data=JobLocationRead.model_validate(row))


@router.post("", response_model=JobLocationResponse, status_code=201)
def create_job_location(
    payload: JobLocationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> JobLocationResponse:
    row = job_location_service.create_job_location(db, payload, created_by=user.id)
    return JobLocationResponse(data=JobLocationRead.model_validate(row))


@router.patch("/{location_id}", response_model=JobLocationResponse)
def update_job_location(
    location_id: str,
    payload: JobLocationUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobLocationResponse:
    row = job_location_service.update_job_location(
        db, location_id, payload, company_id=company_id
    )
    return JobLocationResponse(data=JobLocationRead.model_validate(row))


@router.delete("/{location_id}", status_code=204)
def delete_job_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    job_location_service.delete_job_location(db, location_id, company_id=company_id)
    return Response(status_code=204)
