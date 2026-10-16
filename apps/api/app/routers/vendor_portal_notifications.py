"""Vendor-facing notifications — SPEC.md §35 (in-app only, Phase 1)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.vendor_portal_auth import VendorIdentity, require_vendor_user
from app.schemas.vendor.notification import (
    VendorNotificationListResponse,
    VendorNotificationMarkReadResponse,
    VendorNotificationRead,
)
from app.services.vendor import vendor_notification_service

router = APIRouter(prefix="/vendor-portal/notifications", tags=["vendor-portal-notifications"])


def _read(row) -> VendorNotificationRead:
    return VendorNotificationRead(
        id=row.id,
        event=row.event,
        title=row.title,
        message=row.message,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        is_read=row.is_read,
        created_at=row.created_at,
    )


@router.get("", response_model=VendorNotificationListResponse)
def list_notifications(
    identity: VendorIdentity = Depends(require_vendor_user),
    db: Session = Depends(get_db),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
) -> VendorNotificationListResponse:
    rows = vendor_notification_service.list_notifications(
        db, vendor_id=identity.vendor_id, unread_only=unread_only
    ).limit(limit).all()
    unread = vendor_notification_service.unread_count(db, vendor_id=identity.vendor_id)
    return VendorNotificationListResponse(data=[_read(r) for r in rows], unread_count=unread)


@router.post("/{notification_id}/read", response_model=VendorNotificationMarkReadResponse)
def mark_read(
    notification_id: str,
    identity: VendorIdentity = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> VendorNotificationMarkReadResponse:
    row = vendor_notification_service.mark_read(db, vendor_id=identity.vendor_id, notification_id=notification_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    return VendorNotificationMarkReadResponse(data=_read(row))


@router.post("/read-all")
def mark_all_read(
    identity: VendorIdentity = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> dict:
    count = vendor_notification_service.mark_all_read(db, vendor_id=identity.vendor_id)
    return {"marked_read": count}
