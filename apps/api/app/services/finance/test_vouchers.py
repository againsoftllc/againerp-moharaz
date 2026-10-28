"""Debit / credit / contra / journal vouchers and templates — in-memory SQLite, real posting."""

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
from app.models.finance import FinanceAccount, FinanceJournalEntry, FinanceJournalLine, FinancePayment, FinancePaymentAccount
from app.models.finance_period import FinancePeriod
from app.models.finance_voucher import FinanceVoucher, FinanceVoucherLine, FinanceVoucherTemplate, FinanceVoucherTemplateLine
from app.schemas.finance_voucher import VoucherCreate, VoucherLineInput, VoucherTemplateCreate, VoucherUpdate
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money
from app.services.finance.voucher_service import VoucherService, check_line_sides

D = Decimal
CO = "default"

TABLES = [
    FinanceAccount.__table__,
    FinancePaymentAccount.__table__,
    FinanceJournalEntry.__table__,
    FinanceJournalLine.__table__,
    FinancePayment.__table__,
    CoreSequence.__table__,
    FinancePeriod.__table__,
    FinanceVoucher.__table__,
    FinanceVoucherLine.__table__,
    FinanceVoucherTemplate.__table__,
    FinanceVoucherTemplateLine.__table__,
]


class LineRuleTests(TestCase):
    def test_journal_must_balance(self):
        with self.assertRaises(HTTPException):
            check_line_sides("journal", [{"debit": "100", "credit": "0"}, {"debit": "0", "credit": "90"}])
        self.assertEqual(
            check_line_sides("journal", [{"debit": "100", "credit": "0"}, {"debit": "0", "credit": "100"}]), (D("100.00"), D("100.00"))
        )

    def test_debit_voucher_lines_only_debit(self):
        with self.assertRaises(HTTPException):
            check_line_sides("debit", [{"debit": "0", "credit": "50"}])
        with self.assertRaises(HTTPException):
            check_line_sides("credit", [{"debit": "50", "credit": "0"}])

    def test_line_cannot_carry_both_sides(self):
        with self.assertRaises(HTTPException):
            check_line_sides("journal", [{"debit": "5", "credit": "5"}, {"debit": "0", "credit": "0"}])


class VoucherTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine)()
        self.fin = FinanceService(self.db)
        self.fin.ensure_accounts(CO)
        self.fin.ensure_payment_accounts(CO)
        self.cash = self.fin.get_default_payment_account(CO)
        self.bank = FinancePaymentAccount(
            company_id=CO, name="City Bank", kind="bank", gl_account_id=self.fin._account_by_code(CO, "1010").id
        )
        self.db.add(self.bank)
        self.db.flush()
        self.svc = VoucherService(self.db)
        accounts = {a.code: a for a in self.db.query(FinanceAccount).all()}
        self.expense = accounts["6000"] if "6000" in accounts else next(a for a in accounts.values() if a.account_type == "expense")
        self.revenue = next(a for a in accounts.values() if a.account_type == "revenue")
        self.equity = next(a for a in accounts.values() if a.account_type == "equity")
        self.ar = accounts["1100"]

    def tearDown(self):
        self.db.close()

    def _bal_id(self, account_id):
        d, c = (
            self.db.query(func.coalesce(func.sum(FinanceJournalLine.debit), 0), func.coalesce(func.sum(FinanceJournalLine.credit), 0))
            .filter(FinanceJournalLine.account_id == account_id)
            .one()
        )
        return money(d) - money(c)

    def _line(self, account, debit="0", credit="0"):
        return VoucherLineInput(account_id=account.id, debit=D(debit), credit=D(credit))

    def test_debit_voucher_approve_and_cancel(self):
        v = self.svc.create(
            VoucherCreate(
                voucher_type="debit", payment_account_id=self.cash.id, description="Office rent October",
                lines=[self._line(self.expense, debit="1500"), self._line(self.equity, debit="500")],
            ),
            company_id=CO, actor="tester",
        )
        self.assertEqual(v.status, "draft")
        self.assertTrue(v.voucher_number.startswith("DV-"))
        self.assertEqual(v.amount, D("2000.00"))
        self.assertEqual(self.fin.get_payment_account_balance(self.cash), self.cash.opening_balance)  # a draft moves nothing

        self.svc.approve(v, actor="checker")
        self.assertEqual(v.status, "approved")
        self.assertEqual(self._bal_id(self.expense.id), D("1500.00"))
        self.assertEqual(self._bal_id(self.cash.gl_account_id), D("-2000.00"))
        self.assertEqual(self.fin.get_payment_account_balance(self.cash), self.cash.opening_balance - D("2000"))

        with self.assertRaises(HTTPException):
            self.svc.update(v, VoucherUpdate(description="changed"))  # posted vouchers are never edited

        self.svc.cancel(v, actor="checker", reason="Wrong month")
        self.assertEqual(v.status, "cancelled")
        self.assertEqual(self._bal_id(self.expense.id), D("0.00"))
        self.assertEqual(self._bal_id(self.cash.gl_account_id), D("0.00"))
        self.assertEqual(self.fin.get_payment_account_balance(self.cash), self.cash.opening_balance)

    def test_credit_voucher_debits_the_bank(self):
        v = self.svc.create(
            VoucherCreate(voucher_type="credit", payment_account_id=self.bank.id, lines=[self._line(self.revenue, credit="300")]),
            company_id=CO, actor=None,
        )
        self.svc.approve(v, actor=None)
        self.assertEqual(self._bal_id(self.bank.gl_account_id), D("300.00"))
        self.assertEqual(self._bal_id(self.revenue.id), D("-300.00"))
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("300.00"))

    def test_contra_moves_cash_to_bank(self):
        v = self.svc.create(
            VoucherCreate(voucher_type="contra", payment_account_id=self.cash.id, to_payment_account_id=self.bank.id, amount=D("700")),
            company_id=CO, actor=None,
        )
        self.assertTrue(v.voucher_number.startswith("CON-"))
        self.svc.approve(v, actor=None)
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("700.00"))
        self.assertEqual(self._bal_id(self.bank.gl_account_id), D("700.00"))
        with self.assertRaises(HTTPException):
            self.svc.create(
                VoucherCreate(voucher_type="contra", payment_account_id=self.cash.id, to_payment_account_id=self.cash.id, amount=D("1")),
                company_id=CO, actor=None,
            )

    def test_journal_rules(self):
        v = self.svc.create(
            VoucherCreate(voucher_type="journal", lines=[self._line(self.expense, debit="90"), self._line(self.equity, credit="90")]),
            company_id=CO, actor=None,
        )
        self.svc.approve(v, actor=None)
        self.assertEqual(self._bal_id(self.expense.id), D("90.00"))
        self.assertEqual(self.db.query(FinancePayment).count(), 0)  # a journal moves no cash

        for bad in (
            [self._line(self.expense, debit="90"), self._line(self.equity, credit="80")],  # not balanced
            [self._line(self.ar, debit="90"), self._line(self.equity, credit="90")],  # AR belongs to the party ledgers
            [self._line(self.expense, debit="90"), VoucherLineInput(account_id=self.cash.gl_account_id, credit=D("90"))],  # cash head
        ):
            with self.assertRaises(HTTPException):
                self.svc.create(VoucherCreate(voucher_type="journal", lines=bad), company_id=CO, actor=None)

    def test_draft_can_be_deleted_and_edited(self):
        v = self.svc.create(
            VoucherCreate(voucher_type="debit", payment_account_id=self.cash.id, lines=[self._line(self.expense, debit="10")]),
            company_id=CO, actor=None,
        )
        self.svc.update(v, VoucherUpdate(lines=[self._line(self.expense, debit="25")]))
        self.assertEqual(v.amount, D("25.00"))
        self.svc.delete(v)
        self.assertEqual(self.db.query(FinanceVoucher).count(), 0)
        self.assertEqual(self.db.query(FinanceVoucherLine).count(), 0)

    def test_template_keeps_lines_with_or_without_amounts(self):
        t = self.svc.create_template(
            VoucherTemplateCreate(
                name="Monthly rent", voucher_type="debit", payment_account_id=self.cash.id,
                lines=[self._line(self.expense), self._line(self.equity, debit="100")],
            ),
            company_id=CO,
        )
        self.assertEqual(len(self.svc.template_lines(t.id)), 2)
        with self.assertRaises(HTTPException):
            self.svc.create_template(VoucherTemplateCreate(name="monthly RENT", voucher_type="debit"), company_id=CO)
        self.svc.delete_template(t)
        self.assertEqual(self.db.query(FinanceVoucherTemplateLine).count(), 0)
