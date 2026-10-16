from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.shift import (
    ShiftCreate,
    ShiftListMeta,
    ShiftListResponse,
    ShiftRead,
    ShiftResponse,
    ShiftUpdate,
)
from app.services.hrm import shift_service

router = APIRouter(prefix="/shifts", tags=["hrm-shifts"])


@router.get("", response_model=ShiftListResponse)
def list_shifts(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> ShiftListResponse:
    rows = shift_service.list_shifts(db, company_id=company_id, status=status, q=q)
    data = [ShiftRead.model_validate(r) for r in rows]
    return ShiftListResponse(data=data, meta=ShiftListMeta(count=len(data)))


@router.get("/{shift_id}", response_model=ShiftResponse)
def get_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ShiftResponse:
    row = shift_service.get_shift(db, shift_id, company_id=company_id)
    return ShiftResponse(data=ShiftRead.model_validate(row))


@router.post("", response_model=ShiftResponse, status_code=201)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> ShiftResponse:
    row = shift_service.create_shift(db, payload, created_by=user.id)
    return ShiftResponse(data=ShiftRead.model_validate(row))


@router.patch("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: str,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ShiftResponse:
    row = shift_service.update_shift(db, shift_id, payload, company_id=company_id)
    return ShiftResponse(data=ShiftRead.model_validate(row))


@router.delete("/{shift_id}", status_code=204)
def delete_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    shift_service.delete_shift(db, shift_id, company_id=company_id)
    return Response(status_code=204)
