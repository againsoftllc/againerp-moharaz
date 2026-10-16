"""Purchase order and goods receipt business logic."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatusHistory
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine
from app.models.inventory_item import InventoryItem
from app.models.purchase_receipt_correction import PurchaseReceiptLineCorrection
from app.services.inventory.constants import TRACKING_BATCH, TRACKING_SERIAL, tracking_type_of
from app.services.inventory.constants import (
    MOVEMENT_PURCHASE_RECEIPT,
    MOVEMENT_STOCK_ADJUSTMENT_IN,
    MOVEMENT_STOCK_ADJUSTMENT_OUT,
)
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.purchase.constants import PO_STATUSES, PO_STATUS_TRANSITIONS, RECEIPT_STATUSES
from app.services.core.sequence_service import next_number as allocate_number


@dataclass(frozen=True)
class PurchaseLineInput:
    item_id: str
    quantity_ordered: int
    unit_cost: Decimal
    tax_rate: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    notes: Optional[str] = None


@dataclass(frozen=True)
class ReceiptLineInput:
    purchase_order_line_id: str
    quantity_received: int
    serial_numbers: tuple[str, ...] = ()
    notes: Optional[str] = None


class PurchaseOrderService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    def list_orders(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        supplier_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseOrder], int]:
        query = self._db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id)
        if status:
            query = query.filter(PurchaseOrder.status == status)
        if supplier_id:
            query = query.filter(PurchaseOrder.supplier_id == supplier_id)
        total = query.count()
        rows = (
            query.order_by(PurchaseOrder.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_order(self, order_id: str) -> Optional[PurchaseOrder]:
        row = self._db.get(PurchaseOrder, order_id)
        if not row:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_lines(self, order_id: str) -> list[PurchaseOrderLine]:
        return (
            self._db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.purchase_order_id == order_id)
            .order_by(PurchaseOrderLine.sort_order, PurchaseOrderLine.line_number)
            .all()
        )

    def get_history(self, order_id: str) -> list[PurchaseOrderStatusHistory]:
        return (
            self._db.query(PurchaseOrderStatusHistory)
            .filter(PurchaseOrderStatusHistory.purchase_order_id == order_id)
            .order_by(PurchaseOrderStatusHistory.created_at.desc())
            .all()
        )

    def create_order(
        self,
        *,
        supplier_id: str,
        warehouse_id: str,
        lines: list[PurchaseLineInput],
        company_id: str = "default",
        order_date: Optional[date] = None,
        expected_date: Optional[date] = None,
        buyer_name: Optional[str] = None,
        notes: Optional[str] = None,
        allow_over_receive: bool = False,
        created_by: Optional[str] = None,
    ) -> PurchaseOrder:
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")

        supplier = self._db.get(CommerceSupplier, supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

        warehouse = self._db.get(InventoryWarehouse, warehouse_id)
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")

        po_number = self._next_po_number(company_id)
        order = PurchaseOrder(
            company_id=company_id,
            po_number=po_number,
            supplier_id=supplier_id,
            warehouse_id=warehouse_id,
            status="draft",
            order_date=order_date or date.today(),
            expected_date=expected_date,
            buyer_name=buyer_name or supplier.buyer_name,
            notes=notes,
            allow_over_receive=allow_over_receive,
            created_by=created_by,
        )
        self._db.add(order)
        self._db.flush()

        subtotal = Decimal("0")
        tax_total = Decimal("0")
        discount_total = Decimal("0")

        for idx, line_in in enumerate(lines, start=1):
            if line_in.quantity_ordered <= 0:
                raise HTTPException(status_code=400, detail="Line quantity must be positive")
            item = self._db.get(Item, line_in.item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"Item not found: {line_in.item_id}")

            line_subtotal = line_in.unit_cost * line_in.quantity_ordered
            line_tax = (line_subtotal * line_in.tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_discount = line_in.discount_amount
            line_total = line_subtotal + line_tax - line_discount

            subtotal += line_subtotal
            tax_total += line_tax
            discount_total += line_discount

            self._db.add(
                PurchaseOrderLine(
                    purchase_order_id=order.id,
                    item_id=line_in.item_id,
                    supplier_id=supplier_id,
                    line_number=idx,
                    sort_order=idx,
                    sku=item.sku,
                    name=item.name,
                    quantity_ordered=line_in.quantity_ordered,
                    unit_cost=line_in.unit_cost,
                    tax_rate=line_in.tax_rate,
                    tax_amount=line_tax,
                    discount_amount=line_discount,
                    line_total=line_total,
                    notes=line_in.notes,
                ),
            )

        order.subtotal = subtotal
        order.tax_total = tax_total
        order.discount_total = discount_total
        order.total = subtotal + tax_total - discount_total

        self._record_status(order.id, None, "draft", created_by, "Purchase order created")
        self._db.flush()
        return order

    def update_order(
        self,
        order_id: str,
        *,
        supplier_id: str,
        warehouse_id: str,
        lines: list[PurchaseLineInput],
        order_date: Optional[date] = None,
        expected_date: Optional[date] = None,
        buyer_name: Optional[str] = None,
        notes: Optional[str] = None,
        allow_over_receive: Optional[bool] = None,
        actor_id: Optional[str] = None,
    ) -> PurchaseOrder:
        order = self._require_order(order_id)
        if order.status in {"completed", "cancelled"}:
            raise HTTPException(
                status_code=400,
                detail="Completed or cancelled purchase orders cannot be edited",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")

        supplier = self._db.get(CommerceSupplier, supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        warehouse = self._db.get(InventoryWarehouse, warehouse_id)
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")

        existing = self.get_lines(order.id)
        has_received = any(line.quantity_received > 0 for line in existing)
        if has_received and supplier_id != order.supplier_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot change supplier after goods have been received",
            )
        if has_received and warehouse_id != order.warehouse_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot change warehouse after goods have been received",
            )

        unused = list(existing)
        subtotal = Decimal("0")
        tax_total = Decimal("0")
        discount_total = Decimal("0")

        for idx, line_in in enumerate(lines, start=1):
            if line_in.quantity_ordered <= 0:
                raise HTTPException(status_code=400, detail="Line quantity must be positive")
            item = self._db.get(Item, line_in.item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"Item not found: {line_in.item_id}")

            match: Optional[PurchaseOrderLine] = None
            for pos, old in enumerate(unused):
                if old.item_id == line_in.item_id:
                    match = unused.pop(pos)
                    break

            received = match.quantity_received if match else 0
            if line_in.quantity_ordered < received:
                raise HTTPException(
                    status_code=400,
                    detail=f"Quantity cannot be below received qty for {item.sku}",
                )

            line_subtotal = line_in.unit_cost * line_in.quantity_ordered
            line_tax = (line_subtotal * line_in.tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_discount = line_in.discount_amount
            line_total = line_subtotal + line_tax - line_discount
            subtotal += line_subtotal
            tax_total += line_tax
            discount_total += line_discount

            if match:
                match.supplier_id = supplier_id
                match.line_number = idx
                match.sort_order = idx
                match.sku = item.sku
                match.name = item.name
                match.quantity_ordered = line_in.quantity_ordered
                match.unit_cost = line_in.unit_cost
                match.tax_rate = line_in.tax_rate
                match.tax_amount = line_tax
                match.discount_amount = line_discount
                match.line_total = line_total
                match.notes = line_in.notes
            else:
                self._db.add(
                    PurchaseOrderLine(
                        purchase_order_id=order.id,
                        item_id=line_in.item_id,
                        supplier_id=supplier_id,
                        line_number=idx,
                        sort_order=idx,
                        sku=item.sku,
                        name=item.name,
                        quantity_ordered=line_in.quantity_ordered,
                        unit_cost=line_in.unit_cost,
                        tax_rate=line_in.tax_rate,
                        tax_amount=line_tax,
                        discount_amount=line_discount,
                        line_total=line_total,
                        notes=line_in.notes,
                    ),
                )

        for leftover in unused:
            if leftover.quantity_received > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot remove {leftover.sku}: already received",
                )
            receipt_line = (
                self._db.query(PurchaseReceiptLine)
                .filter(PurchaseReceiptLine.purchase_order_line_id == leftover.id)
                .first()
            )
            if receipt_line:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot remove {leftover.sku}: linked to a goods receipt",
                )
            self._db.delete(leftover)

        order.supplier_id = supplier_id
        order.warehouse_id = warehouse_id
        if order_date:
            order.order_date = order_date
        order.expected_date = expected_date
        order.buyer_name = buyer_name
        order.notes = notes
        if allow_over_receive is not None:
            order.allow_over_receive = allow_over_receive
        order.subtotal = subtotal
        order.tax_total = tax_total
        order.discount_total = discount_total
        order.total = subtotal + tax_total - discount_total
        self._record_status(order.id, order.status, order.status, actor_id, "Purchase order updated")
        self._db.flush()
        return order

    def confirm_order(self, order_id: str, *, actor_id: Optional[str] = None) -> PurchaseOrder:
        order = self._require_order(order_id)
        self._transition(order, "confirmed", actor_id, "Purchase order confirmed")
        order.confirmed_at = datetime.utcnow()
        order.confirmed_by = actor_id
        self._db.flush()
        return order

    def cancel_order(self, order_id: str, *, actor_id: Optional[str] = None, reason: Optional[str] = None) -> PurchaseOrder:
        order = self._require_order(order_id)
        if order.status == "completed":
            raise HTTPException(status_code=400, detail="Cannot cancel a completed purchase order")
        self._transition(order, "cancelled", actor_id, reason or "Purchase order cancelled")
        order.cancelled_at = datetime.utcnow()
        order.cancelled_by = actor_id
        self._db.flush()
        return order

    def delete_order(self, order_id: str, *, actor_id: Optional[str] = None) -> None:
        order = self._require_order(order_id)
        has_receipt = (
            self._db.query(PurchaseReceipt.id)
            .filter(PurchaseReceipt.purchase_order_id == order.id)
            .first()
            is not None
        )
        if has_receipt or order.status in {"partial_received", "completed"}:
            raise HTTPException(
                status_code=400,
                detail=f"{order.po_number} has received goods and cannot be deleted",
            )
        self._db.delete(order)
        self._db.flush()

    def bulk_delete_orders(
        self, order_ids: list[str], *, actor_id: Optional[str] = None
    ) -> tuple[int, list[str]]:
        deleted = 0
        skipped: list[str] = []
        for oid in order_ids:
            nested = self._db.begin_nested()
            try:
                self.delete_order(oid, actor_id=actor_id)
                nested.commit()
                deleted += 1
            except HTTPException as exc:
                nested.rollback()
                skipped.append(exc.detail if isinstance(exc.detail, str) else oid)
            except IntegrityError:
                nested.rollback()
                skipped.append(oid)
        return deleted, skipped

    def update_status(
        self,
        order_id: str,
        status: str,
        *,
        actor_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> PurchaseOrder:
        if status not in PO_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        order = self._require_order(order_id)
        if status == "confirmed":
            return self.confirm_order(order_id, actor_id=actor_id)
        if status == "cancelled":
            return self.cancel_order(order_id, actor_id=actor_id, reason=notes)
        self._transition(order, status, actor_id, notes)
        self._db.flush()
        return order

    def create_receipt(
        self,
        order_id: str,
        lines: list[ReceiptLineInput],
        *,
        receipt_date: Optional[date] = None,
        received_by: Optional[str] = None,
        notes: Optional[str] = None,
        delivery_note: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> PurchaseReceipt:
        order = self._require_order(order_id)
        if order.status not in {"confirmed", "partial_received"}:
            raise HTTPException(
                status_code=400,
                detail="Receipts can only be created for confirmed or partially received orders",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one receipt line is required")

        po_lines = {row.id: row for row in self.get_lines(order.id)}
        receipt_number = self._next_receipt_number(order.company_id)
        combined_notes = self._combine_receipt_notes(delivery_note, notes)
        receipt = PurchaseReceipt(
            company_id=order.company_id,
            receipt_number=receipt_number,
            purchase_order_id=order.id,
            supplier_id=order.supplier_id,
            warehouse_id=order.warehouse_id,
            status="draft",
            receipt_date=receipt_date or date.today(),
            received_by=received_by,
            notes=combined_notes,
        )
        self._db.add(receipt)
        self._db.flush()

        total_received = 0
        has_over = False
        seen_serials: set[str] = set()
        inv_svc = InventoryItemService(self._db)

        for line_in in lines:
            if line_in.quantity_received <= 0:
                continue
            po_line = po_lines.get(line_in.purchase_order_line_id)
            if not po_line:
                raise HTTPException(status_code=404, detail=f"PO line not found: {line_in.purchase_order_line_id}")

            remaining = po_line.quantity_ordered - po_line.quantity_received
            if line_in.quantity_received > remaining:
                if not order.allow_over_receive:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Over-receive blocked for {po_line.sku}: "
                            f"requested {line_in.quantity_received}, remaining {remaining}"
                        ),
                    )
                has_over = True

            serials = self._clean_serials(line_in.serial_numbers)
            self._validate_line_serials(
                po_line.sku,
                po_line.item_id,
                quantity=line_in.quantity_received,
                serials=serials,
                seen=seen_serials,
                inv_svc=inv_svc,
                company_id=order.company_id,
                notes=line_in.notes,
            )

            self._db.add(
                PurchaseReceiptLine(
                    purchase_receipt_id=receipt.id,
                    purchase_order_line_id=po_line.id,
                    item_id=po_line.item_id,
                    quantity_received=line_in.quantity_received,
                    serials_json=json.dumps(serials),
                    notes=line_in.notes,
                ),
            )
            total_received += line_in.quantity_received

        if total_received == 0:
            raise HTTPException(status_code=400, detail="No quantities to receive")

        ordered_total = sum(l.quantity_ordered for l in po_lines.values())
        received_before = sum(l.quantity_received for l in po_lines.values())
        if has_over:
            receipt.receive_type = "over"
        elif received_before + total_received >= ordered_total:
            receipt.receive_type = "full"
        else:
            receipt.receive_type = "partial"

        self._db.flush()
        self._receipt_activity(
            receipt,
            "Receipt Created",
            actor_id,
            {"po_number": order.po_number, "qty": total_received},
        )
        return receipt

    def post_receipt(self, receipt_id: str, *, actor_id: Optional[str] = None) -> PurchaseReceipt:
        receipt = self.get_receipt(receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")
        # Confirm is idempotent: a second post must not add inventory again.
        if receipt.status == "posted":
            return receipt
        if receipt.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft receipts can be posted")

        order = self._require_order(receipt.purchase_order_id)
        if order.status not in {"confirmed", "partial_received"}:
            raise HTTPException(status_code=400, detail="Purchase order is not receivable")

        receipt_lines = (
            self._db.query(PurchaseReceiptLine)
            .filter(PurchaseReceiptLine.purchase_receipt_id == receipt.id)
            .all()
        )
        if not receipt_lines:
            raise HTTPException(status_code=400, detail="Receipt has no lines")

        inv_svc = InventoryItemService(self._db)
        pending: list[tuple[PurchaseReceiptLine, PurchaseOrderLine, list[str]]] = []
        seen: set[str] = set()
        for rline in receipt_lines:
            po_line = self._db.get(PurchaseOrderLine, rline.purchase_order_line_id)
            if not po_line:
                raise HTTPException(status_code=400, detail="Receipt line is missing its purchase order line")
            remaining = po_line.quantity_ordered - po_line.quantity_received
            if rline.quantity_received > remaining and not order.allow_over_receive:
                raise HTTPException(
                    status_code=400,
                    detail=f"Over-receive blocked for {po_line.sku} at post time",
                )
            serials = self._parse_serials_json(rline.serials_json)
            self._validate_line_serials(
                po_line.sku,
                po_line.item_id,
                quantity=rline.quantity_received,
                serials=serials,
                seen=seen,
                inv_svc=inv_svc,
                company_id=order.company_id,
                notes=rline.notes,
            )
            pending.append((rline, po_line, serials))

        movement_svc = StockMovementService(self._db)
        from app.services.inventory import serial_service
        from app.services.collaboration import on_item_stock_change

        for rline, po_line, serials in pending:
            inv_svc.ensure_for_item(
                po_line.item_id,
                company_id=order.company_id,
                track_stock=True,
                default_warehouse_id=order.warehouse_id,
            )
            movement_svc.apply_movement(
                MovementInput(
                    item_id=po_line.item_id,
                    warehouse_id=receipt.warehouse_id,
                    movement_type=MOVEMENT_PURCHASE_RECEIPT,
                    quantity=rline.quantity_received,
                    company_id=order.company_id,
                    reference=receipt.receipt_number,
                    notes=f"PURCHASE_RECEIPT {receipt.receipt_number} PO {order.po_number}",
                    created_by=actor_id,
                    unit_cost=po_line.unit_cost,
                    source_type="purchase_receipt",
                    source_id=receipt.id,
                    document_date=receipt.received_at.date() if getattr(receipt, "received_at", None) else None,
                ),
            )
            if serials:
                serial_service.register_serials_or_raise(
                    self._db,
                    serials,
                    company_id=order.company_id,
                    item_id=po_line.item_id,
                    warehouse_id=receipt.warehouse_id,
                    source_type="receipt",
                    source_id=receipt.id,
                    supplier_id=order.supplier_id,
                    received_at=datetime.utcnow(),
                    notes=f"Received on {receipt.receipt_number}",
                )
            po_line.quantity_received += rline.quantity_received
            on_item_stock_change(
                self._db,
                po_line.item_id,
                old_qty=str(po_line.quantity_received - rline.quantity_received),
                new_qty=str(po_line.quantity_received),
                performed_by=actor_id,
                company_id=order.company_id,
            )

        self._refresh_po_status(order)
        receipt.status = "posted"
        receipt.posted_at = datetime.utcnow()
        receipt.posted_by = actor_id
        self._db.flush()
        self._receipt_activity(
            receipt,
            "Receipt Confirmed",
            actor_id,
            {"po_number": order.po_number},
        )
        self._receipt_activity(
            receipt,
            "Inventory Updated",
            actor_id,
            {"po_number": order.po_number, "reference": receipt.receipt_number},
        )

        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_purchase_receipt(receipt.id),
            source_type="purchase_receipt",
            source_id=receipt.id,
            company_id=receipt.company_id,
        )

        return receipt

    def cancel_receipt(self, receipt_id: str, *, actor_id: Optional[str] = None) -> PurchaseReceipt:
        receipt = self.get_receipt(receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")
        if receipt.status == "cancelled":
            return receipt
        if receipt.status != "draft":
            raise HTTPException(
                status_code=400,
                detail="Only draft receipts can be cancelled. Posted receipts already updated inventory.",
            )
        receipt.status = "cancelled"
        self._db.flush()
        self._receipt_activity(receipt, "Receipt Cancelled", actor_id)
        return receipt

    def correct_receipt_line(
        self,
        receipt_id: str,
        line_id: str,
        *,
        new_quantity: int,
        reason: str,
        actor_id: str,
    ) -> tuple[PurchaseReceiptLine, PurchaseReceiptLineCorrection, int]:
        """Admin-only fix for a data-entry mistake on an already-posted receipt
        line. Adjusts the PO line's received total, posts a compensating stock
        movement, and writes a permanent audit row — the receipt itself stays
        otherwise immutable. Returns (line, audit_row, delta) so the router can
        also correct the linked Finance payable by the same value delta."""
        if new_quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity cannot be negative")
        if not reason or not reason.strip():
            raise HTTPException(status_code=400, detail="A reason is required to correct a received quantity")

        receipt = self.get_receipt(receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")
        if receipt.status != "posted":
            raise HTTPException(status_code=400, detail="Only posted receipts can be corrected")

        rline = self._db.get(PurchaseReceiptLine, line_id)
        if not rline or rline.purchase_receipt_id != receipt.id:
            raise HTTPException(status_code=404, detail="Receipt line not found")

        inv_item = self._db.query(InventoryItem).filter_by(item_id=rline.item_id).first()
        if inv_item and (inv_item.track_serial or inv_item.track_batch):
            raise HTTPException(
                status_code=400,
                detail="Serial/batch-tracked items can't be corrected this way — use a Purchase Return instead",
            )

        old_quantity = rline.quantity_received
        delta = new_quantity - old_quantity
        if delta == 0:
            raise HTTPException(status_code=400, detail="New quantity is the same as the current quantity")

        po_line = self._db.get(PurchaseOrderLine, rline.purchase_order_line_id)
        if not po_line:
            raise HTTPException(status_code=404, detail="Purchase order line not found")
        if po_line.quantity_received + delta < po_line.quantity_returned:
            raise HTTPException(
                status_code=400,
                detail="Cannot reduce below the quantity already returned to the supplier",
            )
        order = self._db.get(PurchaseOrder, po_line.purchase_order_id)
        if delta > 0 and not order.allow_over_receive:
            remaining = po_line.quantity_ordered - po_line.quantity_received
            if delta > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=f"Correction would over-receive {po_line.sku} — enable over-receive on the PO first",
                )

        audit = PurchaseReceiptLineCorrection(
            company_id=receipt.company_id,
            purchase_receipt_id=receipt.id,
            purchase_receipt_line_id=rline.id,
            old_quantity=old_quantity,
            new_quantity=new_quantity,
            reason=reason.strip(),
            corrected_by=actor_id,
        )
        self._db.add(audit)

        movement_svc = StockMovementService(self._db)
        movement_svc.apply_movement(
            MovementInput(
                item_id=rline.item_id,
                warehouse_id=receipt.warehouse_id,
                movement_type=MOVEMENT_STOCK_ADJUSTMENT_IN if delta > 0 else MOVEMENT_STOCK_ADJUSTMENT_OUT,
                quantity=abs(delta),
                company_id=receipt.company_id,
                reference=receipt.receipt_number,
                notes=f"Admin correction on {receipt.receipt_number}: {old_quantity} -> {new_quantity} ({reason.strip()})",
                created_by=actor_id,
                unit_cost=po_line.unit_cost,
                source_type="purchase_receipt_correction",
                source_id=audit.id,
            ),
        )

        rline.quantity_received = new_quantity
        po_line.quantity_received += delta
        self._db.flush()
        self._refresh_po_status(order)
        return rline, audit, delta

    def list_receipt_line_corrections(
        self, receipt_id: str, *, company_id: str = "default"
    ) -> list[PurchaseReceiptLineCorrection]:
        return (
            self._db.query(PurchaseReceiptLineCorrection)
            .filter(
                PurchaseReceiptLineCorrection.company_id == company_id,
                PurchaseReceiptLineCorrection.purchase_receipt_id == receipt_id,
            )
            .order_by(PurchaseReceiptLineCorrection.created_at.desc())
            .all()
        )

    def list_receipts(
        self,
        *,
        company_id: str = "default",
        purchase_order_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseReceipt], int]:
        query = self._db.query(PurchaseReceipt).filter(PurchaseReceipt.company_id == company_id)
        if purchase_order_id:
            query = query.filter(PurchaseReceipt.purchase_order_id == purchase_order_id)
        if status:
            query = query.filter(PurchaseReceipt.status == status)
        total = query.count()
        rows = (
            query.order_by(PurchaseReceipt.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_receipt(self, receipt_id: str) -> Optional[PurchaseReceipt]:
        row = self._db.get(PurchaseReceipt, receipt_id)
        if not row:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_receipt_lines(self, receipt_id: str) -> list[PurchaseReceiptLine]:
        return (
            self._db.query(PurchaseReceiptLine)
            .filter(PurchaseReceiptLine.purchase_receipt_id == receipt_id)
            .all()
        )

    def dashboard(self, company_id: str = "default") -> dict[str, Any]:
        open_statuses = ("draft", "confirmed", "partial_received")
        open_count = (
            self._db.query(PurchaseOrder)
            .filter(PurchaseOrder.company_id == company_id, PurchaseOrder.status.in_(open_statuses))
            .count()
        )
        pending_receive = (
            self._db.query(PurchaseOrder)
            .filter(
                PurchaseOrder.company_id == company_id,
                PurchaseOrder.status.in_(("confirmed", "partial_received")),
            )
            .count()
        )
        completed_count = (
            self._db.query(PurchaseOrder)
            .filter(PurchaseOrder.company_id == company_id, PurchaseOrder.status == "completed")
            .count()
        )
        spend_ytd = (
            self._db.query(func.coalesce(func.sum(PurchaseOrder.total), 0))
            .filter(
                PurchaseOrder.company_id == company_id,
                PurchaseOrder.status.in_(("confirmed", "partial_received", "completed")),
            )
            .scalar()
        )
        status_rows = (
            self._db.query(PurchaseOrder.status, func.count(PurchaseOrder.id))
            .filter(PurchaseOrder.company_id == company_id)
            .group_by(PurchaseOrder.status)
            .all()
        )
        recent = (
            self._db.query(PurchaseOrder)
            .filter(PurchaseOrder.company_id == company_id)
            .order_by(PurchaseOrder.updated_at.desc())
            .limit(5)
            .all()
        )
        return {
            "open_po_count": open_count,
            "pending_receive_count": pending_receive,
            "completed_count": completed_count,
            "spend_total": spend_ytd or Decimal("0"),
            "status_breakdown": {status: count for status, count in status_rows},
            "recent_order_ids": [row.id for row in recent],
        }

    def _refresh_po_status(self, order: PurchaseOrder) -> None:
        lines = self.get_lines(order.id)
        if not lines:
            return
        total_ordered = sum(l.quantity_ordered for l in lines)
        total_received = sum(l.quantity_received for l in lines)
        if total_received <= 0:
            return
        if total_received >= total_ordered:
            new_status = "completed"
        else:
            new_status = "partial_received"
        if order.status != new_status:
            self._transition(order, new_status, None, "Updated from goods receipt", internal=True)

    @staticmethod
    def _parse_serials_json(raw: Optional[str]) -> list[str]:
        try:
            value = json.loads(raw or "[]")
        except json.JSONDecodeError:
            return []
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _receipt_activity(
        self,
        receipt: PurchaseReceipt,
        action: str,
        actor_id: Optional[str],
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        try:
            from app.services.collaboration.collaboration_service import CollaborationService
            from app.services.collaboration.constants import ENTITY_TYPE_PURCHASE

            CollaborationService(self._db, company_id=receipt.company_id).record_activity(
                ENTITY_TYPE_PURCHASE,
                receipt.id,
                action,
                performed_by=actor_id,
                details={
                    "receipt_number": receipt.receipt_number,
                    "purchase_order_id": receipt.purchase_order_id,
                    **(details or {}),
                },
            )
        except Exception:
            return

    @staticmethod
    def _combine_receipt_notes(delivery_note: Optional[str], notes: Optional[str]) -> Optional[str]:
        parts = []
        dn = (delivery_note or "").strip()
        body = (notes or "").strip()
        if dn:
            parts.append(f"DN: {dn}")
        if body:
            parts.append(body)
        return "\n".join(parts) or None

    @staticmethod
    def _clean_serials(raw: tuple[str, ...] | list[str] | None) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in raw or ():
            cleaned = (value or "").strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate serial number {cleaned} on this receipt.",
                )
            seen.add(key)
            out.append(cleaned)
        return out

    def _validate_line_serials(
        self,
        sku: str,
        item_id: str,
        *,
        quantity: int,
        serials: list[str],
        seen: set[str],
        inv_svc: InventoryItemService,
        company_id: str,
        notes: Optional[str] = None,
    ) -> None:
        inv = inv_svc.get_by_item_id(item_id)
        tracking = tracking_type_of(
            bool(inv.track_serial) if inv else False,
            bool(inv.track_batch) if inv else False,
        )
        if tracking == TRACKING_SERIAL:
            if len(serials) != quantity:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{sku} is serial-tracked: receive {quantity} requires exactly "
                        f"{quantity} serial number(s), got {len(serials)}."
                    ),
                )
        elif tracking == TRACKING_BATCH:
            batch = (notes or "").strip()
            if not batch.upper().startswith("BATCH:") or len(batch) < 7:
                raise HTTPException(
                    status_code=400,
                    detail=f"{sku} is batch-tracked: batch number is required.",
                )
        elif serials and len(serials) != quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{sku}: {len(serials)} serial(s) given for "
                    f"{quantity} unit(s) — they must match."
                ),
            )

        if not serials:
            return

        from app.services.inventory import serial_service

        for serial in serials:
            key = serial.lower()
            if key in seen:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate serial number {serial} on this receipt.",
                )
            seen.add(key)
            existing = serial_service.find_by_number(self._db, serial, company_id=company_id)
            if existing is not None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial number {serial} already exists in inventory.",
                )

    def _transition(
        self,
        order: PurchaseOrder,
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
        *,
        internal: bool = False,
    ) -> None:
        if to_status not in PO_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {to_status}")
        # "partial_received"/"completed" are only reachable as a side effect of posting a
        # goods receipt (see _refresh_po_status) — never as a manual status-update target,
        # or a caller could jump a draft PO straight to "completed" with no confirm/receive.
        allowed = PO_STATUS_TRANSITIONS.get(order.status, frozenset())
        exempt = internal and to_status in {"partial_received", "completed"}
        if to_status != order.status and to_status not in allowed and not exempt:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {order.status} to {to_status}",
            )
        from_status = order.status
        order.status = to_status
        self._record_status(order.id, from_status, to_status, actor_id, notes)

    def _record_status(
        self,
        order_id: str,
        from_status: Optional[str],
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
    ) -> None:
        self._db.add(
            PurchaseOrderStatusHistory(
                purchase_order_id=order_id,
                from_status=from_status,
                to_status=to_status,
                changed_by=actor_id,
                notes=notes,
            ),
        )

    def _require_order(self, order_id: str) -> PurchaseOrder:
        order = self.get_order(order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return order

    def _next_po_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "purchase.order",
            initial=lambda: self._db.query(PurchaseOrder)
            .filter(PurchaseOrder.company_id == company_id)
            .count()
            + 1,
        )

    def _next_receipt_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "purchase.receipt",
            initial=lambda: self._db.query(PurchaseReceipt)
            .filter(PurchaseReceipt.company_id == company_id)
            .count()
            + 1,
        )

    def resolve_item_id(self, *, item_id: Optional[str] = None, sku: Optional[str] = None) -> str:
        if item_id:
            item = self._db.get(Item, item_id)
            if not item:
                raise HTTPException(status_code=404, detail="Item not found")
            return item.id
        if sku:
            item = self._db.query(Item).filter(Item.sku == sku).first()
            if not item:
                raise HTTPException(status_code=404, detail=f"No item for SKU: {sku}")
            return item.id
        raise HTTPException(status_code=400, detail="item_id or sku is required")
