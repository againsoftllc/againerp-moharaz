from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.announcements import (
    AnnouncementCreate,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdate,
    AnnouncementViewCreate,
    AnnouncementViewListResponse,
    AnnouncementViewRead,
    AnnouncementViewResponse,
)
from app.services.hrm import announcements_service as svc

announcements_router = APIRouter(prefix="/announcements", tags=["hrm-announcements"])
views_router = APIRouter(prefix="/announcement-views", tags=["hrm-announcement-views"])


def _meta(rows):
    return {"count": len(rows)}


@announcements_router.get("", response_model=AnnouncementListResponse)
def list_announcements(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    category: Optional[str] = None,
    q: Optional[str] = None,
    featured_only: bool = Query(default=False),
    high_priority_only: bool = Query(default=False),
    active_only: bool = Query(default=False),
):
    rows = svc.list_announcements(
        db,
        company_id=company_id,
        category=category,
        q=q,
        featured_only=featured_only,
        high_priority_only=high_priority_only,
        active_only=active_only,
    )
    data = [svc._to_read(db, r) for r in rows]
    return AnnouncementListResponse(data=data, meta=_meta(data))


@announcements_router.get("/{row_id}", response_model=AnnouncementResponse)
def get_announcement(
    row_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.get_announcement(db, row_id, company_id=company_id)
    return AnnouncementResponse(data=svc._to_read(db, row))


@announcements_router.post("", response_model=AnnouncementResponse, status_code=201)
def create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_announcement(db, payload, created_by=user.id)
    return AnnouncementResponse(data=svc._to_read(db, row))


@announcements_router.patch("/{row_id}", response_model=AnnouncementResponse)
def update_announcement(
    row_id: str,
    payload: AnnouncementUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_announcement(db, row_id, payload, company_id=company_id)
    return AnnouncementResponse(data=svc._to_read(db, row))


@announcements_router.delete("/{row_id}", status_code=204)
def delete_announcement(
    row_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_announcement(db, row_id, company_id=company_id)
    return Response(status_code=204)


@views_router.get("", response_model=AnnouncementViewListResponse)
def list_views(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    announcement_id: Optional[str] = None,
    employee_id: Optional[str] = None,
):
    rows = svc.list_views(
        db, company_id=company_id, announcement_id=announcement_id, employee_id=employee_id
    )
    data = [AnnouncementViewRead.model_validate(r) for r in rows]
    return AnnouncementViewListResponse(data=data, meta=_meta(data))


@views_router.post("", response_model=AnnouncementViewResponse, status_code=201)
def mark_viewed(
    payload: AnnouncementViewCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.mark_viewed(db, payload)
    return AnnouncementViewResponse(data=AnnouncementViewRead.model_validate(row))


@views_router.delete("/{row_id}", status_code=204)
def delete_view(
    row_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_view(db, row_id, company_id=company_id)
    return Response(status_code=204)
