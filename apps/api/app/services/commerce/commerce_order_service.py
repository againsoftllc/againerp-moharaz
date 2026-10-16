"""Commerce order lifecycle — status transitions, shipments, cancel, ERP hooks (STEP 07)."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.commerce_order import CommerceOrder, dump_json, load_json
from app.models.commerce_order_address import CommerceOrderAddress
from app.models.commerce_order_event import CommerceOrderEvent
from app.models.commerce_order_item import CommerceOrderItem
from app.models.commerce_order_refund import CommerceOrderRefund
from app.models.commerce_order_return import CommerceOrderReturn
from app.models.commerce_order_shipment import CommerceOrderShipment
from app.models.finance import FinanceReceivable
from app.security import new_session_token
from app.services.ecommerce.checkout_constants import DEFAULT_COMPANY_ID
from app.services.ecommerce.commerce_inventory_service import CommerceInventoryService


class OrderLifecycleError(ValueError):
    """Invalid transition or order operation."""


ORDER_STATUSES = frozenset(
    {
        "pending",
        "confirmed",
        "packed",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "returned",
        "refunded",
    },
)

TERMINAL_STATUSES = frozenset({"completed", "cancelled", "returned", "refunded"})

STATUS_TRANSITIONS: Dict[str, frozenset[str]] = {
    "pending": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"packed", "cancelled"}),
    "packed": frozenset({"shipped", "cancelled"}),
    "shipped": frozenset({"delivered"}),
    "delivered": frozenset({"completed", "returned"}),
    "completed": frozenset({"returned", "refunded"}),
    "cancelled": frozenset(),
    "returned": frozenset({"refunded"}),
    "refunded": frozenset(),
}

STATUS_SIDE_EFFECTS: Dict[str, Dict[str, str]] = {
    "confirmed": {"shipment_status": "unfulfilled"},
    "packed": {"shipment_status": "unfulfilled"},
    "shipped": {"shipment_status": "shipped"},
    "delivered": {"shipment_status": "delivered"},
    "completed": {"shipment_status": "delivered"},
    "cancelled": {"shipment_status": "returned"},
    "returned": {"shipment_status": "returned"},
    "refunded": {"payment_status": "refunded", "shipment_status": "returned"},
}


@dataclass(frozen=True)
class ShipmentLineInput:
    order_item_id: str
    quantity: int


@dataclass(frozen=True)
class ShipmentCreateInput:
    lines: List[ShipmentLineInput]
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notes: Optional[str] = None
    mark_shipped: bool = True
    create_pathao: bool = False


class CommerceOrderService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id
        self._inventory = CommerceInventoryService(db)

    def available_transitions(self, order: CommerceOrder) -> List[str]:
        return sorted(STATUS_TRANSITIONS.get(order.status, frozenset()))

    def transition(
        self,
        order_id: str,
        to_status: str,
        *,
        actor: str = "admin",
        message: Optional[str] = None,
    ) -> CommerceOrder:
        order = self._get_order(order_id)
        self._assert_transition(order, to_status)

        from_status = order.status
        from_payment = order.payment_status
        from_shipment = order.shipment_status

        order.status = to_status
        side = STATUS_SIDE_EFFECTS.get(to_status, {})
        if "payment_status" in side:
            order.payment_status = side["payment_status"]
        if "shipment_status" in side:
            order.shipment_status = side["shipment_status"]

        now = datetime.utcnow()
        if to_status == "shipped" and not order.shipped_at:
            order.shipped_at = now
        if to_status == "delivered" and not order.delivered_at:
            order.delivered_at = now
        if to_status == "cancelled":
            self._release_all_reservations(order)

        self._append_timeline(order, f"Status → {to_status}", actor=actor)
        self._append_activity(order, "status_change", f"Order status changed to {to_status}", actor)
        self._record_event(
            order,
            event_type="status_transition",
            from_status=from_status,
            to_status=to_status,
            from_payment_status=from_payment,
            to_payment_status=order.payment_status,
            from_shipment_status=from_shipment,
            to_shipment_status=order.shipment_status,
            actor=actor,
            message=message,
        )
        self._erp_hook(order, from_status, to_status)
        self._db.commit()
        self._db.refresh(order)
        return order

    def cancel(
        self,
        order_id: str,
        *,
        reason: Optional[str] = None,
        actor: str = "admin",
    ) -> CommerceOrder:
        return self.transition(
            order_id,
            "cancelled",
            actor=actor,
            message=reason or "Order cancelled",
        )

    def create_shipment(
        self,
        order_id: str,
        payload: ShipmentCreateInput,
        *,
        actor: str = "admin",
    ) -> CommerceOrderShipment:
        order = self._get_order(order_id)
        if order.status in TERMINAL_STATUSES:
            raise OrderLifecycleError(f"Cannot ship order in status {order.status}")

        items = self._items(order.id)
        item_map = {row.id: row for row in items}
        shipment_lines: List[Dict[str, Any]] = []
        fulfill_queue: List[tuple[CommerceOrderItem, int]] = []

        for line in payload.lines:
            if line.quantity <= 0:
                raise OrderLifecycleError("Shipment quantity must be positive")
            row = item_map.get(line.order_item_id)
            if not row:
                raise OrderLifecycleError(f"Order line {line.order_item_id} not found")
            remaining = row.quantity - row.quantity_shipped
            if line.quantity > remaining:
                raise OrderLifecycleError(
                    f"Cannot ship {line.quantity} of {row.name}; {remaining} remaining",
                )
            row.quantity_shipped += line.quantity
            shipment_lines.append(
                {
                    "order_item_id": row.id,
                    "item_id": row.item_id,
                    "product_id": row.product_id,
                    "sku": row.sku,
                    "name": row.name,
                    "quantity": line.quantity,
                },
            )
            if payload.mark_shipped and row.item_id:
                fulfill_queue.append((row, line.quantity))

        shipment_number = f"SHP-{new_session_token()[:8].upper()}"
        now = datetime.utcnow() if payload.mark_shipped else None
        shipment = CommerceOrderShipment(
            order_id=order.id,
            shipment_number=shipment_number,
            status="shipped" if payload.mark_shipped else "pending",
            courier=payload.courier,
            tracking_number=payload.tracking_number,
            tracking_url=payload.tracking_url,
            items_json=dump_json(shipment_lines),
            shipped_at=now,
            notes=payload.notes,
        )
        self._db.add(shipment)
        self._db.flush()

        for row, qty in fulfill_queue:
            try:
                self._fulfill_shipped(row, qty, order, shipment.id)
            except Exception as exc:
                # Surface inventory failures as lifecycle errors (400), not 500.
                from app.services.ecommerce.commerce_inventory_service import (
                    CommerceInventoryError,
                )

                if isinstance(exc, CommerceInventoryError):
                    raise OrderLifecycleError(str(exc)) from exc
                raise

        if not order.primary_shipment_id:
            order.primary_shipment_id = shipment.id
        order.courier = payload.courier or order.courier
        order.tracking_number = payload.tracking_number or order.tracking_number
        order.tracking_url = payload.tracking_url or order.tracking_url

        # Optional Pathao consignment — skipped silently when plugin inactive.
        pathao_meta: Dict[str, Any] = {}
        try:
            from app.services.pathao_shipping import maybe_create_pathao_consignment

            pathao_result = maybe_create_pathao_consignment(
                self._db,
                order,
                shipment,
                force=payload.create_pathao,
                item_quantity=sum(l["quantity"] for l in shipment_lines) or 1,
            )
            pathao_meta = {
                "created": pathao_result.created,
                "skipped": pathao_result.skipped,
                "consignment_id": pathao_result.consignment_id,
                "message": pathao_result.message,
            }
            if pathao_result.created:
                self._append_timeline(
                    order,
                    f"Pathao consignment {pathao_result.consignment_id}",
                    actor=actor,
                )
            elif not pathao_result.skipped and pathao_result.message:
                self._append_timeline(
                    order,
                    f"Pathao skipped: {pathao_result.message}",
                    actor=actor,
                )
        except Exception:
            # Never block local shipment on courier plugin failures.
            logger = __import__("logging").getLogger("commerce.pathao")
            logger.exception("Pathao soft-hook failed for order %s", order.order_number)

        total_qty = sum(i.quantity for i in items)
        shipped_qty = sum(i.quantity_shipped for i in items)
        if shipped_qty >= total_qty:
            order.shipment_status = "shipped"
            if order.status in {"pending", "confirmed", "packed"}:
                order.status = "shipped"
                order.shipped_at = order.shipped_at or now
        elif shipped_qty > 0:
            order.shipment_status = "partial"

        self._append_timeline(order, f"Shipment {shipment_number} created", actor=actor)
        self._record_event(
            order,
            event_type="shipment_created",
            actor=actor,
            message=f"Shipment {shipment_number}",
            payload={"shipment_id": shipment.id, "lines": shipment_lines, "pathao": pathao_meta},
        )
        self._db.commit()
        self._db.refresh(shipment)
        return shipment

    def create_return(
        self,
        order_id: str,
        *,
        order_item_id: str,
        quantity: int,
        reason: str,
        actor: str = "admin",
    ) -> CommerceOrderReturn:
        order = self._get_order(order_id)
        row = self._item(order.id, order_item_id)
        if quantity <= 0 or quantity > row.quantity:
            raise OrderLifecycleError("Invalid return quantity")

        return_row = CommerceOrderReturn(
            company_id=order.company_id,
            return_number=f"RET-{new_session_token()[:8].upper()}",
            order_id=order.id,
            order_number=order.order_number,
            customer_name=order.customer_name,
            product_name=row.name,
            sku=row.sku,
            quantity=quantity,
            reason=reason,
            status="requested",
            amount=row.unit_price * quantity,
        )
        self._db.add(return_row)
        order.status = "returned"
        order.shipment_status = "returned"
        self._append_timeline(order, f"Return requested — {row.name}", actor=actor)
        self._record_event(
            order,
            event_type="return_requested",
            actor=actor,
            message=reason,
            payload={"return_id": return_row.id, "order_item_id": order_item_id, "quantity": quantity},
        )
        self._db.commit()
        self._db.refresh(return_row)
        return return_row

    def create_refund(
        self,
        order_id: str,
        *,
        amount: Decimal,
        method: str,
        reason: str,
        actor: str = "admin",
    ) -> CommerceOrderRefund:
        order = self._get_order(order_id)
        if amount <= 0:
            raise OrderLifecycleError("Refund amount must be positive")
        if amount > order.grand_total - order.refund_amount:
            raise OrderLifecycleError("Refund exceeds remaining order total")

        refund = CommerceOrderRefund(
            company_id=order.company_id,
            refund_number=f"REF-{new_session_token()[:8].upper()}",
            order_id=order.id,
            order_number=order.order_number,
            customer_name=order.customer_name,
            amount=amount,
            method=method,
            reason=reason,
            status="pending",
        )
        self._db.add(refund)
        order.refund_amount += amount
        order.payment_status = "refunded" if order.refund_amount >= order.grand_total else "partial"
        if order.status not in {"returned", "refunded"}:
            order.status = "refunded"

        payment_timeline = load_json(order.payment_timeline_json, [])
        payment_timeline.insert(
            0,
            {
                "id": f"ref_{uuid.uuid4().hex[:8]}",
                "label": "Refund initiated",
                "amount": str(amount),
                "status": "pending",
                "at": datetime.utcnow().isoformat(),
            },
        )
        order.payment_timeline_json = dump_json(payment_timeline)

        self._append_timeline(order, f"Refund {refund.refund_number} — {amount}", actor=actor)
        self._record_event(
            order,
            event_type="refund_created",
            actor=actor,
            message=reason,
            payload={"refund_id": refund.id, "amount": str(amount), "method": method},
        )
        self._erp_hook_finance(order, refund)
        self._db.commit()
        self._db.refresh(refund)
        return refund

    def list_events(self, order_id: str) -> List[CommerceOrderEvent]:
        self._get_order(order_id)
        return (
            self._db.query(CommerceOrderEvent)
            .filter(CommerceOrderEvent.order_id == order_id)
            .order_by(CommerceOrderEvent.created_at.desc())
            .all()
        )

    def list_shipments(self, order_id: str) -> List[CommerceOrderShipment]:
        self._get_order(order_id)
        return (
            self._db.query(CommerceOrderShipment)
            .filter(CommerceOrderShipment.order_id == order_id)
            .order_by(CommerceOrderShipment.created_at.desc())
            .all()
        )

    def create_address_snapshot(
        self,
        order: CommerceOrder,
        *,
        address_type: str,
        first_name: str,
        last_name: str,
        email: str,
        phone: str,
        line1: str,
        city: str,
        region: str = "",
        postal_code: str = "",
        country: str = "Bangladesh",
    ) -> CommerceOrderAddress:
        row = CommerceOrderAddress(
            order_id=order.id,
            address_type=address_type,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone,
            line1=line1,
            city=city,
            region=region or city,
            postal_code=postal_code,
            country=country,
        )
        self._db.add(row)
        self._db.flush()
        return row

    def _get_order(self, order_id: str) -> CommerceOrder:
        row = self._db.get(CommerceOrder, order_id)
        if not row:
            raise OrderLifecycleError("Order not found")
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            raise OrderLifecycleError("Order not found")
        return row

    def _items(self, order_id: str) -> List[CommerceOrderItem]:
        return (
            self._db.query(CommerceOrderItem)
            .filter(CommerceOrderItem.order_id == order_id)
            .order_by(CommerceOrderItem.sort_order)
            .all()
        )

    def _item(self, order_id: str, item_id: str) -> CommerceOrderItem:
        row = (
            self._db.query(CommerceOrderItem)
            .filter(CommerceOrderItem.order_id == order_id, CommerceOrderItem.id == item_id)
            .first()
        )
        if not row:
            raise OrderLifecycleError("Order line not found")
        return row

    def _assert_transition(self, order: CommerceOrder, to_status: str) -> None:
        if to_status not in ORDER_STATUSES:
            raise OrderLifecycleError(f"Unknown status: {to_status}")
        allowed = STATUS_TRANSITIONS.get(order.status, frozenset())
        if to_status not in allowed:
            raise OrderLifecycleError(
                f"Cannot transition from {order.status} to {to_status}",
            )

    def _record_event(
        self,
        order: CommerceOrder,
        *,
        event_type: str,
        actor: str,
        message: Optional[str] = None,
        from_status: Optional[str] = None,
        to_status: Optional[str] = None,
        from_payment_status: Optional[str] = None,
        to_payment_status: Optional[str] = None,
        from_shipment_status: Optional[str] = None,
        to_shipment_status: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> CommerceOrderEvent:
        row = CommerceOrderEvent(
            order_id=order.id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            from_payment_status=from_payment_status,
            to_payment_status=to_payment_status,
            from_shipment_status=from_shipment_status,
            to_shipment_status=to_shipment_status,
            actor=actor,
            message=message,
            payload_json=json.dumps(payload or {}),
        )
        self._db.add(row)
        return row

    def _append_timeline(self, order: CommerceOrder, title: str, *, actor: str) -> None:
        timeline = load_json(order.timeline_json, [])
        timeline.insert(
            0,
            {
                "id": f"t_{uuid.uuid4().hex[:8]}",
                "type": "status",
                "title": title,
                "actor": actor,
                "actorInitials": "".join(p[0] for p in actor.split()[:2]).upper() or "SY",
                "at": datetime.utcnow().isoformat() + "Z",
            },
        )
        order.timeline_json = dump_json(timeline[:100])

    def _append_activity(
        self,
        order: CommerceOrder,
        activity_type: str,
        message: str,
        actor: str,
    ) -> None:
        activities = load_json(order.activities_json, [])
        activities.insert(
            0,
            {
                "id": f"a_{uuid.uuid4().hex[:8]}",
                "type": activity_type,
                "title": message,
                "assignee": actor,
                "status": "done",
                "at": datetime.utcnow().isoformat(),
            },
        )
        order.activities_json = dump_json(activities[:100])

    def _warehouse_id(self, order: CommerceOrder) -> str:
        return self._inventory.resolve_warehouse(order.warehouse_id)

    def _release_all_reservations(self, order: CommerceOrder) -> None:
        for line in self._items(order.id):
            unshipped = line.quantity - line.quantity_shipped
            if unshipped <= 0 or not line.item_id:
                continue
            self._inventory.release(
                line.item_id,
                unshipped,
                warehouse_id=order.warehouse_id,
                reference=order.order_number,
                source_type="commerce_order",
                source_id=order.id,
                notes=f"Cancel release — {line.name}",
            )

    def _fulfill_shipped(
        self,
        line: CommerceOrderItem,
        qty: int,
        order: CommerceOrder,
        shipment_id: str,
    ) -> None:
        if not line.item_id:
            return
        self._inventory.deduct_shipped(
            line.item_id,
            qty,
            warehouse_id=order.warehouse_id,
            reference=order.order_number,
            source_type="commerce_shipment",
            source_id=shipment_id,
            notes=f"Shipment deduct — {line.name}",
        )

    def _erp_hook(self, order: CommerceOrder, from_status: str, to_status: str) -> None:
        """Future ERP integration — Sales / Inventory / CRM / AI."""
        payload = {
            "order_id": order.id,
            "order_number": order.order_number,
            "from_status": from_status,
            "to_status": to_status,
            "customer_id": order.customer_id,
            "payment_id": order.payment_id,
            "invoice_id": order.invoice_id,
            "shipment_id": order.primary_shipment_id,
            "integration_targets": ["sales", "inventory", "finance", "crm", "ai"],
        }
        self._record_event(
            order,
            event_type="erp_integration_hook",
            actor="system",
            message=f"ERP hook for {to_status}",
            payload=payload,
        )

    def _erp_hook_finance(self, order: CommerceOrder, refund: CommerceOrderRefund) -> None:
        receivable = None
        if order.invoice_id:
            receivable = self._db.get(FinanceReceivable, order.invoice_id)
        self._record_event(
            order,
            event_type="finance_refund_hook",
            actor="system",
            message="Finance refund integration ready",
            payload={
                "refund_id": refund.id,
                "invoice_id": order.invoice_id,
                "receivable_balance": str(receivable.balance) if receivable else None,
            },
        )
