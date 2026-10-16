"""Order status of a website (storefront) order, changed from the admin's Sales / Website → Orders drawer.

The storefront customer portal reads the *commerce* order (`commerce_orders.status`), the admin screens list the Sales
order that mirrors it (`notes` carries `commerce_order_id=<id>`). One call changes both, so the customer sees the
same status the admin set, and both orders get a history entry (commerce timeline + sales Activity tab).

Only the plain lifecycle steps are offered here; returns and refunds have their own flows (stock and finance entries),
so `returned` / `refunded` are not selectable."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.commerce_order import CommerceOrder
from app.models.sales import SalesOrder
from app.services.commerce.commerce_order_service import (
    STATUS_TRANSITIONS,
    CommerceOrderService,
    OrderLifecycleError,
)
from app.services.sales.sales_service import SalesService

MARKER = "commerce_order_id="

# the order the dropdown lists its choices in
LIFECYCLE_ORDER = ("pending", "confirmed", "packed", "shipped", "delivered", "completed", "cancelled")

STATUS_LABELS = {
    "pending": "Pending",
    "confirmed": "Confirmed",
    "packed": "Packed",
    "shipped": "Shipped",
    "delivered": "Delivered",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "returned": "Returned",
    "refunded": "Refunded",
}

# website status → the Sales order's own status (draft / confirmed / processing / completed / cancelled)
SALES_STATUS_FOR = {
    "pending": "confirmed",
    "confirmed": "confirmed",
    "packed": "confirmed",
    "shipped": "processing",
    "delivered": "processing",
    "completed": "completed",
    "cancelled": "cancelled",
}


def commerce_order_id_of(order: SalesOrder) -> Optional[str]:
    notes = order.notes or ""
    if MARKER not in notes:
        return None
    rest = notes.split(MARKER, 1)[1].split()
    return rest[0].strip() if rest else None


# the forward path of an order; `cancelled` is a side exit (allowed until it ships)
FORWARD = ("pending", "confirmed", "packed", "shipped", "delivered", "completed")


def _path(current: str, to_status: str) -> list[str]:
    """The lifecycle steps from `current` to `to_status`: every step in between is taken (and so is in the order's
    timeline), `cancelled` is one step. Empty when there is no way."""
    if to_status == "cancelled":
        return ["cancelled"] if "cancelled" in STATUS_TRANSITIONS.get(current, frozenset()) else []
    if current not in FORWARD or to_status not in FORWARD:
        return []
    a, b = FORWARD.index(current), FORWARD.index(to_status)
    return list(FORWARD[a + 1 : b + 1]) if b > a else []


def next_statuses(current: str) -> list[str]:
    """Statuses an admin may move a website order to from `current`: any later step, or cancel while it hasn't
    shipped (returns / refunds have their own flows, with stock and finance entries)."""
    return [s for s in LIFECYCLE_ORDER if s != current and _path(current, s)]


def set_website_status(
    db: Session,
    order: SalesOrder,
    to_status: str,
    *,
    company_id: str,
    actor_id: Optional[str],
    actor_name: str,
    message: Optional[str] = None,
) -> SalesOrder:
    commerce_id = commerce_order_id_of(order)
    commerce = db.get(CommerceOrder, commerce_id) if commerce_id else None
    if commerce is None:
        raise HTTPException(status_code=400, detail="This is not a website order")
    if to_status not in next_statuses(commerce.status):
        raise HTTPException(
            status_code=400,
            detail=f"A {STATUS_LABELS.get(commerce.status, commerce.status).lower()} order cannot be moved to "
            f"{STATUS_LABELS.get(to_status, to_status).lower()}",
        )

    from_status = commerce.status
    try:
        # each step updates the status, shipment status, timeline, activity and event log the customer portal reads
        for step in _path(from_status, to_status):
            commerce = CommerceOrderService(db, company_id).transition(
                commerce.id, step, actor=actor_name or "admin", message=message
            )
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    svc = SalesService(db, company_id=company_id)
    prev_sales = order.status
    new_sales = SALES_STATUS_FOR.get(to_status, prev_sales)
    now = datetime.utcnow()
    order.status = new_sales
    order.shipping_status = commerce.shipment_status
    if to_status in ("delivered", "completed"):
        order.delivery_status = "delivered"
    if new_sales == "completed" and not order.completed_at:
        order.completed_at = now
    if new_sales == "cancelled" and not order.cancelled_at:
        order.cancelled_at = now
    if new_sales != prev_sales:
        svc._record_order_history(order.id, prev_sales, new_sales, actor_id, f"Website status → {to_status}")
    svc._record_activity(
        order.id,
        "updated",
        f"Order status changed from {STATUS_LABELS.get(from_status, from_status)} to {STATUS_LABELS.get(to_status, to_status)}",
        actor_id,
        description=message or "Shown to the customer in their account",
    )
    db.flush()
    return order
