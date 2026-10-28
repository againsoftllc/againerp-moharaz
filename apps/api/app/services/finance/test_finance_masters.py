"""Finance masters: group accounts, check balance, banks / branches / bank ledgers, opening balances — in-memory SQLite."""

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
from app.models.finance import FinanceAccount, FinanceJournalEntry, FinanceJournalLine, FinancePayable, FinancePayment, FinancePaymentAccount
from app.models.finance_master import FinanceBank, FinanceBankBranch, FinanceOpeningBatch, FinanceOpeningLine
from app.models.finance_period import FinancePeriod
from app.services.finance import master_service as masters
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money

D = Decimal
CO = "default"


class FinanceMasterTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            engine,
            tables=[
                FinanceAccount.__table__, FinancePaymentAccount.__table__, FinanceJournalEntry.__table__,
                FinanceJournalLine.__table__, FinancePayment.__table__, FinancePayable.__table__, CoreSequence.__table__,
                FinancePeriod.__table__, FinanceBank.__table__, FinanceBankBranch.__table__, FinanceOpeningBatch.__table__,
                FinanceOpeningLine.__table__,
            ],
        )
        self.db: Session = sessionmaker(bind=engine)()
        self.fin = FinanceService(self.db)
        self.fin.ensure_accounts(CO)
        self.fin.ensure_payment_accounts(CO)

    def tearDown(self):
        self.db.close()

    def _bal(self, code):
        acc = self.fin._account_by_code(CO, code)
        d, c = (
            self.db.query(func.coalesce(func.sum(FinanceJournalLine.debit), 0), func.coalesce(func.sum(FinanceJournalLine.credit), 0))
            .filter(FinanceJournalLine.account_id == acc.id)
            .one()
        )
        return money(d) - money(c)

    def test_group_account_takes_no_postings(self):
        group = self.fin.create_account(company_id=CO, code="6900", name="Misc", account_type="expense", is_postable=False)
        with self.assertRaises(HTTPException):
            self.fin._post_journal(
                company_id=CO, entry_date=date.today(), description="x", source_type="manual", source_id="m1",
                lines=[("6900", D("5"), D("0"), "x", None, None, D("0")), ("1000", D("0"), D("5"), "x", None, None, D("0"))],
            )
        with self.assertRaises(HTTPException):
            self.fin.update_account(self.fin._account_by_code(CO, "1000"), is_postable=False)  # system accounts stay postable
        self.fin.update_account(group, is_postable=True)

    def test_levels(self):
        rows = self.fin.list_accounts(CO)
        levels = masters.account_levels(rows)
        child = next(r for r in rows if r.parent_id)
        self.assertEqual(levels[child.id], levels[child.parent_id] + 1)

    def test_check_balance_blocks_paying_out_too_much(self):
        cash = self.fin.get_default_payment_account(CO)
        cash.check_balance = True
        cash.opening_balance = D("100")
        payable = FinancePayable(company_id=CO, supplier_id="s1", source_type="manual", source_id="b1", reference_number="B-1", amount=D("500"), balance=D("500"))
        self.db.add(payable)
        self.db.flush()
        with self.assertRaises(HTTPException) as caught:
            self.fin.settle_payable(payable, amount=D("150"), payment_account_id=cash.id)
        self.assertIn("cannot pay out", caught.exception.detail)
        self.fin.settle_payable(payable, amount=D("100"), payment_account_id=cash.id)  # exactly what it holds
        cash.check_balance = False
        self.fin.settle_payable(payable, amount=D("50"), payment_account_id=cash.id)  # off: may go negative

    def test_banks_branches_and_own_ledger(self):
        banks = masters.list_banks(self.db, CO)
        self.assertGreater(len(banks), 50)  # seeded once
        city = next(b for b in banks if b.name == "City Bank")
        branch = masters.save_branch(self.db, CO, bank_id=city.id, name="Gulshan", routing_number="225261725")
        with self.assertRaises(HTTPException):
            masters.save_branch(self.db, CO, bank_id=city.id, name="gulshan")  # same branch twice
        with self.assertRaises(HTTPException):
            masters.save_branch(self.db, CO, bank_id=city.id, name="Banani", routing_number="22A")
        account = self.fin.create_payment_account(
            company_id=CO, name="City Bank Gulshan", kind="bank", bank_branch_id=branch.id, account_number="1234567890"
        )
        gl = self.db.get(FinanceAccount, account.gl_account_id)
        self.assertEqual(gl.code, "1011")
        self.assertEqual(self.db.get(FinanceAccount, gl.parent_id).code, "1010")
        self.assertEqual(masters.bank_label(self.db, account), "City Bank · Gulshan")
        second = self.fin.create_payment_account(company_id=CO, name="Second", kind="bank")
        self.assertEqual(self.db.get(FinanceAccount, second.gl_account_id).code, "1012")

    def test_opening_batch_posts_once_with_the_difference_to_equity(self):
        furniture = self.fin.create_account(company_id=CO, code="1550", name="Furniture", account_type="asset")
        loan = self.fin.create_account(company_id=CO, code="2550", name="Bank loan", account_type="liability")
        batch = masters.save_batch(
            self.db, CO, batch=None, as_of_date=date(2026, 1, 1), note="Go-live", actor="t",
            lines=[{"account_id": furniture.id, "debit": "50000"}, {"account_id": loan.id, "credit": "20000"}],
        )
        with self.assertRaises(HTTPException):  # AR comes from the customers
            masters.save_batch(self.db, CO, batch=batch, as_of_date=date(2026, 1, 1), note=None, actor="t",
                               lines=[{"account_id": self.fin._account_by_code(CO, "1100").id, "debit": "1"}])
        masters.finalize_batch(self.db, self.fin, batch, actor="t")
        self.assertEqual(batch.status, "finalized")
        self.assertEqual(self._bal("1550"), D("50000.00"))
        self.assertEqual(self._bal("2550"), D("-20000.00"))
        self.assertEqual(self._bal("3900"), D("-30000.00"))
        with self.assertRaises(HTTPException):
            masters.finalize_batch(self.db, self.fin, batch, actor="t")
        with self.assertRaises(HTTPException):
            masters.save_batch(self.db, CO, batch=batch, as_of_date=date(2026, 1, 1), note=None, actor="t", lines=[])
        with self.assertRaises(HTTPException):
            masters.delete_batch(self.db, batch)
