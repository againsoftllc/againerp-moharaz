"""Customer / supplier ledger payments post to the GL (Dr cash, Cr AR; Dr AP, Cr cash) — in-memory SQLite, real posting."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase

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
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.models.finance_period import FinancePeriod
from app.models.finance_settlement import FinanceAllocation
from app.models.party import Party
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.schemas.customer_ledger import CustomerPaymentCreate
from app.schemas.supplier.ledger import SupplierPaymentCreate
from app.services.customer import customer_ledger_service
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money
from app.services.supplier import supplier_ledger_service

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
    CoreSequence.__table__,
    FinancePeriod.__table__,
    FinanceAllocation.__table__,
    Party.__table__,
    CommerceSupplier.__table__,
    CommerceCustomer.__table__,
    PurchaseOrder.__table__,
    PurchaseOrderLine.__table__,
    PurchaseReceipt.__table__,
]


class LedgerPaymentPostingTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine)()
        self.fin = FinanceService(self.db)
        self.fin.ensure_accounts(CO)
        self.bank = FinancePaymentAccount(
            company_id=CO, name="City Bank", kind="bank", gl_account_id=self.fin._account_by_code(CO, "1010").id
        )
        self.db.add_all(
            [
                self.bank,
                CommerceCustomer(
                    id="cust1", company_id=CO, party_id="p1", customer_code="C-1", name="Rahim", customer_since=date.today()
                ),
                CommerceSupplier(id="sup1", company_id=CO, party_id="p2", vendor_code="S-1", name="Acme", phone="0171"),
                FinanceReceivable(
                    company_id=CO, customer_id="cust1", source_type="manual", source_id="inv1", invoice_number="INV-1",
                    amount=D("1000"), balance=D("1000"),
                ),
                FinancePayable(
                    company_id=CO, supplier_id="sup1", source_type="manual", source_id="bill1", reference_number="BILL-1",
                    amount=D("800"), balance=D("800"),
                ),
            ]
        )
        self.db.flush()

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

    def test_customer_receipt_posts_cash_and_ar(self):
        customer_ledger_service.record_payment(
            self.db,
            "cust1",
            CustomerPaymentCreate(amount=D("1200"), payment_method="bank", payment_account_id=self.bank.id),
            company_id=CO,
        )
        payment = self.db.query(FinancePayment).filter(FinancePayment.source_type == "customer_payment").one()
        self.assertIsNotNone(payment.journal_entry_id)
        self.assertEqual(self._bal("1010"), D("1200"))
        self.assertEqual(self._bal("1100"), D("-1200"))  # 1000 settles INV-1, 200 sits as the customer's advance

    def test_supplier_payment_posts_and_delete_reverses(self):
        supplier_ledger_service.record_payment(
            self.db,
            "sup1",
            SupplierPaymentCreate(amount=D("500"), payment_method="bank", payment_account_id=self.bank.id),
            company_id=CO,
        )
        payment = self.db.query(FinancePayment).filter(FinancePayment.source_type == "supplier_payment").one()
        self.assertEqual(self._bal("2100"), D("500"))
        self.assertEqual(self._bal("1010"), D("-500"))

        supplier_ledger_service.delete_payment(self.db, "sup1", payment.id)
        self.assertEqual(self._bal("2100"), D("0"))
        self.assertEqual(self._bal("1010"), D("0"))
        self.assertEqual(
            self.db.query(FinanceJournalEntry).filter(FinanceJournalEntry.source_type == "supplier_payment_reversal").count(), 1
        )

    def test_write_off_links_its_journal(self):
        customer_ledger_service.record_payment(
            self.db,
            "cust1",
            CustomerPaymentCreate(amount=D("0"), write_off_amount=D("50"), write_off_reason="Rounding"),
            company_id=CO,
        )
        write_off = self.db.query(FinancePayment).filter(FinancePayment.payment_method == "write_off").one()
        self.assertIsNotNone(write_off.journal_entry_id)
        self.assertEqual(self._bal("1100"), D("-50"))

    def test_posting_is_idempotent(self):
        payment = FinancePayment(
            company_id=CO, payment_number="PAY-X", payment_date=date.today(), amount=D("70"), payment_method="cash",
            direction="inbound", source_type="customer_payment", source_id="cust1", party_type="customer", party_id="cust1",
        )
        self.db.add(payment)
        self.db.flush()
        first = self.fin.post_ledger_payment_journal(payment, counter_code="1100", description="x")
        second = self.fin.post_ledger_payment_journal(payment, counter_code="1100", description="x")
        self.assertEqual(first.id, second.id)
        self.assertIsNotNone(payment.payment_account_id)  # no account given: the cash account is chosen and kept
        self.assertEqual(self._bal("1100"), D("-70"))
