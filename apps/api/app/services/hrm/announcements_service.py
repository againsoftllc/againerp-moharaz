from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Type, TypeVar

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.hrm.meetings import HrmAnnouncement, HrmAnnouncementView
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.announcements import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    AnnouncementViewCreate,
)

T = TypeVar("T")


def _get(db: Session, model: Type[T], row_id: str, company_id: Optional[str], label: str) -> T:
    row = db.get(model, row_id)
    if not row or (company_id and getattr(row, "company_id", None) != company_id):
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _is_active(row: HrmAnnouncement, today: Optional[date] = None) -> bool:
    today = today or date.today()
    if row.start_date and row.start_date > today:
        return False
    if row.end_date and row.end_date < today:
        return False
    return True


def _view_count(db: Session, announcement_id: str) -> int:
    return (
        db.query(func.count(HrmAnnouncementView.id))
        .filter(HrmAnnouncementView.announcement_id == announcement_id)
        .scalar()
        or 0
    )


def _to_read(db: Session, row: HrmAnnouncement, *, include_counts: bool = True) -> AnnouncementRead:
    data = AnnouncementRead.model_validate(row)
    data.is_active = _is_active(row)
    if include_counts:
        data.view_count = _view_count(db, row.id)
    return data


def list_announcements(
    db: Session,
    *,
    company_id: str,
    category: Optional[str] = None,
    q: Optional[str] = None,
    featured_only: bool = False,
    high_priority_only: bool = False,
    active_only: bool = False,
):
    query = db.query(HrmAnnouncement).filter(HrmAnnouncement.company_id == company_id)
    if category:
        query = query.filter(HrmAnnouncement.category == category)
    if featured_only:
        query = query.filter(HrmAnnouncement.is_featured.is_(True))
    if high_priority_only:
        query = query.filter(HrmAnnouncement.is_high_priority.is_(True))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmAnnouncement.title.ilike(like),
                HrmAnnouncement.description.ilike(like),
                HrmAnnouncement.content.ilike(like),
            )
        )
    rows = query.order_by(
        HrmAnnouncement.is_high_priority.desc(),
        HrmAnnouncement.is_featured.desc(),
        HrmAnnouncement.created_at.desc(),
    ).all()
    if active_only:
        today = date.today()
        rows = [r for r in rows if _is_active(r, today)]
    return rows


def get_announcement(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAnnouncement, row_id, company_id, "Announcement")


def create_announcement(db: Session, payload: AnnouncementCreate, *, created_by: Optional[str]):
    data = payload.model_dump()
    data["title"] = payload.title.strip()
    data["start_date"] = payload.start_date or date.today()
    data["created_by"] = created_by
    row = HrmAnnouncement(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_announcement(db: Session, row_id: str, payload: AnnouncementUpdate, *, company_id: str):
    row = get_announcement(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    start = row.start_date
    end = row.end_date
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    db.commit()
    db.refresh(row)
    return row


def delete_announcement(db: Session, row_id: str, *, company_id: str):
    row = get_announcement(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


def list_views(
    db: Session,
    *,
    company_id: str,
    announcement_id: Optional[str] = None,
    employee_id: Optional[str] = None,
):
    query = db.query(HrmAnnouncementView).filter(HrmAnnouncementView.company_id == company_id)
    if announcement_id:
        query = query.filter(HrmAnnouncementView.announcement_id == announcement_id)
    if employee_id:
        query = query.filter(HrmAnnouncementView.employee_id == employee_id)
    return query.order_by(HrmAnnouncementView.viewed_at.desc()).all()


def get_view(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmAnnouncementView, row_id, company_id, "Announcement view")


def mark_viewed(db: Session, payload: AnnouncementViewCreate):
    get_announcement(db, payload.announcement_id, company_id=payload.company_id)
    _require_employee(db, payload.employee_id, payload.company_id)
    existing = (
        db.query(HrmAnnouncementView)
        .filter(
            HrmAnnouncementView.company_id == payload.company_id,
            HrmAnnouncementView.announcement_id == payload.announcement_id,
            HrmAnnouncementView.employee_id == payload.employee_id,
        )
        .first()
    )
    if existing:
        existing.viewed_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    row = HrmAnnouncementView(
        company_id=payload.company_id,
        announcement_id=payload.announcement_id,
        employee_id=payload.employee_id,
        viewed_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_view(db: Session, row_id: str, *, company_id: str):
    row = get_view(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()
