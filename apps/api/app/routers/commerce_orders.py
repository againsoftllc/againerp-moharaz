from __future__ import annotations

import json
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import get_current_company_id, get_current_user, require_write_access
from app.database import get_db
from app.models.auth_user import AuthUser
from app.models.commerce_order import CommerceOrder, load_json
from app.models.commerce_order_item import CommerceOrderItem
from app.schemas.commerce_order import (
    OrderCancelRequest,
    OrderEventListResponse,
    OrderEventRead,
    OrderItemRead,
    OrderListMeta,
    OrderListResponse,
    OrderRead,
    OrderRefundCreate,
    OrderResponse,
    OrderReturnCreate,
    OrderShipmentCreate,
    OrderShipmentListResponse,
    OrderShipmentRead,
    OrderShipmentResponse,
    OrderTransitionRequest,
    OrderUpdate,
    PathaoConsignmentCreate,
    PathaoConsignmentRead,
    PathaoConsignmentResponse,
)
from app.schemas.commerce_inventory import (
    CommerceInventoryHistoryListResponse,
    CommerceInventoryHistoryRead,
)
from app.services.ecommerce.commerce_inventory_service import CommerceInventoryService
from app.services.commerce.commerce_order_service import (
    CommerceOrderService,
    OrderLifecycleError,
    ShipmentCreateInput,
    ShipmentLineInput,
)

router = APIRouter(prefix="/orders", tags=["commerce-orders"])


def _service(db: Session, company_id: str) -> CommerceOrderService:
    return CommerceOrderService(db, company_id=company_id)


def _items_for_order(db: Session, order_id: str) -> List[CommerceOrderItem]:
    return (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order_id)
        .order_by(CommerceOrderItem.sort_order, CommerceOrderItem.name)
        .all()
    )


def _event_to_read(row) -> OrderEventRead:
    payload = {}
    try:
        payload = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return OrderEventRead(
        id=row.id,
        order_id=row.order_id,
        event_type=row.event_type,
        from_status=row.from_status,
        to_status=row.to_status,
        from_payment_status=row.from_payment_status,
        to_payment_status=row.to_payment_status,
        from_shipment_status=row.from_shipment_status,
        to_shipment_status=row.to_shipment_status,
        actor=row.actor,
        message=row.message,
        payload=payload,
        created_at=row.created_at,
    )


def _shipment_to_read(row) -> OrderShipmentRead:
    return OrderShipmentRead(
        id=row.id,
        order_id=row.order_id,
        shipment_number=row.shipment_number,
        status=row.status,
        courier=row.courier,
        tracking_number=row.tracking_number,
        tracking_url=row.tracking_url,
        items=load_json(row.items_json, []),
        shipped_at=row.shipped_at,
        delivered_at=row.delivered_at,
        notes=row.notes,
        created_at=row.created_at,
    )


def _to_read(db: Session, row: CommerceOrder, items: List[CommerceOrderItem]) -> OrderRead:
    svc = _service(db, row.company_id or "default")
    item_reads = [OrderItemRead.model_validate(i) for i in items]
    qty_total = sum(i.quantity for i in items)
    return OrderRead(
        id=row.id,
        company_id=row.company_id,
        order_number=row.order_number,
        order_date=row.order_date,
        status=row.status,
        payment_status=row.payment_status,
        shipment_status=row.shipment_status,
        source=row.source,
        branch=row.branch,
        assigned_staff=row.assigned_staff,
        priority=row.priority,
        tags=load_json(row.tags_json, []),
        customer_id=row.customer_id,
        billing_address_id=row.billing_address_id,
        shipping_address_id=row.shipping_address_id,
        payment_id=row.payment_id,
        invoice_id=row.invoice_id,
        primary_shipment_id=row.primary_shipment_id,
        warehouse_id=row.warehouse_id,
        customer_name=row.customer_name,
        customer_phone=row.customer_phone,
        customer_email=row.customer_email,
        customer_group=row.customer_group,
        customer_lifetime_value=row.customer_lifetime_value,
        customer_order_count=row.customer_order_count,
        customer_risk_score=row.customer_risk_score,
        billing_address=row.billing_address,
        billing_city=row.billing_city,
        billing_region=row.billing_region,
        billing_country=row.billing_country,
        shipping_address=row.shipping_address,
        shipping_city=row.shipping_city,
        shipping_region=row.shipping_region,
        shipping_country=row.shipping_country,
        payment_method=row.payment_method,
        payment_transaction_id=row.payment_transaction_id,
        paid_amount=row.paid_amount,
        due_amount=row.due_amount,
        refund_amount=row.refund_amount,
        courier=row.courier,
        tracking_number=row.tracking_number,
        tracking_url=row.tracking_url,
        shipping_cost=row.shipping_cost,
        shipped_at=row.shipped_at,
        delivered_at=row.delivered_at,
        subtotal=row.subtotal,
        discount_amount=row.discount_amount,
        tax_amount=row.tax_amount,
        shipping_amount=row.shipping_amount,
        grand_total=row.grand_total,
        notes=row.notes,
        ai_risk=row.ai_risk,
        ai_summary=row.ai_summary,
        timeline=load_json(row.timeline_json, []),
        activities=load_json(row.activities_json, []),
        comments=load_json(row.comments_json, []),
        attachments=load_json(row.attachments_json, []),
        payment_timeline=load_json(row.payment_timeline_json, []),
        ai_insights=load_json(row.ai_insights_json, {}),
        followers=load_json(row.followers_json, []),
        items=item_reads,
        item_count=qty_total,
        available_transitions=svc.available_transitions(row),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _actor(user: AuthUser) -> str:
    return user.name or user.email or user.id


@router.get("", response_model=OrderListResponse)
def list_orders(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    branch: Optional[str] = Query(default=None),
) -> OrderListResponse:
    query = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.company_id == company_id)
        .order_by(CommerceOrder.order_date.desc())
    )

    if status:
        query = query.filter(CommerceOrder.status == status)
    if payment_status:
        query = query.filter(CommerceOrder.payment_status == payment_status)
    if branch:
        query = query.filter(CommerceOrder.branch == branch)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            (CommerceOrder.order_number.ilike(term))
            | (CommerceOrder.customer_name.ilike(term))
            | (CommerceOrder.customer_phone.ilike(term))
            | (CommerceOrder.customer_email.ilike(term)),
        )

    rows = query.all()
    data: List[OrderRead] = []
    total_revenue = Decimal("0")
    for row in rows:
        items = _items_for_order(db, row.id)
        data.append(_to_read(db, row, items))
        total_revenue += row.grand_total

    return OrderListResponse(
        data=data,
        meta=OrderListMeta(count=len(data), total_revenue=total_revenue),
    )


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    row = db.get(CommerceOrder, order_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Order not found")
    items = _items_for_order(db, row.id)
    return OrderResponse(data=_to_read(db, row, items))


@router.get("/{order_id}/inventory-history", response_model=CommerceInventoryHistoryListResponse)
def order_inventory_history(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CommerceInventoryHistoryListResponse:
    row = db.get(CommerceOrder, order_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Order not found")
    inv = CommerceInventoryService(db)
    rows = inv.list_history(reference=row.order_number, limit=200)
    return CommerceInventoryHistoryListResponse(
        data=[
            CommerceInventoryHistoryRead(
                id=m.id,
                item_id=m.item_id,
                warehouse_id=m.warehouse_id,
                movement_type=m.movement_type,
                quantity=m.quantity,
                qty_before=m.qty_before,
                qty_after=m.qty_after,
                reference=m.reference,
                notes=m.notes,
                created_at=m.created_at,
            )
            for m in rows
        ],
        meta={"count": len(rows), "order_number": row.order_number},
    )


@router.get("/{order_id}/events", response_model=OrderEventListResponse)
def list_order_events(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> OrderEventListResponse:
    try:
        events = _service(db, company_id).list_events(order_id)
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return OrderEventListResponse(data=[_event_to_read(e) for e in events])


@router.get("/{order_id}/shipments", response_model=OrderShipmentListResponse)
def list_order_shipments(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> OrderShipmentListResponse:
    try:
        rows = _service(db, company_id).list_shipments(order_id)
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return OrderShipmentListResponse(data=[_shipment_to_read(r) for r in rows])


@router.patch("/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: str,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    row = db.get(CommerceOrder, order_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Order not found")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] != row.status:
        try:
            row = _service(db, company_id).transition(order_id, updates.pop("status"), actor="admin")
        except OrderLifecycleError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    for key, value in updates.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    items = _items_for_order(db, row.id)
    return OrderResponse(data=_to_read(db, row, items))


@router.post("/{order_id}/transition", response_model=OrderResponse)
def transition_order(
    order_id: str,
    payload: OrderTransitionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    try:
        row = _service(db, company_id).transition(
            order_id,
            payload.status,
            actor=_actor(user),
            message=payload.message,
        )
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    items = _items_for_order(db, row.id)
    return OrderResponse(data=_to_read(db, row, items))


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: str,
    payload: OrderCancelRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    try:
        row = _service(db, company_id).cancel(order_id, reason=payload.reason, actor=_actor(user))
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    items = _items_for_order(db, row.id)
    return OrderResponse(data=_to_read(db, row, items))


@router.post("/{order_id}/shipments", response_model=OrderShipmentResponse)
def create_order_shipment(
    order_id: str,
    payload: OrderShipmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderShipmentResponse:
    try:
        shipment = _service(db, company_id).create_shipment(
            order_id,
            ShipmentCreateInput(
                lines=[ShipmentLineInput(order_item_id=l.order_item_id, quantity=l.quantity) for l in payload.lines],
                courier=payload.courier,
                tracking_number=payload.tracking_number,
                tracking_url=payload.tracking_url,
                notes=payload.notes,
                mark_shipped=payload.mark_shipped,
                create_pathao=payload.create_pathao,
            ),
            actor=_actor(user),
        )
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OrderShipmentResponse(data=_shipment_to_read(shipment))


@router.post("/{order_id}/pathao-consignment", response_model=PathaoConsignmentResponse)
def create_pathao_consignment(
    order_id: str,
    payload: PathaoConsignmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PathaoConsignmentResponse:
    """Create a Pathao consignment for an order when the Pathao plugin is active.

    If Pathao is not installed/enabled, returns skipped=true without failing the order module.
    """
    from app.services.pathao_shipping import get_active_pathao_plugin

    plugin = get_active_pathao_plugin(db)
    if not plugin:
        return PathaoConsignmentResponse(
            data=PathaoConsignmentRead(
                created=False,
                skipped=True,
                message="Pathao plugin is not installed or not ready",
            ),
        )

    order = db.get(CommerceOrder, order_id)
    if not order or (order.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Order not found")

    items = _items_for_order(db, order.id)
    lines = [
        ShipmentLineInput(order_item_id=item.id, quantity=item.quantity - item.quantity_shipped)
        for item in items
        if (item.quantity - item.quantity_shipped) > 0
    ]
    if not lines:
        # Already fully shipped — try Pathao on primary shipment if present
        if order.primary_shipment_id:
            from app.models.commerce_order_shipment import CommerceOrderShipment
            from app.services.pathao_shipping import maybe_create_pathao_consignment

            shipment = db.get(CommerceOrderShipment, order.primary_shipment_id)
            if shipment:
                result = maybe_create_pathao_consignment(
                    db,
                    order,
                    shipment,
                    force=True,
                    item_quantity=sum(i.quantity for i in items) or 1,
                )
                db.commit()
                db.refresh(shipment)
                return PathaoConsignmentResponse(
                    data=PathaoConsignmentRead(
                        created=result.created,
                        skipped=result.skipped,
                        consignment_id=result.consignment_id,
                        tracking_url=result.tracking_url,
                        message=result.message,
                        shipment=_shipment_to_read(shipment),
                    ),
                )
        raise HTTPException(status_code=400, detail="No remaining items to ship")

    try:
        shipment = _service(db, company_id).create_shipment(
            order_id,
            ShipmentCreateInput(
                lines=lines,
                courier="Pathao",
                notes=payload.notes,
                mark_shipped=payload.mark_shipped,
                create_pathao=True,
            ),
            actor=_actor(user),
        )
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created = bool(shipment.tracking_number)
    return PathaoConsignmentResponse(
        data=PathaoConsignmentRead(
            created=created,
            skipped=not created,
            consignment_id=shipment.tracking_number or "",
            tracking_url=shipment.tracking_url or "",
            message=(
                f"Pathao consignment {shipment.tracking_number}"
                if created
                else "Shipment created but Pathao consignment was not created"
            ),
            shipment=_shipment_to_read(shipment),
        ),
    )


@router.post("/{order_id}/returns", response_model=OrderResponse)
def create_order_return(
    order_id: str,
    payload: OrderReturnCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    try:
        _service(db, company_id).create_return(
            order_id,
            order_item_id=payload.order_item_id,
            quantity=payload.quantity,
            reason=payload.reason,
            actor=_actor(user),
        )
        row = db.get(CommerceOrder, order_id)
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    items = _items_for_order(db, order_id)
    return OrderResponse(data=_to_read(db, row, items))


@router.post("/{order_id}/refunds", response_model=OrderResponse)
def create_order_refund(
    order_id: str,
    payload: OrderRefundCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> OrderResponse:
    try:
        _service(db, company_id).create_refund(
            order_id,
            amount=payload.amount,
            method=payload.method,
            reason=payload.reason,
            actor=_actor(user),
        )
        row = db.get(CommerceOrder, order_id)
    except OrderLifecycleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    items = _items_for_order(db, order_id)
    return OrderResponse(data=_to_read(db, row, items))
