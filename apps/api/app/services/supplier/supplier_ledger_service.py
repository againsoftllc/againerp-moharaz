"""Supplier account ledger — payables raised against a supplier and payments made.

Built on the existing FinancePayable / FinancePayment models, so purchase bills
and supplier payments share one source of truth with the rest of finance.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceCheque, FinanceChequeEvent, FinancePayable, FinancePayment
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.models.inventory_warehouse import InventoryWarehouse
from app.services.finance.constants import SOURCE_TYPE_LABELS
from app.services.finance.ledger_running import (
    apply_unapplied_fifo,
    attach_running_due,
    document_date,
    document_due,
    net_payments,
)
from app.schemas.supplier.ledger import (
    SupplierCreditSummary,
    SupplierStatementCheque,
    SupplierStatementLine,
    SupplierStatementOpenOrder,
    SupplierStatementParty,
    SupplierStatementRead,
    SupplierTransactionSummary,
    LedgerAgeing,
    LedgerEntryRead,
    LedgerSummary,
    SupplierPaymentCreate,
    SupplierPaymentRead,
)
from app.services.core.sequence_service import next_number as allocate_number


def list_payments(
    db: Session, supplier_id: str, *, reference: Optional[str] = None
) -> list[SupplierPaymentRead]:
    """Payments made against a supplier, optionally filtered to one PO/bill reference."""
    rows = _payments(db, supplier_id)
    if reference:
        rows = [p for p in rows if p.reference == reference]
    rows.sort(key=lambda p: p.created_at, reverse=True)
    return [
        SupplierPaymentRead(
            id=p.id,
            payment_number=p.payment_number,
            payment_date=p.payment_date,
            amount=p.amount,
            payment_method=p.payment_method,
            reference=p.reference,
            notes=p.notes,
            applied_to=[],
            direction=p.direction or "outbound",
            created_at=p.created_at,
        )
        for p in rows
    ]

ZERO = Decimal("0")
PAYMENT_SOURCE_TYPE = "supplier_payment"


def _line_due(row: FinancePayable) -> Decimal:
    return document_due(row)


def apply_unapplied_payments(db: Session, supplier_id: str) -> list[str]:
    """Allocate leftover supplier payments onto open bills, oldest first."""
    return apply_unapplied_fifo(
        _payables(db, supplier_id),
        _payments(db, supplier_id),
        paid_direction="outbound",
        reference_attr="reference_number",
    )


def _rebuild_bill_allocations(db: Session, supplier_id: str) -> list[str]:
    from app.services.finance.settlement_service import replay_supplier_settlements

    for payable in _payables(db, supplier_id):
        amount = payable.amount or ZERO
        payable.amount_paid = ZERO
        payable.balance = amount
        payable.status = "open" if amount != ZERO else "paid"
    refs = apply_unapplied_payments(db, supplier_id)
    replay_supplier_settlements(db, supplier_id, _payables(db, supplier_id))
    return refs


def _payables(db: Session, supplier_id: str) -> list[FinancePayable]:
    return (
        db.query(FinancePayable)
        .filter(FinancePayable.supplier_id == supplier_id)
        .order_by(FinancePayable.created_at.asc())
        .all()
    )


def _payments(db: Session, supplier_id: str) -> list[FinancePayment]:
    return (
        db.query(FinancePayment)
        .filter(FinancePayment.party_id == supplier_id)
        .order_by(FinancePayment.payment_date.asc(), FinancePayment.created_at.asc())
        .all()
    )


def _po_locations(db: Session, payables: list[FinancePayable]) -> dict[str, str]:
    """Warehouse name per bill. Bills are posted from a purchase receipt (GRN),
    so source_id is the receipt id, not the PO id — resolve through the
    receipt. Other source types (RMA, manual bills, etc.) have no single
    warehouse to show."""
    receipt_ids = {p.source_id for p in payables if p.source_type == "purchase_receipt" and p.source_id}
    if not receipt_ids:
        return {}
    rows = (
        db.query(PurchaseReceipt.id, InventoryWarehouse.name)
        .join(InventoryWarehouse, InventoryWarehouse.id == PurchaseReceipt.warehouse_id)
        .filter(PurchaseReceipt.id.in_(receipt_ids))
        .all()
    )
    return {receipt_id: name for receipt_id, name in rows}


def ledger(db: Session, supplier_id: str) -> tuple[list[LedgerEntryRead], LedgerSummary]:
    allocated = apply_unapplied_payments(db, supplier_id)
    if allocated:
        db.commit()

    payables = _payables(db, supplier_id)
    payments = _payments(db, supplier_id)
    po_locations = _po_locations(db, payables)

    entries: list[LedgerEntryRead] = []

    for p in payables:
        line_due = _line_due(p)
        entries.append(
            LedgerEntryRead(
                id=p.id,
                kind="payable",
                entry_date=document_date(p.created_at, p.due_date),
                reference=p.reference_number,
                source_type=p.source_type,
                source_id=p.source_id,
                debit=p.amount or ZERO,
                credit=ZERO,
                balance=ZERO,
                due=max(line_due, ZERO),
                status=p.status,
                due_date=p.due_date,
                location=po_locations.get(p.source_id or ""),
                created_at=p.created_at,
            )
        )

    for p in payments:
        amount = p.amount or ZERO
        outbound = p.direction != "inbound"
        entries.append(
            LedgerEntryRead(
                id=p.id,
                kind="payment",
                entry_date=document_date(p.created_at, p.payment_date),
                reference=p.payment_number,
                source_type=p.source_type,
                source_id=p.source_id,
                debit=ZERO if outbound else amount,
                credit=amount if outbound else ZERO,
                balance=ZERO,
                due=ZERO,
                status="paid",
                notes=p.notes,
                payment_method=p.payment_method,
                created_at=p.created_at,
            )
        )

    billed = sum((p.amount or ZERO for p in payables), ZERO)
    paid = net_payments(payments, paid_direction="outbound")
    closing = billed - paid
    outstanding = max(closing, ZERO)
    advance = max(-closing, ZERO)
    entries = attach_running_due(entries, closing)

    today = date.today()
    ageing = LedgerAgeing()
    overdue = ZERO
    open_count = 0
    for p in payables:
        balance = _line_due(p)
        if balance <= 0:
            continue
        open_count += 1
        if not p.due_date or p.due_date >= today:
            ageing.current += balance
            continue
        overdue += balance
        days = (today - p.due_date).days
        if days <= 30:
            ageing.days_30 += balance
        elif days <= 60:
            ageing.days_60 += balance
        else:
            ageing.days_90_plus += balance

    supplier = db.get(CommerceSupplier, supplier_id)
    summary = LedgerSummary(
        opening_balance=(supplier.opening_balance if supplier else ZERO) or ZERO,
        billed_total=billed,
        paid_total=paid,
        outstanding=outstanding,
        advance=advance,
        overdue=overdue,
        open_bill_count=open_count,
        ageing=ageing,
    )
    return entries, summary


# ── Supplier statement (OnerERP Reports › Ledger › Supplier, spec §15.6) ─────

OPEN_PO_STATUSES = ("confirmed", "partial_received")

BILL_TYPES = {
    "purchase_receipt": "Purchase",
    "purchase_document": "Purchase",
    "vendor_bill": "Purchase",
    "purchase_return": "Purchase Return",
    "rma": "RMA",
    "rma_settlement": "RMA",
    "manual": "Bill",
}


def credit_days(payment_terms: Optional[str]) -> Optional[int]:
    """"Net 30" → 30, "Due on receipt" → 0, anything without a number → None."""
    text = (payment_terms or "").strip().lower()
    if not text:
        return None
    if "receipt" in text or "immediate" in text or text in ("cod", "cash"):
        return 0
    match = re.search(r"(\d+)", text)
    return int(match.group(1)) if match else None


def _statement_address(raw: Optional[str], country: Optional[str]) -> str:
    try:
        records = json.loads(raw or "[]")
    except (TypeError, ValueError):
        records = []
    first = records[0] if isinstance(records, list) and records and isinstance(records[0], dict) else {}
    parts = [str(first.get(key) or "").strip() for key in ("line1", "line2", "city", "state", "zip")]
    parts.append(str(first.get("country") or country or "").strip())
    return ", ".join(p for p in parts if p)


def statement(
    db: Session, supplier_id: str, *, company_id: str, date_from: date, date_to: date
) -> SupplierStatementRead:
    """One supplier, one period: Opening (master opening + everything before the period), every bill and
    payment as Date · Transaction Type · Particular · Transaction No. · Dr · Cr · Balance, and the Credit
    Limit Summary. Reads the same bills and payments as ``ledger``; Cr raises what we owe, Dr lowers it."""
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="Date from must be on or before date to")
    supplier = (
        db.query(CommerceSupplier)
        .filter(CommerceSupplier.id == supplier_id, CommerceSupplier.company_id == company_id)
        .first()
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    payables = [p for p in _payables(db, supplier_id) if p.status != "void"]
    payments = _payments(db, supplier_id)

    # what each purchase bill came from, for the Particular column
    receipt_ids = [p.source_id for p in payables if p.source_type == "purchase_receipt" and p.source_id]
    receipts: dict[str, tuple[str, Optional[str]]] = {}
    if receipt_ids:
        for rid, grn, po_number in (
            db.query(PurchaseReceipt.id, PurchaseReceipt.receipt_number, PurchaseOrder.po_number)
            .outerjoin(PurchaseOrder, PurchaseOrder.id == PurchaseReceipt.purchase_order_id)
            .filter(PurchaseReceipt.id.in_(receipt_ids))
        ):
            receipts[rid] = (grn, po_number)
    cheque_ids = [p.source_id for p in payments if p.source_type in ("cheque", "cheque_reversal") and p.source_id]
    cheques = {c.id: c for c in db.query(FinanceCheque).filter(FinanceCheque.id.in_(cheque_ids))} if cheque_ids else {}

    events: list[tuple[date, int, str, dict]] = []  # (date, bills before payments, reference, line)
    for bill in payables:
        when = document_date(bill.created_at, bill.due_date)
        amount = bill.amount or ZERO
        debit, credit = (ZERO, amount) if amount >= 0 else (-amount, ZERO)
        kind = BILL_TYPES.get(bill.source_type) or SOURCE_TYPE_LABELS.get(bill.source_type, "Bill")
        if amount < 0 and kind == "Purchase":
            kind = "Purchase Return"
        particular = kind
        if bill.source_type == "purchase_receipt" and bill.source_id in receipts:
            grn, po_number = receipts[bill.source_id]
            particular = f"Purchase Ref. No {po_number}" + (f" · GRN {grn}" if grn else "") if po_number else f"GRN {grn}"
        events.append(
            (
                when,
                0,
                bill.reference_number or "",
                dict(
                    id=bill.id,
                    date=when,
                    transaction_type=kind,
                    particular=particular,
                    transaction_no=bill.reference_number,
                    debit=debit,
                    credit=credit,
                    source_type=bill.source_type,
                    source_id=bill.source_id,
                    journal_entry_id=bill.journal_entry_id,
                    status=bill.status,
                    due_date=bill.due_date,
                ),
            )
        )
    for pay in payments:
        amount = pay.amount or ZERO
        outbound = pay.direction != "inbound"
        debit, credit = (amount, ZERO) if outbound else (ZERO, amount)
        cheque = cheques.get(pay.source_id or "")
        # the cheque's own number: a number fixed on the cheque later is the one the supplier knows
        number = cheque.cheque_number if cheque else pay.reference
        if pay.source_type == "cheque_reversal":
            kind = "Cheque Dishonour"
            particular = f"Cheque {number} returned" + (f" · {cheque.bank_name}" if cheque else "")
        elif pay.source_type == "cheque":
            kind = "Payment"
            particular = f"Cheque {number}" + (f" · {cheque.bank_name} · dated {cheque.cheque_date.isoformat()}" if cheque else "")
        elif not outbound:
            kind = "Refund Received"
            particular = (pay.payment_method or "").replace("_", " ").title() or "Refund"
        else:
            kind = "Payment"
            method = (pay.payment_method or "").replace("_", " ").title() or "Payment"
            particular = method + (f" · {pay.reference}" if pay.reference and pay.reference != pay.payment_number else "")
        events.append(
            (
                pay.payment_date,
                1,
                pay.payment_number or "",
                dict(
                    id=pay.id,
                    date=pay.payment_date,
                    transaction_type=kind,
                    particular=particular,
                    transaction_no=pay.payment_number,
                    debit=debit,
                    credit=credit,
                    source_type=pay.source_type,
                    source_id=pay.source_id,
                    journal_entry_id=pay.journal_entry_id,
                ),
            )
        )
    events.sort(key=lambda e: (e[0], e[1], e[2]))

    opening = supplier.opening_balance or ZERO
    for when, _order, _ref, line in events:
        if when < date_from:
            opening += line["credit"] - line["debit"]

    lines: list[SupplierStatementLine] = []
    running = opening
    total_dr = total_cr = ZERO
    by_type: dict[str, SupplierTransactionSummary] = {}
    for when, _order, _ref, line in events:
        if when < date_from or when > date_to:
            continue
        running += line["credit"] - line["debit"]
        total_dr += line["debit"]
        total_cr += line["credit"]
        lines.append(SupplierStatementLine(**line, balance=running))
        kind = line["transaction_type"]
        bucket = by_type.setdefault(kind, SupplierTransactionSummary(transaction_type=kind, count=0, debit=ZERO, credit=ZERO))
        bucket.count += 1
        bucket.debit += line["debit"]
        bucket.credit += line["credit"]

    # confirmed purchase orders not received yet: a commitment that is not on the ledger
    open_orders: list[SupplierStatementOpenOrder] = []
    unsettled = ZERO
    for order in (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrder.order_date <= date_to,
        )
        .order_by(PurchaseOrder.order_date.asc())
    ):
        remaining = ZERO
        for po_line in db.query(PurchaseOrderLine).filter(PurchaseOrderLine.purchase_order_id == order.id):
            ordered = po_line.quantity_ordered or 0
            left = max(ordered - (po_line.quantity_received or 0), 0)
            if ordered > 0 and left > 0:
                remaining += (po_line.line_total or ZERO) * Decimal(left) / Decimal(ordered)
        remaining = remaining.quantize(Decimal("0.01"))
        if remaining > ZERO:
            unsettled += remaining
            open_orders.append(
                SupplierStatementOpenOrder(
                    id=order.id, po_number=order.po_number, order_date=order.order_date, status=order.status,
                    total=order.total or ZERO, unreceived=remaining,
                )
            )
    # OnerERP's Credit Limit Summary: issued cheques count as paid on the ledger from the day they are written,
    # so the outstanding the supplier really has is the ledger balance plus the cheques not honoured yet.
    pending = _pending_cheques(db, supplier_id, company_id=company_id, as_of=date_to)
    not_treated = sum((c.amount for c in pending if c.status == "issued"), ZERO)
    presented = sum((c.amount for c in pending if c.status == "presented"), ZERO)
    dishonoured = sum((c.amount for c in pending if c.status == "bounced"), ZERO)
    adv_cheque_issued = not_treated + presented
    net_outstanding = running + adv_cheque_issued
    limit = supplier.credit_limit or ZERO
    with_orders = net_outstanding + unsettled

    return SupplierStatementRead(
        supplier=SupplierStatementParty(
            id=supplier.id,
            code=supplier.vendor_code,
            name=supplier.name,
            phone=supplier.phone or "",
            email=supplier.email or "",
            address=_statement_address(supplier.addresses_json, supplier.country),
            country=supplier.country,
            currency=supplier.currency,
            payment_terms=supplier.payment_terms,
        ),
        date_from=date_from,
        date_to=date_to,
        opening_balance=opening,
        lines=lines,
        total_debit=total_dr,
        total_credit=total_cr,
        closing_balance=running,
        transaction_summary=list(by_type.values()),
        credit_summary=SupplierCreditSummary(
            ledger_balance=running,
            adv_cheque_issued=adv_cheque_issued,
            not_treated=not_treated,
            presented=presented,
            dishonoured=dishonoured,
            net_outstanding=net_outstanding,
            unsettled_order_balance=unsettled,
            net_outstanding_with_orders=with_orders,
            credit_limit=limit,
            available_credit=(limit - with_orders) if limit > ZERO else None,
            credit_allowed_days=credit_days(supplier.payment_terms),
            open_orders=open_orders,
        ),
        pending_cheques=pending,
    )


def _pending_cheques(db: Session, supplier_id: str, *, company_id: str, as_of: date) -> list[SupplierStatementCheque]:
    """Issued cheques that were not honoured, cancelled or closed by ``as_of`` — status read from the cheque history
    the same way the cheque reports do, so a back-dated statement shows the cheques as they stood then."""
    from app.services.finance.cheque_report_service import status_as_of

    cheques = (
        db.query(FinanceCheque)
        .filter(
            FinanceCheque.company_id == company_id,
            FinanceCheque.direction == "issued",
            FinanceCheque.party_id == supplier_id,
        )
        .order_by(FinanceCheque.cheque_date.asc(), FinanceCheque.cheque_number.asc())
        .all()
    )
    if not cheques:
        return []
    events: dict[str, list[FinanceChequeEvent]] = {}
    for event in (
        db.query(FinanceChequeEvent)
        .filter(FinanceChequeEvent.cheque_id.in_([c.id for c in cheques]))
        .order_by(FinanceChequeEvent.event_date.asc(), FinanceChequeEvent.created_at.asc())
    ):
        events.setdefault(event.cheque_id, []).append(event)
    bills = {
        p.id: p.reference_number
        for p in db.query(FinancePayable).filter(FinancePayable.id.in_([c.payable_id for c in cheques if c.payable_id]))
    }
    out: list[SupplierStatementCheque] = []
    for cheque in cheques:
        state = status_as_of(events.get(cheque.id, []), as_of)
        if state is None or state[0] not in ("issued", "presented", "bounced"):
            continue
        out.append(
            SupplierStatementCheque(
                id=cheque.id,
                cheque_number=cheque.cheque_number,
                cheque_date=cheque.cheque_date,
                bank_name=cheque.bank_name,
                amount=cheque.amount or ZERO,
                status=state[0],
                status_date=state[1],
                document_number=bills.get(cheque.payable_id or ""),
            )
        )
    return out


def _next_payment_number(db: Session, company_id: str) -> str:
    return allocate_number(
        db,
        company_id,
        "finance.payment.supplier",
        initial=lambda: (
            db.query(func.count(FinancePayment.id))
            .filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == "outbound",
            )
            .scalar()
            or 0
        )
        + 1,
        # Legacy rows already carry some of these numbers.
        is_taken=lambda number: db.query(FinancePayment.id)
        .filter(FinancePayment.payment_number == number)
        .first()
        is not None,
    )


def _record_supplier_refund(
    db: Session,
    supplier_id: str,
    payload: SupplierPaymentCreate,
    *,
    company_id: str,
) -> SupplierPaymentRead:
    """Money coming back from a supplier - the "return due" after goods were returned or an advance was overpaid.

    Posted like any other receipt of money: debit the cash / bank account, credit Accounts Payable (the supplier's account
    goes back toward zero). It settles the supplier's open credit notes (return credits), oldest first, and is limited to what
    the supplier really owes, so a refund can never open a bill the other way round.
    """
    amount = payload.amount
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Enter the amount received back from the supplier")

    payables = _payables(db, supplier_id)
    billed = sum((p.amount or ZERO for p in payables), ZERO)
    paid = net_payments(_payments(db, supplier_id), paid_direction="outbound")
    owed_by_supplier = max(paid - billed, ZERO)
    if amount > owed_by_supplier:
        raise HTTPException(
            status_code=400,
            detail=f"The supplier owes only {owed_by_supplier:.2f}; a refund cannot be more than that.",
        )

    from app.services.finance.finance_service import FinanceService

    reference = payload.reference or "Supplier refund"
    payment, _entry = FinanceService(db).post_party_payment(
        company_id=company_id,
        direction="inbound",
        amount=amount,
        payment_account_id=payload.payment_account_id,
        payment_date=payload.payment_date,
        source_type="supplier_refund",
        source_id=str(uuid.uuid4()),
        counter_code="2100",
        description=f"Refund received from supplier ({reference})",
        party_type="supplier",
        party_id=supplier_id,
        line_party_type="supplier",
        reference=payload.reference,
        notes=payload.notes,
    )

    # the refund settles the return credits (negative bills) it stands for, oldest first
    remaining = amount
    applied: list[str] = []
    for row in payables:
        due = _line_due(row)
        if due >= 0:
            continue
        take = min(-due, remaining)
        row.amount_paid = (row.amount_paid or ZERO) - take
        row.balance = due + take
        row.status = "paid" if row.balance == 0 else "partial"
        applied.append(row.reference_number)
        remaining -= take
        if remaining <= 0:
            break

    db.commit()
    db.refresh(payment)
    return SupplierPaymentRead(
        id=payment.id,
        payment_number=payment.payment_number,
        payment_date=payment.payment_date,
        amount=amount,
        payment_method=payment.payment_method,
        reference=payment.reference,
        notes=payment.notes,
        applied_to=applied,
        direction="inbound",
        created_at=payment.created_at,
    )


def record_payment(
    db: Session,
    supplier_id: str,
    payload: SupplierPaymentCreate,
    *,
    company_id: str,
) -> SupplierPaymentRead:
    """Apply a payment against the supplier's open bills, oldest first.

    Any leftover (advance / overpayment) stays on the account as credit and is
    allocated to the next bill that is posted.
    """
    if payload.direction == "inbound":
        return _record_supplier_refund(db, supplier_id, payload, company_id=company_id)

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
            direction="outbound",
            source_type=PAYMENT_SOURCE_TYPE,
            source_id=supplier_id,
            party_type="supplier",
            party_id=supplier_id,
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
            direction="outbound",
            source_type=PAYMENT_SOURCE_TYPE,
            source_id=supplier_id,
            party_type="supplier",
            party_id=supplier_id,
            reference=payload.write_off_reason or "Discount / write-off",
            notes=payload.notes,
        )
        db.add(write_off_payment)
    db.flush()

    from app.services.finance.finance_service import FinanceService, ledger_payment_description

    if payment:
        # Dr AP, Cr cash / bank: the money leaves the books, not only the supplier's ledger.
        FinanceService(db).post_ledger_payment_journal(
            payment, counter_code="2100", description=ledger_payment_description(payment)
        )

    from app.services.finance.settlement_service import log_allocations, paid_snapshot

    paid_before = paid_snapshot(_payables(db, supplier_id))
    applied: list[str] = []
    if payload.payable_id:
        target = db.get(FinancePayable, payload.payable_id)
        if not target or target.supplier_id != supplier_id:
            raise HTTPException(status_code=404, detail="Payable not found for this supplier")
        remaining = payload.amount + write_off_amount
        balance = _line_due(target)
        if balance > 0:
            take = min(balance, remaining)
            target.amount_paid = (target.amount_paid or ZERO) + take
            target.balance = balance - take
            target.status = "paid" if target.balance <= 0 else "partial"
            applied.append(target.reference_number)
    else:
        applied = apply_unapplied_payments(db, supplier_id)

    log_allocations(
        db, company_id=company_id, party_type="supplier", party_id=supplier_id,
        before=paid_before, docs=_payables(db, supplier_id), payment_id=(payment or write_off_payment).id,
    )

    if write_off_payment:
        desc = write_off_payment.reference or "Discount received"
        write_off_payment.journal_entry_id = FinanceService(db)._post_journal(
            company_id=company_id,
            entry_date=write_off_payment.payment_date,
            description=desc,
            source_type="supplier_payment_writeoff",
            source_id=write_off_payment.id,
            lines=[
                ("2100", write_off_amount, ZERO, desc, "supplier", supplier_id, ZERO),
                ("4110", ZERO, write_off_amount, desc, "supplier", supplier_id, ZERO),
            ],
        ).id

    db.commit()
    result = payment or write_off_payment
    assert result is not None
    db.refresh(result)

    return SupplierPaymentRead(
        id=result.id,
        payment_number=result.payment_number,
        payment_date=result.payment_date,
        amount=payload.amount,
        payment_method=result.payment_method,
        reference=result.reference,
        notes=result.notes,
        applied_to=applied,
        write_off_amount=write_off_amount if write_off_amount > 0 else None,
        created_at=result.created_at,
    )


def delete_payment(db: Session, supplier_id: str, payment_id: str) -> None:
    """Remove a payment and rebuild FIFO allocations from the remaining payments."""
    payment = db.get(FinancePayment, payment_id)
    if payment and payment.party_id == supplier_id and payment.direction == "inbound":
        raise HTTPException(
            status_code=400,
            detail="A refund received from the supplier is posted to the books and cannot be deleted.",
        )
    if not payment or payment.party_id != supplier_id or payment.direction != "outbound":
        raise HTTPException(status_code=404, detail="Payment not found for this supplier")

    if payment.journal_entry_id:
        from app.services.finance.finance_service import FinanceService

        # The posted journal stays; a mirror entry takes the money back into the books.
        FinanceService(db).reverse_journal_entry(
            payment.journal_entry_id,
            company_id=payment.company_id,
            source_type="supplier_payment_reversal",
            source_id=payment.id,
            description=f"Payment {payment.payment_number} deleted",
        )
    from app.models.finance_settlement import FinanceAllocation

    db.query(FinanceAllocation).filter(FinanceAllocation.payment_id == payment.id).delete()
    db.delete(payment)
    db.flush()
    _rebuild_bill_allocations(db, supplier_id)
    db.commit()
