from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.award_type import (
    AwardTypeCreate,
    AwardTypeListMeta,
    AwardTypeListResponse,
    AwardTypeRead,
    AwardTypeResponse,
    AwardTypeUpdate,
)
from app.services.hrm import award_type_service

router = APIRouter(prefix="/award-types", tags=["hrm-award-types"])


@router.get("", response_model=AwardTypeListResponse)
def list_award_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> AwardTypeListResponse:
    rows = award_type_service.list_award_types(
        db, company_id=company_id, status=status, q=q
    )
    data = [AwardTypeRead.model_validate(r) for r in rows]
    return AwardTypeListResponse(data=data, meta=AwardTypeListMeta(count=len(data)))


@router.get("/{award_type_id}", response_model=AwardTypeResponse)
def get_award_type(
    award_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> AwardTypeResponse:
    row = award_type_service.get_award_type(db, award_type_id, company_id=company_id)
    return AwardTypeResponse(data=AwardTypeRead.model_validate(row))


@router.post("", response_model=AwardTypeResponse, status_code=201)
def create_award_type(
    payload: AwardTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> AwardTypeResponse:
    row = award_type_service.create_award_type(db, payload, created_by=user.id)
    return AwardTypeResponse(data=AwardTypeRead.model_validate(row))


@router.patch("/{award_type_id}", response_model=AwardTypeResponse)
def update_award_type(
    award_type_id: str,
    payload: AwardTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AwardTypeResponse:
    row = award_type_service.update_award_type(
        db, award_type_id, payload, company_id=company_id
    )
    return AwardTypeResponse(data=AwardTypeRead.model_validate(row))


@router.delete("/{award_type_id}", status_code=204)
def delete_award_type(
    award_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    award_type_service.delete_award_type(db, award_type_id, company_id=company_id)
    return Response(status_code=204)
