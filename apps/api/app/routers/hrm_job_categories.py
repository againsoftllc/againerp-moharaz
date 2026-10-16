from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.job_category import (
    JobCategoryCreate,
    JobCategoryListMeta,
    JobCategoryListResponse,
    JobCategoryRead,
    JobCategoryResponse,
    JobCategoryUpdate,
)
from app.services.hrm import job_category_service

router = APIRouter(prefix="/job-categories", tags=["hrm-job-categories"])


@router.get("", response_model=JobCategoryListResponse)
def list_job_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> JobCategoryListResponse:
    rows = job_category_service.list_job_categories(
        db, company_id=company_id, status=status, q=q
    )
    data = [JobCategoryRead.model_validate(r) for r in rows]
    return JobCategoryListResponse(data=data, meta=JobCategoryListMeta(count=len(data)))


@router.get("/{category_id}", response_model=JobCategoryResponse)
def get_job_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> JobCategoryResponse:
    row = job_category_service.get_job_category(db, category_id, company_id=company_id)
    return JobCategoryResponse(data=JobCategoryRead.model_validate(row))


@router.post("", response_model=JobCategoryResponse, status_code=201)
def create_job_category(
    payload: JobCategoryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> JobCategoryResponse:
    row = job_category_service.create_job_category(db, payload, created_by=user.id)
    return JobCategoryResponse(data=JobCategoryRead.model_validate(row))


@router.patch("/{category_id}", response_model=JobCategoryResponse)
def update_job_category(
    category_id: str,
    payload: JobCategoryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobCategoryResponse:
    row = job_category_service.update_job_category(
        db, category_id, payload, company_id=company_id
    )
    return JobCategoryResponse(data=JobCategoryRead.model_validate(row))


@router.delete("/{category_id}", status_code=204)
def delete_job_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    job_category_service.delete_job_category(db, category_id, company_id=company_id)
    return Response(status_code=204)
