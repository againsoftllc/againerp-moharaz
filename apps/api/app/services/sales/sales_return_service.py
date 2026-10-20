"""Sales return / credit note — Odoo return order + credit memo.

Draft only records the request. Confirming marks warehouse acceptance.
Crediting posts stock in (customer_return) and an AR credit memo (account 4200).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.sales_return import SalesReturn, SalesReturnLine
from app.schemas.sales_return import SalesReturnLineRead, SalesReturnRead
from app.services.inventory.constants import MOVEMENT_CUSTOMER_RETURN, RESERVATION_SOURCE_SALES
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.sales.constants import SALES_RETURN_REASONS, SALES_RETURN_STATUS_TRANSITIONS
from app.services.core.sequence_service import get_or_create as get_sequence, next_number as allocate_number


# A return for one of these reasons is a faulty / damaged unit: it must not go back into SELLABLE stock, so (unless the staff pick
# a warehouse) it is received into the company's RMA store.
DEFECT_REASONS = frozenset({"defective", "damaged_in_transit", "warranty"})


@dataclass(frozen=True)
class SalesReturnLineInput:
    sales_order_line_id: str
    quantity_returned: int
    discount_amount: Decimal = Decimal("0")
    reason: Optional[str] = None
    notes: Optional[str] = None
    serial_numbers: Optional[list[str]] = None


class SalesReturnService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    def list_returns(
        self,
        *,
        company_id: str = "default",
        sales_order_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[SalesReturn], int]:
        query = self._db.query(SalesReturn).filter(SalesReturn.company_id == company_id)
        if sales_order_id:
            query = query.filter(SalesReturn.sales_order_id == sales_order_id)
        if status:
            query = query.filter(SalesReturn.status == status)
        total = query.count()
        rows = (
            query.order_by(SalesReturn.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_return(self, return_id: str) -> Optional[SalesReturn]:
        row = self._db.get(SalesReturn, return_id)
        if not row:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_return_lines(self, return_id: str) -> list[SalesReturnLine]:
        return (
            self._db.query(SalesReturnLine)
            .filter(SalesReturnLine.sales_return_id == return_id)
            .all()
        )

    def create_return(
        self,
        sales_order_id: str,
        lines: list[SalesReturnLineInput],
        *,
        reason: str = "other",
        return_date: Optional[date] = None,
        requested_by: Optional[str] = None,
        notes: Optional[str] = None,
        discount_amount: Decimal = Decimal("0"),
        actor_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
    ) -> SalesReturn:
        order = self._require_order(sales_order_id)
        if order.status == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot return a cancelled sales order")
        if not lines:
            raise HTTPException(status_code=400, detail="At least one return line is required")
        if reason not in SALES_RETURN_REASONS:
            raise HTTPException(status_code=400, detail=f"Invalid reason: {reason}")

        so_lines = {row.id: row for row in self._order_lines(order.id)}

        ret = SalesReturn(
            company_id=order.company_id,
            return_number=self._next_return_number(order.company_id),
            sales_order_id=order.id,
            customer_id=order.customer_id,
            warehouse_id=self._return_warehouse(order, reason, warehouse_id),
            status="draft",
            reason=reason,
            return_date=return_date or date.today(),
            requested_by=requested_by,
            notes=notes,
        )
        self._db.add(ret)
        self._db.flush()

        subtotal = Decimal("0")
        tax_total = Decimal("0")
        returned_net = Decimal("0")  # the returned lines' value after their own discount, before any order-level discount
        for line_in in lines:
            if line_in.quantity_returned <= 0:
                continue
            so_line = so_lines.get(line_in.sales_order_line_id)
            if not so_line:
                raise HTTPException(
                    status_code=404, detail=f"Sales order line not found: {line_in.sales_order_line_id}"
                )
            already = int(getattr(so_line, "quantity_returned", 0) or 0) + self._pending_returned_quantity(
                so_line.id
            )
            # Most orders never go through a separate warehouse delivery step —
            # treat them as delivered-in-full so returns aren't blocked.
            delivered = so_line.quantity_delivered or so_line.quantity_ordered
            returnable = delivered - already
            if line_in.quantity_returned > returnable:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot return {line_in.quantity_returned} of {so_line.sku}: "
                        f"only {returnable} delivered and not already returned"
                    ),
                )
            if line_in.reason and line_in.reason not in SALES_RETURN_REASONS:
                raise HTTPException(status_code=400, detail=f"Invalid reason: {line_in.reason}")

            qty = Decimal(line_in.quantity_returned)
            ordered = Decimal(so_line.quantity_ordered or 1)
            discount_per_unit = so_line.discount_amount / ordered
            net_unit = so_line.unit_price - discount_per_unit
            line_sub = net_unit * qty
            returned_net += line_sub
            line_discount = max(Decimal("0"), min(line_in.discount_amount, line_sub))
            line_sub_after_discount = line_sub - line_discount
            line_tax = line_sub_after_discount * so_line.tax_rate / Decimal("100")
            subtotal += line_sub_after_discount
            tax_total += line_tax

            return_line = SalesReturnLine(
                sales_return_id=ret.id,
                sales_order_line_id=so_line.id,
                item_id=so_line.item_id,
                quantity_returned=line_in.quantity_returned,
                unit_price=so_line.unit_price,
                discount_amount=line_discount,
                tax_rate=so_line.tax_rate,
                reason=line_in.reason,
                notes=line_in.notes,
            )
            return_line.serial_numbers = self._serials_coming_back(so_line, line_in)
            self._db.add(return_line)

        if subtotal <= 0:
            raise HTTPException(status_code=400, detail="No quantities to return")

        # The customer paid for the lines MINUS the order-level discount (a fixed amount or a percent of the order): the units that come
        # back take their share of it with them, or a paid order would be refunded more than was paid. Shipping is not refunded.
        order_net = sum(
            (row.unit_price * Decimal(row.quantity_ordered or 0) - row.discount_amount for row in so_lines.values()),
            Decimal("0"),
        )
        order_share = Decimal("0")
        if order_net > 0:
            from app.services.sales.sales_service import SalesService

            header_discount = SalesService.header_discount_amount(order, order_net)
            order_share = (header_discount * returned_net / order_net).quantize(Decimal("0.01"))
        discount = max(Decimal("0"), min(discount_amount + order_share, subtotal))

        ret.subtotal = subtotal
        ret.discount_amount = discount
        ret.tax_amount = tax_total
        ret.credit_amount = subtotal - discount + tax_total
        self._db.flush()
        self._activity(ret, "Return Drafted", actor_id, {"order_number": order.order_number})
        units = sum(int(l.quantity_returned) for l in lines if l.quantity_returned > 0)
        self._order_activity(
            order.id,
            "return_recorded",
            f"Return {ret.return_number} recorded — {units} unit(s), credit {ret.credit_amount}",
            actor_id,
            description=notes,
        )
        return ret

    def confirm_return(self, return_id: str, *, actor_id: Optional[str] = None) -> SalesReturn:
        ret = self._require_return(return_id)
        self._transition(ret, "confirmed")
        ret.confirmed_at = datetime.utcnow()
        ret.confirmed_by = actor_id
        self._db.flush()
        self._activity(ret, "Return Confirmed", actor_id)
        return ret

    def cancel_return(self, return_id: str, *, actor_id: Optional[str] = None) -> SalesReturn:
        ret = self._require_return(return_id)
        if ret.status == "cancelled":
            return ret
        self._transition(ret, "cancelled")
        ret.cancelled_at = datetime.utcnow()
        ret.cancelled_by = actor_id
        self._db.flush()
        self._activity(ret, "Return Cancelled", actor_id)
        self._order_activity(ret.sales_order_id, "return_cancelled", f"Return {ret.return_number} cancelled", actor_id)
        return ret

    def _serials_coming_back(self, so_line: SalesOrderLine, line_in: SalesReturnLineInput) -> list[str]:
        """Which serial units this return line brings back: the ones named, else the
        first N still out on the sale line (units already returned earlier are skipped)."""
        on_line = so_line.serial_numbers
        if not on_line:
            return []
        already: set[str] = set()
        for prev in (
            self._db.query(SalesReturnLine)
            .filter(SalesReturnLine.sales_order_line_id == so_line.id)
            .all()
        ):
            already.update(sn.lower() for sn in prev.serial_numbers)
        wanted = [sn.strip() for sn in (line_in.serial_numbers or []) if sn and sn.strip()]
        if wanted:
            by_lower = {sn.lower(): sn for sn in on_line}
            unknown = [sn for sn in wanted if sn.lower() not in by_lower]
            if unknown:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {unknown[0]} was not sold on this line",
                )
            if len(wanted) > line_in.quantity_returned:
                raise HTTPException(
                    status_code=400,
                    detail="More serial numbers than units being returned",
                )
            return [by_lower[sn.lower()] for sn in wanted]
        remaining = [sn for sn in on_line if sn.lower() not in already]
        return remaining[: line_in.quantity_returned]

    def credit_return(self, return_id: str, *, actor_id: Optional[str] = None) -> SalesReturn:
        """Post the credit memo and receive returned units into stock."""
        ret = self._require_return(return_id)
        if ret.status == "credited":
            return ret
        self._transition(ret, "credited")

        lines = self.get_return_lines(ret.id)
        if not lines:
            raise HTTPException(status_code=400, detail="Return has no lines")

        so_lines = {
            row.id: row
            for row in self._db.query(SalesOrderLine)
            .filter(SalesOrderLine.id.in_([l.sales_order_line_id for l in lines]))
            .all()
        }

        for rline in lines:
            so_line = so_lines.get(rline.sales_order_line_id)
            if not so_line:
                raise HTTPException(status_code=400, detail="Return line is missing its sales order line")
            already = int(getattr(so_line, "quantity_returned", 0) or 0)
            delivered = so_line.quantity_delivered or so_line.quantity_ordered
            returnable = delivered - already
            if rline.quantity_returned > returnable:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot credit {so_line.sku}: only {returnable} returnable now",
                )

        movement_svc = StockMovementService(self._db)
        for rline in lines:
            so_line = so_lines[rline.sales_order_line_id]
            if int(so_line.quantity_delivered or 0) > 0:
                # The goods left stock at confirmation/delivery: put them back.
                movement_svc.apply_movement(
                    MovementInput(
                        item_id=rline.item_id,
                        warehouse_id=ret.warehouse_id,
                        movement_type=MOVEMENT_CUSTOMER_RETURN,
                        quantity=rline.quantity_returned,
                        company_id=ret.company_id,
                        reference=ret.return_number,
                        notes=f"SALES_RETURN {ret.return_number} SO {so_line.sales_order_id}",
                        created_by=actor_id,
                        unit_cost=None,
                        source_type="sales_return",
                        source_id=ret.id,
                        document_date=ret.return_date,
                    ),
                )
            else:
                # Older orders were only reserved (never delivered in the system), so
                # the stock never went down — hand the reservation back instead of
                # adding units that were never taken out.
                release = min(rline.quantity_returned, int(so_line.quantity_reserved or 0))
                if release > 0:
                    movement_svc.release(
                        item_id=rline.item_id,
                        warehouse_id=self._require_order(ret.sales_order_id).warehouse_id or ret.warehouse_id,
                        quantity=release,
                        company_id=ret.company_id,
                        source_type=RESERVATION_SOURCE_SALES,
                        source_id=so_line.sales_order_id,
                        source_line_id=so_line.id,
                        reference=ret.return_number,
                        notes=f"SALES_RETURN {ret.return_number} — reservation released",
                        created_by=actor_id,
                    )
                    so_line.quantity_reserved = int(so_line.quantity_reserved or 0) - release
            so_line.quantity_returned = int(getattr(so_line, "quantity_returned", 0) or 0) + rline.quantity_returned
            if rline.serial_numbers:
                from app.services.inventory import serial_service

                serial_service.release_to_stock(
                    self._db,
                    rline.serial_numbers,
                    warehouse_id=ret.warehouse_id,
                    note=f"return {ret.return_number}",
                    company_id=ret.company_id or "default",
                )

        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        receivable = FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_sales_credit_note(ret.id),
            source_type="sales_return",
            source_id=ret.id,
            company_id=ret.company_id,
        )
        if receivable:
            ret.receivable_id = receivable.id

        ret.credited_at = datetime.utcnow()
        ret.credited_by = actor_id
        self._db.flush()
        self._activity(ret, "Credit Note Posted", actor_id, {"credit_amount": str(ret.credit_amount)})
        returned = ", ".join(
            f"{so_lines[l.sales_order_line_id].sku} × {l.quantity_returned}" for l in lines
        )
        self._order_activity(
            ret.sales_order_id,
            "return_credited",
            f"Return {ret.return_number} credited — stock back ({returned}), credit note {ret.credit_amount}",
            actor_id,
        )
        return ret

    def to_read(self, ret: SalesReturn) -> SalesReturnRead:
        customer = self._db.get(CommerceCustomer, ret.customer_id)
        warehouse = self._db.get(InventoryWarehouse, ret.warehouse_id)
        order = self._db.get(SalesOrder, ret.sales_order_id)
        lines = self.get_return_lines(ret.id)
        item_ids = {l.item_id for l in lines if l.item_id}
        items = (
            {i.id: i for i in self._db.query(Item).filter(Item.id.in_(item_ids)).all()}
            if item_ids
            else {}
        )
        return SalesReturnRead(
            id=ret.id,
            company_id=ret.company_id,
            return_number=ret.return_number,
            sales_order_id=ret.sales_order_id,
            order_number=order.order_number if order else None,
            invoice_number=order.invoice_number if order else None,
            customer_id=ret.customer_id,
            customer_name=customer.name if customer else None,
            warehouse_id=ret.warehouse_id,
            warehouse_name=warehouse.name if warehouse else None,
            status=ret.status,
            reason=ret.reason,
            return_date=ret.return_date,
            requested_by=ret.requested_by,
            notes=ret.notes,
            subtotal=ret.subtotal,
            discount_amount=ret.discount_amount,
            tax_amount=ret.tax_amount,
            credit_amount=ret.credit_amount,
            receivable_id=ret.receivable_id,
            confirmed_at=ret.confirmed_at,
            credited_at=ret.credited_at,
            cancelled_at=ret.cancelled_at,
            created_at=ret.created_at,
            updated_at=ret.updated_at,
            lines=[
                SalesReturnLineRead(
                    id=l.id,
                    sales_order_line_id=l.sales_order_line_id,
                    item_id=l.item_id,
                    sku=items[l.item_id].sku if l.item_id in items else None,
                    name=items[l.item_id].name if l.item_id in items else None,
                    quantity_returned=l.quantity_returned,
                    unit_price=l.unit_price,
                    discount_amount=l.discount_amount,
                    tax_rate=l.tax_rate,
                    line_total=(l.unit_price * l.quantity_returned - l.discount_amount)
                    * (1 + l.tax_rate / 100),
                    reason=l.reason,
                    notes=l.notes,
                    serial_numbers=l.serial_numbers,
                )
                for l in lines
            ],
        )

    def _return_warehouse(self, order: SalesOrder, reason: str, requested: Optional[str]) -> str:
        """Where the returned units are received: the warehouse the staff chose, else the RMA store for a faulty / damaged return,
        else the warehouse the order was sold from."""
        if requested:
            wh = self._db.get(InventoryWarehouse, requested)
            if wh is None or (wh.company_id or "default") != (order.company_id or "default") or not wh.is_active or wh.is_supplier_transit:
                raise HTTPException(status_code=400, detail="Choose an active warehouse to receive the returned units")
            return wh.id
        if reason in DEFECT_REASONS:
            rma = (
                self._db.query(InventoryWarehouse)
                .filter(
                    InventoryWarehouse.company_id == order.company_id,
                    InventoryWarehouse.is_rma_store.is_(True),
                    InventoryWarehouse.is_active.is_(True),
                )
                .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.created_at)
                .first()
            )
            if rma is not None:
                return rma.id
        return order.warehouse_id

    def _order_lines(self, order_id: str) -> list[SalesOrderLine]:
        return self._db.query(SalesOrderLine).filter(SalesOrderLine.sales_order_id == order_id).all()

    def _pending_returned_quantity(self, so_line_id: str, *, exclude_return_id: Optional[str] = None) -> int:
        """Quantity already claimed by draft/confirmed returns against this order line.

        so_line.quantity_returned only advances when a return is *credited* — a
        draft or confirmed return doesn't touch it — so without this, the same
        units could be added to any number of separate draft returns before any
        of them is credited, letting Sub total/Refund due run away with them.
        """
        query = (
            self._db.query(func.coalesce(func.sum(SalesReturnLine.quantity_returned), 0))
            .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
            .filter(
                SalesReturnLine.sales_order_line_id == so_line_id,
                SalesReturn.status.in_(["draft", "confirmed"]),
            )
        )
        if exclude_return_id:
            query = query.filter(SalesReturn.id != exclude_return_id)
        return int(query.scalar() or 0)

    def _require_order(self, order_id: str) -> SalesOrder:
        order = self._db.get(SalesOrder, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Sales order not found")
        if self._company_id is not None and (order.company_id or "default") != self._company_id:
            raise HTTPException(status_code=404, detail="Sales order not found")
        return order

    def _require_return(self, return_id: str) -> SalesReturn:
        ret = self.get_return(return_id)
        if not ret:
            raise HTTPException(status_code=404, detail="Sales return not found")
        return ret

    def _transition(self, ret: SalesReturn, to_status: str) -> None:
        allowed = SALES_RETURN_STATUS_TRANSITIONS.get(ret.status, frozenset())
        if to_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move return from {ret.status} to {to_status}",
            )
        ret.status = to_status

    def _next_return_number(self, company_id: str) -> str:
        from app.models.company import Company
        from app.services.company_invoice import DEFAULT_CREDIT_PREFIX

        # Credit-note prefix stays company-configurable; the counter itself is
        # a locked sequence so concurrent returns cannot share a number.
        company = self._db.get(Company, company_id)
        prefix = ((company.credit_note_prefix if company else None) or DEFAULT_CREDIT_PREFIX).strip() or "CN"
        row = get_sequence(self._db, company_id, "sales.return")
        wanted_prefix = f"{prefix}-{{YYYY}}-"
        if row.prefix != wanted_prefix:
            row.prefix = wanted_prefix
        return allocate_number(
            self._db,
            company_id,
            "sales.return",
            initial=lambda: self._db.query(SalesReturn)
            .filter(SalesReturn.company_id == company_id)
            .count()
            + 1,
        )

    def _order_activity(
        self,
        order_id: str,
        activity_type: str,
        title: str,
        actor_id: Optional[str],
        description: Optional[str] = None,
    ) -> None:
        """Mirror return events onto the sales order's own activity feed."""
        from app.models.sales import SalesOrderActivity

        self._db.add(
            SalesOrderActivity(
                sales_order_id=order_id,
                activity_type=activity_type,
                title=title,
                description=description,
                actor_id=actor_id,
            ),
        )

    def _activity(
        self,
        ret: SalesReturn,
        action: str,
        actor_id: Optional[str],
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        try:
            from app.services.collaboration.collaboration_service import CollaborationService
            from app.services.collaboration.constants import ENTITY_TYPE_SALES

            CollaborationService(self._db, company_id=ret.company_id).record_activity(
                ENTITY_TYPE_SALES,
                ret.id,
                action,
                performed_by=actor_id,
                details={
                    "return_number": ret.return_number,
                    "sales_order_id": ret.sales_order_id,
                    **(details or {}),
                },
            )
        except Exception:
            return
