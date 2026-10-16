from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.job_posting import (
    JobPostingCreate,
    JobPostingListMeta,
    JobPostingListResponse,
    JobPostingResponse,
    JobPostingUpdate,
)
from app.services.hrm import job_posting_service

router = APIRouter(prefix="/job-postings", tags=["hrm-job-postings"])


@router.get("", response_model=JobPostingListResponse)
def list_job_postings(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|published|closed)$"
    ),
    is_published: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> JobPostingListResponse:
    data, total = job_posting_service.list_job_postings(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        status=status,
        is_published=is_published,
        q=q,
    )
    return JobPostingListResponse(
        data=data,
        meta=JobPostingListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{posting_id}", response_model=JobPostingResponse)
def get_job_posting(
    posting_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> JobPostingResponse:
    data = job_posting_service.get_job_posting(db, posting_id, company_id=company_id)
    return JobPostingResponse(data=data)


@router.post("", response_model=JobPostingResponse, status_code=201)
def create_job_posting(
    payload: JobPostingCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> JobPostingResponse:
    data = job_posting_service.create_job_posting(db, payload, created_by=user.id)
    return JobPostingResponse(data=data)


@router.patch("/{posting_id}", response_model=JobPostingResponse)
def update_job_posting(
    posting_id: str,
    payload: JobPostingUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobPostingResponse:
    data = job_posting_service.update_job_posting(
        db, posting_id, payload, company_id=company_id
    )
    return JobPostingResponse(data=data)


@router.post("/{posting_id}/publish", response_model=JobPostingResponse)
def publish_job_posting(
    posting_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobPostingResponse:
    data = job_posting_service.publish_job_posting(
        db, posting_id, company_id=company_id
    )
    return JobPostingResponse(data=data)


@router.post("/{posting_id}/close", response_model=JobPostingResponse)
def close_job_posting(
    posting_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobPostingResponse:
    data = job_posting_service.close_job_posting(
        db, posting_id, company_id=company_id
    )
    return JobPostingResponse(data=data)


@router.delete("/{posting_id}", status_code=204)
def delete_job_posting(
    posting_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    job_posting_service.delete_job_posting(db, posting_id, company_id=company_id)
    return Response(status_code=204)
