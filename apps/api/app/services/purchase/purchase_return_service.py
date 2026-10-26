"""Purchase return business logic.

A return always traces back to the purchase order (and, when known, the GRN)
it was received against. Creating a return only reserves the requested
quantities against what has actually been received — it does not touch stock
or Finance. Crediting a return is the point where it becomes real: it pulls
the returned units out of the warehouse through the single stock mutation
engine (StockMovementService.apply_movement) and posts an AP credit through
FinanceService.record_purchase_document(credit=True) — the exact inverse of
how PurchaseOrderService.post_receipt posts a payable when goods come in.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.inventory_stock_transfer import InventoryStockTransfer, InventoryStockTransferLine
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine
from app.models.purchase_return import PurchaseReturn, PurchaseReturnLine
from app.services.inventory import serial_service
from app.services.inventory.constants import MOVEMENT_PURCHASE_RETURN, TRACKING_SERIAL, tracking_type_of
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.purchase.constants import RETURN_REASONS, RETURN_STATUS_TRANSITIONS
from app.services.core.sequence_service import next_number as allocate_number


@dataclass(frozen=True)
class ReturnLineInput:
    purchase_order_line_id: str
    quantity_returned: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    # serial-tracked products: one serial per returned unit
    serial_numbers: tuple[str, ...] = field(default_factory=tuple)


class PurchaseReturnService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    # ------------------------------------------------------------- reads

    def list_returns(
        self,
        *,
        company_id: str = "default",
        purchase_order_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseReturn], int]:
        query = self._db.query(PurchaseReturn).filter(PurchaseReturn.company_id == company_id)
        if purchase_order_id:
            query = query.filter(PurchaseReturn.purchase_order_id == purchase_order_id)
        if status:
            query = query.filter(PurchaseReturn.status == status)
        total = query.count()
        rows = (
            query.order_by(PurchaseReturn.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_return(self, return_id: str) -> Optional[PurchaseReturn]:
        row = self._db.get(PurchaseReturn, return_id)
        if not row:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_return_lines(self, return_id: str) -> list[PurchaseReturnLine]:
        return (
            self._db.query(PurchaseReturnLine)
            .filter(PurchaseReturnLine.purchase_return_id == return_id)
            .all()
        )

    # ------------------------------------------------------------ writes

    def create_return(
        self,
        purchase_order_id: str,
        lines: list[ReturnLineInput],
        *,
        purchase_receipt_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        reason: str = "other",
        return_date: Optional[date] = None,
        requested_by: Optional[str] = None,
        notes: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> PurchaseReturn:
        order = self._require_order(purchase_order_id)
        # the goods go back from where they are now - the order's warehouse unless the caller names another location
        return_warehouse = self._require_warehouse(warehouse_id or order.warehouse_id, order.company_id)
        po_receipt_ids = {
            rid
            for (rid,) in self._db.query(PurchaseReceipt.id)
            .filter(PurchaseReceipt.purchase_order_id == order.id)
            .all()
        }
        if not lines:
            raise HTTPException(status_code=400, detail="At least one return line is required")
        if reason not in RETURN_REASONS:
            raise HTTPException(status_code=400, detail=f"Invalid reason: {reason}")

        receipt: Optional[PurchaseReceipt] = None
        if purchase_receipt_id:
            receipt = self._db.get(PurchaseReceipt, purchase_receipt_id)
            if not receipt or receipt.purchase_order_id != order.id:
                raise HTTPException(status_code=404, detail="Receipt not found for this purchase order")

        po_lines = {row.id: row for row in self._order_lines(order.id)}

        ret = PurchaseReturn(
            company_id=order.company_id,
            return_number=self._next_return_number(order.company_id),
            purchase_order_id=order.id,
            purchase_receipt_id=receipt.id if receipt else None,
            supplier_id=order.supplier_id,
            warehouse_id=return_warehouse.id,
            status="requested",
            reason=reason,
            return_date=return_date or date.today(),
            requested_by=requested_by,
            notes=notes,
        )
        self._db.add(ret)
        self._db.flush()

        subtotal = Decimal("0")
        tax_total = Decimal("0")
        taken_serials: set[str] = set()  # one serial cannot go back on two lines
        for line_in in lines:
            if line_in.quantity_returned <= 0:
                continue
            po_line = po_lines.get(line_in.purchase_order_line_id)
            if not po_line:
                raise HTTPException(
                    status_code=404, detail=f"PO line not found: {line_in.purchase_order_line_id}"
                )
            returnable = po_line.quantity_received - po_line.quantity_returned
            if line_in.quantity_returned > returnable:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot return {line_in.quantity_returned} of {po_line.sku}: "
                        f"only {returnable} received and not already returned"
                    ),
                )
            if line_in.reason and line_in.reason not in RETURN_REASONS:
                raise HTTPException(status_code=400, detail=f"Invalid reason: {line_in.reason}")

            serials = self._validate_line_stock(
                po_line,
                line_in,
                order=order,
                warehouse=return_warehouse,
                po_receipt_ids=po_receipt_ids,
                company_id=order.company_id,
                taken=taken_serials,
            )

            qty = Decimal(line_in.quantity_returned)
            ordered = Decimal(po_line.quantity_ordered or 1)
            discount_per_unit = po_line.discount_amount / ordered
            net_unit = po_line.unit_cost - discount_per_unit
            line_sub = net_unit * qty
            line_tax = line_sub * po_line.tax_rate / Decimal("100")
            subtotal += line_sub
            tax_total += line_tax

            self._db.add(
                PurchaseReturnLine(
                    purchase_return_id=ret.id,
                    purchase_order_line_id=po_line.id,
                    item_id=po_line.item_id,
                    quantity_returned=line_in.quantity_returned,
                    unit_cost=po_line.unit_cost,
                    tax_rate=po_line.tax_rate,
                    reason=line_in.reason,
                    notes=line_in.notes,
                    serials_json=json.dumps(serials),
                ),
            )

        if subtotal <= 0:
            raise HTTPException(status_code=400, detail="No quantities to return")

        ret.subtotal = subtotal
        ret.tax_amount = tax_total
        ret.credit_amount = subtotal + tax_total
        self._db.flush()
        self._activity(ret, "Return Requested", actor_id, {"po_number": order.po_number})
        return ret

    def approve_return(self, return_id: str, *, actor_id: Optional[str] = None) -> PurchaseReturn:
        ret = self._require_return(return_id)
        self._transition(ret, "approved")
        ret.approved_at = datetime.utcnow()
        ret.approved_by = actor_id
        self._db.flush()
        self._activity(ret, "Return Approved", actor_id)
        return ret

    def reject_return(
        self, return_id: str, *, actor_id: Optional[str] = None, notes: Optional[str] = None
    ) -> PurchaseReturn:
        ret = self._require_return(return_id)
        self._transition(ret, "rejected")
        ret.rejected_at = datetime.utcnow()
        ret.rejected_by = actor_id
        if notes:
            ret.notes = f"{ret.notes}\n{notes}" if ret.notes else notes
        self._db.flush()
        self._activity(ret, "Return Rejected", actor_id)
        return ret

    def cancel_return(self, return_id: str, *, actor_id: Optional[str] = None) -> PurchaseReturn:
        ret = self._require_return(return_id)
        if ret.status == "cancelled":
            return ret
        self._transition(ret, "cancelled")
        ret.cancelled_at = datetime.utcnow()
        ret.cancelled_by = actor_id
        self._db.flush()
        self._activity(ret, "Return Cancelled", actor_id)
        return ret

    def credit_return(self, return_id: str, *, actor_id: Optional[str] = None) -> PurchaseReturn:
        """Post the AP credit and pull the returned units out of stock.

        Idempotent: a second call on an already-credited return is a no-op.
        """
        ret = self._require_return(return_id)
        if ret.status == "credited":
            return ret
        self._transition(ret, "credited")

        lines = self.get_return_lines(ret.id)
        if not lines:
            raise HTTPException(status_code=400, detail="Return has no lines")

        po_lines = {
            row.id: row
            for row in self._db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.id.in_([l.purchase_order_line_id for l in lines]))
            .all()
        }

        # Re-validate against current PO state — another return posted in the
        # meantime must not let the two overdraw what was actually received.
        for rline in lines:
            po_line = po_lines.get(rline.purchase_order_line_id)
            if not po_line:
                raise HTTPException(status_code=400, detail="Return line is missing its purchase order line")
            returnable = po_line.quantity_received - po_line.quantity_returned
            if rline.quantity_returned > returnable:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot credit {po_line.sku}: only {returnable} returnable now",
                )

        # the serials going back must still be sitting in stock at the return's warehouse
        serial_rows: dict[str, list[InventorySerial]] = {}
        for rline in lines:
            serial_rows[rline.id] = []
            for number in self._line_serials(rline):
                row = self._find_serial(number, ret.company_id)
                if row is None or row.status != "in_stock" or row.warehouse_id != ret.warehouse_id:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Serial {number} is no longer in stock at the return location.",
                    )
                serial_rows[rline.id].append(row)

        movement_svc = StockMovementService(self._db)
        for rline in lines:
            po_line = po_lines[rline.purchase_order_line_id]
            movement_svc.apply_movement(
                MovementInput(
                    item_id=rline.item_id,
                    warehouse_id=ret.warehouse_id,
                    movement_type=MOVEMENT_PURCHASE_RETURN,
                    quantity=rline.quantity_returned,
                    company_id=ret.company_id,
                    reference=ret.return_number,
                    notes=f"PURCHASE_RETURN {ret.return_number} PO {po_line.purchase_order_id}",
                    created_by=actor_id,
                    unit_cost=po_line.unit_cost,
                    source_type="purchase_return",
                    source_id=ret.id,
                    document_date=ret.return_date,
                ),
            )
            po_line.quantity_returned += rline.quantity_returned
            # the returned units leave the inventory: each serial is marked as sent back to the supplier
            for serial in serial_rows.get(rline.id, []):
                serial_service.set_status(self._db, serial, "returned")
                serial.notes = f"Returned to supplier on {ret.return_number}"

        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        payable = FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_purchase_document(
                company_id=ret.company_id,
                supplier_id=ret.supplier_id,
                reference_number=ret.return_number,
                amount=ret.credit_amount,
                tax_amount=ret.tax_amount,
                due_date=None,
                source_type="purchase_return",
                source_id=ret.id,
                description=f"Purchase return {ret.return_number}",
                credit=True,
            ),
            source_type="purchase_return",
            source_id=ret.id,
            company_id=ret.company_id,
        )
        if payable:
            ret.payable_id = payable.id

        ret.credited_at = datetime.utcnow()
        ret.credited_by = actor_id
        self._db.flush()
        self._activity(
            ret,
            "Return Credited",
            actor_id,
            {"credit_amount": str(ret.credit_amount)},
        )
        return ret

    # ------------------------------------------------------------ helpers

    def _require_warehouse(self, warehouse_id: str, company_id: str) -> InventoryWarehouse:
        warehouse = self._db.get(InventoryWarehouse, warehouse_id)
        if not warehouse or (warehouse.company_id or "default") != (company_id or "default"):
            raise HTTPException(status_code=404, detail="Return location not found")
        return warehouse

    @staticmethod
    def _line_serials(rline: PurchaseReturnLine) -> list[str]:
        try:
            value = json.loads(rline.serials_json or "[]")
        except json.JSONDecodeError:
            return []
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _find_serial(self, number: str, company_id: str) -> Optional[InventorySerial]:
        return serial_service.find_by_number(self._db, number, company_id=company_id)

    def _reachable_warehouses(self, po_line: PurchaseOrderLine, order: PurchaseOrder) -> set[str]:
        """Locations this order's product can be returned from: where its receipts put it, then wherever completed stock
        transfers carried it on from one of those."""
        reach = {
            wid
            for (wid,) in self._db.query(PurchaseReceipt.warehouse_id)
            .join(PurchaseReceiptLine, PurchaseReceiptLine.purchase_receipt_id == PurchaseReceipt.id)
            .filter(
                PurchaseReceipt.purchase_order_id == order.id,
                PurchaseReceipt.status == "posted",
                PurchaseReceiptLine.purchase_order_line_id == po_line.id,
            )
            .all()
        } or {order.warehouse_id}
        moves = (
            self._db.query(InventoryStockTransfer.from_warehouse_id, InventoryStockTransfer.to_warehouse_id)
            .join(InventoryStockTransferLine, InventoryStockTransferLine.transfer_id == InventoryStockTransfer.id)
            .filter(
                InventoryStockTransferLine.item_id == po_line.item_id,
                InventoryStockTransferLine.received_qty > 0,
                InventoryStockTransfer.status.in_(("completed", "partial_received")),
            )
            .distinct()
            .all()
        )
        changed = True
        while changed:
            changed = False
            for source, target in moves:
                if source in reach and target not in reach:
                    reach.add(target)
                    changed = True
        return reach

    def _validate_line_stock(
        self,
        po_line: PurchaseOrderLine,
        line_in: ReturnLineInput,
        *,
        order: PurchaseOrder,
        warehouse: InventoryWarehouse,
        po_receipt_ids: set[str],
        company_id: str,
        taken: set[str],
    ) -> list[str]:
        """The return location must really hold what is going back; returns the cleaned serial list.

        A serial-tracked product needs exactly one serial per unit, each one of this order's received units that is
        in stock at the location. Anything else only needs enough stock there.
        """
        qty = line_in.quantity_returned
        stock = (
            self._db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == po_line.item_id,
                InventoryStockLevel.warehouse_id == warehouse.id,
            )
            .first()
        )
        available = max(0, (stock.on_hand - stock.reserved) if stock else 0)
        if qty > available:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot return {qty} of {po_line.sku} from {warehouse.name}: only {available} in stock there",
            )

        inv = self._db.query(InventoryItem).filter(InventoryItem.item_id == po_line.item_id).first()
        tracking = tracking_type_of(
            bool(inv.track_serial) if inv else False,
            bool(inv.track_batch) if inv else False,
        )
        serials = [s.strip() for s in line_in.serial_numbers if s and s.strip()]
        if tracking != TRACKING_SERIAL:
            if serials:
                raise HTTPException(status_code=400, detail=f"{po_line.sku} is not serial-tracked")
            # goods go back only from where they were received, or from where a transfer moved them on from there
            if warehouse.id not in self._reachable_warehouses(po_line, order):
                raise HTTPException(
                    status_code=400,
                    detail=f"{po_line.sku} was not received at {warehouse.name} (or transferred there from where it was received).",
                )
            return []
        if len(serials) != qty:
            raise HTTPException(
                status_code=400,
                detail=f"{po_line.sku} is serial-tracked: returning {qty} needs exactly {qty} serial number(s), got {len(serials)}.",
            )
        for number in serials:
            key = number.lower()
            if key in taken:
                raise HTTPException(status_code=400, detail=f"Serial {number} is listed twice on this return.")
            taken.add(key)
            row = self._find_serial(number, company_id)
            if row is None or row.item_id != po_line.item_id:
                raise HTTPException(status_code=400, detail=f"Serial {number} is not a unit of {po_line.sku}.")
            if row.status != "in_stock" or row.warehouse_id != warehouse.id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {number} is not in stock at {warehouse.name}.",
                )
            if row.source_type == "receipt" and row.source_id not in po_receipt_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {number} was not received on this purchase order.",
                )
        return serials

    def _order_lines(self, order_id: str) -> list[PurchaseOrderLine]:
        return (
            self._db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.purchase_order_id == order_id)
            .all()
        )

    def _require_order(self, order_id: str) -> PurchaseOrder:
        order = self._db.get(PurchaseOrder, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if self._company_id is not None and (order.company_id or "default") != self._company_id:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return order

    def _require_return(self, return_id: str) -> PurchaseReturn:
        ret = self.get_return(return_id)
        if not ret:
            raise HTTPException(status_code=404, detail="Purchase return not found")
        return ret

    def _transition(self, ret: PurchaseReturn, to_status: str) -> None:
        allowed = RETURN_STATUS_TRANSITIONS.get(ret.status, frozenset())
        if to_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move return from {ret.status} to {to_status}",
            )
        ret.status = to_status

    def _next_return_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "purchase.return",
            initial=lambda: self._db.query(PurchaseReturn)
            .filter(PurchaseReturn.company_id == company_id)
            .count()
            + 1,
        )

    def _activity(
        self,
        ret: PurchaseReturn,
        action: str,
        actor_id: Optional[str],
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        try:
            from app.services.collaboration.collaboration_service import CollaborationService
            from app.services.collaboration.constants import ENTITY_TYPE_PURCHASE

            CollaborationService(self._db, company_id=ret.company_id).record_activity(
                ENTITY_TYPE_PURCHASE,
                ret.id,
                action,
                performed_by=actor_id,
                details={
                    "return_number": ret.return_number,
                    "purchase_order_id": ret.purchase_order_id,
                    **(details or {}),
                },
            )
        except Exception:
            return
