from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.super_admin_auth import require_super_admin
from app.models.auth_activity_log import AuthActivityLog
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company import COMPANY_STATUSES, Company
from app.models.super_admin_user import SuperAdminUser
from app.schemas.super_admin import (
    CompanyListMeta,
    CompanyListResponse,
    CompanyRead,
    CompanyResponse,
    CompanySuspendRequest,
    CompanyUpdate,
    DashboardStats,
    DashboardStatsResponse,
    ImpersonateResponse,
    ModuleInfo,
    ModuleListResponse,
)
from app.security import new_session_token
from app.services import rbac as rbac_service
from app.services.auth_user_read import user_read

SESSION_DAYS = 7

router = APIRouter(
    prefix="/super-admin",
    tags=["super-admin-companies"],
    dependencies=[Depends(require_super_admin)],
)


def _read(row: Company) -> CompanyRead:
    return CompanyRead.model_validate(row)


@router.get("/companies", response_model=CompanyListResponse)
def list_companies(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None),
) -> CompanyListResponse:
    query = db.query(Company)
    if status_filter:
        query = query.filter(Company.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((Company.name.ilike(like)) | (Company.slug.ilike(like)))
    rows = query.order_by(Company.created_at.desc()).all()
    data = [_read(row) for row in rows]
    return CompanyListResponse(data=data, meta=CompanyListMeta(count=len(data)))


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def dashboard_stats(db: Session = Depends(get_db)) -> DashboardStatsResponse:
    rows = db.query(Company).all()
    stats = DashboardStats(
        total=len(rows),
        trialing=sum(1 for r in rows if r.status == "trialing"),
        active=sum(1 for r in rows if r.status == "active"),
        suspended=sum(1 for r in rows if r.status == "suspended"),
        cancelled=sum(1 for r in rows if r.status == "cancelled"),
    )
    return DashboardStatsResponse(data=stats)


@router.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(company_id: str, db: Session = Depends(get_db)) -> CompanyResponse:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyResponse(data=_read(row))


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
def update_company(company_id: str, payload: CompanyUpdate, db: Session = Depends(get_db)) -> CompanyResponse:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    if payload.status is not None:
        if payload.status not in COMPANY_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status; must be one of {COMPANY_STATUSES}")
        row.status = payload.status
    if payload.name is not None:
        row.name = payload.name
    if payload.plan_id is not None:
        row.plan_id = payload.plan_id
    if payload.trial_ends_at is not None:
        row.trial_ends_at = payload.trial_ends_at
    if payload.subscription_ends_at is not None:
        row.subscription_ends_at = payload.subscription_ends_at
    if payload.suspended_reason is not None:
        row.suspended_reason = payload.suspended_reason
    if payload.enabled_modules is not None:
        row.enabled_modules = json.dumps(payload.enabled_modules)
    db.commit()
    db.refresh(row)
    return CompanyResponse(data=_read(row))


@router.get("/modules", response_model=ModuleListResponse)
def list_modules() -> ModuleListResponse:
    return ModuleListResponse(data=[ModuleInfo(**m) for m in rbac_service.module_registry()])


@router.post("/companies/{company_id}/impersonate", response_model=ImpersonateResponse)
def impersonate_company(
    company_id: str,
    db: Session = Depends(get_db),
    actor: SuperAdminUser = Depends(require_super_admin),
) -> ImpersonateResponse:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    user = (
        db.query(AuthUser)
        .filter(AuthUser.company_id == company_id, AuthUser.role == "admin", AuthUser.is_active.is_(True))
        .order_by(AuthUser.created_at.asc())
        .first()
    )
    if not user:
        user = (
            db.query(AuthUser)
            .filter(AuthUser.company_id == company_id, AuthUser.is_active.is_(True))
            .order_by(AuthUser.created_at.asc())
            .first()
        )
    if not user:
        raise HTTPException(status_code=404, detail="This company has no active users to log in as")

    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token=token, expires_at=expires_at))
    db.add(
        AuthActivityLog(
            user_id=user.id,
            actor_id=actor.id,
            actor_name=f"{actor.name} (super admin)",
            action="impersonated",
            detail=f"Super admin {actor.email} logged in as this account",
        )
    )
    db.commit()

    return ImpersonateResponse(
        token=token,
        expires_at=expires_at,
        user=user_read(db, user),
        permissions=rbac_service.permissions_for_api(db, user),
    )


@router.post("/companies/{company_id}/suspend", response_model=CompanyResponse)
def suspend_company(company_id: str, payload: CompanySuspendRequest, db: Session = Depends(get_db)) -> CompanyResponse:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    row.status = "suspended"
    row.suspended_reason = payload.reason
    db.commit()
    db.refresh(row)
    return CompanyResponse(data=_read(row))


@router.post("/companies/{company_id}/activate", response_model=CompanyResponse)
def activate_company(company_id: str, db: Session = Depends(get_db)) -> CompanyResponse:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    row.status = "active"
    row.suspended_reason = None
    db.commit()
    db.refresh(row)
    return CompanyResponse(data=_read(row))
