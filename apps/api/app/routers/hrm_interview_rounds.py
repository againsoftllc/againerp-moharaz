from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.interview_round import (
    InterviewRoundCreate,
    InterviewRoundListMeta,
    InterviewRoundListResponse,
    InterviewRoundRead,
    InterviewRoundResponse,
    InterviewRoundUpdate,
)
from app.services.hrm import interview_round_service

router = APIRouter(prefix="/interview-rounds", tags=["hrm-interview-rounds"])


@router.get("", response_model=InterviewRoundListResponse)
def list_interview_rounds(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    job_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
) -> InterviewRoundListResponse:
    rows = interview_round_service.list_interview_rounds(
        db, company_id=company_id, job_id=job_id, status=status
    )
    data = [InterviewRoundRead.model_validate(r) for r in rows]
    return InterviewRoundListResponse(
        data=data, meta=InterviewRoundListMeta(count=len(data))
    )


@router.get("/{round_id}", response_model=InterviewRoundResponse)
def get_interview_round(
    round_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewRoundResponse:
    row = interview_round_service.get_interview_round(
        db, round_id, company_id=company_id
    )
    return InterviewRoundResponse(data=InterviewRoundRead.model_validate(row))


@router.post("", response_model=InterviewRoundResponse, status_code=201)
def create_interview_round(
    payload: InterviewRoundCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> InterviewRoundResponse:
    row = interview_round_service.create_interview_round(
        db, payload, created_by=user.id
    )
    return InterviewRoundResponse(data=InterviewRoundRead.model_validate(row))


@router.patch("/{round_id}", response_model=InterviewRoundResponse)
def update_interview_round(
    round_id: str,
    payload: InterviewRoundUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewRoundResponse:
    row = interview_round_service.update_interview_round(
        db, round_id, payload, company_id=company_id
    )
    return InterviewRoundResponse(data=InterviewRoundRead.model_validate(row))


@router.delete("/{round_id}", status_code=204)
def delete_interview_round(
    round_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    interview_round_service.delete_interview_round(
        db, round_id, company_id=company_id
    )
    return Response(status_code=204)
