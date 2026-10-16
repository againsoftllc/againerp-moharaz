"""Supplier bills — the 3-way-match step between a PO, its Goods Receipt(s), and
the supplier's actual invoice.

Posting is deliberately conservative about Finance: a Goods Receipt already posts
Dr Inventory / Cr AP when it's received (see FinanceService.record_purchase_receipt).
If that already happened for this PO, posting the bill just links to that existing
payable instead of creating a second one — otherwise the same purchase would post
to AP twice and to COGS on top of Inventory. See the router's `post_bill` endpoint
for the FinanceService composition.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.purchase_bill import PurchaseBill, PurchaseBillLine
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.services.core.sequence_service import next_number as allocate_number

MATCH_TOLERANCE_PCT = Decimal("2")
SEVERE_PRICE_PCT = Decimal("5")

BILL_STATUSES = frozenset(
    {"draft", "unmatched", "matched", "exception", "approved", "posted", "paid", "cancelled"}
)


class PurchaseBillService:
    def __init__(self, db: Session):
        self._db = db

    def _next_bill_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "purchase.bill",
            initial=lambda: self._db.query(PurchaseBill)
            .filter(PurchaseBill.company_id == company_id)
            .count()
            + 1,
        )

    def _price_variance_pct(self, line: PurchaseBillLine) -> Decimal:
        if line.unit_price_po == 0:
            return Decimal("0")
        return abs((line.unit_price_bill - line.unit_price_po) / line.unit_price_po * 100)

    def _evaluate_match(self, bill: PurchaseBill) -> None:
        lines = self.get_lines(bill.id)
        has_qty_issue = any(
            l.quantity_bill != l.quantity_receipt or l.quantity_bill != l.quantity_po for l in lines
        )
        has_price_issue = any(self._price_variance_pct(l) > MATCH_TOLERANCE_PCT for l in lines)
        if has_price_issue or has_qty_issue:
            severe = any(
                self._price_variance_pct(l) > SEVERE_PRICE_PCT or l.quantity_bill != l.quantity_receipt
                for l in lines
            )
            bill.match_status = "exception" if severe else "partial_match"
            bill.status = "exception" if severe else "unmatched"
        else:
            bill.match_status = "matched"
            bill.status = "matched"
        self._db.flush()

    def get_lines(self, bill_id: str) -> list[PurchaseBillLine]:
        return (
            self._db.query(PurchaseBillLine)
            .filter(PurchaseBillLine.purchase_bill_id == bill_id)
            .all()
        )

    def list_bills(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        supplier_id: Optional[str] = None,
        purchase_order_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseBill], int]:
        query = self._db.query(PurchaseBill).filter(PurchaseBill.company_id == company_id)
        if status and status != "all":
            query = query.filter(PurchaseBill.status == status)
        if supplier_id:
            query = query.filter(PurchaseBill.supplier_id == supplier_id)
        if purchase_order_id:
            query = query.filter(PurchaseBill.purchase_order_id == purchase_order_id)
        total = query.count()
        rows = query.order_by(PurchaseBill.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_bill(self, bill_id: str, *, company_id: str = "default") -> PurchaseBill:
        bill = self._db.get(PurchaseBill, bill_id)
        if not bill or bill.company_id != company_id:
            raise HTTPException(status_code=404, detail="Supplier bill not found")
        return bill

    def create_bill_from_po(
        self,
        *,
        company_id: str,
        purchase_order_id: str,
        vendor_invoice_number: Optional[str],
        bill_date: date,
        due_date: Optional[date],
        notes: Optional[str],
        created_by: Optional[str],
    ) -> PurchaseBill:
        order = self._db.get(PurchaseOrder, purchase_order_id)
        if not order or order.company_id != company_id:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if order.status in ("draft", "cancelled"):
            raise HTTPException(status_code=400, detail="Purchase order must be confirmed before billing")
        lines = (
            self._db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.purchase_order_id == purchase_order_id)
            .order_by(PurchaseOrderLine.line_number.asc())
            .all()
        )
        if not lines:
            raise HTTPException(status_code=400, detail="Purchase order has no lines")

        bill = PurchaseBill(
            company_id=company_id,
            bill_number=self._next_bill_number(company_id),
            vendor_invoice_number=vendor_invoice_number,
            purchase_order_id=purchase_order_id,
            supplier_id=order.supplier_id,
            bill_date=bill_date,
            due_date=due_date,
            status="draft",
            match_status="unmatched",
            notes=notes,
            created_by=created_by,
        )
        self._db.add(bill)
        self._db.flush()

        subtotal = Decimal("0")
        for line in lines:
            quantity_bill = line.quantity_received or line.quantity_ordered
            line_total = Decimal(quantity_bill) * line.unit_cost
            self._db.add(
                PurchaseBillLine(
                    purchase_bill_id=bill.id,
                    purchase_order_line_id=line.id,
                    sku=line.sku,
                    name=line.name,
                    quantity_po=line.quantity_ordered,
                    quantity_receipt=line.quantity_received,
                    quantity_bill=quantity_bill,
                    unit_price_po=line.unit_cost,
                    unit_price_bill=line.unit_cost,
                    line_total=line_total,
                )
            )
            subtotal += line_total
        bill.subtotal = subtotal
        bill.total = subtotal
        self._db.flush()
        self._evaluate_match(bill)
        return bill

    def run_auto_match(self, bill_id: str, *, company_id: str, actor_id: Optional[str]) -> PurchaseBill:
        bill = self.get_bill(bill_id, company_id=company_id)
        if bill.status in ("posted", "paid", "cancelled"):
            raise HTTPException(status_code=400, detail="Bill is already posted")
        self._evaluate_match(bill)
        bill.matched_by = actor_id
        self._db.flush()
        return bill

    def approve_bill(self, bill_id: str, *, company_id: str, actor_id: Optional[str]) -> PurchaseBill:
        bill = self.get_bill(bill_id, company_id=company_id)
        if bill.match_status != "matched":
            raise HTTPException(status_code=400, detail="Bill must be matched before it can be approved")
        bill.status = "approved"
        bill.approved_by = actor_id
        bill.approved_at = datetime.utcnow()
        self._db.flush()
        return bill

    def find_receipt_payable_source(self, bill: PurchaseBill) -> Optional[str]:
        """The most recent posted receipt for this bill's PO, if any — the receipt
        whose Finance payable this bill should link to instead of duplicating."""
        receipt = (
            self._db.query(PurchaseReceipt)
            .filter(
                PurchaseReceipt.purchase_order_id == bill.purchase_order_id,
                PurchaseReceipt.status == "posted",
            )
            .order_by(PurchaseReceipt.posted_at.desc())
            .first()
        )
        return receipt.id if receipt else None

    def delete_bill(self, bill_id: str, *, company_id: str) -> None:
        bill = self.get_bill(bill_id, company_id=company_id)
        if bill.status in ("posted", "paid"):
            raise HTTPException(status_code=400, detail="Cannot delete a bill already posted to Finance")
        self._db.query(PurchaseBillLine).filter(PurchaseBillLine.purchase_bill_id == bill.id).delete()
        self._db.delete(bill)
        self._db.flush()
