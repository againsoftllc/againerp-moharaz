from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.interview import (
    InterviewCreate,
    InterviewListMeta,
    InterviewListResponse,
    InterviewResponse,
    InterviewUpdate,
)
from app.services.hrm import interview_service

router = APIRouter(prefix="/interviews", tags=["hrm-interviews"])


@router.get("", response_model=InterviewListResponse)
def list_interviews(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    candidate_id: Optional[str] = Query(default=None),
    job_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(scheduled|completed|cancelled|no_show)$"
    ),
) -> InterviewListResponse:
    data, total = interview_service.list_interviews(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        candidate_id=candidate_id,
        job_id=job_id,
        status=status,
    )
    return InterviewListResponse(
        data=data,
        meta=InterviewListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{interview_id}", response_model=InterviewResponse)
def get_interview(
    interview_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewResponse:
    data = interview_service.get_interview(db, interview_id, company_id=company_id)
    return InterviewResponse(data=data)


@router.post("", response_model=InterviewResponse, status_code=201)
def create_interview(
    payload: InterviewCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> InterviewResponse:
    data = interview_service.create_interview(db, payload, created_by=user.id)
    return InterviewResponse(data=data)


@router.patch("/{interview_id}", response_model=InterviewResponse)
def update_interview(
    interview_id: str,
    payload: InterviewUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewResponse:
    data = interview_service.update_interview(
        db, interview_id, payload, company_id=company_id
    )
    return InterviewResponse(data=data)


@router.post("/{interview_id}/complete", response_model=InterviewResponse)
def complete_interview(
    interview_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewResponse:
    data = interview_service.complete_interview(
        db, interview_id, company_id=company_id
    )
    return InterviewResponse(data=data)


@router.post("/{interview_id}/cancel", response_model=InterviewResponse)
def cancel_interview(
    interview_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewResponse:
    data = interview_service.cancel_interview(db, interview_id, company_id=company_id)
    return InterviewResponse(data=data)


@router.post("/{interview_id}/no-show", response_model=InterviewResponse)
def mark_no_show(
    interview_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewResponse:
    data = interview_service.mark_no_show(db, interview_id, company_id=company_id)
    return InterviewResponse(data=data)


@router.delete("/{interview_id}", status_code=204)
def delete_interview(
    interview_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    interview_service.delete_interview(db, interview_id, company_id=company_id)
    return Response(status_code=204)
