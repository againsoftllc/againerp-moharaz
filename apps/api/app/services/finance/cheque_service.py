"""Cheque lifecycle on top of the existing finance engine.

No separate ledger: every event posts through ``FinanceService._post_journal`` (period lock,
numbering, balance checks) and the party ledger keeps working off ``FinancePayment`` rows.

Posting pattern (A/R side shown; A/P mirrors it)::

    record   Dr 1150 Cheques in Hand          Cr 1100 Accounts Receivable   (+ FinancePayment, no bank)
    deposit  Dr 1160 Cheques Under Collection Cr 1150 Cheques in Hand
    clear    Dr Bank (payment account GL)     Cr 1160                       (payment now hits the bank)
    bounce   Dr 1100 Accounts Receivable      Cr 1160 / 1150                (+ reversing FinancePayment)

    issue    Dr 2100 Accounts Payable         Cr 2150 Cheques Issued
    clear    Dr 2150                          Cr Bank
    bounce   Dr 2150                          Cr 2100

The cheque's ``FinancePayment`` has no payment account until clearance, so the bank balance and
the cash-flow report only move on the clearing event.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.finance import (
    FinanceAccount,
    FinanceCheque,
    FinanceChequeEvent,
    FinancePayable,
    FinancePayment,
    FinanceReceivable,
)
from app.services.finance.constants import (
    AP_CODE,
    AR_CODE,
    BANK_CHARGES_CODE,
    CHEQUES_IN_HAND_CODE,
    CHEQUES_ISSUED_CODE,
    CHEQUES_UNDER_COLLECTION_CODE,
)
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money

ZERO = Decimal("0")

DIRECTIONS = ("received", "issued")
CHEQUE_STATUSES = ("received", "issued", "deposited", "presented", "cleared", "bounced", "cancelled")

# action -> {current status: new status}. Anything not listed is rejected.
TRANSITIONS: dict[str, dict[str, str]] = {
    "deposit": {"received": "deposited"},
    "present": {"issued": "presented"},
    "clear": {"deposited": "cleared", "issued": "cleared", "presented": "cleared"},
    "bounce": {"deposited": "bounced", "issued": "bounced", "presented": "bounced"},
    "cancel": {"received": "cancelled", "issued": "cancelled", "deposited": "cancelled", "presented": "cancelled"},
}

# GL accounts the cheque flow depends on: code -> (expected type, label). Missing or repurposed
# accounts stop the posting with a clear message instead of silently using the wrong ledger.
REQUIRED_ACCOUNTS = {
    CHEQUES_IN_HAND_CODE: ("asset", "Cheques in Hand"),
    CHEQUES_UNDER_COLLECTION_CODE: ("asset", "Cheques Under Collection"),
    CHEQUES_ISSUED_CODE: ("liability", "Cheques Issued (Payable)"),
    AR_CODE: ("asset", "Accounts Receivable"),
    AP_CODE: ("liability", "Accounts Payable"),
}


def next_status(action: str, current: str) -> str:
    """Pure transition lookup — raises ValueError when the action is not valid for ``current``."""
    try:
        return TRANSITIONS[action][current]
    except KeyError:
        raise ValueError(f"Cannot {action} a cheque that is {current}") from None


def available_actions(status: str) -> list[str]:
    return [action for action, moves in TRANSITIONS.items() if status in moves]


def build_receipt_lines(direction: str, amount: Decimal, party_id: str, number: str) -> list[tuple]:
    desc = f"Cheque {number}"
    if direction == "received":
        return [
            (CHEQUES_IN_HAND_CODE, amount, ZERO, desc, "customer", party_id, ZERO),
            (AR_CODE, ZERO, amount, desc, "customer", party_id, ZERO),
        ]
    return [
        (AP_CODE, amount, ZERO, desc, "supplier", party_id, ZERO),
        (CHEQUES_ISSUED_CODE, ZERO, amount, desc, "supplier", party_id, ZERO),
    ]


def build_clearance_lines(direction: str, amount: Decimal, bank_gl: str, party_id: str, number: str) -> list[tuple]:
    desc = f"Cheque {number} cleared"
    if direction == "received":
        return [
            (bank_gl, amount, ZERO, desc, "customer", party_id, ZERO),
            (CHEQUES_UNDER_COLLECTION_CODE, ZERO, amount, desc, "customer", party_id, ZERO),
        ]
    return [
        (CHEQUES_ISSUED_CODE, amount, ZERO, desc, "supplier", party_id, ZERO),
        (bank_gl, ZERO, amount, desc, "supplier", party_id, ZERO),
    ]


def build_reversal_lines(
    direction: str, amount: Decimal, holding_code: str, party_id: str, number: str, label: str,
) -> list[tuple]:
    """Mirror of the receipt posting. ``holding_code`` is where the cheque sits right now."""
    desc = f"Cheque {number} {label}"
    if direction == "received":
        return [
            (AR_CODE, amount, ZERO, desc, "customer", party_id, ZERO),
            (holding_code, ZERO, amount, desc, "customer", party_id, ZERO),
        ]
    return [
        (CHEQUES_ISSUED_CODE, amount, ZERO, desc, "supplier", party_id, ZERO),
        (AP_CODE, ZERO, amount, desc, "supplier", party_id, ZERO),
    ]


class ChequeService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._fin = FinanceService(db)

    # ── Reads ────────────────────────────────────────────────────────────────

    def get(self, cheque_id: str, *, company_id: str, lock: bool = False) -> FinanceCheque:
        query = self._db.query(FinanceCheque).filter(
            FinanceCheque.id == cheque_id, FinanceCheque.company_id == company_id,
        )
        if lock:
            query = query.with_for_update()
        cheque = query.first()
        if not cheque:
            raise HTTPException(status_code=404, detail="Cheque not found")
        return cheque

    def list(
        self,
        *,
        company_id: str,
        direction: Optional[str] = None,
        status: Optional[str] = None,
        party_id: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> tuple[list[FinanceCheque], int]:
        query = self._db.query(FinanceCheque).filter(FinanceCheque.company_id == company_id)
        if direction:
            query = query.filter(FinanceCheque.direction == direction)
        if status:
            query = query.filter(FinanceCheque.status == status)
        if party_id:
            query = query.filter(FinanceCheque.party_id == party_id)
        total = query.count()
        rows = (
            query.order_by(FinanceCheque.cheque_date.desc(), FinanceCheque.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def events(self, cheque_id: str) -> list[FinanceChequeEvent]:
        return (
            self._db.query(FinanceChequeEvent)
            .filter(FinanceChequeEvent.cheque_id == cheque_id)
            .order_by(FinanceChequeEvent.created_at.asc(), FinanceChequeEvent.id.asc())
            .all()
        )

    # ── Create ───────────────────────────────────────────────────────────────

    def create(
        self,
        *,
        company_id: str,
        direction: str,
        party_id: str,
        bank_name: str,
        cheque_number: str,
        cheque_date: date,
        amount: Decimal,
        receivable_id: Optional[str] = None,
        payable_id: Optional[str] = None,
        notes: Optional[str] = None,
        actor: Optional[str] = None,
        leaf_id: Optional[str] = None,
    ) -> FinanceCheque:
        if direction not in DIRECTIONS:
            raise HTTPException(status_code=400, detail="Direction must be received or issued")
        books = leaf = None
        if leaf_id:
            # an issued cheque taken from a cheque book: the leaf gives its number, the book its bank
            if direction != "issued":
                raise HTTPException(status_code=400, detail="Only an issued cheque can use a cheque book leaf")
            from app.services.finance.cheque_book_service import ChequeBookService

            books = ChequeBookService(self._db)
            leaf, book = books.take_leaf(leaf_id, company_id=company_id)
            cheque_number, bank_name = leaf.cheque_number, book.bank_name
        bank_name = (bank_name or "").strip()
        cheque_number = (cheque_number or "").strip()
        if not bank_name or not cheque_number:
            raise HTTPException(status_code=400, detail="Bank name and cheque number are required")
        amount = money(amount)
        if amount <= ZERO:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero")

        duplicate = (
            self._db.query(FinanceCheque.id)
            .filter(
                FinanceCheque.company_id == company_id,
                FinanceCheque.direction == direction,
                func.lower(FinanceCheque.bank_name) == bank_name.lower(),
                func.lower(FinanceCheque.cheque_number) == cheque_number.lower(),
                FinanceCheque.status != "cancelled",
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=409, detail=f"Cheque {cheque_number} from {bank_name} is already recorded",
            )

        party_type = "customer" if direction == "received" else "supplier"
        if direction == "received":
            if payable_id:
                raise HTTPException(status_code=400, detail="A received cheque can only be linked to an invoice")
            receivable = self._lock_receivable(receivable_id, party_id, company_id, amount) if receivable_id else None
            payable = None
        else:
            if receivable_id:
                raise HTTPException(status_code=400, detail="An issued cheque can only be linked to a bill")
            payable = self._lock_payable(payable_id, party_id, company_id, amount) if payable_id else None
            receivable = None
        self._require_accounts(company_id)

        cheque = FinanceCheque(
            company_id=company_id,
            direction=direction,
            cheque_number=cheque_number,
            bank_name=bank_name,
            cheque_date=cheque_date,
            amount=amount,
            status=direction,
            party_type=party_type,
            party_id=party_id,
            receivable_id=receivable.id if receivable else None,
            payable_id=payable.id if payable else None,
            notes=(notes or "").strip() or None,
            created_by=actor,
        )
        self._db.add(cheque)
        self._db.flush()
        if books is not None and leaf is not None:
            books.attach_cheque(leaf, cheque)

        entry_date = date.today()
        entry = self._fin._post_journal(
            company_id=company_id,
            entry_date=entry_date,
            description=f"Cheque {cheque_number} {direction}",
            source_type="cheque_receipt",
            source_id=cheque.id,
            lines=build_receipt_lines(direction, amount, party_id, cheque_number),
        )
        cheque.receipt_journal_entry_id = entry.id

        payment = FinancePayment(
            company_id=company_id,
            payment_number=self._fin._next_payment_number(company_id),
            payment_date=entry_date,
            amount=amount,
            payment_method="cheque",
            payment_account_id=None,  # bank untouched until clearance
            direction="inbound" if direction == "received" else "outbound",
            source_type="cheque",
            source_id=cheque.id,
            party_type=party_type,
            party_id=party_id,
            journal_entry_id=entry.id,
            reference=cheque_number,
            notes=f"Cheque {cheque_number} · {bank_name}",
        )
        self._db.add(payment)
        self._db.flush()
        cheque.payment_id = payment.id

        if receivable:
            self._fin._apply_payment_to_receivable(receivable, amount)
        if payable:
            self._fin._apply_payment_to_payable(payable, amount)

        self._log(cheque, "record", None, cheque.status, entry_date, entry.id, actor)
        self._db.flush()
        return cheque

    # ── Edit (details only) ──────────────────────────────────────────────────

    def update_details(
        self,
        cheque_id: str,
        *,
        company_id: str,
        bank_name: Optional[str] = None,
        cheque_number: Optional[str] = None,
        cheque_date: Optional[date] = None,
        notes: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> FinanceCheque:
        """Fix typos in bank / number / date / notes. Money, party and invoice are posted, so changing
        them means cancelling the cheque and recording a new one."""
        cheque = self.get(cheque_id, company_id=company_id, lock=True)
        if cheque.status in ("cleared", "bounced", "cancelled"):
            raise HTTPException(status_code=409, detail=f"A {cheque.status} cheque cannot be edited")
        from app.models.finance_cheque_book import FinanceChequeLeaf

        if self._db.query(FinanceChequeLeaf.id).filter(FinanceChequeLeaf.cheque_id == cheque.id).first() is not None and (
            (bank_name is not None and bank_name.strip() != cheque.bank_name)
            or (cheque_number is not None and cheque_number.strip() != cheque.cheque_number)
        ):
            raise HTTPException(
                status_code=409,
                detail="This cheque was taken from a cheque book, so its number and bank follow the book. Cancel it and issue another leaf instead.",
            )
        new_bank = (bank_name if bank_name is not None else cheque.bank_name).strip()
        new_number = (cheque_number if cheque_number is not None else cheque.cheque_number).strip()
        if not new_bank or not new_number:
            raise HTTPException(status_code=400, detail="Bank name and cheque number are required")
        duplicate = (
            self._db.query(FinanceCheque.id)
            .filter(
                FinanceCheque.company_id == company_id,
                FinanceCheque.id != cheque.id,
                FinanceCheque.direction == cheque.direction,
                func.lower(FinanceCheque.bank_name) == new_bank.lower(),
                func.lower(FinanceCheque.cheque_number) == new_number.lower(),
                FinanceCheque.status != "cancelled",
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail=f"Cheque {new_number} from {new_bank} is already recorded")
        changes = []
        if new_bank != cheque.bank_name:
            changes.append(f"bank {cheque.bank_name} → {new_bank}")
        if new_number != cheque.cheque_number:
            changes.append(f"number {cheque.cheque_number} → {new_number}")
        if cheque_date is not None and cheque_date != cheque.cheque_date:
            changes.append(f"date {cheque.cheque_date} → {cheque_date}")
            cheque.cheque_date = cheque_date
        if notes is not None and (notes.strip() or None) != cheque.notes:
            changes.append("notes")
            cheque.notes = notes.strip() or None
        cheque.bank_name = new_bank
        cheque.cheque_number = new_number
        if changes:
            self._log(cheque, "edit", cheque.status, cheque.status, date.today(), None, actor, "Changed " + ", ".join(changes))
        self._db.flush()
        return cheque

    # ── Status actions ───────────────────────────────────────────────────────

    def apply_action(
        self,
        cheque_id: str,
        action: str,
        *,
        company_id: str,
        action_date: Optional[date] = None,
        payment_account_id: Optional[str] = None,
        bank_charge: Decimal = ZERO,
        note: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> FinanceCheque:
        cheque = self.get(cheque_id, company_id=company_id, lock=True)
        try:
            new_status = next_status(action, cheque.status)
        except (ValueError, KeyError) as exc:
            # Repeating an action lands here too — the cheque has already moved on.
            raise HTTPException(status_code=409, detail=str(exc)) from None

        when = action_date or date.today()
        bank_charge = money(bank_charge or 0)
        if bank_charge < ZERO:
            raise HTTPException(status_code=400, detail="Bank charge cannot be negative")
        if bank_charge > ZERO and action != "bounce":
            raise HTTPException(status_code=400, detail="Bank charge can only be recorded when a cheque bounces")
        old_status = cheque.status
        self._require_accounts(company_id)
        entry_id: Optional[str] = None

        if action == "deposit":
            account = self._bank_account(company_id, payment_account_id)
            cheque.payment_account_id = account.id
            entry = self._fin._post_journal(
                company_id=company_id,
                entry_date=when,
                description=f"Cheque {cheque.cheque_number} deposited — {account.name}",
                source_type="cheque_deposit",
                source_id=cheque.id,
                lines=[
                    (CHEQUES_UNDER_COLLECTION_CODE, cheque.amount, ZERO, f"Cheque {cheque.cheque_number}", "customer", cheque.party_id, ZERO),
                    (CHEQUES_IN_HAND_CODE, ZERO, cheque.amount, f"Cheque {cheque.cheque_number}", "customer", cheque.party_id, ZERO),
                ],
            )
            cheque.deposit_journal_entry_id = entry_id = entry.id

        elif action == "present":
            pass  # issued cheque handed to the supplier / presented — no ledger movement

        elif action == "clear":
            account = self._bank_account(company_id, payment_account_id or cheque.payment_account_id)
            cheque.payment_account_id = account.id
            gl_code = self._fin._payment_account_gl_code(account)
            entry = self._fin._post_journal(
                company_id=company_id,
                entry_date=when,
                description=f"Cheque {cheque.cheque_number} cleared — {account.name}",
                source_type="cheque_clearance",
                source_id=cheque.id,
                lines=build_clearance_lines(cheque.direction, cheque.amount, gl_code, cheque.party_id, cheque.cheque_number),
            )
            cheque.clearance_journal_entry_id = entry_id = entry.id
            # The cheque payment now reaches the bank — only from this point does balance move.
            payment = self._db.get(FinancePayment, cheque.payment_id) if cheque.payment_id else None
            if payment is not None:
                payment.payment_account_id = account.id
                payment.payment_date = when
                payment.journal_entry_id = entry.id

        elif action in ("bounce", "cancel"):
            holding = self._holding_code(cheque)
            label = "bounced" if action == "bounce" else "cancelled"
            entry = self._fin._post_journal(
                company_id=company_id,
                entry_date=when,
                description=f"Cheque {cheque.cheque_number} {label}",
                source_type="cheque_reversal",
                source_id=cheque.id,
                lines=build_reversal_lines(
                    cheque.direction, cheque.amount, holding, cheque.party_id, cheque.cheque_number, label,
                ),
            )
            cheque.reversal_journal_entry_id = entry_id = entry.id
            self._reverse_settlement(cheque, when, entry.id, label)
            if bank_charge > ZERO:
                self._post_bank_charge(cheque, bank_charge, when, payment_account_id)

        cheque.status = new_status
        self._log(cheque, action, old_status, new_status, when, entry_id, actor, note)
        self._db.flush()
        return cheque

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _holding_code(self, cheque: FinanceCheque) -> str:
        if cheque.direction == "issued":
            return CHEQUES_ISSUED_CODE
        return CHEQUES_UNDER_COLLECTION_CODE if cheque.status == "deposited" else CHEQUES_IN_HAND_CODE

    def _reverse_settlement(self, cheque: FinanceCheque, when: date, entry_id: str, label: str) -> None:
        """Take the cheque out of the party ledger and give the invoice/bill its balance back."""
        original = self._db.get(FinancePayment, cheque.payment_id) if cheque.payment_id else None
        reversal = FinancePayment(
            company_id=cheque.company_id,
            payment_number=self._fin._next_payment_number(cheque.company_id),
            payment_date=when,
            amount=cheque.amount,
            payment_method="cheque",
            payment_account_id=None,
            direction="outbound" if cheque.direction == "received" else "inbound",
            source_type="cheque_reversal",
            source_id=cheque.id,
            party_type=cheque.party_type,
            party_id=cheque.party_id,
            journal_entry_id=entry_id,
            reference=cheque.cheque_number,
            notes=f"Cheque {cheque.cheque_number} {label}"
            + (f" (reverses {original.payment_number})" if original else ""),
        )
        self._db.add(reversal)

        if cheque.receivable_id:
            receivable = self._db.get(FinanceReceivable, cheque.receivable_id)
            if receivable is not None and receivable.status != "void":
                receivable.amount_paid = max((receivable.amount_paid or ZERO) - cheque.amount, ZERO)
                receivable.balance = max(receivable.amount - receivable.amount_paid, ZERO)
                receivable.status = "partial" if receivable.amount_paid > ZERO else "open"
        if cheque.payable_id:
            payable = self._db.get(FinancePayable, cheque.payable_id)
            if payable is not None and payable.status != "void":
                payable.amount_paid = max((payable.amount_paid or ZERO) - cheque.amount, ZERO)
                payable.balance = max(payable.amount - payable.amount_paid, ZERO)
                payable.status = "partial" if payable.amount_paid > ZERO else "open"

    def _post_bank_charge(
        self, cheque: FinanceCheque, charge: Decimal, when: date, payment_account_id: Optional[str],
    ) -> None:
        account = self._bank_account(cheque.company_id, payment_account_id or cheque.payment_account_id)
        gl_code = self._fin._payment_account_gl_code(account)
        entry = self._fin._post_journal(
            company_id=cheque.company_id,
            entry_date=when,
            description=f"Bank charge — cheque {cheque.cheque_number}",
            source_type="cheque_bank_charge",
            source_id=cheque.id,
            lines=[
                (BANK_CHARGES_CODE, charge, ZERO, f"Bank charge — cheque {cheque.cheque_number}", None, None, ZERO),
                (gl_code, ZERO, charge, f"Bank charge — cheque {cheque.cheque_number}", None, None, ZERO),
            ],
        )
        self._db.add(
            FinancePayment(
                company_id=cheque.company_id,
                payment_number=self._fin._next_payment_number(cheque.company_id),
                payment_date=when,
                amount=charge,
                payment_method="bank",
                payment_account_id=account.id,
                direction="outbound",
                source_type="cheque_bank_charge",
                source_id=cheque.id,
                journal_entry_id=entry.id,
                reference=cheque.cheque_number,
                notes=f"Bank charge — cheque {cheque.cheque_number}",
            )
        )
        cheque.bank_charge = charge
        cheque.bank_charge_journal_entry_id = entry.id
        cheque.payment_account_id = account.id

    def _bank_account(self, company_id: str, account_id: Optional[str]):
        if not account_id:
            raise HTTPException(status_code=400, detail="Choose the bank account")
        account = self._fin.get_payment_account(account_id, company_id=company_id)
        if account.kind != "bank" or not account.is_active:
            raise HTTPException(status_code=400, detail="Choose an active bank account")
        return account

    def _lock_receivable(self, receivable_id: str, party_id: str, company_id: str, amount: Decimal) -> FinanceReceivable:
        receivable = (
            self._db.query(FinanceReceivable)
            .filter(FinanceReceivable.id == receivable_id, FinanceReceivable.company_id == company_id)
            .with_for_update()
            .first()
        )
        if not receivable:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if receivable.customer_id != party_id:
            raise HTTPException(status_code=400, detail="Invoice belongs to a different customer")
        if receivable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Invoice is already settled")
        if amount > money(receivable.balance):
            raise HTTPException(status_code=400, detail="Cheque amount exceeds the invoice's outstanding balance")
        return receivable

    def _lock_payable(self, payable_id: str, party_id: str, company_id: str, amount: Decimal) -> FinancePayable:
        payable = (
            self._db.query(FinancePayable)
            .filter(FinancePayable.id == payable_id, FinancePayable.company_id == company_id)
            .with_for_update()
            .first()
        )
        if not payable:
            raise HTTPException(status_code=404, detail="Bill not found")
        if payable.supplier_id != party_id:
            raise HTTPException(status_code=400, detail="Bill belongs to a different supplier")
        if payable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Bill is already settled")
        if amount > money(payable.balance):
            raise HTTPException(status_code=400, detail="Cheque amount exceeds the bill's outstanding balance")
        return payable

    def _require_accounts(self, company_id: str) -> None:
        self._fin.ensure_accounts(company_id)
        rows = {
            row.code: row
            for row in self._db.query(FinanceAccount).filter(
                FinanceAccount.company_id == company_id, FinanceAccount.code.in_(list(REQUIRED_ACCOUNTS)),
            )
        }
        problems = []
        for code, (account_type, label) in REQUIRED_ACCOUNTS.items():
            row = rows.get(code)
            if row is None:
                problems.append(f"{code} {label} is missing")
            elif row.account_type != account_type or not row.is_active:
                problems.append(f"{code} must be an active {account_type} account ({label})")
        if problems:
            raise HTTPException(
                status_code=409,
                detail="Cheque accounts are not configured in the Chart of accounts: " + "; ".join(problems),
            )

    def _log(
        self,
        cheque: FinanceCheque,
        action: str,
        from_status: Optional[str],
        to_status: str,
        when: date,
        entry_id: Optional[str],
        actor: Optional[str],
        note: Optional[str] = None,
    ) -> None:
        self._db.add(
            FinanceChequeEvent(
                cheque_id=cheque.id,
                action=action,
                from_status=from_status,
                to_status=to_status,
                event_date=when,
                journal_entry_id=entry_id,
                actor=actor,
                note=(note or "").strip() or None,
            )
        )
