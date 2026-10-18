"""Cheque lifecycle + accounting — in-memory SQLite, real FinanceService posting."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.crm  # noqa: F401
from app.database import Base
from app.models.core_sequence import CoreSequence
from app.models.finance import (
    FinanceAccount,
    FinanceCheque,
    FinanceChequeEvent,
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.models.finance_period import FinancePeriod
from app.services.finance.cheque_service import (
    ChequeService,
    available_actions,
    build_clearance_lines,
    build_receipt_lines,
    next_status,
)
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import journal_lines_balance, money

D = Decimal
CO = "default"

TABLES = [
    FinanceAccount.__table__,
    FinancePaymentAccount.__table__,
    FinanceJournalEntry.__table__,
    FinanceJournalLine.__table__,
    FinancePayment.__table__,
    FinanceReceivable.__table__,
    FinancePayable.__table__,
    FinanceCheque.__table__,
    FinanceChequeEvent.__table__,
    CoreSequence.__table__,
    FinancePeriod.__table__,
]


class PureTests(TestCase):
    def test_transitions(self):
        self.assertEqual(next_status("deposit", "received"), "deposited")
        self.assertEqual(next_status("clear", "deposited"), "cleared")
        self.assertEqual(next_status("clear", "issued"), "cleared")
        for action, status in [
            ("clear", "received"),  # received cheque cannot clear before deposit
            ("deposit", "cleared"),
            ("bounce", "received"),
            ("cancel", "cleared"),
            ("clear", "bounced"),
            ("clear", "cancelled"),
        ]:
            with self.assertRaises(ValueError):
                next_status(action, status)

    def test_available_actions(self):
        self.assertEqual(available_actions("received"), ["deposit", "cancel"])
        self.assertEqual(available_actions("deposited"), ["clear", "bounce", "cancel"])
        self.assertEqual(available_actions("cleared"), [])

    def test_lines_balance(self):
        for direction in ("received", "issued"):
            self.assertTrue(journal_lines_balance([l[:7] for l in build_receipt_lines(direction, D("10"), "p", "1")]))
            self.assertTrue(journal_lines_balance([l[:7] for l in build_clearance_lines(direction, D("10"), "1010", "p", "1")]))


class ChequeServiceTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine)()
        self.fin = FinanceService(self.db)
        self.svc = ChequeService(self.db)
        self.fin.ensure_accounts(CO)
        bank_gl = self.fin._account_by_code(CO, "1010")
        self.bank = FinancePaymentAccount(company_id=CO, name="City Bank", kind="bank", gl_account_id=bank_gl.id)
        self.db.add(self.bank)
        self.rec = FinanceReceivable(
            company_id=CO, customer_id="cust1", source_type="manual", source_id="inv1", invoice_number="INV-1",
            amount=D("1000"), balance=D("1000"),
        )
        self.pay = FinancePayable(
            company_id=CO, supplier_id="sup1", source_type="manual", source_id="bill1", reference_number="BILL-1",
            amount=D("800"), balance=D("800"),
        )
        self.db.add_all([self.rec, self.pay])
        self.db.flush()

    def tearDown(self):
        self.db.close()

    # helpers
    def _received(self, number="C-1", amount="400", **kw):
        return self.svc.create(
            company_id=CO, direction="received", party_id="cust1", bank_name="ABC Bank", cheque_number=number,
            cheque_date=date.today(), amount=D(amount), receivable_id=kw.pop("receivable_id", self.rec.id), **kw,
        )

    def _issued(self, number="I-1", amount="300"):
        return self.svc.create(
            company_id=CO, direction="issued", party_id="sup1", bank_name="My Bank", cheque_number=number,
            cheque_date=date.today(), amount=D(amount), payable_id=self.pay.id,
        )

    def _act(self, cheque, action, **kw):
        return self.svc.apply_action(cheque.id, action, company_id=CO, **kw)

    def _bal(self, code):
        acc = self.fin._account_by_code(CO, code)
        d, c = (
            self.db.query(func.coalesce(func.sum(FinanceJournalLine.debit), 0), func.coalesce(func.sum(FinanceJournalLine.credit), 0))
            .filter(FinanceJournalLine.account_id == acc.id)
            .one()
        )
        return money(d) - money(c)

    def _assert_books_balance(self):
        d, c = self.db.query(func.sum(FinanceJournalLine.debit), func.sum(FinanceJournalLine.credit)).one()
        self.assertEqual(money(d), money(c))

    # received
    def test_received_full_cycle(self):
        ch = self._received()
        self.assertEqual(ch.status, "received")
        self.assertEqual(self._bal("1150"), D("400"))
        self.assertEqual(self._bal("1100"), D("-400"))
        self.assertEqual(self.rec.amount_paid, D("400"))
        self.assertEqual(self.rec.balance, D("600"))
        self.assertEqual(self.rec.status, "partial")
        # bank untouched
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("0"))

        self._act(ch, "deposit", payment_account_id=self.bank.id)
        self.assertEqual(self._bal("1150"), D("0"))
        self.assertEqual(self._bal("1160"), D("400"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("0"))  # deposited ≠ cleared

        self._act(ch, "clear")
        self.assertEqual(ch.status, "cleared")
        self.assertEqual(self._bal("1160"), D("0"))
        self.assertEqual(self._bal("1010"), D("400"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("400"))
        self._assert_books_balance()

    def test_repeat_actions_rejected_and_no_duplicate_entries(self):
        ch = self._received()
        self._act(ch, "deposit", payment_account_id=self.bank.id)
        with self.assertRaises(HTTPException) as ctx:
            self._act(ch, "deposit", payment_account_id=self.bank.id)
        self.assertEqual(ctx.exception.status_code, 409)
        self._act(ch, "clear")
        with self.assertRaises(HTTPException):
            self._act(ch, "clear")
        count = self.db.query(FinanceJournalEntry).filter(FinanceJournalEntry.source_id == ch.id).count()
        self.assertEqual(count, 3)  # receipt, deposit, clearance — once each
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("400"))

    def test_cannot_clear_before_deposit(self):
        ch = self._received()
        with self.assertRaises(HTTPException):
            self._act(ch, "clear", payment_account_id=self.bank.id)

    def test_bounce_after_deposit_restores_receivable(self):
        ch = self._received()
        self._act(ch, "deposit", payment_account_id=self.bank.id)
        self._act(ch, "bounce", bank_charge=D("25"))
        self.assertEqual(ch.status, "bounced")
        self.assertEqual(self.rec.amount_paid, D("0"))
        self.assertEqual(self.rec.balance, D("1000"))
        self.assertEqual(self.rec.status, "open")
        self.assertEqual(self._bal("1100"), D("0"))
        self.assertEqual(self._bal("1160"), D("0"))
        self.assertEqual(self._bal("1150"), D("0"))
        self.assertEqual(self._bal("6170"), D("25"))
        self.assertEqual(self._bal("1010"), D("-25"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("-25"))
        # net party payments zero → ledger sees no payment
        net = sum(
            (p.amount if p.direction == "inbound" else -p.amount)
            for p in self.db.query(FinancePayment).filter(FinancePayment.party_id == "cust1")
        )
        self.assertEqual(net, D("0"))
        # history kept, no deletes
        self.assertEqual(self.db.query(FinanceChequeEvent).filter_by(cheque_id=ch.id).count(), 3)
        with self.assertRaises(HTTPException):
            self._act(ch, "clear")
        self._assert_books_balance()

    def test_cancel_received_reverses_and_blocks_after_deposit(self):
        ch = self._received()
        self._act(ch, "cancel")
        self.assertEqual(self._bal("1150"), D("0"))
        self.assertEqual(self._bal("1100"), D("0"))
        self.assertEqual(self.rec.balance, D("1000"))
        # a cancelled cheque frees its number, so the correct entry can be recorded again
        again = self._received(number=ch.cheque_number)
        self.assertEqual(again.status, "received")
        # entered by mistake after deposit: cancel reverses from Cheques Under Collection
        self._act(again, "deposit", payment_account_id=self.bank.id)
        self._act(again, "cancel")
        self.assertEqual(self._bal("1160"), D("0"))
        self.assertEqual(self._bal("1100"), D("0"))
        self.assertEqual(self.rec.balance, D("1000"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("0"))
        # a cleared cheque can no longer be cancelled
        ch3 = self._received(number="C-3")
        self._act(ch3, "deposit", payment_account_id=self.bank.id)
        self._act(ch3, "clear")
        with self.assertRaises(HTTPException):
            self._act(ch3, "cancel")

    def test_validation(self):
        with self.assertRaises(HTTPException):
            self._received(amount="1000.01")  # exceeds balance
        with self.assertRaises(HTTPException):
            self._received(amount="0")
        ch = self._received()
        with self.assertRaises(HTTPException) as ctx:
            self._received(number=ch.cheque_number.lower())  # duplicate, case-insensitive
        self.assertEqual(ctx.exception.status_code, 409)
        with self.assertRaises(HTTPException):
            self.svc.create(
                company_id=CO, direction="received", party_id="other", bank_name="B", cheque_number="X",
                cheque_date=date.today(), amount=D("5"), receivable_id=self.rec.id,
            )
        with self.assertRaises(HTTPException):
            self._act(ch, "deposit")  # bank account required
        self.assertIsNone(self.svc.get(ch.id, company_id=CO).payment_account_id)
        with self.assertRaises(HTTPException):
            self.svc.get(ch.id, company_id="another-company")

    def test_same_invoice_cannot_be_overpaid_by_two_cheques(self):
        self._received(number="A", amount="700")
        with self.assertRaises(HTTPException):
            self._received(number="B", amount="400")  # only 300 left
        self._received(number="C", amount="300")
        self.assertEqual(self.rec.status, "paid")

    def test_unlinked_received_cheque_credits_receivable_account(self):
        ch = self._received(receivable_id=None, amount="50")
        self.assertIsNone(ch.receivable_id)
        self.assertEqual(self._bal("1100"), D("-50"))

    # issued
    def test_issued_cycle(self):
        ch = self._issued()
        self.assertEqual(self._bal("2100"), D("300"))
        self.assertEqual(self._bal("2150"), D("-300"))
        self.assertEqual(self.pay.balance, D("500"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("0"))
        self._act(ch, "present")
        self._act(ch, "clear", payment_account_id=self.bank.id)
        self.assertEqual(self._bal("2150"), D("0"))
        self.assertEqual(self._bal("1010"), D("-300"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("-300"))
        self._assert_books_balance()

    def test_issued_bounce_restores_payable(self):
        ch = self._issued()
        self._act(ch, "bounce")
        self.assertEqual(self.pay.balance, D("800"))
        self.assertEqual(self.pay.status, "open")
        self.assertEqual(self._bal("2100"), D("0"))
        self.assertEqual(self._bal("2150"), D("0"))

    def test_missing_account_configuration_blocks_posting(self):
        acc = self.fin._account_by_code(CO, "1160")
        acc.is_active = False
        self.db.flush()
        with self.assertRaises(HTTPException) as ctx:
            self._received()
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("1160", ctx.exception.detail)

    def test_edit_details(self):
        ch = self._received()
        a = self._received(number="C-2", amount="100")
        self.svc.update_details(ch.id, company_id=CO, bank_name="Other Bank", notes="fixed typo")
        self.assertEqual(ch.bank_name, "Other Bank")
        self.assertEqual(ch.amount, D("400"))
        with self.assertRaises(HTTPException) as ctx:
            self.svc.update_details(a.id, company_id=CO, bank_name="Other Bank", cheque_number=ch.cheque_number)
        self.assertEqual(ctx.exception.status_code, 409)
        self._act(ch, "cancel")
        with self.assertRaises(HTTPException):
            self.svc.update_details(ch.id, company_id=CO, notes="x")
