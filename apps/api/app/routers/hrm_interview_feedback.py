from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.interview import (
    InterviewFeedbackCreate,
    InterviewFeedbackListMeta,
    InterviewFeedbackListResponse,
    InterviewFeedbackResponse,
    InterviewFeedbackUpdate,
)
from app.services.hrm import interview_service

router = APIRouter(prefix="/interview-feedback", tags=["hrm-interview-feedback"])


@router.get("", response_model=InterviewFeedbackListResponse)
def list_interview_feedback(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    interview_id: Optional[str] = Query(default=None),
) -> InterviewFeedbackListResponse:
    data = interview_service.list_interview_feedback(
        db, company_id=company_id, interview_id=interview_id
    )
    return InterviewFeedbackListResponse(
        data=data, meta=InterviewFeedbackListMeta(count=len(data))
    )


@router.get("/{feedback_id}", response_model=InterviewFeedbackResponse)
def get_interview_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewFeedbackResponse:
    data = interview_service.get_interview_feedback(
        db, feedback_id, company_id=company_id
    )
    return InterviewFeedbackResponse(data=data)


@router.post("", response_model=InterviewFeedbackResponse, status_code=201)
def create_interview_feedback(
    payload: InterviewFeedbackCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> InterviewFeedbackResponse:
    data = interview_service.create_interview_feedback(
        db, payload, created_by=user.id
    )
    return InterviewFeedbackResponse(data=data)


@router.patch("/{feedback_id}", response_model=InterviewFeedbackResponse)
def update_interview_feedback(
    feedback_id: str,
    payload: InterviewFeedbackUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewFeedbackResponse:
    data = interview_service.update_interview_feedback(
        db, feedback_id, payload, company_id=company_id
    )
    return InterviewFeedbackResponse(data=data)


@router.delete("/{feedback_id}", status_code=204)
def delete_interview_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    interview_service.delete_interview_feedback(
        db, feedback_id, company_id=company_id
    )
    return Response(status_code=204)
