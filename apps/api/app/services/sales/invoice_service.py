"""Sales invoices — manually-authored billing documents with line items.

Mirrors the SalesQuotation pattern. On create/update, the invoice's Finance
receivable (finance_receivables, source_type="sales_invoice") is kept in sync
via FinanceService so Clients/Finance aggregates never drift from the document.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.sales import SalesInvoice, SalesInvoiceLine
from app.services.core.sequence_service import next_number as allocate_number


@dataclass
class InvoiceLineInput:
    item_id: Optional[str] = None
    name: str = ""
    description: Optional[str] = None
    quantity: Decimal = Decimal("1")
    unit_type: str = "Unit"
    rate: Decimal = Decimal("0")
    taxable: bool = True


class InvoiceService:
    def __init__(self, db: Session):
        self._db = db

    def _next_invoice_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "sales.invoice",
            initial=lambda: self._db.query(SalesInvoice)
            .filter(SalesInvoice.company_id == company_id)
            .count()
            + 1,
        )

    def _build_line(self, invoice_id: str, sort_order: int, data: InvoiceLineInput) -> SalesInvoiceLine:
        name = data.name.strip()
        if not name and data.item_id:
            item = self._db.get(Item, data.item_id)
            if item:
                name = item.name
        quantity = data.quantity or Decimal("0")
        rate = data.rate or Decimal("0")
        return SalesInvoiceLine(
            sales_invoice_id=invoice_id,
            item_id=data.item_id,
            sort_order=sort_order,
            name=name,
            description=data.description,
            quantity=quantity,
            unit_type=data.unit_type or "Unit",
            rate=rate,
            taxable=data.taxable,
            line_total=quantity * rate,
        )

    def _recompute_totals(self, invoice: SalesInvoice) -> None:
        lines = (
            self._db.query(SalesInvoiceLine)
            .filter(SalesInvoiceLine.sales_invoice_id == invoice.id)
            .all()
        )
        subtotal = sum((line.line_total for line in lines), Decimal("0"))
        taxable_base = sum((line.line_total for line in lines if line.taxable), Decimal("0"))
        tax_total = taxable_base * (invoice.tax_rate or Decimal("0")) / Decimal("100")
        tax_total += taxable_base * (invoice.second_tax_rate or Decimal("0")) / Decimal("100")
        tds_total = subtotal * (invoice.tds_rate or Decimal("0")) / Decimal("100")
        invoice.subtotal = subtotal
        invoice.tax_total = tax_total
        invoice.tds_total = tds_total
        invoice.total = subtotal + tax_total - tds_total
        self._db.flush()

    def get_lines(self, invoice_id: str) -> list[SalesInvoiceLine]:
        return (
            self._db.query(SalesInvoiceLine)
            .filter(SalesInvoiceLine.sales_invoice_id == invoice_id)
            .order_by(SalesInvoiceLine.sort_order)
            .all()
        )

    def list_invoices(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        project_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SalesInvoice], int]:
        query = self._db.query(SalesInvoice).filter(
            SalesInvoice.company_id == company_id,
            SalesInvoice.deleted_at.is_(None),
        )
        if status and status != "all":
            query = query.filter(SalesInvoice.status == status)
        if customer_id:
            query = query.filter(SalesInvoice.customer_id == customer_id)
        if project_id:
            query = query.filter(SalesInvoice.project_id == project_id)
        if search:
            like = f"%{search.strip()}%"
            query = query.filter(SalesInvoice.invoice_number.ilike(like))
        total = query.count()
        rows = query.order_by(SalesInvoice.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_invoice(self, invoice_id: str, *, company_id: str = "default") -> SalesInvoice:
        invoice = self._db.get(SalesInvoice, invoice_id)
        if not invoice or invoice.company_id != company_id or invoice.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return invoice

    def create_invoice(
        self,
        *,
        company_id: str,
        customer_id: str,
        project_id: Optional[str],
        bill_date: date,
        due_date: Optional[date],
        tax_rate: Decimal,
        second_tax_rate: Decimal,
        tds_rate: Decimal,
        is_recurring: bool,
        notes: Optional[str],
        created_by: Optional[str],
        lines: list[InvoiceLineInput],
    ) -> SalesInvoice:
        invoice = SalesInvoice(
            company_id=company_id,
            invoice_number=self._next_invoice_number(company_id),
            customer_id=customer_id,
            project_id=project_id,
            bill_date=bill_date,
            due_date=due_date,
            tax_rate=tax_rate,
            second_tax_rate=second_tax_rate,
            tds_rate=tds_rate,
            is_recurring=is_recurring,
            notes=notes,
            created_by=created_by,
            updated_by=created_by,
        )
        self._db.add(invoice)
        self._db.flush()
        for idx, line in enumerate(lines):
            self._db.add(self._build_line(invoice.id, idx, line))
        self._db.flush()
        self._recompute_totals(invoice)
        return invoice

    def update_invoice(
        self,
        invoice_id: str,
        *,
        company_id: str = "default",
        updated_by: Optional[str] = None,
        lines: Optional[list[InvoiceLineInput]] = None,
        **patch,
    ) -> SalesInvoice:
        invoice = self.get_invoice(invoice_id, company_id=company_id)
        for key, value in patch.items():
            if value is not None and hasattr(invoice, key):
                setattr(invoice, key, value)
        invoice.updated_by = updated_by
        if lines is not None:
            self._db.query(SalesInvoiceLine).filter(
                SalesInvoiceLine.sales_invoice_id == invoice.id
            ).delete()
            self._db.flush()
            for idx, line in enumerate(lines):
                self._db.add(self._build_line(invoice.id, idx, line))
        self._db.flush()
        self._recompute_totals(invoice)
        return invoice

    def delete_invoice(self, invoice_id: str, *, company_id: str = "default") -> None:
        invoice = self.get_invoice(invoice_id, company_id=company_id)
        from datetime import datetime

        invoice.deleted_at = datetime.utcnow()
        self._db.flush()

    def add_line(self, invoice_id: str, *, company_id: str, data: InvoiceLineInput) -> SalesInvoiceLine:
        invoice = self.get_invoice(invoice_id, company_id=company_id)
        sort_order = len(self.get_lines(invoice.id))
        line = self._build_line(invoice.id, sort_order, data)
        self._db.add(line)
        self._db.flush()
        self._recompute_totals(invoice)
        return line

    def update_line(
        self, invoice_id: str, line_id: str, *, company_id: str, data: InvoiceLineInput
    ) -> SalesInvoiceLine:
        invoice = self.get_invoice(invoice_id, company_id=company_id)
        line = self._db.get(SalesInvoiceLine, line_id)
        if not line or line.sales_invoice_id != invoice.id:
            raise HTTPException(status_code=404, detail="Line item not found")
        line.item_id = data.item_id
        line.name = data.name.strip() or line.name
        line.description = data.description
        line.quantity = data.quantity or Decimal("0")
        line.unit_type = data.unit_type or "Unit"
        line.rate = data.rate or Decimal("0")
        line.taxable = data.taxable
        line.line_total = line.quantity * line.rate
        self._db.flush()
        self._recompute_totals(invoice)
        return line

    def delete_line(self, invoice_id: str, line_id: str, *, company_id: str) -> None:
        invoice = self.get_invoice(invoice_id, company_id=company_id)
        line = self._db.get(SalesInvoiceLine, line_id)
        if not line or line.sales_invoice_id != invoice.id:
            raise HTTPException(status_code=404, detail="Line item not found")
        self._db.delete(line)
        self._db.flush()
        self._recompute_totals(invoice)
