"""Supplier account ledger — payables raised against a supplier and payments made.

Built on the existing FinancePayable / FinancePayment models, so purchase bills
and supplier payments share one source of truth with the rest of finance.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinancePayable, FinancePayment
from app.models.purchase_receipt import PurchaseReceipt
from app.models.inventory_warehouse import InventoryWarehouse
from app.services.finance.ledger_running import (
    apply_unapplied_fifo,
    attach_running_due,
    document_date,
    document_due,
    net_payments,
)
from app.schemas.supplier.ledger import (
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
    for payable in _payables(db, supplier_id):
        amount = payable.amount or ZERO
        payable.amount_paid = ZERO
        payable.balance = amount
        payable.status = "open" if amount != ZERO else "paid"
    return apply_unapplied_payments(db, supplier_id)


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

    if write_off_payment:
        from app.services.finance.finance_service import FinanceService

        desc = write_off_payment.reference or "Discount received"
        FinanceService(db)._post_journal(
            company_id=company_id,
            entry_date=write_off_payment.payment_date,
            description=desc,
            source_type="supplier_payment_writeoff",
            source_id=write_off_payment.id,
            lines=[
                ("2100", write_off_amount, ZERO, desc, "supplier", supplier_id, ZERO),
                ("4110", ZERO, write_off_amount, desc, "supplier", supplier_id, ZERO),
            ],
        )

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
    if not payment or payment.party_id != supplier_id or payment.direction != "outbound":
        raise HTTPException(status_code=404, detail="Payment not found for this supplier")

    db.delete(payment)
    db.flush()
    _rebuild_bill_allocations(db, supplier_id)
    db.commit()
