"""Sales quotations, orders, deliveries, and customer pricing."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import re
import secrets
import uuid
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.sales_edit_request import EDIT_REQUEST_ACTIVE_STATUSES, SalesOrderEditRequest
from app.models.sales_return import SalesReturnLine
from app.models.sales import (
    CustomerItemPrice,
    SalesDelivery,
    SalesDeliveryLine,
    SalesOrder,
    SalesOrderActivity,
    SalesOrderLine,
    SalesOrderLog,
    SalesOrderStatusHistory,
    SalesOrderTax,
    SalesQuotation,
    SalesQuotationLine,
    SalesQuotationStatusHistory,
)
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.inventory import product_master
from app.services.inventory.constants import (
    MOVEMENT_CUSTOMER_RETURN,
    MOVEMENT_POS_SALE,
    MOVEMENT_SALES_DELIVERY,
    RESERVATION_SOURCE_SALES,
)
from app.services.sales.constants import (
    DELIVERY_NOTE_STATUSES,
    DELIVERY_STATUSES,
    EDITABLE_QUOTATION_STATUSES,
    EDITABLE_SALES_ORDER_STATUSES,
    QUOTATION_STATUSES,
    QUOTATION_TRANSITIONS,
    SALES_ORDER_STATUSES,
    SALES_ORDER_TRANSITIONS,
)
from app.services.core.sequence_service import next_number as allocate_number


@dataclass(frozen=True)
class SalesLineInput:
    item_id: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    notes: Optional[str] = None
    serial_numbers: Optional[list[str]] = None

@dataclass(frozen=True)
class DeliveryLineInput:
    sales_order_line_id: str
    quantity_delivered: int
    notes: Optional[str] = None


# Past draft: stock and ledger postings are live, so edits must keep them in step.
LEDGER_LIVE_STATUSES = frozenset({"confirmed", "processing", "completed"})


# Sortable list columns, keyed by the public `sort_by` value. Unknown keys fall
# back to created_at instead of getattr() on the model, which let
# `?sort_by=__class__` reach ORDER BY and 500.
ORDER_SORT_COLUMNS = {
    "created_at": SalesOrder.created_at,
    "updated_at": SalesOrder.updated_at,
    "order_date": SalesOrder.order_date,
    "expected_date": SalesOrder.expected_date,
    "order_number": SalesOrder.order_number,
    "invoice_number": SalesOrder.invoice_number,
    "status": SalesOrder.status,
    "delivery_status": SalesOrder.delivery_status,
    "subtotal": SalesOrder.subtotal,
    "tax_total": SalesOrder.tax_total,
    "discount_total": SalesOrder.discount_total,
    "total": SalesOrder.total,
    "customer_name": CommerceCustomer.name,
}

# Quotations accept the order vocabulary too, so one grid can sort both lists.
QUOTATION_SORT_COLUMNS = {
    "created_at": SalesQuotation.created_at,
    "updated_at": SalesQuotation.updated_at,
    "quote_date": SalesQuotation.quote_date,
    "order_date": SalesQuotation.quote_date,
    "valid_until": SalesQuotation.valid_until,
    "quotation_number": SalesQuotation.quotation_number,
    "order_number": SalesQuotation.quotation_number,
    "status": SalesQuotation.status,
    "subtotal": SalesQuotation.subtotal,
    "tax_total": SalesQuotation.tax_total,
    "discount_total": SalesQuotation.discount_total,
    "total": SalesQuotation.total,
    "customer_name": CommerceCustomer.name,
}


def _sort_expr(column, sort_dir: str):
    expr = column.desc() if (sort_dir or "").lower() == "desc" else column.asc()
    return expr.nulls_last()


class SalesService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    # ── Quotations ───────────────────────────────────────────────────────────

    def list_quotations(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        limit: int = 100,
        offset: int = 0,
        warehouse_ids: Optional[list[str]] = None,
    ) -> tuple[list[SalesQuotation], int]:
        query = self._db.query(SalesQuotation).filter(
            SalesQuotation.company_id == company_id,
            SalesQuotation.deleted_at.is_(None),
        )
        if warehouse_ids is not None:  # a member limited to some warehouses: theirs, and quotations with none yet
            query = query.filter(or_(SalesQuotation.warehouse_id.in_(warehouse_ids), SalesQuotation.warehouse_id.is_(None)))
        if status:
            query = query.filter(SalesQuotation.status == status)
        if customer_id:
            query = query.filter(SalesQuotation.customer_id == customer_id)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(SalesQuotation.quotation_number.ilike(term))
        total = query.count()
        sort_col = QUOTATION_SORT_COLUMNS.get(sort_by, SalesQuotation.created_at)
        if sort_col is CommerceCustomer.name:
            query = query.outerjoin(CommerceCustomer, CommerceCustomer.id == SalesQuotation.customer_id)
        rows = (
            query.order_by(
                _sort_expr(sort_col, sort_dir),
                SalesQuotation.created_at.desc(),
                SalesQuotation.id,
            )
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_quotation(self, quotation_id: str) -> Optional[SalesQuotation]:
        row = self._db.get(SalesQuotation, quotation_id)
        if row is None:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_quotation_lines(self, quotation_id: str) -> list[SalesQuotationLine]:
        return (
            self._db.query(SalesQuotationLine)
            .filter(SalesQuotationLine.sales_quotation_id == quotation_id)
            .order_by(SalesQuotationLine.sort_order, SalesQuotationLine.line_number)
            .all()
        )

    def create_quotation(
        self,
        *,
        customer_id: str,
        lines: list[SalesLineInput],
        company_id: str = "default",
        warehouse_id: Optional[str] = None,
        quote_date: Optional[date] = None,
        valid_until: Optional[date] = None,
        sales_rep: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> SalesQuotation:
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")
        self._require_customer(customer_id)
        if warehouse_id:
            self._require_warehouse(warehouse_id)

        quote = SalesQuotation(
            company_id=company_id,
            quotation_number=self._next_quotation_number(company_id),
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            status="draft",
            quote_date=quote_date or date.today(),
            valid_until=valid_until,
            sales_rep=sales_rep,
            notes=notes,
            created_by=created_by,
        )
        self._db.add(quote)
        self._db.flush()
        self._add_quotation_lines(quote, lines)
        self._db.flush()
        self._recalc_quotation(quote)
        self._record_quotation_history(quote.id, None, "draft", created_by, "Created")
        self._db.flush()
        return quote

    def update_quotation(
        self,
        quotation_id: str,
        *,
        customer_id: str,
        lines: list[SalesLineInput],
        warehouse_id: Optional[str] = None,
        quote_date: Optional[date] = None,
        valid_until: Optional[date] = None,
        sales_rep: Optional[str] = None,
        notes: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> SalesQuotation:
        quote = self._require_quotation(quotation_id)
        if quote.status not in EDITABLE_QUOTATION_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Only draft or sent quotations can be edited",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")
        self._require_customer(customer_id)
        if warehouse_id:
            self._require_warehouse(warehouse_id)

        quote.customer_id = customer_id
        quote.warehouse_id = warehouse_id
        if quote_date:
            quote.quote_date = quote_date
        quote.valid_until = valid_until
        quote.sales_rep = sales_rep
        quote.notes = notes
        quote.updated_by = actor_id

        self._db.query(SalesQuotationLine).filter(
            SalesQuotationLine.sales_quotation_id == quote.id,
        ).delete(synchronize_session=False)
        self._add_quotation_lines(quote, lines)
        self._db.flush()
        self._recalc_quotation(quote)
        self._record_quotation_history(quote.id, quote.status, quote.status, actor_id, "Updated")
        self._db.flush()
        return quote

    def delete_quotation(self, quotation_id: str, *, actor_id: Optional[str] = None) -> SalesQuotation:
        quote = self._require_quotation(quotation_id)
        if quote.status not in {"draft", "rejected"}:
            raise HTTPException(status_code=400, detail="Only draft or rejected quotations can be deleted")
        quote.deleted_at = datetime.utcnow()
        quote.updated_by = actor_id
        self._record_quotation_history(quote.id, quote.status, "deleted", actor_id, "Deleted")
        self._db.flush()
        return quote

    def duplicate_quotation(self, quotation_id: str, *, actor_id: Optional[str] = None) -> SalesQuotation:
        quote = self._require_quotation(quotation_id)
        q_lines = self.get_quotation_lines(quote.id)
        duplicate = self.create_quotation(
            customer_id=quote.customer_id,
            warehouse_id=quote.warehouse_id,
            quote_date=date.today(),
            valid_until=quote.valid_until,
            sales_rep=quote.sales_rep,
            notes=quote.notes,
            company_id=quote.company_id,
            created_by=actor_id,
            lines=[
                SalesLineInput(
                    item_id=line.item_id,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    tax_rate=line.tax_rate,
                    discount_amount=line.discount_amount,
                    notes=line.notes,
                )
                for line in q_lines
            ],
        )
        self._record_quotation_history(duplicate.id, None, "draft", actor_id, f"Duplicated from {quote.quotation_number}")
        return duplicate

    def update_quotation_status(
        self,
        quotation_id: str,
        status: str,
        *,
        actor_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> SalesQuotation:
        if status not in QUOTATION_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid quotation status: {status}")
        quote = self._require_quotation(quotation_id)
        allowed = QUOTATION_TRANSITIONS.get(quote.status, frozenset())
        if status != quote.status and status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition quotation from {quote.status} to {status}",
            )
        prev = quote.status
        quote.status = status
        now = datetime.utcnow()
        if status == "sent":
            quote.sent_at = now
        elif status == "approved":
            quote.approved_at = now
        elif status == "rejected":
            quote.rejected_at = now
        self._record_quotation_history(quote.id, prev, status, actor_id, notes)
        self._db.flush()
        return quote

    def convert_quotation_to_order(
        self,
        quotation_id: str,
        *,
        warehouse_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> SalesOrder:
        quote = self._require_quotation(quotation_id)
        if quote.status != "approved":
            raise HTTPException(status_code=400, detail="Only approved quotations can convert to sales orders")
        if quote.sales_order_id:
            raise HTTPException(status_code=409, detail="Quotation already converted")

        wh_id = warehouse_id or quote.warehouse_id
        if not wh_id:
            wh = (
                self._db.query(InventoryWarehouse)
                .filter(InventoryWarehouse.is_active.is_(True))
                .order_by(InventoryWarehouse.sort_order)
                .first()
            )
            if not wh:
                raise HTTPException(status_code=400, detail="No warehouse available")
            wh_id = wh.id

        q_lines = self.get_quotation_lines(quote.id)
        order = self.create_order(
            customer_id=quote.customer_id,
            warehouse_id=wh_id,
            lines=[
                SalesLineInput(
                    item_id=line.item_id,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    tax_rate=line.tax_rate,
                    discount_amount=line.discount_amount,
                    notes=line.notes,
                )
                for line in q_lines
            ],
            company_id=quote.company_id,
            sales_quotation_id=quote.id,
            order_date=date.today(),
            sales_rep=quote.sales_rep,
            notes=quote.notes,
            created_by=actor_id,
        )
        quote.sales_order_id = order.id
        self._db.flush()
        return order

    # ── Sales orders ─────────────────────────────────────────────────────────

    def list_orders(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        delivery_status: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        limit: int = 100,
        offset: int = 0,
        warehouse_ids: Optional[list[str]] = None,
    ) -> tuple[list[SalesOrder], int]:
        query = self._db.query(SalesOrder).filter(
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
        )
        if warehouse_ids is not None:  # a member limited to some warehouses sees only their orders
            query = query.filter(SalesOrder.warehouse_id.in_(warehouse_ids))
        if status:
            query = query.filter(SalesOrder.status == status)
        if customer_id:
            query = query.filter(SalesOrder.customer_id == customer_id)
        if delivery_status:
            query = query.filter(SalesOrder.delivery_status == delivery_status)
        if search:
            term = f"%{search.strip()}%"
            customer_ids = [
                row[0]
                for row in self._db.query(CommerceCustomer.id)
                .filter(
                    or_(
                        CommerceCustomer.name.ilike(term),
                        CommerceCustomer.phone.ilike(term),
                        CommerceCustomer.email.ilike(term),
                    ),
                )
                .all()
            ]
            filters = [
                SalesOrder.order_number.ilike(term),
                SalesOrder.invoice_number.ilike(term),
            ]
            if customer_ids:
                filters.append(SalesOrder.customer_id.in_(customer_ids))
            query = query.filter(or_(*filters))
        total = query.count()
        sort_col = ORDER_SORT_COLUMNS.get(sort_by, SalesOrder.created_at)
        if sort_col is CommerceCustomer.name:
            query = query.outerjoin(CommerceCustomer, CommerceCustomer.id == SalesOrder.customer_id)
        # Tie-breakers keep pages stable when the sort key repeats (status, date).
        rows = (
            query.order_by(
                _sort_expr(sort_col, sort_dir),
                SalesOrder.created_at.desc(),
                SalesOrder.id,
            )
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_order(self, order_id: str) -> Optional[SalesOrder]:
        row = self._db.get(SalesOrder, order_id)
        if row is None:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_order_lines(self, order_id: str) -> list[SalesOrderLine]:
        return (
            self._db.query(SalesOrderLine)
            .filter(SalesOrderLine.sales_order_id == order_id)
            .order_by(SalesOrderLine.sort_order, SalesOrderLine.line_number)
            .all()
        )

    def get_order_history(self, order_id: str) -> list[SalesOrderStatusHistory]:
        return (
            self._db.query(SalesOrderStatusHistory)
            .filter(SalesOrderStatusHistory.sales_order_id == order_id)
            .order_by(SalesOrderStatusHistory.created_at.desc())
            .all()
        )

    def create_order(
        self,
        *,
        customer_id: str,
        warehouse_id: str,
        lines: list[SalesLineInput],
        company_id: str = "default",
        sales_quotation_id: Optional[str] = None,
        order_date: Optional[date] = None,
        expected_date: Optional[date] = None,
        sales_rep: Optional[str] = None,
        notes: Optional[str] = None,
        payment_terms: Optional[str] = None,
        sale_stage: Optional[str] = None,
        invoice_scheme: Optional[str] = None,
        shipping_status: Optional[str] = None,
        delivered_to: Optional[str] = None,
        delivery_person_id: Optional[str] = None,
        created_by: Optional[str] = None,
        order_discount: Decimal = Decimal("0"),
        order_discount_type: str = "fixed",
        shipping_charge: Decimal = Decimal("0"),
        additional_expenses_json: str = "[]",
    ) -> SalesOrder:
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")
        self._require_customer(customer_id)
        self._require_warehouse(warehouse_id)

        order = SalesOrder(
            company_id=company_id,
            order_number=self._next_order_number(company_id),
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            sales_quotation_id=sales_quotation_id,
            status="draft",
            delivery_status="pending",
            order_date=order_date or date.today(),
            expected_date=expected_date,
            sales_rep=sales_rep,
            notes=notes,
            payment_terms=payment_terms,
            sale_stage=sale_stage or "final",
            invoice_scheme=invoice_scheme or "standard",
            shipping_status=shipping_status,
            delivered_to=delivered_to,
            delivery_person_id=delivery_person_id,
            created_by=created_by,
            order_discount=order_discount,
            order_discount_type=order_discount_type or "fixed",
            shipping_charge=shipping_charge,
            additional_expenses_json=additional_expenses_json or "[]",
        )
        self._db.add(order)
        self._db.flush()
        self._add_order_lines(order, lines, customer_id)
        self._db.flush()
        self._recalc_order(order)
        self._record_order_history(order.id, None, "draft", created_by, "Created")
        self._record_activity(order.id, "created", "Sales order created", created_by)
        self._record_audit_log(
            order.id,
            action="created",
            actor_id=created_by,
            old_value=None,
            new_value=self._order_snapshot(order),
        )
        self._refresh_customer_sales_stats(customer_id)
        return order

    def sync_from_storefront_order(
        self,
        commerce_order,
        items: list,
        *,
        warehouse_id: str,
    ) -> Optional[SalesOrder]:
        """Mirror a storefront commerce order into sales_orders for the admin Sales module."""
        from app.models.commerce_order import CommerceOrder
        from app.models.commerce_order_item import CommerceOrderItem

        if not isinstance(commerce_order, CommerceOrder):
            return None
        if not commerce_order.customer_id or not items:
            return None

        marker = f"commerce_order_id={commerce_order.id}"
        existing = (
            self._db.query(SalesOrder)
            .filter(
                SalesOrder.company_id == commerce_order.company_id,
                SalesOrder.deleted_at.is_(None),
                SalesOrder.notes.contains(marker),
            )
            .first()
        )
        if existing:
            self._ensure_storefront_payment_meta(existing, commerce_order)
            return existing

        number_taken = (
            self._db.query(SalesOrder)
            .filter(
                SalesOrder.company_id == commerce_order.company_id,
                SalesOrder.order_number == commerce_order.order_number[:32],
                SalesOrder.deleted_at.is_(None),
            )
            .first()
        )
        if number_taken:
            self._ensure_storefront_payment_meta(number_taken, commerce_order)
            return number_taken

        sales_lines: list[SalesLineInput] = []
        for row in items:
            if not isinstance(row, CommerceOrderItem):
                continue
            item_id = row.item_id or row.product_id
            if not item_id or not self._db.get(Item, item_id):
                continue
            variant_note = None
            if row.variant_label and str(row.variant_label).strip():
                variant_note = f"variant: {str(row.variant_label).strip()}"
            sales_lines.append(
                SalesLineInput(
                    item_id=item_id,
                    quantity=row.quantity,
                    unit_price=row.unit_price,
                    tax_rate=Decimal("0"),
                    discount_amount=row.discount_amount or Decimal("0"),
                    notes=variant_note,
                ),
            )
        if not sales_lines:
            return None

        self._require_customer(commerce_order.customer_id)
        self._require_warehouse(warehouse_id)

        order_date = commerce_order.order_date.date() if commerce_order.order_date else date.today()
        notes_parts = [p for p in [commerce_order.notes, f"Storefront checkout · {marker}"] if p]
        base_notes = "\n".join(notes_parts)
        sales_order = SalesOrder(
            company_id=commerce_order.company_id,
            order_number=commerce_order.order_number[:32],
            customer_id=commerce_order.customer_id,
            warehouse_id=warehouse_id,
            status="confirmed",
            delivery_status="pending",
            order_date=order_date,
            notes=self._pack_storefront_payment_notes(base_notes, commerce_order),
            confirmed_at=datetime.utcnow(),
        )
        self._db.add(sales_order)
        self._db.flush()
        # the storefront already charged these prices: take them as they are
        self._add_order_lines(sales_order, sales_lines, commerce_order.customer_id, check_prices=False)
        self._db.flush()
        self._recalc_order(sales_order)
        self._apply_commerce_totals(sales_order, commerce_order)
        self._record_order_history(
            sales_order.id,
            None,
            "confirmed",
            None,
            "Imported from storefront checkout",
        )
        self._record_activity(
            sales_order.id,
            "created",
            f"Storefront order {commerce_order.order_number}",
            None,
        )
        self._record_audit_log(
            sales_order.id,
            action="created",
            actor_id=None,
            old_value=None,
            new_value=self._order_snapshot(sales_order),
        )
        return sales_order

    @staticmethod
    def _sales_payment_method_label(raw: Optional[str]) -> str:
        key = (raw or "").strip().lower().replace("_", " ").replace("-", " ")
        key = " ".join(key.split())
        aliases = {
            "cod": "COD",
            "cash on delivery": "COD",
            "cashondelivery": "COD",
            "bkash": "bKash",
            "b kash": "bKash",
            "nagad": "Nagad",
            "card": "Card",
            "card / sslcommerz": "Card",
            "sslcommerz": "Card",
            "stripe": "Card",
            "paypal": "Card",
            "bank": "Manual Payment (Bank)",
            "bank transfer": "Manual Payment (Bank)",
            "manual payment (bank)": "Manual Payment (Bank)",
            "manual": "Manual Payment (Bank)",
            "cash": "Cash",
        }
        return aliases.get(key) or (raw.strip() if raw and raw.strip() else "COD")

    def _pack_storefront_payment_notes(self, base_notes: str, commerce_order) -> str:
        method = self._sales_payment_method_label(getattr(commerce_order, "payment_method", None))
        paid = float(getattr(commerce_order, "paid_amount", 0) or 0)
        total = float(getattr(commerce_order, "grand_total", 0) or 0)
        due = float(getattr(commerce_order, "due_amount", None) or max(0.0, total - paid))
        shipping = float(
            getattr(commerce_order, "shipping_amount", None)
            or getattr(commerce_order, "shipping_cost", 0)
            or 0
        )
        discount = float(getattr(commerce_order, "discount_amount", 0) or 0)
        tax = float(getattr(commerce_order, "tax_amount", 0) or 0)
        subtotal = float(getattr(commerce_order, "subtotal", 0) or 0)
        coupon_code = None
        notes_raw = getattr(commerce_order, "notes", None) or ""
        for line in str(notes_raw).replace("\r", "\n").split("\n"):
            for part in line.split("·"):
                chunk = part.strip()
                if chunk.lower().startswith("coupon:"):
                    coupon_code = chunk.split(":", 1)[1].strip() or None
                    break
            if coupon_code:
                break
        if paid <= 0:
            status = "unpaid"
        elif due > 0:
            status = "partial"
        else:
            status = "paid"
        meta = {
            "paid": paid,
            "due": due,
            "status": status,
            "method": method,
            "shipping": shipping,
            "discount": discount,
            "tax": tax,
            "subtotal": subtotal,
            "grand_total": total,
            "coupon_code": coupon_code,
            "history": [],
        }
        block = f"<!--againerp:payment-->{json.dumps(meta, ensure_ascii=False)}<!--/againerp:payment-->"
        clean = base_notes or ""
        clean = re.sub(
            r"<!--againerp:payment-->[\s\S]*?<!--/againerp:payment-->",
            "",
            clean,
        ).strip()
        return f"{clean}\n\n{block}".strip() if clean else block

    def _apply_commerce_totals(self, sales_order: SalesOrder, commerce_order) -> None:
        """Keep sales sticky totals aligned with storefront commerce totals."""
        from decimal import Decimal

        line_subtotal = sum(
            (l.unit_price * l.quantity_ordered) - (l.discount_amount or 0)
            for l in self.get_order_lines(sales_order.id)
        )
        sales_order.subtotal = Decimal(str(getattr(commerce_order, "subtotal", None) or line_subtotal))
        sales_order.discount_total = Decimal(str(getattr(commerce_order, "discount_amount", 0) or 0))
        sales_order.tax_total = Decimal(str(getattr(commerce_order, "tax_amount", 0) or 0))
        sales_order.total = Decimal(
            str(
                getattr(commerce_order, "grand_total", None)
                or (sales_order.subtotal - sales_order.discount_total + sales_order.tax_total)
            )
        )
        self._db.flush()

    def _ensure_storefront_payment_meta(self, sales_order: SalesOrder, commerce_order) -> None:
        notes = sales_order.notes or ""
        sales_order.notes = self._pack_storefront_payment_notes(notes, commerce_order)
        self._apply_commerce_totals(sales_order, commerce_order)

    def update_order(
        self,
        order_id: str,
        *,
        customer_id: str,
        warehouse_id: str,
        lines: list[SalesLineInput],
        order_date: Optional[date] = None,
        expected_date: Optional[date] = None,
        sales_rep: Optional[str] = None,
        notes: Optional[str] = None,
        payment_terms: Optional[str] = None,
        sale_stage: Optional[str] = None,
        invoice_scheme: Optional[str] = None,
        shipping_status: Optional[str] = None,
        delivered_to: Optional[str] = None,
        delivery_person_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        allow_locked: bool = False,
        order_discount: Optional[Decimal] = None,
        order_discount_type: Optional[str] = None,
        shipping_charge: Optional[Decimal] = None,
        additional_expenses_json: Optional[str] = None,
    ) -> SalesOrder:
        order = self._require_order(order_id)
        # Callers that ran authorize_edit() (admin, or an approved edit
        # request) may change orders past the normally editable statuses.
        if not allow_locked and order.status not in EDITABLE_SALES_ORDER_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Only draft, confirmed, or processing orders can be edited",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")
        self._require_customer(customer_id)
        resolved_wh = warehouse_id or order.warehouse_id
        self._require_warehouse(resolved_wh)

        old_snapshot = self._order_snapshot(order)
        old_scalars = self._order_scalar_snapshot(order)
        old_lines = self.get_order_lines(order.id)
        # Value snapshot: the upsert below mutates these rows in place.
        old_serials_by_item: dict[str, list[str]] = {}
        for prev in old_lines:
            old_serials_by_item.setdefault(prev.item_id, []).extend(prev.serial_numbers)
        order.customer_id = customer_id
        order.warehouse_id = resolved_wh
        if order_date:
            order.order_date = order_date
        order.expected_date = expected_date
        order.sales_rep = sales_rep
        order.notes = notes
        order.payment_terms = payment_terms
        order.sale_stage = sale_stage or "final"
        order.invoice_scheme = invoice_scheme or "standard"
        order.shipping_status = shipping_status
        order.delivered_to = delivered_to
        order.delivery_person_id = delivery_person_id
        order.updated_by = actor_id
        if order_discount is not None:
            order.order_discount = order_discount
        if order_discount_type is not None:
            order.order_discount_type = order_discount_type or "fixed"
        if shipping_charge is not None:
            order.shipping_charge = shipping_charge
        if additional_expenses_json is not None:
            order.additional_expenses_json = additional_expenses_json or "[]"

        self._db.query(SalesOrderTax).filter(SalesOrderTax.sales_order_id == order.id).delete(
            synchronize_session=False,
        )
        self._replace_order_lines(order, lines, customer_id)
        self._db.flush()
        self._recalc_order(order)
        self._sync_order_taxes(order)
        # An invoiced order's receivable must follow the edited total (otherwise
        # the ledger keeps the total from confirm time and caps later payments).
        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).resync_sales_receivable(order.id)
        self._record_order_history(order.id, order.status, order.status, actor_id, "Updated")
        new_lines = self.get_order_lines(order.id)
        change_lines = self._summarize_order_changes(old_scalars, order, old_lines, new_lines)
        change_lines += self._sync_line_serials(order, new_lines, old_serials_by_item)
        if change_lines:
            title = change_lines[0] if len(change_lines) == 1 else f"Updated {len(change_lines)} field(s)"
            description = "; ".join(change_lines) if len(change_lines) > 1 else None
            self._record_activity(order.id, "updated", title, actor_id, description)
        else:
            self._record_activity(order.id, "updated", "Sales order saved (no field changes)", actor_id)
        self.sync_order_payments(order, actor_id=actor_id)
        self._record_audit_log(
            order.id,
            action="updated",
            actor_id=actor_id,
            old_value=old_snapshot,
            new_value=self._order_snapshot(order),
        )
        self._db.flush()
        self._refresh_customer_sales_stats(customer_id)
        return order

    def delete_order(self, order_id: str, *, actor_id: Optional[str] = None) -> SalesOrder:
        order = self._require_order(order_id)
        if order.status not in {"draft", "cancelled"}:
            raise HTTPException(status_code=400, detail="Only draft or cancelled orders can be deleted")
        customer_id = order.customer_id
        order.deleted_at = datetime.utcnow()
        order.updated_by = actor_id
        self._record_order_history(order.id, order.status, "deleted", actor_id, "Deleted")
        self._record_activity(order.id, "deleted", "Sales order deleted", actor_id)
        self._record_audit_log(
            order.id,
            action="deleted",
            actor_id=actor_id,
            old_value=self._order_snapshot(order),
            new_value={"deleted_at": order.deleted_at.isoformat()},
        )
        self._db.flush()
        self._refresh_customer_sales_stats(customer_id)
        return order

    def duplicate_order(self, order_id: str, *, actor_id: Optional[str] = None) -> SalesOrder:
        order = self._require_order(order_id)
        o_lines = self.get_order_lines(order.id)
        duplicate = self.create_order(
            customer_id=order.customer_id,
            warehouse_id=order.warehouse_id,
            order_date=date.today(),
            expected_date=order.expected_date,
            sales_rep=order.sales_rep,
            notes=order.notes,
            company_id=order.company_id,
            created_by=actor_id,
            lines=[
                SalesLineInput(
                    item_id=line.item_id,
                    quantity=line.quantity_ordered,
                    unit_price=line.unit_price,
                    tax_rate=line.tax_rate,
                    discount_amount=line.discount_amount,
                    notes=line.notes,
                )
                for line in o_lines
            ],
        )
        self._record_activity(
            duplicate.id,
            "created",
            f"Duplicated from {order.order_number}",
            actor_id,
        )
        return duplicate

    def bulk_delete_orders(self, order_ids: list[str], *, actor_id: Optional[str] = None) -> int:
        deleted = 0
        for order_id in order_ids:
            try:
                self.delete_order(order_id, actor_id=actor_id)
                deleted += 1
            except HTTPException:
                continue
        return deleted

    def bulk_update_order_status(
        self,
        order_ids: list[str],
        status: str,
        *,
        actor_id: Optional[str] = None,
    ) -> int:
        if status not in SALES_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        updated = 0
        for order_id in order_ids:
            order = self.get_order(order_id)
            if not order or order.deleted_at is not None:
                continue
            allowed = SALES_ORDER_TRANSITIONS.get(order.status, frozenset())
            if status == order.status or status not in allowed:
                continue
            if status == "confirmed":
                self.confirm_order(order_id, actor_id=actor_id)
            elif status == "cancelled":
                self.cancel_order(order_id, actor_id=actor_id)
            else:
                prev = order.status
                order.status = status
                self._record_order_history(order_id, prev, status, actor_id, "Bulk status update")
                self._record_activity(order_id, "updated", f"Status changed to {status}", actor_id)
            updated += 1
        self._db.flush()
        return updated

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

    def resolve_default_warehouse(self, company_id: str = "default") -> str:
        wh = (
            self._db.query(InventoryWarehouse)
            .filter(InventoryWarehouse.is_active.is_(True))
            .order_by(InventoryWarehouse.sort_order)
            .first()
        )
        if not wh:
            raise HTTPException(status_code=400, detail="No warehouse available")
        return wh.id

    # ── Edit approval ────────────────────────────────────────────────────────
    # Once an order leaves "draft", non-admins need an admin-approved edit
    # request to change it; each approval is consumed by a single save.

    def active_edit_request(self, order_id: str) -> Optional[SalesOrderEditRequest]:
        return (
            self._db.query(SalesOrderEditRequest)
            .filter(
                SalesOrderEditRequest.sales_order_id == order_id,
                SalesOrderEditRequest.status.in_(tuple(EDIT_REQUEST_ACTIVE_STATUSES)),
            )
            .order_by(SalesOrderEditRequest.requested_at.desc())
            .first()
        )

    def request_edit(
        self,
        order_id: str,
        *,
        actor_id: str,
        actor_name: Optional[str],
        reason: Optional[str] = None,
    ) -> SalesOrderEditRequest:
        order = self._require_order(order_id)
        if order.status == "draft":
            raise HTTPException(status_code=400, detail="Draft orders can be edited without approval")
        active = self.active_edit_request(order_id)
        if active is not None and (active.status == "pending" or active.requested_by == actor_id):
            return active
        request = SalesOrderEditRequest(
            company_id=self._company_id or order.company_id or "default",
            sales_order_id=order_id,
            status="pending",
            reason=(reason or "").strip() or None,
            requested_by=actor_id,
            requested_by_name=actor_name,
        )
        self._db.add(request)
        self._record_activity(
            order_id,
            "edit_requested",
            f"Edit requested by {actor_name or 'staff'}",
            actor_id,
            description=request.reason,
        )
        self._db.flush()
        return request

    def review_edit_request(
        self,
        order_id: str,
        request_id: str,
        *,
        approve: bool,
        actor_id: str,
        actor_name: Optional[str],
        note: Optional[str] = None,
    ) -> SalesOrderEditRequest:
        self._require_order(order_id)
        request = self._db.get(SalesOrderEditRequest, request_id)
        if request is None or request.sales_order_id != order_id:
            raise HTTPException(status_code=404, detail="Edit request not found")
        if request.status != "pending":
            raise HTTPException(status_code=409, detail="Edit request has already been reviewed")
        request.status = "approved" if approve else "rejected"
        request.reviewed_by = actor_id
        request.reviewed_by_name = actor_name
        request.reviewed_at = datetime.utcnow()
        request.review_note = (note or "").strip() or None
        verb = "approved" if approve else "rejected"
        self._record_activity(
            order_id,
            f"edit_{verb}",
            f"Edit request {verb} by {actor_name or 'admin'}",
            actor_id,
            description=request.review_note,
        )
        self._db.flush()
        return request

    def authorize_edit(
        self,
        order: SalesOrder,
        *,
        user_id: str,
        is_admin: bool,
    ) -> Optional[SalesOrderEditRequest]:
        """Raise unless this user may save changes to the order.

        Returns the approved request being used, which the caller consumes
        after the save goes through.
        """
        if order.status == "draft" or is_admin:
            return None
        active = self.active_edit_request(order.id)
        if active is not None and active.status == "approved" and active.requested_by == user_id:
            return active
        if active is not None and active.status == "pending":
            raise HTTPException(status_code=403, detail="Edit request is pending admin approval")
        raise HTTPException(
            status_code=403,
            detail="This order is locked — request an edit approval from an admin",
        )

    def consume_edit_request(self, request: SalesOrderEditRequest, *, actor_id: str) -> None:
        request.status = "consumed"
        request.consumed_at = datetime.utcnow()
        self._record_activity(
            request.sales_order_id,
            "edit_request_used",
            "Approved edit request used",
            actor_id,
        )

    def confirm_order(
        self,
        order_id: str,
        *,
        actor_id: Optional[str] = None,
        deliver: bool = True,
        paid_at_counter: bool = False,
    ) -> SalesOrder:
        """Confirm a draft. With `deliver` (the counter-sale default) the goods
        leave stock right here — a shop hands them over with the invoice, there
        is no separate warehouse step. POS passes False and posts its own delivery."""
        order = self._require_order(order_id)
        if order.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft orders can be confirmed")
        # credit control: a locked customer, a cash-only customer with something due, or one over the credit limit is refused
        from app.services.customer.credit_control import check_order_confirm

        check_order_confirm(self._db, order, paid_at_counter=paid_at_counter)
        lines = self.get_order_lines(order.id)
        self._require_trackable_lines(order, lines)
        backordered: list[str] = []
        for line in lines:
            remaining = line.quantity_ordered - line.quantity_delivered
            if remaining <= 0:
                continue
            if not self._reserve_stock(order, line, remaining, actor_id=actor_id):
                backordered.append(line.sku)
        order.status = "confirmed"
        order.confirmed_at = datetime.utcnow()
        delivered = self._deliver_on_confirm(order, lines, actor_id=actor_id) if deliver else False
        self._mark_serials_sold(order, lines)
        history_note = (
            f"Order confirmed — backorder: {', '.join(backordered)}"
            if backordered
            else ("Order confirmed — stock deducted" if delivered else "Order confirmed — stock reserved")
        )
        self._record_order_history(order.id, "draft", "confirmed", actor_id, history_note)
        confirm_msg = (
            f"Sales order confirmed (backorder: {', '.join(backordered)})"
            if backordered
            else "Sales order confirmed"
        )
        self._record_activity(order.id, "confirmed", confirm_msg, actor_id)
        self._record_audit_log(
            order.id,
            action="confirmed",
            actor_id=actor_id,
            old_value={"status": "draft"},
            new_value={"status": "confirmed"},
        )
        self._db.flush()
        self._refresh_customer_sales_stats(order.customer_id)
        # A confirmed sale is a receivable: issue the invoice now (posts the
        # AR entry) and settle it with whatever the Payment tab already holds.
        try:
            order = self.issue_invoice(order.id, actor_id=actor_id)
            self.sync_order_payments(order, actor_id=actor_id)
        except HTTPException as exc:
            self._record_activity(
                order.id,
                "finance_warning",
                f"Ledger posting skipped: {exc.detail}",
                actor_id,
            )
        return order

    # ── Ledger sync ──────────────────────────────────────────────────────────

    @staticmethod
    def _load_payment_meta(notes: Optional[str]) -> Optional[dict]:
        """The drawer keeps paid/due/history in a <!--againerp:payment--> JSON block."""
        match = re.search(r"<!--againerp:payment-->([\s\S]*?)<!--/againerp:payment-->", notes or "")
        if not match:
            return None
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _write_payment_meta(notes: Optional[str], meta: dict) -> str:
        block = f"<!--againerp:payment-->{json.dumps(meta, ensure_ascii=False)}<!--/againerp:payment-->"
        clean = re.sub(r"<!--againerp:payment-->[\s\S]*?<!--/againerp:payment-->", "", notes or "").strip()
        return f"{clean}\n\n{block}" if clean else block

    def record_ledger_payment(
        self,
        order_id: str,
        *,
        amount: Decimal,
        payment,
        account_name: Optional[str] = None,
        label: str = "Due payment",
    ) -> bool:
        """A customer-ledger receipt settled part of this order's invoice. Mirror it
        into the order's Payment history so the drawer and the list show it — with a
        `ledger_` id so `sync_order_payments` never posts it to Finance a second time."""
        order = self._db.get(SalesOrder, order_id)
        if order is None or amount <= 0:
            return False
        meta = self._load_payment_meta(order.notes) or {}
        history = [h for h in (meta.get("history") or []) if isinstance(h, dict)]
        entry_id = f"ledger_{payment.id}_{order.id}"
        if any(h.get("id") == entry_id for h in history):
            return False
        history.append(
            {
                "id": entry_id,
                "label": f"{label} · {payment.payment_number}",
                "amount": float(amount),
                "status": "completed",
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "method": str(payment.payment_method or "cash"),
                "account": account_name,
                "accountId": payment.payment_account_id,
                "kind": "payment",
            }
        )
        paid = Decimal(str(meta.get("paid") or 0)) + amount
        grand_total = Decimal(str(meta.get("grand_total") or order.total or 0))
        due = max(grand_total - paid, Decimal("0"))
        meta.update(
            {
                "paid": float(paid),
                "due": float(due),
                "status": "paid" if due <= 0 else "partial",
                "history": history,
            }
        )
        meta.setdefault("method", str(payment.payment_method or "cash").title())
        order.notes = self._write_payment_meta(order.notes, meta)
        self._record_activity(
            order.id,
            "payment_posted",
            f"{payment.payment_number} received against {order.invoice_number or order.order_number} — {amount}",
            None,
        )
        self._db.flush()
        return True

    def sync_order_payments(self, order: SalesOrder, *, actor_id: Optional[str] = None) -> int:
        """Post completed Payment-tab payments to Finance as settlements of the
        order's receivable. Idempotent: each history entry is keyed by
        FinancePayment(source_type="sales_order_payment", source_id="<order>:<entry>").
        No-op until the order has a receivable (issued at confirm)."""
        meta = self._load_payment_meta(order.notes)
        history = (meta or {}).get("history") or []
        if not history:
            return 0
        from app.models.finance import FinancePayment, FinanceReceivable
        from app.services.finance.finance_service import FinanceService

        receivable = (
            self._db.query(FinanceReceivable)
            .filter(
                FinanceReceivable.company_id == order.company_id,
                FinanceReceivable.source_type == "sales_order",
                FinanceReceivable.source_id == order.id,
            )
            .first()
        )
        if receivable is None:
            return 0
        finance = FinanceService(self._db)
        posted = 0
        for evt in history:
            if not isinstance(evt, dict):
                continue
            kind = evt.get("kind") or "payment"
            if kind not in ("payment", "refund"):
                continue
            if (evt.get("status") or "completed") != "completed":
                continue
            entry_id = str(evt.get("id") or "").strip()
            if not entry_id:
                continue
            # Mirrored from a customer-ledger receipt: already in Finance.
            if entry_id.startswith("ledger_"):
                continue
            try:
                amount = Decimal(str(evt.get("amount") or 0)).quantize(Decimal("0.01"))
            except Exception:
                continue
            if amount <= 0:
                continue
            # What this entry has already put into Finance (an entry can land
            # in parts when the receivable was smaller at the time).
            prior = (
                self._db.query(FinancePayment)
                .filter(
                    FinancePayment.company_id == order.company_id,
                    FinancePayment.source_type == "sales_order_payment",
                    FinancePayment.reference == order.order_number,
                    FinancePayment.notes.like(f"% · {entry_id}%"),
                )
                .all()
            )
            already = sum((Decimal(str(p.amount or 0)) for p in prior), Decimal("0"))
            remaining = amount - already
            if remaining <= 0:
                continue
            paid_on: Optional[date] = None
            raw_at = str(evt.get("at") or "")[:10]
            try:
                paid_on = date.fromisoformat(raw_at) if raw_at else None
            except ValueError:
                paid_on = None
            label = str(evt.get("label") or evt.get("method") or "Sales payment")
            seq = len(prior) + 1
            # source_id is varchar(36): derive stable UUIDs from order + entry + part.
            key = str(
                uuid.uuid5(uuid.NAMESPACE_URL, f"againerp:sales-payment:{order.id}:{entry_id}:{seq}")
            )
            refund = kind == "refund"
            customer_id = order.customer_id
            invoice_no = receivable.invoice_number
            pay_date = paid_on or date.today()
            try:
                account = finance._resolve_payment_account(
                    order.company_id,
                    evt.get("accountId") or None,
                    method_hint=str(evt.get("method") or "") or None,
                )
                gl_code = finance._payment_account_gl_code(account)
                if refund:
                    # Money paid back to the customer (after a return / overpayment):
                    # AR goes back up, cash goes out.
                    lines = [
                        ("1100", remaining, Decimal("0"), f"Refund against {invoice_no}", "customer", customer_id, Decimal("0")),
                        (gl_code, Decimal("0"), remaining, f"Refund for {invoice_no}", "customer", customer_id, Decimal("0")),
                    ]
                    description = f"Refund paid — {invoice_no}"
                else:
                    lines = [
                        (gl_code, remaining, Decimal("0"), f"Payment for {invoice_no}", "customer", customer_id, Decimal("0")),
                        ("1100", Decimal("0"), remaining, "AR settlement", "customer", customer_id, Decimal("0")),
                    ]
                    description = f"Payment received — {invoice_no}"
                entry = finance._post_journal(
                    company_id=order.company_id,
                    entry_date=pay_date,
                    description=description,
                    source_type="sales_order_refund" if refund else "sales_order_payment",
                    source_id=key,
                    lines=lines,
                )
            except HTTPException as exc:
                self._record_activity(
                    order.id,
                    "finance_warning",
                    f"{'Refund' if refund else 'Payment'} {entry_id} not posted to ledger: {exc.detail}",
                    actor_id,
                )
                continue
            # One voucher per Payment-tab entry, for the full amount — the way the
            # customer paid it. The invoice takes what it can; any surplus stays as
            # customer advance and settles the next open invoice by FIFO.
            self._db.add(
                FinancePayment(
                    company_id=order.company_id,
                    payment_number=finance._next_payment_number(order.company_id),
                    payment_date=pay_date,
                    amount=remaining,
                    payment_method=account.kind,
                    payment_account_id=account.id,
                    direction="outbound" if refund else "inbound",
                    source_type="sales_order_payment",
                    source_id=key,
                    party_type="customer",
                    party_id=customer_id,
                    journal_entry_id=entry.id,
                    reference=order.order_number,
                    notes=f"{label} · {entry_id}" + (" (refund)" if refund else ""),
                )
            )
            self._db.flush()
            if refund:
                if customer_id:
                    from app.services.customer.customer_ledger_service import consume_credit_for_refund

                    consume_credit_for_refund(self._db, customer_id, remaining)
            elif receivable.status in ("open", "partial") and receivable.balance > 0:
                finance._apply_payment_to_receivable(
                    receivable, min(remaining, Decimal(str(receivable.balance)))
                )
            posted += 1
        if posted:
            self._db.flush()
            if order.customer_id:
                from app.services.customer.customer_ledger_service import apply_unapplied_payments

                apply_unapplied_payments(self._db, order.customer_id)
            self._record_activity(
                order.id,
                "payment_posted",
                f"{posted} payment(s) posted to the ledger against {receivable.invoice_number}",
                actor_id,
            )
        return posted

    def cancel_order(
        self,
        order_id: str,
        *,
        actor_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> SalesOrder:
        order = self._require_order(order_id)
        if order.status == "cancelled":
            return order
        if order.status == "completed":
            raise HTTPException(status_code=400, detail="Completed orders cannot be cancelled")
        prev = order.status
        reason = (reason or "").strip() or None
        restocked: list[str] = []
        for line in self.get_order_lines(order.id):
            self._release_reservation(order, line)
            if self._restock_on_cancel(order, line, actor_id=actor_id):
                restocked.append(line.sku)
        self._release_serials(order, self.get_order_lines(order.id), reason="cancelled")
        if restocked:
            self._refresh_delivery_status(order)
            self._record_activity(
                order.id, "stock_restocked", f"Goods back in stock — {', '.join(restocked)}", actor_id
            )
        order.status = "cancelled"
        order.cancelled_at = datetime.utcnow()
        self._record_order_history(order.id, prev, "cancelled", actor_id, reason)
        self._record_activity(
            order.id,
            "cancelled",
            f"Sales order cancelled — {reason}" if reason else "Sales order cancelled",
            actor_id,
        )
        self._record_audit_log(
            order.id,
            action="cancelled",
            actor_id=actor_id,
            old_value={"status": prev},
            new_value={"status": "cancelled"},
        )
        self._db.flush()
        if order.invoice_number:
            self._void_invoice_receivable(order, actor_id=actor_id)
        self._refresh_customer_sales_stats(order.customer_id)
        return order

    def _void_invoice_receivable(self, order: SalesOrder, *, actor_id: Optional[str]) -> None:
        """A cancelled order must stop billing the customer: void its receivable
        and reverse the AR posting. Money already received stays as advance."""
        from app.services.finance.finance_service import FinanceService

        try:
            receivable = FinanceService(self._db).void_sales_receivable(order.id)
        except HTTPException as exc:
            self._record_activity(
                order.id,
                "finance_warning",
                f"Invoice {order.invoice_number} not voided: {exc.detail}",
                actor_id,
            )
            return
        if receivable is None:
            return
        self._record_activity(
            order.id,
            "invoice_voided",
            f"Invoice {receivable.invoice_number} voided",
            actor_id,
        )

    def issue_invoice(self, order_id: str, *, actor_id: Optional[str] = None) -> SalesOrder:
        order = self._require_order(order_id)
        if order.invoice_number:
            return order
        from app.services.company_invoice import allocate_invoice_number

        number = allocate_invoice_number(self._db, order.company_id)
        order = self.link_invoice(
            order.id,
            invoice_id=f"inv_{order.id.replace('-', '')[:12]}",
            invoice_number=number,
            actor_id=actor_id,
        )
        return self.ensure_public_key(order.id)

    def ensure_public_key(self, order_id: str) -> SalesOrder:
        order = self._require_order(order_id)
        if order.public_key:
            return order
        for _ in range(8):
            key = secrets.token_urlsafe(24)
            taken = (
                self._db.query(SalesOrder.id)
                .filter(SalesOrder.public_key == key)
                .first()
            )
            if taken:
                continue
            order.public_key = key
            self._db.flush()
            return order
        raise HTTPException(status_code=500, detail="Could not allocate a public invoice key")

    def ensure_public_invoice(self, order_id: str, *, actor_id: Optional[str] = None) -> SalesOrder:
        order = self.issue_invoice(order_id, actor_id=actor_id)
        return self.ensure_public_key(order.id)

    def link_invoice(
        self,
        order_id: str,
        *,
        invoice_id: str,
        invoice_number: str,
        actor_id: Optional[str] = None,
    ) -> SalesOrder:
        order = self._require_order(order_id)
        order.invoice_id = invoice_id
        order.invoice_number = invoice_number
        order.invoiced_at = datetime.utcnow()
        self._record_order_history(order.id, order.status, order.status, actor_id, f"Linked invoice {invoice_number}")
        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_sales_invoice(order.id),
            source_type="sales_order",
            source_id=order.id,
            company_id=order.company_id,
        )

        return order

    # ── Deliveries ───────────────────────────────────────────────────────────

    def list_deliveries(
        self,
        *,
        company_id: str = "default",
        sales_order_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[SalesDelivery], int]:
        query = self._db.query(SalesDelivery).filter(SalesDelivery.company_id == company_id)
        if sales_order_id:
            query = query.filter(SalesDelivery.sales_order_id == sales_order_id)
        total = query.count()
        rows = query.order_by(SalesDelivery.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def create_delivery(
        self,
        order_id: str,
        lines: list[DeliveryLineInput],
        *,
        delivery_date: Optional[date] = None,
        delivered_by: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> SalesDelivery:
        order = self._require_order(order_id)
        if order.status not in {"confirmed", "processing"}:
            raise HTTPException(status_code=400, detail="Deliveries require confirmed or processing orders")
        if not lines:
            raise HTTPException(status_code=400, detail="At least one delivery line is required")

        so_lines = {row.id: row for row in self.get_order_lines(order.id)}
        delivery = SalesDelivery(
            company_id=order.company_id,
            delivery_number=self._next_delivery_number(order.company_id),
            sales_order_id=order.id,
            customer_id=order.customer_id,
            warehouse_id=order.warehouse_id,
            status="draft",
            delivery_date=delivery_date or date.today(),
            delivered_by=delivered_by,
            notes=notes,
        )
        self._db.add(delivery)
        self._db.flush()

        total_qty = 0
        for line_in in lines:
            if line_in.quantity_delivered <= 0:
                continue
            so_line = so_lines.get(line_in.sales_order_line_id)
            if not so_line:
                raise HTTPException(status_code=404, detail=f"Order line not found: {line_in.sales_order_line_id}")
            remaining = so_line.quantity_ordered - so_line.quantity_delivered
            if line_in.quantity_delivered > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=f"Over-delivery for {so_line.sku}: requested {line_in.quantity_delivered}, remaining {remaining}",
                )
            self._db.add(
                SalesDeliveryLine(
                    sales_delivery_id=delivery.id,
                    sales_order_line_id=so_line.id,
                    item_id=so_line.item_id,
                    quantity_delivered=line_in.quantity_delivered,
                    notes=line_in.notes,
                ),
            )
            total_qty += line_in.quantity_delivered

        if total_qty == 0:
            raise HTTPException(status_code=400, detail="No quantities to deliver")
        self._db.flush()
        return delivery

    def _require_trackable_lines(self, order: SalesOrder, lines: list[SalesOrderLine]) -> None:
        """A serial-tracked product leaves stock only as named serial units that are in the order's warehouse.

        Without this a sale could take 1 from Dhaka HQ's count while the serial it names sits in Chittagong - stock and
        the serial registry then disagree for good."""
        from app.services.inventory import serial_service

        company = order.company_id or "default"
        for line in lines:
            remaining = line.quantity_ordered - line.quantity_delivered
            if remaining <= 0:
                continue
            serial_service.require_serials_for_units(
                self._db,
                item_id=line.item_id,
                sku=line.sku,
                units=remaining,
                serial_count=len(line.serial_numbers or []),
                action="confirming the order",
            )
            for number in line.serial_numbers or []:
                row = serial_service.find_by_number(self._db, number, company_id=company)
                if row is not None and not (row.status == "sold" and row.order_id == order.id):
                    serial_service.require_serial_in_warehouse(self._db, row, order.warehouse_id, action="sell it")

    def _deliver_on_confirm(
        self, order: SalesOrder, lines: list[SalesOrderLine], *, actor_id: Optional[str]
    ) -> bool:
        """Consume the stock for everything not yet delivered; the order itself stays
        "confirmed" (the delivery record is for traceability and the stock ledger)."""
        wanted = [
            DeliveryLineInput(
                sales_order_line_id=line.id,
                quantity_delivered=line.quantity_ordered - line.quantity_delivered,
            )
            for line in lines
            if line.quantity_ordered - line.quantity_delivered > 0
        ]
        if not wanted:
            return False
        try:
            delivery = self.create_delivery(
                order.id,
                wanted,
                delivered_by=actor_id,
                notes=f"Handed over at confirmation of {order.order_number}",
            )
            self.post_delivery(delivery.id, actor_id=actor_id, advance_status=False)
        except HTTPException as exc:
            self._record_activity(order.id, "stock_warning", f"Stock not deducted: {exc.detail}", actor_id)
            return False
        sku_by_line = {line.id: line.sku for line in lines}
        handed = ", ".join(f"{sku_by_line.get(w.sales_order_line_id, '?')} × {w.quantity_delivered}" for w in wanted)
        self._record_activity(order.id, "stock_deducted", f"Stock deducted — {handed}", actor_id)
        return True

    def post_delivery(
        self,
        delivery_id: str,
        *,
        actor_id: Optional[str] = None,
        advance_status: bool = True,
    ) -> SalesDelivery:
        delivery = self._db.get(SalesDelivery, delivery_id)
        if not delivery:
            raise HTTPException(status_code=404, detail="Delivery not found")
        if delivery.status != "draft":
            raise HTTPException(status_code=400, detail="Delivery already posted")

        order = self._require_order(delivery.sales_order_id)
        so_lines = {row.id: row for row in self.get_order_lines(order.id)}

        dlines = (
            self._db.query(SalesDeliveryLine)
            .filter(SalesDeliveryLine.sales_delivery_id == delivery.id)
            .all()
        )
        for dline in dlines:
            so_line = so_lines.get(dline.sales_order_line_id)
            if not so_line:
                continue
            qty = dline.quantity_delivered
            item = self._db.get(Item, so_line.item_id)
            # services, digital, combos and products that keep no stock are handed over without a stock movement
            if not product_master.moves_stock(self._db, item):
                so_line.quantity_delivered += qty
                continue
            from app.services.inventory import serial_service

            # units already handed over + these must all be named serials (the registry has to move with the stock)
            serial_service.require_serials_for_units(
                self._db,
                item_id=so_line.item_id,
                sku=so_line.sku,
                units=so_line.quantity_delivered + qty,
                serial_count=len(so_line.serial_numbers or []),
                action="delivering",
            )
            movement_type = (
                MOVEMENT_POS_SALE if (order.sales_rep or "") == "POS" else MOVEMENT_SALES_DELIVERY
            )
            StockMovementService(self._db).consume_reserved(
                MovementInput(
                    item_id=so_line.item_id,
                    warehouse_id=order.warehouse_id,
                    movement_type=movement_type,
                    quantity=qty,
                    company_id=order.company_id,
                    reference=delivery.delivery_number,
                    notes=f"Sales delivery for {order.order_number}",
                    created_by=actor_id,
                    source_type=RESERVATION_SOURCE_SALES,
                    source_id=order.id,
                ),
                source_type=RESERVATION_SOURCE_SALES,
                source_id=order.id,
                source_line_id=so_line.id,
            )
            so_line.quantity_delivered += qty
            release = min(qty, so_line.quantity_reserved)
            so_line.quantity_reserved = max(so_line.quantity_reserved - release, 0)

        delivery.status = "posted"
        self._refresh_delivery_status(order)
        if advance_status:
            if order.status == "confirmed":
                order.status = "processing"
                self._record_order_history(order.id, "confirmed", "processing", actor_id, "First delivery posted")
            if order.delivery_status == "delivered" and order.status == "processing":
                order.status = "completed"
                order.completed_at = datetime.utcnow()
                self._record_order_history(order.id, "processing", "completed", actor_id, "Fully delivered")

        self._db.flush()
        return delivery

    def complete_instant_sale(
        self,
        *,
        customer_id: str,
        warehouse_id: str,
        lines: list[SalesLineInput],
        company_id: str = "default",
        actor_id: Optional[str] = None,
        sales_rep: Optional[str] = "POS",
        notes: Optional[str] = "POS instant sale",
        invoice_prefix: str = "POS-INV",  # kept for callers; numbering uses company invoice scheme
    ) -> tuple[SalesOrder, SalesDelivery]:
        """Create, confirm, deliver, and invoice in one flow — used by POS."""
        order = self.create_order(
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            lines=lines,
            company_id=company_id,
            sales_rep=sales_rep,
            notes=notes,
            created_by=actor_id,
        )
        # POS posts its own delivery below (and advances the order to completed).
        self.confirm_order(order.id, actor_id=actor_id, deliver=False, paid_at_counter=True)
        so_lines = self.get_order_lines(order.id)
        delivery = self.create_delivery(
            order.id,
            [
                DeliveryLineInput(
                    sales_order_line_id=line.id,
                    quantity_delivered=line.quantity_ordered,
                )
                for line in so_lines
            ],
            delivered_by=sales_rep,
            notes=notes,
        )
        self.post_delivery(delivery.id, actor_id=actor_id)
        self.issue_invoice(order.id, actor_id=actor_id)
        self._db.refresh(order)
        return order, delivery

    # ── Customer pricing ─────────────────────────────────────────────────────

    def list_customer_prices(
        self,
        *,
        company_id: str = "default",
        customer_id: Optional[str] = None,
        item_id: Optional[str] = None,
    ) -> list[CustomerItemPrice]:
        query = self._db.query(CustomerItemPrice).filter(
            CustomerItemPrice.company_id == company_id,
            CustomerItemPrice.is_active.is_(True),
        )
        if customer_id:
            query = query.filter(CustomerItemPrice.customer_id == customer_id)
        if item_id:
            query = query.filter(CustomerItemPrice.item_id == item_id)
        return query.order_by(CustomerItemPrice.updated_at.desc()).all()

    def resolve_customer_price(
        self,
        customer_id: str,
        item_id: str,
        *,
        company_id: str = "default",
        quantity: int = 1,
    ) -> Optional[CustomerItemPrice]:
        today = date.today()
        return (
            self._db.query(CustomerItemPrice)
            .filter(
                CustomerItemPrice.company_id == company_id,
                CustomerItemPrice.customer_id == customer_id,
                CustomerItemPrice.item_id == item_id,
                CustomerItemPrice.is_active.is_(True),
                CustomerItemPrice.min_qty <= quantity,
            )
            .filter(
                (CustomerItemPrice.valid_from.is_(None)) | (CustomerItemPrice.valid_from <= today),
            )
            .filter(
                (CustomerItemPrice.valid_to.is_(None)) | (CustomerItemPrice.valid_to >= today),
            )
            .order_by(CustomerItemPrice.min_qty.desc())
            .first()
        )

    def upsert_customer_price(
        self,
        *,
        customer_id: str,
        item_id: str,
        unit_price: Decimal,
        company_id: str = "default",
        currency: str = "BDT",
        discount_pct: Decimal = Decimal("0"),
        min_qty: int = 1,
        valid_from: Optional[date] = None,
        valid_to: Optional[date] = None,
        notes: Optional[str] = None,
    ) -> CustomerItemPrice:
        self._require_customer(customer_id)
        self._require_item(item_id)
        row = (
            self._db.query(CustomerItemPrice)
            .filter(
                CustomerItemPrice.company_id == company_id,
                CustomerItemPrice.customer_id == customer_id,
                CustomerItemPrice.item_id == item_id,
            )
            .first()
        )
        if row:
            row.unit_price = unit_price
            row.currency = currency
            row.discount_pct = discount_pct
            row.min_qty = min_qty
            row.valid_from = valid_from
            row.valid_to = valid_to
            row.notes = notes
            row.is_active = True
        else:
            row = CustomerItemPrice(
                company_id=company_id,
                customer_id=customer_id,
                item_id=item_id,
                unit_price=unit_price,
                currency=currency,
                discount_pct=discount_pct,
                min_qty=min_qty,
                valid_from=valid_from,
                valid_to=valid_to,
                notes=notes,
            )
            self._db.add(row)
        self._db.flush()
        return row

    # ── Dashboard ────────────────────────────────────────────────────────────

    def dashboard(self, company_id: str = "default") -> dict[str, Any]:
        open_statuses = ("draft", "confirmed", "processing")
        open_count = (
            self._db.query(SalesOrder)
            .filter(SalesOrder.company_id == company_id, SalesOrder.status.in_(open_statuses))
            .count()
        )
        pending_delivery = (
            self._db.query(SalesOrder)
            .filter(
                SalesOrder.company_id == company_id,
                SalesOrder.status.in_(("confirmed", "processing")),
                SalesOrder.delivery_status.in_(("pending", "partial")),
            )
            .count()
        )
        completed_count = (
            self._db.query(SalesOrder)
            .filter(SalesOrder.company_id == company_id, SalesOrder.status == "completed")
            .count()
        )
        revenue_total = (
            self._db.query(func.coalesce(func.sum(SalesOrder.total), 0))
            .filter(
                SalesOrder.company_id == company_id,
                SalesOrder.status.in_(("confirmed", "processing", "completed")),
            )
            .scalar()
        )
        # revenue is NET of what was credited back to customers (sales returns)
        revenue_total = Decimal(str(revenue_total or 0)) - self._returns_credited(company_id, None, None)
        quote_open = (
            self._db.query(SalesQuotation)
            .filter(
                SalesQuotation.company_id == company_id,
                SalesQuotation.status.in_(("draft", "sent")),
            )
            .count()
        )
        status_rows = (
            self._db.query(SalesOrder.status, func.count(SalesOrder.id))
            .filter(SalesOrder.company_id == company_id)
            .group_by(SalesOrder.status)
            .all()
        )
        recent = (
            self._db.query(SalesOrder)
            .filter(SalesOrder.company_id == company_id)
            .order_by(SalesOrder.updated_at.desc())
            .limit(8)
            .all()
        )

        # Last 14 calendar days — sales revenue + order count for charts
        today = date.today()
        start = today.fromordinal(today.toordinal() - 13)
        day_rows = (
            self._db.query(
                SalesOrder.order_date,
                func.count(SalesOrder.id),
                func.coalesce(func.sum(SalesOrder.total), 0),
            )
            .filter(
                SalesOrder.company_id == company_id,
                SalesOrder.order_date >= start,
                SalesOrder.order_date <= today,
                SalesOrder.status.in_(("confirmed", "processing", "completed", "draft")),
            )
            .group_by(SalesOrder.order_date)
            .all()
        )
        by_day = {
            row[0]: {"orders": int(row[1] or 0), "sales": float(row[2] or 0)} for row in day_rows
        }
        daily_series = []
        for i in range(14):
            d = today.fromordinal(start.toordinal() + i)
            point = by_day.get(d) or {"orders": 0, "sales": 0.0}
            daily_series.append(
                {
                    "date": d.isoformat(),
                    "label": d.strftime("%b %d"),
                    "orders": point["orders"],
                    "sales": point["sales"],
                }
            )

        return {
            "open_order_count": open_count,
            "pending_delivery_count": pending_delivery,
            "completed_count": completed_count,
            "revenue_total": revenue_total or Decimal("0"),
            "open_quotation_count": quote_open,
            "status_breakdown": {status: count for status, count in status_rows},
            "recent_order_ids": [row.id for row in recent],
            "daily_series": daily_series,
        }

    REVENUE_STATUSES = ("confirmed", "processing", "completed")

    def _returns_credited(self, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> Decimal:
        """Credit notes of sales returns (credited ones) dated within the period (both inclusive; None = open-ended)."""
        from app.models.sales_return import SalesReturn

        q = self._db.query(func.coalesce(func.sum(SalesReturn.credit_amount), 0)).filter(
            SalesReturn.company_id == company_id, SalesReturn.status == "credited"
        )
        if date_from:
            q = q.filter(SalesReturn.return_date >= date_from)
        if date_to:
            q = q.filter(SalesReturn.return_date <= date_to)
        return Decimal(str(q.scalar() or 0))

    def _period_totals(self, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
        """Orders placed between the dates (both inclusive; None = open-ended): count, revenue, completed, cancelled."""
        q = self._db.query(SalesOrder).filter(SalesOrder.company_id == company_id)
        if date_from:
            q = q.filter(SalesOrder.order_date >= date_from)
        if date_to:
            q = q.filter(SalesOrder.order_date <= date_to)
        rows = (
            q.with_entities(SalesOrder.status, func.count(SalesOrder.id), func.coalesce(func.sum(SalesOrder.total), 0))
            .group_by(SalesOrder.status)
            .all()
        )
        by_status = {status: (int(count or 0), Decimal(str(total or 0))) for status, count, total in rows}
        orders = sum(c for c, _ in by_status.values())
        gross = sum((t for s, (_, t) in by_status.items() if s in self.REVENUE_STATUSES), Decimal("0"))
        paying = sum(c for s, (c, _) in by_status.items() if s in self.REVENUE_STATUSES)
        returns_total = self._returns_credited(company_id, date_from, date_to)
        revenue = gross - returns_total  # net of the credit notes issued in the period
        return {
            "order_count": orders,
            "revenue": revenue,
            "returns_total": returns_total,
            "avg_order_value": (revenue / paying) if paying else Decimal("0"),
            "completed_count": by_status.get("completed", (0, 0))[0],
            "cancelled_count": by_status.get("cancelled", (0, 0))[0],
            "status_breakdown": {s: c for s, (c, _) in by_status.items()},
        }

    def dashboard_period(self, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
        """The dashboard for a chosen period (Today, This month …): its totals, the same totals for the period just
        before it (for the change), a trend (by day up to 3 months, by month beyond) and its latest orders."""
        current = self._period_totals(company_id, date_from, date_to)
        previous = None
        if date_from and date_to:
            span = date_to.toordinal() - date_from.toordinal() + 1
            prev_to = date.fromordinal(date_from.toordinal() - 1)
            prev_from = date.fromordinal(prev_to.toordinal() - span + 1)
            previous = self._period_totals(company_id, prev_from, prev_to)

        # trend: from the first order when the period is open-ended
        first, last = date_from, date_to or date.today()
        if first is None:
            first = (
                self._db.query(func.min(SalesOrder.order_date)).filter(SalesOrder.company_id == company_id).scalar()
                or last
            )
        by_month = (last.toordinal() - first.toordinal()) > 92
        bucket = func.date_trunc("month", SalesOrder.order_date) if by_month else SalesOrder.order_date
        trend_rows = (
            self._db.query(
                bucket,
                func.count(SalesOrder.id),
                func.coalesce(func.sum(case((SalesOrder.status.in_(self.REVENUE_STATUSES), SalesOrder.total), else_=0)), 0),
            )
            .filter(SalesOrder.company_id == company_id, SalesOrder.order_date >= first, SalesOrder.order_date <= last)
            .group_by(bucket)
            .all()
        )
        points = {}
        for key, count, total in trend_rows:
            d = key.date() if isinstance(key, datetime) else key
            points[d.replace(day=1) if by_month else d] = (int(count or 0), float(total or 0))
        series = []
        cursor = first.replace(day=1) if by_month else first
        while cursor <= last:
            count, total = points.get(cursor, (0, 0.0))
            series.append({
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %Y") if by_month else cursor.strftime("%b %d"),
                "orders": count,
                "sales": total,
            })
            if by_month:
                cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
            else:
                cursor = cursor + timedelta(days=1)

        recent_q = self._db.query(SalesOrder.id).filter(SalesOrder.company_id == company_id)
        if date_from:
            recent_q = recent_q.filter(SalesOrder.order_date >= date_from)
        if date_to:
            recent_q = recent_q.filter(SalesOrder.order_date <= date_to)
        recent_ids = [
            oid for (oid,) in recent_q.order_by(SalesOrder.order_date.desc(), SalesOrder.created_at.desc()).limit(8).all()
        ]
        return {"current": current, "previous": previous, "series": series, "by_month": by_month,
                "recent_order_ids": recent_ids}

    # ── Stock helpers ────────────────────────────────────────────────────────

    def _reserve_stock(
        self,
        order: SalesOrder,
        line: SalesOrderLine,
        qty: int,
        *,
        actor_id: Optional[str] = None,
    ) -> bool:
        """Reserve available stock. Returns False when qty cannot be fully reserved (backorder).

        With "Allow negative stock" off, a shortfall blocks the confirmation
        instead of backordering, so out-of-stock items can't be sold.
        """
        item = self._db.get(Item, line.item_id)
        if not product_master.moves_stock(self._db, item):
            return True
        # the company allows negative stock, or this product may be sold past its stock
        allow_negative = product_master.allows_negative(self._db, line.item_id, order.company_id)
        svc = StockMovementService(self._db)
        try:
            stock = svc.lock_stock(line.item_id, order.warehouse_id, order.company_id)
        except HTTPException:
            if not allow_negative:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Out of stock: {line.sku} — enable \"Allow negative stock\" in "
                        "Inventory settings to sell it"
                    ),
                )
            self._record_activity(
                order.id,
                "stock_warning",
                f"Backorder: {line.sku} — need {qty}, none available",
                actor_id,
            )
            return False
        available = max(stock.on_hand - stock.reserved, 0)
        if available < qty and not allow_negative:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for {line.sku}: available {available}, requested {qty} "
                    '— enable "Allow negative stock" in Inventory settings to sell it'
                ),
            )
        if available <= 0:
            self._record_activity(
                order.id,
                "stock_warning",
                f"Backorder: {line.sku} — need {qty}, none available",
                actor_id,
            )
            return False
        reserve_qty = min(qty, available)
        svc.reserve(
            item_id=line.item_id,
            warehouse_id=order.warehouse_id,
            quantity=reserve_qty,
            company_id=order.company_id,
            source_type=RESERVATION_SOURCE_SALES,
            source_id=order.id,
            source_line_id=line.id,
            reference=order.order_number,
            notes=f"Sales reserve {order.order_number}",
            created_by=actor_id,
        )
        line.quantity_reserved += reserve_qty
        self._db.flush()
        if reserve_qty < qty:
            self._record_activity(
                order.id,
                "stock_warning",
                f"Partial reserve: {line.sku} — need {qty}, reserved {reserve_qty}",
                actor_id,
            )
            return False
        return True

    def _release_reservation(self, order: SalesOrder, line: SalesOrderLine) -> None:
        unreleased = max(line.quantity_reserved, 0)
        if unreleased <= 0:
            return
        StockMovementService(self._db).release(
            item_id=line.item_id,
            warehouse_id=order.warehouse_id,
            quantity=unreleased,
            company_id=order.company_id,
            source_type=RESERVATION_SOURCE_SALES,
            source_id=order.id,
            source_line_id=line.id,
            reference=order.order_number,
            notes=f"Sales release {order.order_number}",
        )
        line.quantity_reserved = 0
        self._db.flush()

    def _sync_line_serials(
        self,
        order: SalesOrder,
        new_lines: list[SalesOrderLine],
        old_serials_by_item: dict[str, list[str]],
    ) -> list[str]:
        """After an edit: describe serial changes per item and, on an order that is
        already past draft, stamp added units sold / put removed units back in stock
        (confirm only runs once, so edits have to keep the registry in step)."""
        from app.services.inventory import serial_service

        new_by_item: dict[str, list[str]] = {}
        for line in new_lines:
            new_by_item.setdefault(line.item_id, []).extend(line.serial_numbers)
        changes: list[str] = []
        added_all: list[str] = []
        removed_all: list[str] = []
        names = {line.item_id: line.name for line in new_lines}
        for item_id in set(old_serials_by_item) | set(new_by_item):
            old_set = set(old_serials_by_item.get(item_id, []))
            new_set = set(new_by_item.get(item_id, []))
            added = sorted(new_set - old_set)
            removed = sorted(old_set - new_set)
            if not added and not removed:
                continue
            bits = []
            if added:
                bits.append("+" + ", ".join(added))
            if removed:
                bits.append("−" + ", ".join(removed))
            changes.append(f"{names.get(item_id, item_id)}: serials {' '.join(bits)}")
            added_all += added
            removed_all += removed
        if order.status in LEDGER_LIVE_STATUSES:
            if removed_all:
                serial_service.release_to_stock(
                    self._db,
                    removed_all,
                    warehouse_id=order.warehouse_id,
                    note=f"{order.order_number} edited",
                    company_id=order.company_id or "default",
                )
            # Reconcile every unit on the order, not just the ones added in this
            # edit: a serial that slipped on while the order was already confirmed
            # (older builds) is still "in stock" in the registry until now.
            current_all = [sn for serials in new_by_item.values() for sn in serials]
            if current_all:
                customer = self._db.get(CommerceCustomer, order.customer_id) if order.customer_id else None
                serial_service.assign_to_sales_order(
                    self._db,
                    current_all,
                    order=order,
                    customer_name=(customer.name if customer else "") or "",
                    skip_unavailable=True,
                )
        return changes

    def _mark_serials_sold(self, order: SalesOrder, lines: list[SalesOrderLine]) -> None:
        """Stamp the registry: these units now belong to this customer."""
        from app.services.inventory import serial_service

        numbers = [sn for line in lines for sn in line.serial_numbers]
        if not numbers:
            return
        customer = self._db.get(CommerceCustomer, order.customer_id) if order.customer_id else None
        serial_service.assign_to_sales_order(
            self._db,
            numbers,
            order=order,
            customer_name=(customer.name if customer else "") or "",
        )

    def _release_serials(self, order: SalesOrder, lines: list[SalesOrderLine], *, reason: str) -> None:
        from app.services.inventory import serial_service

        numbers = [sn for line in lines for sn in line.serial_numbers]
        if numbers:
            serial_service.release_to_stock(
                self._db,
                numbers,
                warehouse_id=order.warehouse_id,
                note=f"{order.order_number} {reason}",
            )

    def _restock_on_cancel(
        self, order: SalesOrder, line: SalesOrderLine, *, actor_id: Optional[str]
    ) -> bool:
        """Goods handed over at confirmation come back when the sale is cancelled
        (what was already returned through a sales return stays returned)."""
        item = self._db.get(Item, line.item_id)
        if not product_master.moves_stock(self._db, item):
            return False
        returned = int(getattr(line, "quantity_returned", 0) or 0)
        qty = int(line.quantity_delivered or 0) - returned
        if qty <= 0:
            return False
        StockMovementService(self._db).apply_movement(
            MovementInput(
                item_id=line.item_id,
                warehouse_id=order.warehouse_id,
                movement_type=MOVEMENT_CUSTOMER_RETURN,
                quantity=qty,
                company_id=order.company_id,
                reference=order.order_number,
                notes=f"Cancelled {order.order_number} — goods back to stock",
                created_by=actor_id,
                source_type="sales_order_cancel",
                source_id=order.id,
                source_line_id=line.id,
            )
        )
        line.quantity_delivered = returned
        return True

    def _refresh_delivery_status(self, order: SalesOrder) -> None:
        lines = self.get_order_lines(order.id)
        if not lines:
            return
        total_ordered = sum(l.quantity_ordered for l in lines)
        total_delivered = sum(l.quantity_delivered for l in lines)
        if total_delivered <= 0:
            order.delivery_status = "pending"
        elif total_delivered >= total_ordered:
            order.delivery_status = "delivered"
        else:
            order.delivery_status = "partial"

    # ── Line builders ────────────────────────────────────────────────────────

    def _price_line(
        self,
        item: Item,
        line_in: SalesLineInput,
        *,
        company_id: Optional[str],
        customer_id: Optional[str],
        warehouse_id: Optional[str],
        user_id: Optional[str],
        check: bool = True,
    ) -> Decimal:
        """A line's unit price: 0 takes the resolved price (customer price → price type → catalog); anything else is
        checked against the price type's bounds and the discount type's cap (sales pricing masters)."""
        from app.services.sales import pricing_service

        q = pricing_service.quote(
            self._db,
            company_id=company_id or "default",
            item_id=item.id,
            quantity=int(line_in.quantity or 1),
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            user_id=user_id,
        )
        unit_price = line_in.unit_price
        if unit_price == Decimal("0"):
            unit_price = q.price
        if check:
            product_master.require_sellable(self._db, item)
            pricing_service.check_line(
                q, label=item.sku or item.name, unit_price=unit_price, quantity=int(line_in.quantity or 0),
                discount_amount=line_in.discount_amount or Decimal("0"),
            )
        return unit_price

    def _add_quotation_lines(self, quote: SalesQuotation, lines: list[SalesLineInput]) -> None:
        for idx, line_in in enumerate(lines, start=1):
            item = self._require_item(line_in.item_id)
            unit_price = self._price_line(
                item, line_in, company_id=quote.company_id, customer_id=quote.customer_id,
                warehouse_id=quote.warehouse_id, user_id=quote.created_by,
            )
            tax_amount, line_total = self._calc_line(line_in.quantity, unit_price, line_in.tax_rate, line_in.discount_amount)
            self._db.add(
                SalesQuotationLine(
                    sales_quotation_id=quote.id,
                    item_id=item.id,
                    line_number=idx,
                    sort_order=idx,
                    sku=item.sku,
                    name=item.name,
                    quantity=line_in.quantity,
                    unit_price=unit_price,
                    tax_rate=line_in.tax_rate,
                    tax_amount=tax_amount,
                    discount_amount=line_in.discount_amount,
                    line_total=line_total,
                    notes=line_in.notes,
                ),
            )

    def _add_order_lines(
        self, order: SalesOrder, lines: list[SalesLineInput], customer_id: str, *, check_prices: bool = True
    ) -> None:
        for idx, line_in in enumerate(lines, start=1):
            item = self._require_item(line_in.item_id)
            unit_price = self._price_line(
                item, line_in, company_id=order.company_id, customer_id=customer_id,
                warehouse_id=order.warehouse_id, user_id=order.created_by, check=check_prices,
            )
            tax_amount, line_total = self._calc_line(line_in.quantity, unit_price, line_in.tax_rate, line_in.discount_amount)
            new_line = SalesOrderLine(
                sales_order_id=order.id,
                item_id=item.id,
                line_number=idx,
                sort_order=idx,
                sku=item.sku,
                name=item.name,
                quantity_ordered=line_in.quantity,
                unit_price=unit_price,
                tax_rate=line_in.tax_rate,
                tax_amount=tax_amount,
                discount_amount=line_in.discount_amount,
                line_total=line_total,
                notes=line_in.notes,
            )
            new_line.serial_numbers = self._serials_for_line(order, item, line_in)
            self._db.add(new_line)

    def _serials_for_line(
        self,
        order: SalesOrder,
        item: Item,
        line_in: SalesLineInput,
        *,
        current: Optional[list[str]] = None,
    ) -> list[str]:
        """Serial units named on a line. `None` in the payload keeps what the line
        already had (older clients don't send the field); a list replaces it after
        the registry confirms every unit is this item and available to this order."""
        if line_in.serial_numbers is None:
            return list(current or [])
        from app.services.inventory import serial_service

        serials = serial_service.validate_for_sale(
            self._db,
            line_in.serial_numbers,
            item=item,
            company_id=order.company_id or "default",
            order_id=order.id,
            warehouse_id=order.warehouse_id,
        )
        if len(serials) > int(line_in.quantity or 0):
            raise HTTPException(
                status_code=400,
                detail=f"{item.sku}: {len(serials)} serial numbers for {line_in.quantity} unit(s) — add units or remove serials",
            )
        return serials

    def _replace_order_lines(self, order: SalesOrder, lines: list[SalesLineInput], customer_id: str) -> None:
        """Upsert an order's lines by item_id instead of delete-all-then-reinsert.

        A plain delete+reinsert (the old behavior) gives every saved line a brand
        new id and resets quantity_delivered/quantity_returned to 0 — silently
        wiping delivery/return tracking on every edit, and raising a foreign-key
        error on save once any line has a sales_return_lines row referencing it
        (ondelete="RESTRICT"). Matching existing rows by item_id and updating them
        in place preserves both their id and their delivered/returned counters;
        only lines that truly disappear from the new line list get deleted.
        """
        existing = (
            self._db.query(SalesOrderLine)
            .filter(SalesOrderLine.sales_order_id == order.id)
            .all()
        )
        by_item: dict[str, list[SalesOrderLine]] = {}
        for row in existing:
            by_item.setdefault(row.item_id, []).append(row)

        keep_ids: set[str] = set()
        for idx, line_in in enumerate(lines, start=1):
            item = self._require_item(line_in.item_id)
            bucket = by_item.get(item.id)
            row = bucket.pop(0) if bucket else None
            # a line saved before the price masters existed (or before a rule changed) keeps saving as it was
            unchanged = row is not None and (
                row.unit_price == line_in.unit_price
                and row.quantity_ordered == line_in.quantity
                and (row.discount_amount or Decimal("0")) == line_in.discount_amount
            )
            unit_price = self._price_line(
                item, line_in, company_id=order.company_id, customer_id=customer_id,
                warehouse_id=order.warehouse_id, user_id=order.created_by, check=not unchanged,
            )
            tax_amount, line_total = self._calc_line(
                line_in.quantity, unit_price, line_in.tax_rate, line_in.discount_amount
            )

            if row is not None:
                row.line_number = idx
                row.sort_order = idx
                row.sku = item.sku
                row.name = item.name
                row.quantity_ordered = line_in.quantity
                row.unit_price = unit_price
                row.tax_rate = line_in.tax_rate
                row.tax_amount = tax_amount
                row.discount_amount = line_in.discount_amount
                row.line_total = line_total
                row.notes = line_in.notes
                row.serial_numbers = self._serials_for_line(order, item, line_in, current=row.serial_numbers)
                keep_ids.add(row.id)
            else:
                new_row = SalesOrderLine(
                    sales_order_id=order.id,
                    item_id=item.id,
                    line_number=idx,
                    sort_order=idx,
                    sku=item.sku,
                    name=item.name,
                    quantity_ordered=line_in.quantity,
                    unit_price=unit_price,
                    tax_rate=line_in.tax_rate,
                    tax_amount=tax_amount,
                    discount_amount=line_in.discount_amount,
                    line_total=line_total,
                    notes=line_in.notes,
                )
                new_row.serial_numbers = self._serials_for_line(order, item, line_in)
                self._db.add(new_row)
                self._db.flush()
                keep_ids.add(new_row.id)

        removed = [row for row in existing if row.id not in keep_ids]
        if removed:
            returned_skus = {
                row.sku
                for row in removed
                if self._db.query(SalesReturnLine)
                .filter(SalesReturnLine.sales_order_line_id == row.id)
                .first()
            }
            if returned_skus:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Cannot remove line(s) with an existing return: "
                        f"{', '.join(sorted(returned_skus))}"
                    ),
                )
            for row in removed:
                self._db.delete(row)

    def _recalc_quotation(self, quote: SalesQuotation) -> None:
        lines = self.get_quotation_lines(quote.id)
        subtotal = sum((l.unit_price * l.quantity) - l.discount_amount for l in lines)
        tax_total = sum(l.tax_amount for l in lines)
        discount_total = sum(l.discount_amount for l in lines)
        quote.subtotal = subtotal
        quote.tax_total = tax_total
        quote.discount_total = discount_total
        quote.total = subtotal + tax_total
        self._db.flush()

    @staticmethod
    def header_discount_amount(order: SalesOrder, subtotal: Decimal) -> Decimal:
        """Order-level discount as money: entered value, or a percent of the subtotal."""
        entered = Decimal(str(order.order_discount or 0))
        if (order.order_discount_type or "fixed") == "percent":
            amount = subtotal * entered / Decimal("100")
        else:
            amount = entered
        return max(Decimal("0"), min(amount, subtotal)).quantize(Decimal("0.01"))

    @staticmethod
    def additional_expenses(order: SalesOrder) -> list[dict]:
        try:
            data = json.loads(order.additional_expenses_json or "[]")
        except (TypeError, ValueError):
            return []
        out: list[dict] = []
        for row in data if isinstance(data, list) else []:
            if not isinstance(row, dict):
                continue
            try:
                amount = Decimal(str(row.get("amount") or 0))
            except Exception:
                continue
            out.append({"title": str(row.get("title") or "").strip(), "amount": amount})
        return out

    def _recalc_order(self, order: SalesOrder) -> None:
        lines = self.get_order_lines(order.id)
        subtotal = sum((l.unit_price * l.quantity_ordered) - l.discount_amount for l in lines)
        tax_total = sum(l.tax_amount for l in lines)
        line_discounts = sum(l.discount_amount for l in lines)
        header_discount = self.header_discount_amount(order, Decimal(str(subtotal)))
        expenses = sum((e["amount"] for e in self.additional_expenses(order)), Decimal("0"))
        shipping = Decimal(str(order.shipping_charge or 0))
        order.subtotal = subtotal
        order.tax_total = tax_total
        order.discount_total = line_discounts + header_discount
        # Same formula as the drawer's totals box: lines (net of line discounts)
        # + tax − header discount + shipping + additional expenses.
        order.total = subtotal + tax_total - header_discount + shipping + expenses
        self._sync_order_taxes(order)
        self._db.flush()

    @staticmethod
    def _calc_line(qty: int, unit_price: Decimal, tax_rate: Decimal, discount: Decimal) -> tuple[Decimal, Decimal]:
        base = (unit_price * qty) - discount
        tax_amount = (base * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
        line_total = base + tax_amount
        return tax_amount, line_total

    # ── Number sequences ─────────────────────────────────────────────────────

    def _next_quotation_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "sales.quotation",
            initial=lambda: self._db.query(SalesQuotation)
            .filter(SalesQuotation.company_id == company_id)
            .count()
            + 1,
        )

    def _next_order_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "sales.order",
            initial=lambda: self._db.query(SalesOrder)
            .filter(SalesOrder.company_id == company_id)
            .count()
            + 1,
        )

    def _next_delivery_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "sales.delivery",
            initial=lambda: self._db.query(SalesDelivery)
            .filter(SalesDelivery.company_id == company_id)
            .count()
            + 1,
        )

    # ── History ──────────────────────────────────────────────────────────────

    def _quotation_snapshot(self, quote: SalesQuotation) -> dict[str, Any]:
        return {
            "quotation_number": quote.quotation_number,
            "status": quote.status,
            "customer_id": quote.customer_id,
            "total": str(quote.total),
        }

    _ORDER_FIELD_LABELS = {
        "customer_id": "Customer",
        "warehouse_id": "Warehouse",
        "order_date": "Order date",
        "expected_date": "Expected date",
        "sales_rep": "Salesperson",
        "notes": "Notes",
        "payment_terms": "Pay term",
        "sale_stage": "Status",
        "invoice_scheme": "Invoice scheme",
        "shipping_status": "Shipping status",
        "delivered_to": "Delivered to",
        "delivery_person_id": "Delivery person",
    }

    def _order_scalar_snapshot(self, order: SalesOrder) -> dict[str, Any]:
        return {key: getattr(order, key) for key in self._ORDER_FIELD_LABELS}

    def _resolve_customer_label(self, customer_id: Optional[str]) -> str:
        if not customer_id:
            return "—"
        customer = self._db.get(CommerceCustomer, customer_id)
        return customer.name if customer else customer_id

    def _resolve_warehouse_label(self, warehouse_id: Optional[str]) -> str:
        if not warehouse_id:
            return "—"
        warehouse = self._db.get(InventoryWarehouse, warehouse_id)
        return warehouse.name if warehouse else warehouse_id

    @staticmethod
    def _strip_payment_meta(notes: Optional[str]) -> str:
        """Order notes carry an embedded <!--againerp:payment--> JSON blob (the mock
        Payment tab's history) — never surface that raw JSON in a human-readable diff."""
        if not notes:
            return ""
        return re.sub(r"<!--againerp:payment-->[\s\S]*?<!--/againerp:payment-->", "", notes).strip()

    def _summarize_order_changes(
        self,
        old_scalars: dict[str, Any],
        order: SalesOrder,
        old_lines: list[SalesOrderLine],
        new_lines: list[SalesOrderLine],
    ) -> list[str]:
        changes: list[str] = []
        for key, label in self._ORDER_FIELD_LABELS.items():
            old_v = old_scalars.get(key)
            new_v = getattr(order, key)
            if key == "notes":
                old_v = self._strip_payment_meta(old_v)
                new_v = self._strip_payment_meta(new_v)
            if str(old_v or "") == str(new_v or ""):
                continue
            if key == "customer_id":
                changes.append(
                    f"{label}: {self._resolve_customer_label(old_v)} → {self._resolve_customer_label(new_v)}",
                )
            elif key == "warehouse_id":
                changes.append(
                    f"{label}: {self._resolve_warehouse_label(old_v)} → {self._resolve_warehouse_label(new_v)}",
                )
            else:
                changes.append(f"{label}: {old_v or '—'} → {new_v or '—'}")

        old_by_item: dict[str, list[SalesOrderLine]] = {}
        for line in old_lines:
            old_by_item.setdefault(line.item_id, []).append(line)
        new_by_item: dict[str, list[SalesOrderLine]] = {}
        for line in new_lines:
            new_by_item.setdefault(line.item_id, []).append(line)

        for item_id, old_group in old_by_item.items():
            if item_id in new_by_item:
                continue
            for line in old_group:
                changes.append(f"Removed {line.name} (x{line.quantity_ordered})")
        for item_id, new_group in new_by_item.items():
            if item_id in old_by_item:
                continue
            for line in new_group:
                changes.append(f"Added {line.name} (x{line.quantity_ordered})")
        for item_id in set(old_by_item) & set(new_by_item):
            old_line = old_by_item[item_id][0]
            new_line = new_by_item[item_id][0]
            old_qty = sum(l.quantity_ordered for l in old_by_item[item_id])
            new_qty = sum(l.quantity_ordered for l in new_by_item[item_id])
            if old_qty != new_qty:
                changes.append(f"{new_line.name}: quantity {old_qty} → {new_qty}")
            if Decimal(old_line.unit_price or 0) != Decimal(new_line.unit_price or 0):
                changes.append(
                    f"{new_line.name}: unit price {old_line.unit_price} → {new_line.unit_price}",
                )
        return changes

    def _order_snapshot(self, order: SalesOrder) -> dict[str, Any]:
        return {
            "order_number": order.order_number,
            "status": order.status,
            "customer_id": order.customer_id,
            "warehouse_id": order.warehouse_id,
            "total": str(order.total),
        }

    def _record_activity(
        self,
        order_id: str,
        activity_type: str,
        title: str,
        actor_id: Optional[str],
        description: Optional[str] = None,
    ) -> None:
        self._db.add(
            SalesOrderActivity(
                sales_order_id=order_id,
                activity_type=activity_type,
                title=title,
                description=description,
                actor_id=actor_id,
            ),
        )

    def _record_audit_log(
        self,
        order_id: str,
        *,
        action: str,
        actor_id: Optional[str],
        old_value: Optional[dict[str, Any] | str],
        new_value: Optional[dict[str, Any] | str],
    ) -> None:
        self._db.add(
            SalesOrderLog(
                sales_order_id=order_id,
                action=action,
                actor_id=actor_id,
                old_value=json.dumps(old_value) if old_value is not None else None,
                new_value=json.dumps(new_value) if new_value is not None else None,
            ),
        )

    def _sync_order_taxes(self, order: SalesOrder) -> None:
        self._db.query(SalesOrderTax).filter(SalesOrderTax.sales_order_id == order.id).delete(
            synchronize_session=False,
        )
        lines = self.get_order_lines(order.id)
        if not lines:
            return
        for line in lines:
            if line.tax_amount <= 0:
                continue
            self._db.add(
                SalesOrderTax(
                    sales_order_id=order.id,
                    sales_order_line_id=line.id,
                    tax_name="VAT",
                    tax_rate=line.tax_rate,
                    tax_amount=line.tax_amount,
                ),
            )
        self._db.flush()

    def _record_quotation_history(
        self,
        quotation_id: str,
        from_status: Optional[str],
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
    ) -> None:
        self._db.add(
            SalesQuotationStatusHistory(
                sales_quotation_id=quotation_id,
                from_status=from_status,
                to_status=to_status,
                changed_by=actor_id,
                notes=notes,
            ),
        )

    def _record_order_history(
        self,
        order_id: str,
        from_status: Optional[str],
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
    ) -> None:
        self._db.add(
            SalesOrderStatusHistory(
                sales_order_id=order_id,
                from_status=from_status,
                to_status=to_status,
                changed_by=actor_id,
                notes=notes,
            ),
        )

    # ── Validators ───────────────────────────────────────────────────────────

    def _require_quotation(self, quotation_id: str) -> SalesQuotation:
        row = self.get_quotation(quotation_id)
        if not row or row.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Quotation not found")
        return row

    def _require_order(self, order_id: str) -> SalesOrder:
        row = self.get_order(order_id)
        if not row or row.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Sales order not found")
        return row

    def _refresh_customer_sales_stats(self, customer_id: str) -> None:
        """Keep commerce customer totals in sync with admin sales orders."""
        customer = self._db.get(CommerceCustomer, customer_id)
        if not customer:
            return
        orders = (
            self._db.query(SalesOrder)
            .filter(
                SalesOrder.customer_id == customer_id,
                SalesOrder.deleted_at.is_(None),
                SalesOrder.status.notin_(["cancelled", "draft"]),
            )
            .all()
        )
        count = len(orders)
        spend = sum((o.total or Decimal("0")) for o in orders)
        customer.total_orders = count
        customer.total_spend = spend
        customer.avg_order_value = (spend / count) if count else Decimal("0")
        customer.last_order_date = max((o.order_date for o in orders), default=None)
        self._db.flush()

    def _require_customer(self, customer_id: str) -> CommerceCustomer:
        row = self._db.get(CommerceCustomer, customer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        return row

    def _require_warehouse(self, warehouse_id: str) -> InventoryWarehouse:
        row = self._db.get(InventoryWarehouse, warehouse_id)
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        return row

    def _require_item(self, item_id: str) -> Item:
        row = self._db.get(Item, item_id)
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        return row
