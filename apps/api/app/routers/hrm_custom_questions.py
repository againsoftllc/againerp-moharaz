from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.custom_question import (
    CustomQuestionCreate,
    CustomQuestionListMeta,
    CustomQuestionListResponse,
    CustomQuestionRead,
    CustomQuestionResponse,
    CustomQuestionUpdate,
)
from app.services.hrm import custom_question_service

router = APIRouter(prefix="/custom-questions", tags=["hrm-custom-questions"])


@router.get("", response_model=CustomQuestionListResponse)
def list_custom_questions(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    q: Optional[str] = Query(default=None),
) -> CustomQuestionListResponse:
    rows = custom_question_service.list_custom_questions(
        db, company_id=company_id, q=q
    )
    data = [CustomQuestionRead.model_validate(r) for r in rows]
    return CustomQuestionListResponse(
        data=data, meta=CustomQuestionListMeta(count=len(data))
    )


@router.get("/{question_id}", response_model=CustomQuestionResponse)
def get_custom_question(
    question_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomQuestionResponse:
    row = custom_question_service.get_custom_question(
        db, question_id, company_id=company_id
    )
    return CustomQuestionResponse(data=CustomQuestionRead.model_validate(row))


@router.post("", response_model=CustomQuestionResponse, status_code=201)
def create_custom_question(
    payload: CustomQuestionCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> CustomQuestionResponse:
    row = custom_question_service.create_custom_question(
        db, payload, created_by=user.id
    )
    return CustomQuestionResponse(data=CustomQuestionRead.model_validate(row))


@router.patch("/{question_id}", response_model=CustomQuestionResponse)
def update_custom_question(
    question_id: str,
    payload: CustomQuestionUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomQuestionResponse:
    row = custom_question_service.update_custom_question(
        db, question_id, payload, company_id=company_id
    )
    return CustomQuestionResponse(data=CustomQuestionRead.model_validate(row))


@router.delete("/{question_id}", status_code=204)
def delete_custom_question(
    question_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    custom_question_service.delete_custom_question(
        db, question_id, company_id=company_id
    )
    return Response(status_code=204)
