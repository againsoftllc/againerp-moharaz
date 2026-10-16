from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.holiday import (
    HolidayCreate,
    HolidayListMeta,
    HolidayListResponse,
    HolidayResponse,
    HolidayUpdate,
)
from app.services.hrm import holiday_service

router = APIRouter(prefix="/holidays", tags=["hrm-holidays"])


@router.get("", response_model=HolidayListResponse)
def list_holidays(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    branch_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> HolidayListResponse:
    data = holiday_service.list_holidays(
        db, company_id=company_id, branch_id=branch_id, q=q
    )
    return HolidayListResponse(data=data, meta=HolidayListMeta(count=len(data)))


@router.get("/{holiday_id}", response_model=HolidayResponse)
def get_holiday(
    holiday_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> HolidayResponse:
    data = holiday_service.get_holiday(db, holiday_id, company_id=company_id)
    return HolidayResponse(data=data)


@router.post("", response_model=HolidayResponse, status_code=201)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> HolidayResponse:
    data = holiday_service.create_holiday(db, payload, created_by=user.id)
    return HolidayResponse(data=data)


@router.patch("/{holiday_id}", response_model=HolidayResponse)
def update_holiday(
    holiday_id: str,
    payload: HolidayUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> HolidayResponse:
    data = holiday_service.update_holiday(
        db, holiday_id, payload, company_id=company_id
    )
    return HolidayResponse(data=data)


@router.delete("/{holiday_id}", status_code=204)
def delete_holiday(
    holiday_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    holiday_service.delete_holiday(db, holiday_id, company_id=company_id)
    return Response(status_code=204)
