"""Vendor in-app notifications — SPEC.md §35 (in-app channel, Phase 1 scope)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.vendor.vendor_notification import VendorNotification


def notify(
    db: Session,
    *,
    vendor_id: str,
    event: str,
    title: str,
    message: str = "",
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    vendor_user_id: Optional[str] = None,
) -> VendorNotification:
    row = VendorNotification(
        vendor_id=vendor_id,
        vendor_user_id=vendor_user_id,
        event=event,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(row)
    return row


def list_notifications(db: Session, *, vendor_id: str, unread_only: bool = False):
    q = db.query(VendorNotification).filter(VendorNotification.vendor_id == vendor_id)
    if unread_only:
        q = q.filter(VendorNotification.is_read.is_(False))
    return q.order_by(VendorNotification.created_at.desc())


def unread_count(db: Session, *, vendor_id: str) -> int:
    return (
        db.query(VendorNotification)
        .filter(VendorNotification.vendor_id == vendor_id, VendorNotification.is_read.is_(False))
        .count()
    )


def mark_read(db: Session, *, vendor_id: str, notification_id: str) -> Optional[VendorNotification]:
    row = db.get(VendorNotification, notification_id)
    if not row or row.vendor_id != vendor_id:
        return None
    row.is_read = True
    db.commit()
    return row


def mark_all_read(db: Session, *, vendor_id: str) -> int:
    rows = (
        db.query(VendorNotification)
        .filter(VendorNotification.vendor_id == vendor_id, VendorNotification.is_read.is_(False))
        .all()
    )
    for row in rows:
        row.is_read = True
    db.commit()
    return len(rows)
