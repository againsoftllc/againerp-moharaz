"""Customer account ledger — invoices (receivables) and payments received.

Mirrors the supplier AP ledger, but the direction is reversed: billed amounts
are what the customer owes us.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_order import CommerceOrder
from app.models.company import Company
from app.models.finance import FinancePayment, FinancePaymentAccount, FinanceReceivable
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.sales import SalesOrder
from app.services.company_invoice import allocate_invoice_number, due_days_of
from app.services.finance.ledger_running import (
    apply_unapplied_fifo,
    attach_running_due,
    document_date,
    document_due,
    net_payments,
)
from app.schemas.customer_ledger import (
    CustomerInvoiceCreate,
    CustomerInvoiceRead,
    CustomerLedgerAgeing,
    CustomerLedgerEntryRead,
    CustomerLedgerSummary,
    CustomerPaymentAllocation,
    CustomerPaymentCreate,
    CustomerPaymentRead,
)
from app.services.core.sequence_service import next_number as allocate_number

ZERO = Decimal("0")
PAYMENT_SOURCE_TYPE = "customer_payment"
INVOICE_SOURCE_TYPE = "customer_invoice"


def _require_customer(db: Session, customer_id: str, *, company_id: str) -> CommerceCustomer:
    customer = db.get(CommerceCustomer, customer_id)
    if not customer or (customer.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


def _receivables(db: Session, customer_id: str) -> list[FinanceReceivable]:
    return (
        db.query(FinanceReceivable)
        .filter(FinanceReceivable.customer_id == customer_id)
        .order_by(FinanceReceivable.created_at.asc())
        .all()
    )


def _payments(db: Session, customer_id: str) -> list[FinancePayment]:
    return (
        db.query(FinancePayment)
        .filter(FinancePayment.party_id == customer_id)
        .order_by(FinancePayment.payment_date.asc(), FinancePayment.created_at.asc())
        .all()
    )


def _line_due(row: FinanceReceivable) -> Decimal:
    return document_due(row)


def _return_order_ids(db: Session, notes: list[FinanceReceivable]) -> dict[str, str]:
    """sales_return receivable → the sales order the goods came back from."""
    return_ids = [r.source_id for r in notes if r.source_type == "sales_return" and r.source_id]
    if not return_ids:
        return {}
    from app.models.sales_return import SalesReturn

    rows = (
        db.query(SalesReturn.id, SalesReturn.sales_order_id)
        .filter(SalesReturn.id.in_(return_ids))
        .all()
    )
    return {return_id: order_id for return_id, order_id in rows if order_id}


def _consume_credit(note: FinanceReceivable, take: Decimal) -> None:
    """Use up `take` of a credit note (stored as a negative receivable)."""
    note.amount_paid = (note.amount_paid or ZERO) - take
    note.balance = (note.amount or ZERO) - note.amount_paid
    note.status = "paid" if note.balance >= 0 else "partial"


def apply_credit_notes(db: Session, customer_id: str) -> list[str]:
    """Match open credit notes (sales returns) against open invoices — the
    invoice the goods came from first, then the oldest open one. Whatever is
    left stays on the note as customer credit until it is refunded or used."""
    receivables = _receivables(db, customer_id)
    notes = [r for r in receivables if (r.amount or ZERO) < 0 and document_due(r) < 0]
    if not notes:
        return []
    order_of = _return_order_ids(db, notes)
    invoices = [r for r in receivables if (r.amount or ZERO) > 0 and r.status != "void"]
    refs: list[str] = []
    for note in notes:
        remaining = -document_due(note)
        order_id = order_of.get(note.source_id or "")
        targets = sorted(
            invoices,
            key=lambda inv: 0
            if order_id and inv.source_type == "sales_order" and inv.source_id == order_id
            else 1,
        )
        for inv in targets:
            if remaining <= 0:
                break
            due = document_due(inv)
            if due <= 0:
                continue
            take = min(due, remaining)
            inv.amount_paid = (inv.amount_paid or ZERO) + take
            inv.balance = due - take
            inv.status = "paid" if inv.balance <= 0 else "partial"
            _consume_credit(note, take)
            remaining -= take
            refs.append(str(inv.invoice_number or ""))
    return refs


def consume_credit_for_refund(db: Session, customer_id: str, amount: Decimal) -> Decimal:
    """Cash refunded to the customer uses up their open credit notes, oldest
    first. Returns the part not backed by a credit note (a refund of an
    overpayment), which simply stops counting as advance."""
    remaining = amount
    for note in _receivables(db, customer_id):
        if remaining <= 0:
            break
        if (note.amount or ZERO) >= 0:
            continue
        open_credit = -document_due(note)
        if open_credit <= 0:
            continue
        take = min(open_credit, remaining)
        _consume_credit(note, take)
        remaining -= take
    return remaining


def apply_unapplied_payments(db: Session, customer_id: str) -> list[str]:
    """Credit notes first, then leftover customer receipts, onto open invoices oldest first."""
    refs = apply_credit_notes(db, customer_id)
    refs += apply_unapplied_fifo(
        _receivables(db, customer_id),
        _payments(db, customer_id),
        paid_direction="inbound",
        reference_attr="invoice_number",
    )
    return refs


_ENTRY_SUFFIX = re.compile(r" · (?P<entry>\S+?)(?: \((?:advance|refund)\))?$")


def _payment_views(payments: list[FinancePayment]) -> list[object]:
    """One ledger line per Payment-tab entry. A sales-order payment can have
    landed in Finance in parts (posted while the invoice was smaller, then
    topped up after an edit) — the customer paid it once, so show it once."""
    merged: dict[tuple[str, str, str], SimpleNamespace] = {}
    views: list[object] = []
    for p in payments:
        match = _ENTRY_SUFFIX.search(p.notes or "") if p.source_type == "sales_order_payment" else None
        if not match:
            views.append(p)
            continue
        key = (p.reference or "", match.group("entry"), p.direction or "inbound")
        view = merged.get(key)
        if view is None:
            view = SimpleNamespace(
                id=p.id,
                payment_number=p.payment_number,
                payment_date=p.payment_date,
                created_at=p.created_at,
                amount=Decimal(str(p.amount or 0)),
                direction=p.direction,
                source_type=p.source_type,
                source_id=p.source_id,
                payment_method=p.payment_method,
                notes=re.sub(r" \((?:advance|refund)\)$", "", p.notes or ""),
            )
            merged[key] = view
            views.append(view)
        else:
            view.amount += Decimal(str(p.amount or 0))
    return views


def _order_locations(db: Session, receivables: list[FinanceReceivable]) -> dict[str, str]:
    """Warehouse name per invoice, for invoices sourced from a sales/commerce
    order. Other source types (manual invoices, returns, etc.) have no single
    warehouse to show."""
    order_ids = {
        r.source_id for r in receivables if r.source_type == "sales_order" and r.source_id
    }
    commerce_ids = {
        r.source_id for r in receivables if r.source_type == "commerce_order" and r.source_id
    }
    locations: dict[str, str] = {}
    if order_ids:
        rows = (
            db.query(SalesOrder.id, InventoryWarehouse.name)
            .join(InventoryWarehouse, InventoryWarehouse.id == SalesOrder.warehouse_id)
            .filter(SalesOrder.id.in_(order_ids))
            .all()
        )
        locations.update({order_id: name for order_id, name in rows})
    if commerce_ids:
        rows = (
            db.query(CommerceOrder.id, InventoryWarehouse.name)
            .join(InventoryWarehouse, InventoryWarehouse.id == CommerceOrder.warehouse_id)
            .filter(CommerceOrder.id.in_(commerce_ids))
            .all()
        )
        locations.update({order_id: name for order_id, name in rows})
    return locations


def ledger(
    db: Session, customer_id: str, *, company_id: str
) -> tuple[list[CustomerLedgerEntryRead], CustomerLedgerSummary]:
    customer = _require_customer(db, customer_id, company_id=company_id)
    allocated = apply_unapplied_payments(db, customer_id)
    if allocated:
        db.commit()

    receivables = _receivables(db, customer_id)
    payments = _payments(db, customer_id)
    order_locations = _order_locations(db, receivables)

    entries: list[CustomerLedgerEntryRead] = []

    for r in receivables:
        # Credit notes (sales returns) are stored as negative receivables and
        # belong in the credit column.
        amount = r.amount or ZERO
        entries.append(
            CustomerLedgerEntryRead(
                id=r.id,
                kind="receivable",
                entry_date=document_date(r.created_at, r.due_date),
                reference=r.invoice_number,
                source_type=r.source_type,
                source_id=r.source_id,
                debit=amount if amount >= 0 else ZERO,
                credit=-amount if amount < 0 else ZERO,
                balance=ZERO,
                due=max(_line_due(r), ZERO),
                status=r.status,
                due_date=r.due_date,
                location=order_locations.get(r.source_id or ""),
                created_at=r.created_at,
            )
        )

    for p in _payment_views(payments):
        amount = p.amount or ZERO
        inbound = p.direction != "outbound"
        entries.append(
            CustomerLedgerEntryRead(
                id=p.id,
                kind="payment",
                entry_date=document_date(p.created_at, p.payment_date),
                reference=p.payment_number,
                source_type=p.source_type,
                source_id=p.source_id,
                debit=ZERO if inbound else amount,
                credit=amount if inbound else ZERO,
                balance=ZERO,
                due=ZERO,
                status="paid",
                notes=p.notes,
                payment_method=p.payment_method,
                created_at=p.created_at,
            )
        )

    billed = sum((r.amount or ZERO for r in receivables), ZERO)
    paid = net_payments(payments, paid_direction="inbound")
    closing = billed - paid
    outstanding = max(closing, ZERO)
    advance = max(-closing, ZERO)
    entries = attach_running_due(entries, closing)

    today = date.today()
    ageing = CustomerLedgerAgeing()
    overdue = ZERO
    open_count = 0
    for r in receivables:
        balance = _line_due(r)
        if balance <= 0:
            continue
        open_count += 1
        if not r.due_date or r.due_date >= today:
            ageing.current += balance
            continue
        overdue += balance
        days = (today - r.due_date).days
        if days <= 30:
            ageing.days_30 += balance
        elif days <= 60:
            ageing.days_60 += balance
        else:
            ageing.days_90_plus += balance

    summary = CustomerLedgerSummary(
        opening_balance=customer.opening_balance or ZERO,
        billed_total=billed,
        paid_total=paid,
        outstanding=outstanding,
        advance=advance,
        overdue=overdue,
        open_bill_count=open_count,
        ageing=ageing,
    )
    return entries, summary


def _next_invoice_number(db: Session, company_id: str) -> str:
    return allocate_invoice_number(db, company_id)


def _next_payment_number(db: Session, company_id: str) -> str:
    return allocate_number(
        db,
        company_id,
        "finance.payment.customer",
        initial=lambda: (
            db.query(func.count(FinancePayment.id))
            .filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == "inbound",
                FinancePayment.payment_number.like("PAY-CUS-%"),
            )
            .scalar()
            or 0
        )
        + 1,
        is_taken=lambda number: db.query(FinancePayment.id)
        .filter(FinancePayment.payment_number == number)
        .first()
        is not None,
    )


def raise_invoice(
    db: Session,
    customer_id: str,
    payload: CustomerInvoiceCreate,
    *,
    company_id: str,
) -> CustomerInvoiceRead:
    _require_customer(db, customer_id, company_id=company_id)
    invoice_date = payload.invoice_date or date.today()
    company = db.get(Company, company_id)
    due = payload.due_date or (invoice_date + timedelta(days=due_days_of(company)))
    reference = (payload.reference or "").strip()
    invoice_number = reference[:64] if reference else _next_invoice_number(db, company_id)
    if reference:
        clash = (
            db.query(FinanceReceivable.id)
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.invoice_number == invoice_number,
            )
            .first()
        )
        if clash:
            invoice_number = f"{invoice_number[:54]}-{_next_invoice_number(db, company_id)[-5:]}"

    rid = str(uuid.uuid4())
    receivable = FinanceReceivable(
        id=rid,
        company_id=company_id,
        customer_id=customer_id,
        source_type=INVOICE_SOURCE_TYPE,
        source_id=rid,
        invoice_number=invoice_number,
        amount=payload.amount,
        amount_paid=ZERO,
        balance=payload.amount,
        tax_amount=ZERO,
        due_date=due,
        status="open",
        posting_status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(receivable)
    db.flush()
    apply_unapplied_payments(db, customer_id)

    from app.services.finance.finance_service import FinanceService

    FinanceService(db).try_post(
        lambda: FinanceService(db).record_customer_invoice(rid),
        source_type=INVOICE_SOURCE_TYPE,
        source_id=rid,
        company_id=company_id,
    )
    db.commit()
    db.refresh(receivable)
    return CustomerInvoiceRead(
        id=receivable.id,
        invoice_number=receivable.invoice_number,
        amount=receivable.amount,
        due_date=receivable.due_date,
        status=receivable.status,
        created_at=receivable.created_at,
    )


def record_payment(
    db: Session,
    customer_id: str,
    payload: CustomerPaymentCreate,
    *,
    company_id: str,
) -> CustomerPaymentRead:
    _require_customer(db, customer_id, company_id=company_id)
    write_off_amount = payload.write_off_amount or ZERO
    if payload.amount <= 0 and write_off_amount <= 0:
        raise HTTPException(status_code=400, detail="Enter a payment amount or a discount/write-off amount")

    payment: Optional[FinancePayment] = None
    if payload.amount > 0:
        payment = FinancePayment(
            company_id=company_id,
            payment_number=_next_payment_number(db, company_id),
            payment_date=payload.payment_date or date.today(),
            amount=payload.amount,
            payment_method=payload.payment_method,
            payment_account_id=payload.payment_account_id,
            direction="inbound",
            source_type=PAYMENT_SOURCE_TYPE,
            source_id=customer_id,
            party_type="customer",
            party_id=customer_id,
            reference=payload.reference,
            notes=payload.notes,
        )
        db.add(payment)

    write_off_payment: Optional[FinancePayment] = None
    if write_off_amount > 0:
        write_off_payment = FinancePayment(
            company_id=company_id,
            payment_number=_next_payment_number(db, company_id),
            payment_date=payload.payment_date or date.today(),
            amount=write_off_amount,
            payment_method="write_off",
            direction="inbound",
            source_type=PAYMENT_SOURCE_TYPE,
            source_id=customer_id,
            party_type="customer",
            party_id=customer_id,
            reference=payload.write_off_reason or "Discount / write-off",
            notes=payload.notes,
        )
        db.add(write_off_payment)
    db.flush()

    from app.services.finance.finance_service import FinanceService, ledger_payment_description

    if payment:
        # Dr cash / bank, Cr AR: the money is in the books, not only on the customer's ledger.
        FinanceService(db).post_ledger_payment_journal(
            payment, counter_code="1100", description=ledger_payment_description(payment)
        )

    # Credit notes settle first so everything applied below is this receipt's money.
    apply_credit_notes(db, customer_id)
    receivables_before = _receivables(db, customer_id)
    paid_before = {r.id: (r.amount_paid or ZERO) for r in receivables_before}

    # Chosen invoices first ("pay dues" picks them), in the order given.
    targets: list[FinanceReceivable] = []
    if payload.receivable_ids:
        by_id = {r.id: r for r in receivables_before}
        for rid in payload.receivable_ids:
            target = by_id.get(rid)
            if not target:
                raise HTTPException(status_code=404, detail="Invoice not found for this customer")
            targets.append(target)
    elif payload.receivable_id:
        target = db.get(FinanceReceivable, payload.receivable_id)
        if not target or target.customer_id != customer_id:
            raise HTTPException(status_code=404, detail="Invoice not found for this customer")
        targets.append(target)

    applied: list[str] = []
    remaining = payload.amount + write_off_amount
    for target in targets:
        if remaining <= 0:
            break
        balance = _line_due(target)
        if balance <= 0:
            continue
        take = min(balance, remaining)
        target.amount_paid = (target.amount_paid or ZERO) + take
        target.balance = balance - take
        target.status = "paid" if target.balance <= 0 else "partial"
        applied.append(target.invoice_number)
        remaining -= take
    # Whatever the chosen invoices could not absorb goes oldest-first, then stays as credit.
    if not targets or remaining > 0:
        for ref in apply_unapplied_payments(db, customer_id):
            if ref and ref not in applied:
                applied.append(ref)

    # What this receipt settled, per invoice — and mirrored into each sales order's
    # Payment history so the order drawer and list show it too.
    voucher = payment or write_off_payment
    account_name: Optional[str] = None
    if voucher and voucher.payment_account_id:
        account = db.get(FinancePaymentAccount, voucher.payment_account_id)
        account_name = account.name if account else None
    allocations: list[CustomerPaymentAllocation] = []
    for r in _receivables(db, customer_id):
        delta = (r.amount_paid or ZERO) - paid_before.get(r.id, ZERO)
        if delta <= 0 or (r.amount or ZERO) <= 0:
            continue
        order_id = r.source_id if r.source_type == "sales_order" else None
        allocations.append(
            CustomerPaymentAllocation(
                receivable_id=r.id, invoice_number=r.invoice_number, order_id=order_id, amount=delta
            )
        )
        if order_id and voucher:
            from app.services.sales.sales_service import SalesService

            SalesService(db).record_ledger_payment(
                order_id,
                amount=delta,
                payment=voucher,
                account_name=account_name,
                label="Due payment" if payment else "Discount / write-off",
            )

    if voucher:
        from app.services.finance.settlement_service import log_allocations

        log_allocations(
            db, company_id=company_id, party_type="customer", party_id=customer_id,
            before=paid_before, docs=_receivables(db, customer_id), payment_id=voucher.id,
        )

    if write_off_payment:
        desc = write_off_payment.reference or "Discount allowed"
        write_off_payment.journal_entry_id = FinanceService(db)._post_journal(
            company_id=company_id,
            entry_date=write_off_payment.payment_date,
            description=desc,
            source_type="customer_payment_writeoff",
            source_id=write_off_payment.id,
            lines=[
                ("4210", write_off_amount, ZERO, desc, "customer", customer_id, ZERO),
                ("1100", ZERO, write_off_amount, desc, "customer", customer_id, ZERO),
            ],
        ).id

    db.commit()
    result = payment or write_off_payment
    assert result is not None
    db.refresh(result)
    return CustomerPaymentRead(
        id=result.id,
        payment_number=result.payment_number,
        payment_date=result.payment_date,
        amount=payload.amount,
        payment_method=result.payment_method,
        reference=result.reference,
        notes=result.notes,
        applied_to=applied,
        allocations=allocations,
        write_off_amount=write_off_amount if write_off_amount > 0 else None,
        created_at=result.created_at,
    )
