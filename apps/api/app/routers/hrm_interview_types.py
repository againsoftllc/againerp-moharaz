from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.interview_type import (
    InterviewTypeCreate,
    InterviewTypeListMeta,
    InterviewTypeListResponse,
    InterviewTypeRead,
    InterviewTypeResponse,
    InterviewTypeUpdate,
)
from app.services.hrm import interview_type_service

router = APIRouter(prefix="/interview-types", tags=["hrm-interview-types"])


@router.get("", response_model=InterviewTypeListResponse)
def list_interview_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> InterviewTypeListResponse:
    rows = interview_type_service.list_interview_types(
        db, company_id=company_id, status=status, q=q
    )
    data = [InterviewTypeRead.model_validate(r) for r in rows]
    return InterviewTypeListResponse(
        data=data, meta=InterviewTypeListMeta(count=len(data))
    )


@router.get("/{type_id}", response_model=InterviewTypeResponse)
def get_interview_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewTypeResponse:
    row = interview_type_service.get_interview_type(db, type_id, company_id=company_id)
    return InterviewTypeResponse(data=InterviewTypeRead.model_validate(row))


@router.post("", response_model=InterviewTypeResponse, status_code=201)
def create_interview_type(
    payload: InterviewTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> InterviewTypeResponse:
    row = interview_type_service.create_interview_type(db, payload, created_by=user.id)
    return InterviewTypeResponse(data=InterviewTypeRead.model_validate(row))


@router.patch("/{type_id}", response_model=InterviewTypeResponse)
def update_interview_type(
    type_id: str,
    payload: InterviewTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> InterviewTypeResponse:
    row = interview_type_service.update_interview_type(
        db, type_id, payload, company_id=company_id
    )
    return InterviewTypeResponse(data=InterviewTypeRead.model_validate(row))


@router.delete("/{type_id}", status_code=204)
def delete_interview_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    interview_type_service.delete_interview_type(db, type_id, company_id=company_id)
    return Response(status_code=204)
