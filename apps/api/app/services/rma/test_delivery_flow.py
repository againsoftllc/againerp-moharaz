"""RMA customer delivery (docs/RMA.md Stage E) - in-memory SQLite, stock and finance replaced by recorders.

What it proves: a delivery is the hand-over only (it never posts a payment; money is a settlement); approval takes the unit
out of the RMA store exactly once and completes the RMA; the RMA's charges are invoiced once, unpaid, and a zero-charge
delivery creates no receivable; approving twice cannot duplicate stock or finance postings; a rejected or sent-back delivery
posts nothing; an older delivery that carried a payment is cleaned up on resubmit and refused on approval.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.catalog_attribute_profile  # noqa: F401
import app.models.catalog_brand  # noqa: F401
import app.models.catalog_category  # noqa: F401
import app.models.crm  # noqa: F401
import app.models.hrm  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.finance import FinanceAccount, FinancePaymentAccount, FinanceReceivable
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.rma import (
    RmaCharge,
    RmaDelivery,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaTicket,
)
from app.services.inventory import serial_service
from app.services.rma import complaint_service, delivery_service, rma_service

CO = "default"
D = Decimal
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaDelivery.__table__,
    RmaStatusHistory.__table__,
    RmaStockEvent.__table__,
    CollabActivity.__table__,
    InventoryWarehouse.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
    FinanceAccount.__table__,
    FinancePaymentAccount.__table__,
    FinanceReceivable.__table__,
]


class FakeStock:
    posted: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity, data.source_line_id))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        return SimpleNamespace(id=f"rev-{movement_id}")


class FakeFinance:
    settled: list = []

    def __init__(self, db) -> None:
        self.db = db

    def try_post(self, fn, **kwargs):
        return None

    def record_rma_invoice(self, ticket_id):
        return None

    def get_default_payment_account(self, company_id):
        return SimpleNamespace(id="acc-1")

    def settle_receivable(self, receivable, *, amount, payment_account_id=None, payment_date=None, reference=None, notes=None):
        if receivable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Receivable is already settled")
        FakeFinance.settled.append((amount, reference, payment_account_id))
        receivable.amount_paid = (receivable.amount_paid or D("0")) + amount
        receivable.balance = receivable.balance - amount
        receivable.status = "paid" if receivable.balance <= 0 else "partial"
        n = len(FakeFinance.settled)
        return receivable, SimpleNamespace(id=f"pay-{n}", payment_number=f"PAY-{n:05d}")


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class DeliveryFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted, FakeFinance.settled = [], []
        for target, replacement in (
            ("app.services.inventory.stock_movement_service.StockMovementService", FakeStock),
            ("app.services.finance.finance_service.FinanceService", FakeFinance),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.db.add(self.store)
        self.db.add(Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"))
        self.db.flush()
        self.db.add(CatalogProduct(id="prod-1", company_id=CO, item_id="item-1", name="Mouse", slug="mouse", sku="SKU-1", status="published"))
        self.db.add(
            InventorySerial(
                company_id=CO, serial_number="SN-OLD", item_id="item-1", sku="SKU-1", product_name="Mouse", status="sold",
                customer_id="cust-1", customer_name="Rakibul Hasan", order_id="order-1", order_number="ORD-1",
            )
        )
        self.db.flush()

    def ticket(self, *, total="0", status="in_repair", serial=None, **over) -> RmaTicket:
        """An approved RMA whose unit sits in the RMA store, with `total` charged to the customer."""
        data = dict(
            company_id=CO,
            rma_number=f"RMA-2026-{self.db.query(RmaTicket).count() + 1:04d}",
            customer_id="cust-1",
            customer_name="Rakibul Hasan",
            customer_phone="01711000000",
            sku="SKU-1",
            item_id="item-1",
            product_name="Mouse",
            serial_number=serial,
            fault_reported="No power",
            fault_diagnosed="Board replaced",
            internal_notes="SECRET-NOTE",
            status="pending_approval",
            warehouse_id=self.store.id,
            order_id="order-1",
            purchased_at=date(2026, 5, 1),
        )
        data.update(over)
        row = RmaTicket(**data)
        self.db.add(row)
        self.db.flush()
        complaint_service.decide(self.db, row, decision="approved", reason=None, user=_user())
        if status != "received":
            if status == "ready_for_delivery":
                rma_service.change_status(self.db, row, "in_repair", actor="u")
            rma_service.change_status(self.db, row, status, actor="u")
        row.total = D(total)
        row.tax_total = D("0")
        self.db.flush()
        FakeStock.posted.clear()
        return row

    def delivery(self, ticket, **changes):
        d = delivery_service.create_delivery(self.db, ticket, actor="u")
        if changes:
            delivery_service.update_delivery(self.db, d, dict(changes))
        return d

    def approve(self, d, submit=True):
        if submit:
            delivery_service.submit_delivery(self.db, d, actor="u")
        return delivery_service.decide_delivery(self.db, d, decision="approved", reason=None, user=_user("Dispatcher"))

    def receivables(self):
        return self.db.query(FinanceReceivable).all()

    # ------------------------------------------------- hand-over only

    def test_a_delivery_is_the_handover_only(self):
        t = self.ticket(total="500")
        d = self.delivery(t)
        self.assertEqual((d.deliver_product, d.payment_state, d.amount_received, d.preset), (True, "none", D("0.00"), "without_payment"))
        # a payment field sent by an old client is not part of the delivery any more
        delivery_service.update_delivery(self.db, d, {"payment_state": "received", "amount_received": D("100"), "notes": "Box included"})
        self.assertEqual((d.payment_state, d.amount_received, d.notes), ("none", D("0.00"), "Box included"))

    def test_a_zero_charge_delivery_hands_the_unit_over_with_no_receivable(self):
        t = self.ticket(total="0", serial="SN-OLD")
        d = self.delivery(t)
        self.approve(d)
        self.assertEqual(FakeStock.posted, [("rma_replacement", self.store.id, 1, "delivery")])
        self.assertEqual((t.status, t.custody_state), ("closed", "delivered"))
        self.assertEqual(self.receivables(), [])
        self.assertEqual(FakeFinance.settled, [])
        sn = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        self.assertEqual((sn.status, sn.warehouse_id), ("sold", None))
        self.assertIn("Delivered to", sn.notes)

    # --------------------------------------------- charges stay owed

    def test_a_charged_delivery_invoices_the_charges_once_and_takes_no_payment(self):
        t = self.ticket(total="500", serial="SN-OLD")
        d = self.delivery(t)
        self.approve(d)
        r = self.receivables()[0]
        self.assertEqual((r.status, r.balance, r.amount_paid), ("open", D("500"), D("0")))
        self.assertEqual((FakeFinance.settled, len(FakeStock.posted)), ([], 1))
        self.assertEqual((t.status, t.custody_state, t.receivable_id), ("closed", "delivered", r.id))
        self.assertEqual((d.amount_total, d.amount_received, d.amount_due, d.receivable_number), (D("500.00"), D("0.00"), D("500.00"), r.invoice_number))
        self.assertEqual((d.payment_id, d.payment_number), (None, None))

    def test_charges_already_paid_by_a_settlement_show_as_paid_on_the_delivery(self):
        t = self.ticket(total="500")
        r = rma_service.raise_bill(self.db, t)
        r.amount_paid, r.balance, r.status = D("500"), D("0"), "paid"
        d = self.delivery(t)
        self.approve(d)
        self.assertEqual((len(self.receivables()), d.amount_received, d.amount_due), (1, D("500.00"), D("0.00")))

    def test_charges_with_no_customer_cannot_be_invoiced_so_the_delivery_is_refused(self):
        t = self.ticket(total="500", customer_id=None)
        d = self.delivery(t)
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("customer", ctx.exception.detail)

    # ---------------------------------------------------- exactly once

    def test_approving_twice_cannot_duplicate_stock_or_finance_postings(self):
        t = self.ticket(total="500")
        d = self.delivery(t)
        self.approve(d)
        with self.assertRaises(HTTPException):
            delivery_service.decide_delivery(self.db, d, decision="approved", reason=None, user=_user())
        self.assertEqual((len(FakeStock.posted), len(FakeFinance.settled), len(self.receivables())), (1, 0, 1))
        self.assertEqual(self.db.query(RmaStockEvent).filter_by(rma_id=t.id, event_key="delivery").count(), 1)

    def test_only_one_open_delivery_per_rma(self):
        t = self.ticket(total="0")
        self.delivery(t)
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.create_delivery(self.db, t, actor="u")
        self.assertEqual(ctx.exception.status_code, 409)

    # ------------------------------------------------------ no posting

    def test_rejected_or_sent_back_deliveries_post_nothing(self):
        t = self.ticket(total="500")
        d = self.delivery(t)
        delivery_service.submit_delivery(self.db, d, actor="u")
        with self.assertRaises(HTTPException):
            delivery_service.decide_delivery(self.db, d, decision="rejected", reason=" ", user=_user())
        delivery_service.decide_delivery(self.db, d, decision="correction_requested", reason="Wrong name", user=_user())
        self.assertEqual((d.status, FakeStock.posted, FakeFinance.settled, self.receivables()), ("correction_requested", [], [], []))
        delivery_service.submit_delivery(self.db, d, actor="u")
        delivery_service.decide_delivery(self.db, d, decision="rejected", reason="Customer declined", user=_user())
        self.assertEqual((d.status, t.status, t.custody_state), ("rejected", "in_repair", "in_rma_store"))

    def test_an_approved_delivery_cannot_be_cancelled_a_draft_can(self):
        t = self.ticket(total="0")
        d = self.delivery(t)
        self.approve(d)
        with self.assertRaises(HTTPException):
            delivery_service.cancel_delivery(self.db, d, actor="u", reason="x")
        t2 = self.ticket(total="0")
        draft = self.delivery(t2)
        delivery_service.cancel_delivery(self.db, draft, actor="u", reason="typo")
        self.assertEqual(draft.status, "cancelled")

    # ----------------------------------------------- older deliveries

    def test_an_older_draft_with_a_payment_is_cleaned_on_resubmit_and_a_pending_one_is_refused_on_approval(self):
        t = self.ticket(total="500")
        d = self.delivery(t)
        d.payment_state, d.amount_received, d.deliver_product = "received", D("500"), False  # how Phase 4 left it
        delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertEqual((d.status, d.payment_state, d.deliver_product), ("pending_approval", "none", True))
        t2 = self.ticket(total="500")
        legacy = self.delivery(t2)
        legacy.status, legacy.payment_state, legacy.amount_received = "pending_approval", "received", D("500")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.decide_delivery(self.db, legacy, decision="approved", reason=None, user=_user())
        self.assertIn("Settlement", ctx.exception.detail)
        self.assertEqual((FakeStock.posted, FakeFinance.settled), ([], []))

    # ------------------------------------------------------- blockers

    def test_the_product_cannot_be_handed_over_while_it_is_with_the_supplier_or_not_ready(self):
        t = self.ticket(total="0")
        t.custody_state = "with_supplier"
        d = delivery_service.create_delivery(self.db, t, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("supplier", ctx.exception.detail)
        t2 = self.ticket(total="0", status="received")
        d2 = delivery_service.create_delivery(self.db, t2, actor="u")
        with self.assertRaises(HTTPException) as ctx2:
            delivery_service.submit_delivery(self.db, d2, actor="u")
        self.assertIn("Ready for delivery", ctx2.exception.detail)

    def test_a_plain_status_move_to_delivered_is_blocked_while_the_unit_is_held(self):
        t = self.ticket(total="0", status="ready_for_delivery")
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, t, "delivered", actor="u")
        self.assertIn("customer delivery", ctx.exception.detail)

    # ------------------------------------------------- serials

    def test_a_replacement_unit_is_delivered_as_sold_and_the_original_stays_replaced(self):
        t = self.ticket(total="0", serial="SN-OLD")
        # the supplier sent a different unit (what Phase 3 leaves behind)
        old = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        old.status, old.replaced_by_serial = "replaced", "SN-NEW"
        self.db.add(
            InventorySerial(
                company_id=CO, serial_number="SN-NEW", item_id="item-1", sku="SKU-1", status="in_service", rma_id=t.id,
                replaces_serial="SN-OLD", warehouse_id=self.store.id,
            )
        )
        t.received_serial_number = "SN-NEW"
        self.db.flush()
        d = self.delivery(t)
        self.assertEqual(d.serial_delivered, "SN-NEW")
        self.approve(d)
        new = serial_service.find_by_number(self.db, "SN-NEW", company_id=CO)
        self.assertEqual((new.status, new.warehouse_id, new.customer_name, new.order_number), ("sold", None, "Rakibul Hasan", "ORD-1"))
        self.assertEqual((old.status, old.replaced_by_serial), ("replaced", "SN-NEW"))
        self.assertEqual((t.serial_number, t.received_serial_number), ("SN-OLD", "SN-NEW"))

    # ------------------------------------------------------------ print

    def test_the_customer_copy_has_the_amounts_but_no_internal_notes_or_supplier_cost(self):
        t = self.ticket(total="500", serial="SN-OLD")
        d = self.delivery(t, delivered_to="Rakibul Hasan")
        self.approve(d)
        payload = delivery_service.delivery_payload(self.db, d, printed_by="Staff", reprint=False)
        text = " ".join(str(v) for v in payload.values())
        self.assertNotIn("SECRET-NOTE", text)
        for key in ("internal_notes", "cost", "supplier_cost", "labour_total", "parts_total"):
            self.assertNotIn(key, payload)
        self.assertEqual(
            (payload["amount_total"], payload["amount_received"], payload["amount_due"], payload["payment_number"], payload["approved_by"]),
            ("500.00", "0.00", "500.00", None, "Dispatcher"),
        )
        self.assertEqual((payload["serial_delivered"], payload["deliver_product"]), ("SN-OLD", True))

    def test_print_is_counted(self):
        t = self.ticket(total="0")
        d = self.delivery(t)
        delivery_service.count_delivery_print(self.db, d, actor="u")
        delivery_service.count_delivery_print(self.db, d, actor="u")
        self.assertEqual(d.print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=t.id)]
        self.assertIn("delivery_copy_printed", actions)
        self.assertIn("delivery_copy_reprinted", actions)
