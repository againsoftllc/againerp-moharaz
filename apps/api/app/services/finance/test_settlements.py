"""Bill-wise settlement and "Settled by" — in-memory SQLite."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
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
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.models.finance_period import FinancePeriod
from app.models.finance_settlement import FinanceAllocation, FinanceSettlement
from app.models.party import Party
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.models.sales import SalesOrder
from app.schemas.customer_ledger import CustomerPaymentCreate
from app.schemas.finance_settlement import SettlementDocumentListResponse
from app.schemas.supplier.ledger import SupplierPaymentCreate
from app.services.customer import customer_ledger_service
from app.services.finance.finance_service import FinanceService
from app.services.finance.settlement_service import SettlementService, plan_moves
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
    FinanceCheque.__table__,
    FinanceAllocation.__table__,
    FinanceSettlement.__table__,
    CoreSequence.__table__,
    FinancePeriod.__table__,
    Party.__table__,
    CommerceSupplier.__table__,
    CommerceCustomer.__table__,
    PurchaseOrder.__table__,
    PurchaseOrderLine.__table__,
    PurchaseReceipt.__table__,
    SalesOrder.__table__,
]


class PlanTests(TestCase):
    DOCS = {"a": (D("100"), D("100")), "b": (D("80"), D("0"))}

    def test_balanced_move(self):
        self.assertEqual(plan_moves(self.DOCS, [("a", D("-60")), ("b", D("60"))]), D("60.00"))

    def test_rules(self):
        for lines in (
            [("a", D("-60")), ("b", D("50"))],  # not balanced
            [("a", D("-120")), ("b", D("120"))],  # more than settled on a
            [("a", D("-90")), ("b", D("90"))],  # more than due on b
            [("x", D("-10")), ("b", D("10"))],  # someone else's document
            [("a", D("0"))],  # nothing to do
        ):
            with self.assertRaises(HTTPException):
                plan_moves(self.DOCS, lines)


class SettlementTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine)()
        self.fin = FinanceService(self.db)
        self.fin.ensure_accounts(CO)
        self.fin.ensure_payment_accounts(CO)
        self.db.add_all(
            [
                CommerceCustomer(id="cust1", company_id=CO, party_id="p1", customer_code="C-1", name="Rahim", customer_since=date.today()),
                CommerceSupplier(id="sup1", company_id=CO, party_id="p2", vendor_code="S-1", name="Acme", phone="0171"),
            ]
        )
        self.inv1 = self._receivable("INV-1", "500")
        self.inv2 = self._receivable("INV-2", "300")
        self.db.flush()
        self.svc = SettlementService(self.db)

    def tearDown(self):
        self.db.close()

    def _receivable(self, number, amount):
        row = FinanceReceivable(
            company_id=CO, customer_id="cust1", source_type="manual", source_id=number, invoice_number=number,
            amount=D(amount), balance=D(amount),
        )
        self.db.add(row)
        return row

    def test_receipt_is_recorded_and_can_be_moved(self):
        customer_ledger_service.record_payment(self.db, "cust1", CustomerPaymentCreate(amount=D("500")), company_id=CO)
        self.assertEqual(self.inv1.balance, D("0"))  # oldest first
        payment = self.db.query(FinancePayment).filter(FinancePayment.source_type == "customer_payment").one()
        by = self.svc.settled_by("receivable", [self.inv1, self.inv2])
        self.assertEqual(by[self.inv1.id], [{"ref": payment.payment_number, "amount": D("500.00")}])
        self.assertEqual(by[self.inv2.id], [])

        stl = self.svc.create(
            company_id=CO, party_type="customer", party_id="cust1", lines=[(self.inv1.id, D("-300")), (self.inv2.id, D("300"))]
        )
        self.assertTrue(stl.settlement_number.startswith("STL-"))
        self.assertEqual((self.inv1.balance, self.inv1.status), (D("300.00"), "partial"))
        self.assertEqual((self.inv2.balance, self.inv2.status), (D("0.00"), "paid"))
        by = self.svc.settled_by("receivable", [self.inv1, self.inv2])
        self.assertEqual(sum(i["amount"] for i in by[self.inv1.id]), D("200.00"))
        self.assertEqual(by[self.inv2.id], [{"ref": stl.settlement_number, "amount": D("300.00")}])
        self.assertEqual(len(self.svc.lines(stl)), 2)

    def test_documents_fit_the_response_schema(self):
        rows = SettlementDocumentListResponse(data=self.svc.documents("customer", "cust1", company_id=CO)).data
        self.assertEqual([r.number for r in rows], ["INV-1", "INV-2"])
        self.assertIsNotNone(rows[0].doc_date)

    def test_per_invoice_settle_is_recorded(self):
        _, payment = self.fin.settle_receivable(self.inv2, amount=D("100"))
        self.assertEqual(self.svc.settled_by("receivable", [self.inv2])[self.inv2.id], [{"ref": payment.payment_number, "amount": D("100.00")}])

    def test_unrecorded_paid_amount_shows_as_advance(self):
        self.inv1.amount_paid = D("50")
        self.inv1.balance = D("450")
        self.assertEqual(self.svc.settled_by("receivable", [self.inv1])[self.inv1.id], [{"ref": "Advance / earlier receipt", "amount": D("50.00")}])

    def test_supplier_settlement_survives_payment_delete(self):
        bill1 = FinancePayable(company_id=CO, supplier_id="sup1", source_type="manual", source_id="b1", reference_number="B-1", amount=D("400"), balance=D("400"))
        self.db.add(bill1)
        self.db.flush()
        bill2 = FinancePayable(company_id=CO, supplier_id="sup1", source_type="manual", source_id="b2", reference_number="B-2", amount=D("400"), balance=D("400"))
        self.db.add(bill2)
        self.db.flush()
        supplier_ledger_service.record_payment(self.db, "sup1", SupplierPaymentCreate(amount=D("300")), company_id=CO)
        supplier_ledger_service.record_payment(self.db, "sup1", SupplierPaymentCreate(amount=D("100")), company_id=CO)
        self.assertEqual(bill1.balance, D("0"))
        self.svc.create(company_id=CO, party_type="supplier", party_id="sup1", lines=[(bill1.id, D("-150")), (bill2.id, D("150"))])
        self.db.commit()
        second = self.db.query(FinancePayment).filter(FinancePayment.amount == D("100")).one()
        supplier_ledger_service.delete_payment(self.db, "sup1", second.id)
        # 300 left: oldest first puts it all on B-1, then the settlement moves 150 to B-2 again
        self.assertEqual(bill1.amount_paid, D("150.00"))
        self.assertEqual(bill2.amount_paid, D("150.00"))
