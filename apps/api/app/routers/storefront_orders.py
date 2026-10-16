from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.commerce_order import CommerceOrder, load_json
from app.models.commerce_order_event import CommerceOrderEvent
from app.models.commerce_order_shipment import CommerceOrderShipment
from app.schemas.storefront import (
    StorefrontOrderRead,
    StorefrontOrderResponse,
    StorefrontOrderTrackRead,
    StorefrontOrderTrackRequest,
    StorefrontOrderTrackResponse,
    StorefrontOrderTrackUpdate,
)

router = APIRouter(prefix="/orders", tags=["storefront-orders"])

TRACK_STEPS = ["Accepted", "Picked", "In Transit", "Ready for Delivery", "Delivered"]


def _normalize_phone(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def _progress_for_shipment(status: str, shipment_status: str) -> tuple[int, str]:
    key = (shipment_status or status or "").strip().lower()
    mapping = {
        "pending": (15, "Accepted"),
        "unfulfilled": (15, "Accepted"),
        "processing": (30, "Accepted"),
        "confirmed": (30, "Accepted"),
        "picked": (45, "Picked"),
        "packed": (45, "Picked"),
        "shipped": (65, "In Transit"),
        "in_transit": (65, "In Transit"),
        "out_for_delivery": (85, "Ready for Delivery"),
        "ready": (85, "Ready for Delivery"),
        "delivered": (100, "Delivered"),
        "completed": (100, "Delivered"),
        "cancelled": (10, "Accepted"),
        "canceled": (10, "Accepted"),
    }
    return mapping.get(key, (25, "Accepted"))


def _format_time(value: Optional[datetime]) -> str:
    if not value:
        return ""
    try:
        return value.strftime("%b %d, %Y %I:%M %p").replace(" 0", " ")
    except Exception:
        return str(value)


def _build_updates(db: Session, order: CommerceOrder) -> List[StorefrontOrderTrackUpdate]:
    updates: List[StorefrontOrderTrackUpdate] = []

    events = (
        db.query(CommerceOrderEvent)
        .filter(CommerceOrderEvent.order_id == order.id)
        .order_by(CommerceOrderEvent.created_at.asc())
        .limit(40)
        .all()
    )
    for ev in events:
        text = (ev.message or ev.event_type or "Order update").strip()
        updates.append(
            StorefrontOrderTrackUpdate(
                time=_format_time(ev.created_at),
                text=text,
            )
        )

    if not updates:
        timeline = load_json(order.timeline_json, [])
        if isinstance(timeline, list):
            for item in timeline[:20]:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("label") or item.get("message") or item.get("type") or "Update")
                raw_at = item.get("at") or item.get("time")
                time_label = str(raw_at) if raw_at else _format_time(order.order_date)
                updates.append(StorefrontOrderTrackUpdate(time=time_label, text=text))

    if not updates:
        updates.append(
            StorefrontOrderTrackUpdate(
                time=_format_time(order.order_date),
                text=f"Order {order.order_number} placed",
            )
        )
    return list(reversed(updates))  # newest first for UI


def _to_track_read(db: Session, order: CommerceOrder) -> StorefrontOrderTrackRead:
    shipment = (
        db.query(CommerceOrderShipment)
        .filter(CommerceOrderShipment.order_id == order.id)
        .order_by(CommerceOrderShipment.created_at.desc())
        .first()
    )
    consignment = (
        (shipment.tracking_number if shipment else None)
        or order.tracking_number
        or order.order_number
    )
    progress, step = _progress_for_shipment(order.status, order.shipment_status)
    address_parts = [
        order.shipping_address or "",
        order.shipping_city or "",
        order.shipping_region or "",
        order.shipping_country or "",
    ]
    shipping_line = ", ".join(p for p in address_parts if p)

    return StorefrontOrderTrackRead(
        order_number=order.order_number,
        consignment_id=consignment,
        status=order.status,
        payment_status=order.payment_status,
        shipment_status=order.shipment_status,
        payment_method=order.payment_method or "COD",
        grand_total=order.grand_total,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone or "",
        shipping_address=shipping_line or (order.shipping_address or ""),
        shipping_city=order.shipping_city,
        shipping_region=order.shipping_region,
        courier=(shipment.courier if shipment else None) or order.courier,
        tracking_url=(shipment.tracking_url if shipment else None) or order.tracking_url,
        placed_at=order.order_date,
        progress_pct=progress,
        current_step=step,
        steps=TRACK_STEPS,
        updates=_build_updates(db, order),
    )


def _find_order(db: Session, query: str) -> Optional[CommerceOrder]:
    q = query.strip()
    if not q:
        return None
    upper = q.upper()

    by_number = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.order_number.ilike(upper))
        .first()
    )
    if by_number:
        return by_number

    by_order_tracking = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.tracking_number.ilike(q))
        .first()
    )
    if by_order_tracking:
        return by_order_tracking

    shipment = (
        db.query(CommerceOrderShipment)
        .filter(
            or_(
                CommerceOrderShipment.tracking_number.ilike(q),
                CommerceOrderShipment.shipment_number.ilike(upper),
            )
        )
        .first()
    )
    if shipment:
        return db.get(CommerceOrder, shipment.order_id)
    return None


def _verify_contact(order: CommerceOrder, phone: Optional[str], email: Optional[str]) -> bool:
    """Optional extra check — if caller sends phone/email it must match."""
    if phone:
        want = _normalize_phone(phone)
        have = _normalize_phone(order.customer_phone or "")
        if want and have and not (have.endswith(want[-4:]) or want.endswith(have[-4:]) or want == have):
            return False
    if email:
        want_e = email.strip().lower()
        have_e = (order.customer_email or "").strip().lower()
        if want_e and have_e and want_e != have_e:
            return False
    return True


@router.post("/track", response_model=StorefrontOrderTrackResponse)
def track_storefront_order(
    payload: StorefrontOrderTrackRequest,
    db: Session = Depends(get_db),
) -> StorefrontOrderTrackResponse:
    order = _find_order(db, payload.query)
    if not order or not _verify_contact(order, payload.phone, payload.email):
        raise HTTPException(status_code=404, detail="Order not found. Check your order or tracking number.")
    return StorefrontOrderTrackResponse(data=_to_track_read(db, order))


@router.get("/{order_number}", response_model=StorefrontOrderResponse)
def get_storefront_order(
    order_number: str,
    email: str = Query(..., min_length=3, max_length=255),
    db: Session = Depends(get_db),
) -> StorefrontOrderResponse:
    normalized = order_number.strip().upper()
    normalized_email = email.strip().lower()

    row = (
        db.query(CommerceOrder)
        .filter(
            CommerceOrder.order_number == normalized,
            CommerceOrder.customer_email.ilike(normalized_email),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    return StorefrontOrderResponse(
        data=StorefrontOrderRead(
            id=row.id,
            order_number=row.order_number,
            status=row.status,
            payment_status=row.payment_status,
            shipment_status=row.shipment_status,
            grand_total=row.grand_total,
            placed_at=row.order_date,
            email=row.customer_email,
        ),
    )
