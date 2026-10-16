from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.biometric import (
    BiometricDayListResponse,
    BiometricSyncRequest,
    BiometricSyncResponse,
    BiometricUnmatchedListResponse,
)
from app.services.hrm import biometric_service as svc

router = APIRouter(prefix="/biometric", tags=["hrm-biometric"])


@router.get("/day-records", response_model=BiometricDayListResponse)
def list_day_records(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    date: date = Query(..., description="YYYY-MM-DD"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_biometric_day_records(
        db, company_id=company_id, on_date=date, q=q
    )
    return BiometricDayListResponse(
        data=rows,
        meta={
            "count": len(rows),
            "date": date.isoformat(),
            "pending": sum(1 for r in rows if r.status == "pending"),
            "synced": sum(1 for r in rows if r.status == "synced"),
            "failed": sum(1 for r in rows if r.status == "failed"),
        },
    )


@router.post("/sync", response_model=BiometricSyncResponse)
def sync_to_attendance(
    payload: BiometricSyncRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    result = svc.sync_biometric_to_attendance(
        db,
        company_id=company_id,
        on_date=payload.date,
        employee_id=payload.employee_id,
        created_by=user.id,
    )
    return BiometricSyncResponse(data=result)


@router.get("/unmatched", response_model=BiometricUnmatchedListResponse)
def list_unmatched(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
):
    rows = svc.list_unmatched_codes(
        db, company_id=company_id, from_date=from_date, to_date=to_date
    )
    return BiometricUnmatchedListResponse(
        data=rows, meta={"count": len(rows)}
    )
