from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.award import (
    AwardCreate,
    AwardListMeta,
    AwardListResponse,
    AwardRead,
    AwardResponse,
    AwardUpdate,
)
from app.services.hrm import award_service

router = APIRouter(prefix="/awards", tags=["hrm-awards"])


@router.get("", response_model=AwardListResponse)
def list_awards(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    award_type_id: Optional[str] = Query(default=None),
) -> AwardListResponse:
    rows = award_service.list_awards(
        db,
        company_id=company_id,
        employee_id=employee_id,
        award_type_id=award_type_id,
    )
    data = [AwardRead.model_validate(r) for r in rows]
    return AwardListResponse(data=data, meta=AwardListMeta(count=len(data)))


@router.get("/{award_id}", response_model=AwardResponse)
def get_award(
    award_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> AwardResponse:
    row = award_service.get_award(db, award_id, company_id=company_id)
    return AwardResponse(data=AwardRead.model_validate(row))


@router.post("", response_model=AwardResponse, status_code=201)
def create_award(
    payload: AwardCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> AwardResponse:
    row = award_service.create_award(db, payload, created_by=user.id)
    return AwardResponse(data=AwardRead.model_validate(row))


@router.patch("/{award_id}", response_model=AwardResponse)
def update_award(
    award_id: str,
    payload: AwardUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AwardResponse:
    row = award_service.update_award(db, award_id, payload, company_id=company_id)
    return AwardResponse(data=AwardRead.model_validate(row))


@router.delete("/{award_id}", status_code=204)
def delete_award(
    award_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    award_service.delete_award(db, award_id, company_id=company_id)
    return Response(status_code=204)
