"""Cheque treatment (re-present, close, bulk), cheque reports and the supplier statement —
in-memory SQLite, real FinanceService posting."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.crm  # noqa: F401
import app.models.inventory_warehouse  # noqa: F401
from app.database import Base
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
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
from app.models.finance_cheque_book import FinanceChequeBook, FinanceChequeLeaf
from app.models.finance_period import FinancePeriod
from app.models.party import Party
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.services.finance.cheque_report_service import cheque_register, status_as_of
from app.services.finance.cheque_service import ChequeService, available_actions, next_status
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money
from app.services.supplier.supplier_ledger_service import credit_days, statement as supplier_statement

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
    FinanceChequeBook.__table__,
    FinanceChequeLeaf.__table__,
    CoreSequence.__table__,
    FinancePeriod.__table__,
    Party.__table__,
    CommerceSupplier.__table__,
    CommerceCustomer.__table__,
    PurchaseOrder.__table__,
    PurchaseOrderLine.__table__,
    PurchaseReceipt.__table__,
]


class PureTests(TestCase):
    def test_dishonoured_cheque_can_go_back_or_close(self):
        self.assertEqual(available_actions("bounced"), ["represent", "close"])
        self.assertEqual(next_status("represent", "bounced"), "deposited")
        self.assertEqual(next_status("represent", "bounced", "issued"), "presented")
        self.assertEqual(next_status("close", "bounced", "issued"), "cancelled")
        with self.assertRaises(ValueError):
            next_status("represent", "cleared")

    def test_credit_days(self):
        self.assertEqual(credit_days("Net 30"), 30)
        self.assertEqual(credit_days("Due on receipt"), 0)
        self.assertIsNone(credit_days(""))


class Fixture(TestCase):
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

    def _received(self, number="C-1", amount="400"):
        return self.svc.create(
            company_id=CO, direction="received", party_id="cust1", bank_name="ABC Bank", cheque_number=number,
            cheque_date=date.today(), amount=D(amount), receivable_id=self.rec.id,
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


class RepresentTests(Fixture):
    def test_received_cheque_bounces_twice_and_every_bounce_posts(self):
        ch = self._received()
        self._act(ch, "deposit", payment_account_id=self.bank.id)
        self._act(ch, "bounce", note="Insufficient funds")
        self.assertEqual(self.rec.balance, D("1000"))
        self.assertEqual(self._bal("1160"), D("0"))

        self._act(ch, "represent")  # same bank as before
        self.assertEqual(ch.status, "deposited")
        self.assertEqual(self._bal("1160"), D("400"))
        self.assertEqual(self._bal("1100"), D("-400"))
        self.assertEqual(self.rec.balance, D("600"))  # pays the invoice again

        self._act(ch, "bounce")  # the second bounce must post, not reuse the first reversal
        self.assertEqual(self._bal("1160"), D("0"))
        self.assertEqual(self._bal("1100"), D("0"))
        self.assertEqual(self.rec.balance, D("1000"))
        self.assertEqual(
            self.db.query(FinanceJournalEntry).filter(FinanceJournalEntry.source_type == "cheque_reversal").count(), 2,
        )

        self._act(ch, "represent")
        self._act(ch, "clear")
        self.assertEqual(ch.status, "cleared")
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("400"))
        self.assertEqual(self.rec.balance, D("600"))
        self.assertEqual(len(self.svc.journal_entry_ids(ch)), 7)  # record, deposit, bounce, represent, bounce, represent, clear
        self._assert_books_balance()

    def test_issued_cheque_represented_then_honoured(self):
        ch = self._issued()
        self._act(ch, "bounce", payment_account_id=self.bank.id, bank_charge=D("20"))
        self.assertEqual(self.pay.balance, D("800"))
        self._act(ch, "represent")
        self.assertEqual(ch.status, "presented")
        self.assertEqual(self._bal("2150"), D("-300"))
        self.assertEqual(self.pay.balance, D("500"))
        self._act(ch, "bounce", payment_account_id=self.bank.id, bank_charge=D("15"))
        self.assertEqual(ch.bank_charge, D("35"))  # both penalties kept
        self._act(ch, "close", note="Paid by replacement cheque")
        self.assertEqual(ch.status, "cancelled")
        self.assertEqual(self.pay.balance, D("800"))  # closing posts nothing, the supplier is still owed
        self.assertEqual(self._bal("2150"), D("0"))
        self._assert_books_balance()

    def test_represent_into_a_settled_invoice_leaves_the_rest_unapplied(self):
        ch = self._received(amount="400")
        self._act(ch, "deposit", payment_account_id=self.bank.id)
        self._act(ch, "bounce")
        self.fin._apply_payment_to_receivable(self.rec, D("800"))  # paid most of it some other way
        self._act(ch, "represent")
        self.assertEqual(self.rec.balance, D("0"))
        self.assertEqual(self.rec.status, "paid")
        self._assert_books_balance()


class BulkTests(Fixture):
    def test_bulk_reports_each_cheque_and_keeps_the_good_ones(self):
        a = self._received("C-1", "100")
        b = self._received("C-2", "200")
        c = self._issued("I-1", "300")  # an issued cheque cannot be deposited
        results = self.svc.apply_bulk([a.id, b.id, c.id, a.id], "deposit", company_id=CO, payment_account_id=self.bank.id)
        self.assertEqual([r["ok"] for r in results], [True, True, False])
        self.assertIn("Cannot deposit", results[2]["error"])
        self.assertEqual(self._bal("1160"), D("300"))
        self.assertEqual(c.status, "issued")
        self._assert_books_balance()

    def test_bulk_clear_of_issued_cheques_needs_a_bank(self):
        c = self._issued("I-1", "300")
        results = self.svc.apply_bulk([c.id], "clear", company_id=CO)
        self.assertFalse(results[0]["ok"])  # no bank on the cheque and none chosen
        results = self.svc.apply_bulk([c.id], "clear", company_id=CO, payment_account_id=self.bank.id)
        self.assertTrue(results[0]["ok"])
        self.assertEqual(self.fin.get_payment_account_balance(self.bank), D("-300"))

    def test_bulk_rejects_empty_and_unknown(self):
        with self.assertRaises(HTTPException):
            self.svc.apply_bulk([], "deposit", company_id=CO)
        with self.assertRaises(HTTPException):
            self.svc.apply_bulk(["x"], "explode", company_id=CO)


class ReportTests(Fixture):
    def test_position_as_of_and_gl_reconciliation(self):
        yesterday = date.today() - timedelta(days=1)
        ch = self._received("C-1", "400")
        self._act(ch, "deposit", payment_account_id=self.bank.id)
        issued = self._issued("I-1", "300")
        self._act(issued, "present")

        report = cheque_register(self.db, company_id=CO, view="in_hand")
        self.assertEqual([r["status"] for r in report["rows"]], ["deposited"])
        recon = {r["account_code"]: r for r in report["totals"]["reconciliation"]}
        self.assertEqual(recon["1160"]["difference"], D("0"))
        self.assertEqual(recon["1160"]["register"], D("400"))

        report = cheque_register(self.db, company_id=CO, view="issued")
        self.assertEqual(report["totals"]["amount"], D("300"))
        self.assertEqual(report["totals"]["reconciliation"][0]["difference"], D("0"))

        self.assertEqual(cheque_register(self.db, company_id=CO, view="status", as_of=yesterday)["rows"], [])

        self._act(ch, "bounce", note="Signature differs")
        bounced = cheque_register(self.db, company_id=CO, view="bounced")
        self.assertEqual(bounced["rows"][0]["reason"], "Signature differs")
        self.assertEqual(bounced["rows"][0]["outcome"], "Still dishonoured")
        party = cheque_register(self.db, company_id=CO, view="party")
        cust = next(r for r in party["rows"] if r["party_id"] == "cust1")
        self.assertEqual((cust["count"], cust["dishonoured_count"], cust["bounce_rate"]), (1, 1, 100.0))
        history = cheque_register(self.db, company_id=CO, view="history")
        self.assertEqual([r["action"] for r in history["rows"] if r["cheque_id"] == ch.id], ["record", "deposit", "bounce"])

    def test_status_as_of_ignores_later_events(self):
        ch = self._received()
        events = self.svc.events(ch.id)
        self.assertEqual(status_as_of(events, date.today()), ("received", date.today()))
        self.assertIsNone(status_as_of(events, date.today() - timedelta(days=1)))


class SupplierStatementTests(Fixture):
    def setUp(self):
        super().setUp()
        self.supplier = CommerceSupplier(
            id="sup1", company_id=CO, party_id="p1", vendor_code="SUP-001", name="Acme Traders", phone="0171",
            payment_terms="Net 45", opening_balance=D("100"), credit_limit=D("5000"),
            addresses_json='[{"line1": "12 Road", "city": "Dhaka"}]',
        )
        self.db.add(self.supplier)
        self.db.flush()

    def test_opening_lines_total_and_credit_summary(self):
        today = date.today()
        ch = self._issued("I-1", "300")
        self._act(ch, "bounce", note="Stopped")
        self.db.add(
            FinancePayment(
                company_id=CO, payment_number="PAY-1", payment_date=today, amount=D("200"), payment_method="cash",
                direction="outbound", source_type="supplier_payment", source_id="x", party_type="supplier", party_id="sup1",
            )
        )
        po = PurchaseOrder(company_id=CO, po_number="PO-9", supplier_id="sup1", warehouse_id="w1", status="confirmed", order_date=today, total=D("1000"))
        self.db.add(po)
        self.db.flush()
        self.db.add(PurchaseOrderLine(purchase_order_id=po.id, item_id="i1", supplier_id="sup1", quantity_ordered=10, quantity_received=4, line_total=D("1000")))
        self.db.flush()

        st = supplier_statement(self.db, "sup1", company_id=CO, date_from=today - timedelta(days=30), date_to=today)
        self.assertEqual(st.supplier.code, "SUP-001")
        self.assertEqual(st.supplier.address, "12 Road, Dhaka, Bangladesh")
        self.assertEqual(sorted(line.transaction_type for line in st.lines), ["Bill", "Cheque Dishonour", "Payment", "Payment"])
        # opening 100 + bill 800 − cheque 300 + dishonour 300 − cash 200
        self.assertEqual(st.closing_balance, D("700"))
        self.assertEqual(st.lines[-1].balance, D("700"))
        self.assertEqual(st.total_credit - st.total_debit + st.opening_balance, D("700"))
        cs = st.credit_summary
        self.assertEqual(cs.unsettled_order_balance, D("600"))
        self.assertEqual(cs.net_outstanding_with_orders, D("1300"))
        self.assertEqual(cs.available_credit, D("3700"))
        self.assertEqual(cs.credit_allowed_days, 45)

        later = supplier_statement(self.db, "sup1", company_id=CO, date_from=today + timedelta(days=1), date_to=today + timedelta(days=2))
        self.assertEqual(later.opening_balance, D("700"))  # everything before the period rolls into the opening
        self.assertEqual(later.lines, [])

    def test_unknown_supplier_and_bad_range(self):
        with self.assertRaises(HTTPException):
            supplier_statement(self.db, "nope", company_id=CO, date_from=date.today(), date_to=date.today())
        with self.assertRaises(HTTPException):
            supplier_statement(self.db, "sup1", company_id=CO, date_from=date.today(), date_to=date.today() - timedelta(days=1))


class EditTests(Fixture):
    def test_renumbering_a_cheque_renames_its_ledger_lines(self):
        ch = self._received("C-1", "400")
        self.svc.update_details(ch.id, company_id=CO, cheque_number="C-100", bank_name="City Bank")
        payment = self.db.get(FinancePayment, ch.payment_id)
        self.assertEqual(payment.reference, "C-100")
        self.assertEqual(payment.notes, "Cheque C-100 · City Bank")


class DateOrderTests(Fixture):
    def test_a_treatment_cannot_be_dated_before_the_last_one(self):
        ch = self._received("C-1", "400")
        later = date.today() + timedelta(days=2)
        self._act(ch, "deposit", payment_account_id=self.bank.id, action_date=later)
        with self.assertRaises(HTTPException):
            self._act(ch, "cancel", action_date=date.today())
        self._act(ch, "cancel")  # no date given: lands on the deposit's day, not before it
        cancel = next(e for e in self.svc.events(ch.id) if e.action == "cancel")
        self.assertEqual(cancel.event_date, later)
        deposit = next(e for e in self.svc.events(ch.id) if e.action == "deposit")
        self.assertGreaterEqual(cancel.event_date, deposit.event_date)  # the as-on reports read events in date order


class SupplierCreditSummaryTests(SupplierStatementTests):
    def test_oner_credit_limit_summary(self):
        today = date.today()
        bounced = self._issued("I-1", "300")
        self._act(bounced, "bounce")  # back on the ledger already: shown, not deducted again
        self._issued("I-2", "200")  # not treated
        presented = self._issued("I-3", "100")
        self._act(presented, "present")
        honoured = self._issued("I-4", "50")
        self._act(honoured, "clear", payment_account_id=self.bank.id)

        st = supplier_statement(self.db, "sup1", company_id=CO, date_from=today - timedelta(days=30), date_to=today)
        cs = st.credit_summary
        # opening 100 + bill 800 − 300 + 300 (dishonour) − 200 − 100 − 50 = 550 we owe
        self.assertEqual(cs.ledger_balance, D("550"))
        self.assertEqual((cs.not_treated, cs.presented, cs.dishonoured), (D("200"), D("100"), D("300")))
        self.assertEqual(cs.adv_cheque_issued, D("300"))
        self.assertEqual(cs.net_outstanding, D("850"))  # the two cheques the bank hasn't paid yet are still owed
        self.assertEqual(cs.net_outstanding_with_orders, D("850"))
        self.assertEqual(sorted(c.cheque_number for c in st.pending_cheques), ["I-1", "I-2", "I-3"])

        before = supplier_statement(self.db, "sup1", company_id=CO, date_from=today - timedelta(days=30), date_to=today - timedelta(days=1))
        self.assertEqual(before.pending_cheques, [])  # none were written yet on that day
