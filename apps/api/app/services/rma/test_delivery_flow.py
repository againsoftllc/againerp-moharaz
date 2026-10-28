"""RMA customer delivery (docs/RMA.md Stage E) - in-memory SQLite, stock, finance and settlements replaced by recorders.

What it proves: a delivery has a type that mirrors the supplier receipt (same unit, same product with a new serial, a different
product, cash back) and the three unit types must match the unit the RMA holds; approval takes the unit out of the RMA store
exactly once and completes the RMA; the customer can be charged (service charge, fine): the charges are invoiced once, what is
collected now is posted as a settlement and the rest stays owed; a cash back pays money out through a settlement and hands
nothing over; approving twice cannot duplicate stock or finance postings; a rejected or sent-back delivery posts nothing.
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
        self.settlements: list = []

        def fake_create_settlement(db, ticket, data, *, user):
            self.settlements.append(("create", data))
            return SimpleNamespace(id=f"stl-{len(self.settlements)}", settlement_number="STL-2026-0001", data=data)

        def fake_decide_settlement(db, s, *, decision, reason, user):
            data = s.data
            self.settlements.append(("decide", decision))
            if data["direction"] == "in" and data["purpose"] == "parts_service":  # what the real one does: bill once, settle it
                ticket = self.current_ticket
                receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else rma_service.raise_bill(db, ticket)
                FakeFinance(db).settle_receivable(receivable, amount=data["amount"], payment_account_id=data["payment_account_id"])
            return s

        for target, replacement in (
            ("app.services.rma.settlement_service.create_settlement", fake_create_settlement),
            ("app.services.rma.settlement_service.decide_settlement", fake_decide_settlement),
            ("app.services.inventory.stock_movement_service.StockMovementService", FakeStock),
            ("app.services.finance.finance_service.FinanceService", FakeFinance),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.db.add(self.store)
        self.db.add(Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"))
        self.db.add(Item(id="item-2", company_id=CO, sku="SKU-2", name="Keyboard", item_type="physical", status="active"))
        self.db.add(FinancePaymentAccount(id="acct-1", company_id=CO, name="Cash box", gl_account_id="gl-1"))
        self.current_ticket = None
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
        self.current_ticket = row
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

    def test_a_new_delivery_starts_with_the_type_that_matches_the_unit_the_rma_holds(self):
        t = self.ticket(total="0", serial="SN-OLD")
        self.assertEqual(delivery_service.create_delivery(self.db, t, actor="u").outcome, "same_unit")
        # the supplier replaced it with another serial
        t2 = self.ticket(total="0", serial="SN-OLD")
        t2.received_serial_number = "SN-NEW"
        self.assertEqual(delivery_service.create_delivery(self.db, t2, actor="u").outcome, "same_product")
        # ... or with another product
        t3 = self.ticket(total="0", serial="SN-OLD")
        t3.received_serial_number, t3.held_item_id, t3.held_sku, t3.held_product_name = "KB-1", "item-2", "SKU-2", "Keyboard"
        self.assertEqual(delivery_service.create_delivery(self.db, t3, actor="u").outcome, "different_product")
        # nothing to hand over (the supplier kept the unit): cash back
        t4 = self.ticket(total="0", serial="SN-OLD")
        t4.custody_state = "cash_back"
        self.assertEqual(delivery_service.create_delivery(self.db, t4, actor="u").outcome, "cash_back")

    def test_a_unit_type_must_match_the_unit_the_rma_holds(self):
        t = self.ticket(total="0", serial="SN-OLD")
        t.received_serial_number = "SN-NEW"  # a replacement unit
        d = self.delivery(t, outcome="same_unit")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("Same product, different serial", ctx.exception.detail)
        delivery_service.update_delivery(self.db, d, {"outcome": "same_product"})
        delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertEqual(d.status, "pending_approval")
        with self.assertRaises(HTTPException):
            delivery_service.update_delivery(self.db, d, {"outcome": "nonsense"})

    def test_a_different_product_is_delivered_as_that_product(self):
        t = self.ticket(total="0", serial="SN-OLD")
        self.db.add(InventorySerial(company_id=CO, serial_number="KB-1", item_id="item-2", sku="SKU-2", status="in_service", rma_id=t.id, replaces_serial="SN-OLD", warehouse_id=self.store.id))
        t.received_serial_number, t.held_item_id, t.held_sku, t.held_product_name = "KB-1", "item-2", "SKU-2", "Keyboard"
        self.db.flush()
        d = self.delivery(t)
        self.assertEqual(d.outcome, "different_product")
        self.approve(d)
        self.assertEqual((t.status, t.custody_state, d.serial_delivered), ("closed", "delivered", "KB-1"))
        payload = delivery_service.delivery_payload(self.db, d, printed_by="Staff", reprint=False)
        self.assertEqual((payload["product_name"], payload["sku"], payload["original_product_name"], payload["outcome_label"]), ("Keyboard", "SKU-2", "Mouse", "Different product, different serial"))

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

    def test_charges_collected_now_are_posted_as_a_settlement_and_the_rest_stays_owed(self):
        t = self.ticket(total="500", serial="SN-OLD")  # e.g. a service charge of 300 and a fine of 200
        d = self.delivery(t, amount_received=D("200"), payment_account_id="acct-1", payment_reference="CASH-7")
        self.approve(d)
        kind, data = self.settlements[0]
        self.assertEqual(
            (kind, data["party_type"], data["direction"], data["amount"], data["purpose"], data["payment_account_id"], data["reference"]),
            ("create", "customer", "in", D("200.00"), "parts_service", "acct-1", "CASH-7"),
        )
        self.assertEqual(self.settlements[1], ("decide", "approved"))
        r = self.receivables()[0]
        self.assertEqual((r.amount_paid, r.balance, r.status), (D("200"), D("300"), "partial"))
        self.assertEqual((d.amount_total, d.amount_received, d.amount_due, d.payment_state), (D("500.00"), D("200.00"), D("300.00"), "received"))
        self.assertEqual(d.collect_settlement_id, "stl-1")
        self.assertEqual((t.status, t.custody_state), ("closed", "delivered"))

    def test_the_amount_collected_must_fit_the_charges_and_have_an_account(self):
        t = self.ticket(total="500", serial="SN-OLD")
        d = self.delivery(t, amount_received=D("600"), payment_account_id="acct-1")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("more than what is owed", ctx.exception.detail)
        delivery_service.update_delivery(self.db, d, {"amount_received": D("100"), "payment_account_id": None})
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("account", ctx.exception.detail)
        free = self.ticket(total="0", serial="SN-OLD")
        nothing = self.delivery(free, amount_received=D("50"), payment_account_id="acct-1")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, nothing, actor="u")
        self.assertIn("nothing to collect", ctx.exception.detail)
        with self.assertRaises(HTTPException):  # an account that does not exist
            delivery_service.update_delivery(self.db, d, {"payment_account_id": "nope"})

    # ------------------------------------------------------ cash back

    def test_cash_back_pays_money_out_and_hands_nothing_over(self):
        t = self.ticket(total="0", serial="SN-OLD")
        d = self.delivery(t, outcome="cash_back", refund_amount=D("700"), refund_account_id="acct-1")
        self.approve(d)
        kind, data = self.settlements[0]
        self.assertEqual(
            (kind, data["party_type"], data["direction"], data["amount"], data["purpose"], data["payment_account_id"]),
            ("create", "customer", "out", D("700.00"), "refund_settlement", "acct-1"),
        )
        self.assertEqual(d.refund_settlement_id, "stl-1")
        self.assertEqual(FakeStock.posted, [])  # no unit moved
        self.assertEqual((t.refund_amount, t.resolution_type, t.resolution_status), (D("700.00"), "refund", "completed"))
        # the customer's unit is still in the RMA store: it has its own decision (restock, supplier, scrap), so the RMA stays open
        self.assertEqual((t.status, t.custody_state, d.stock_posted), ("in_repair", "in_rma_store", False))

    def test_cash_back_closes_the_rma_when_the_supplier_kept_the_unit(self):
        t = self.ticket(total="0", serial="SN-OLD", status="in_repair")
        t.status, t.custody_state = "returned_from_supplier", "cash_back"
        d = self.delivery(t)
        self.assertEqual(d.outcome, "cash_back")
        delivery_service.update_delivery(self.db, d, {"refund_amount": D("1200"), "refund_account_id": "acct-1"})
        self.approve(d)
        self.assertEqual((t.status, FakeStock.posted), ("closed", []))

    def test_cash_back_needs_an_amount_an_account_and_a_linked_customer(self):
        t = self.ticket(total="0", serial="SN-OLD")
        d = self.delivery(t, outcome="cash_back")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("amount", ctx.exception.detail)
        delivery_service.update_delivery(self.db, d, {"refund_amount": D("100")})
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("account", ctx.exception.detail)
        t2 = self.ticket(total="0", serial="SN-OLD", customer_id=None)
        d2 = self.delivery(t2, outcome="cash_back", refund_amount=D("100"), refund_account_id="acct-1")
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d2, actor="u")
        self.assertIn("customer", ctx.exception.detail)

    def test_changing_to_a_unit_type_drops_the_refund(self):
        t = self.ticket(total="0", serial="SN-OLD")
        d = self.delivery(t, outcome="cash_back", refund_amount=D("100"), refund_account_id="acct-1")
        delivery_service.update_delivery(self.db, d, {"outcome": "same_unit"})
        self.assertEqual((d.refund_amount, d.refund_account_id, d.deliver_product), (None, None, True))

    def test_charges_already_paid_by_a_settlement_show_as_paid_on_the_delivery(self):
        t = self.ticket(total="500")
        r = rma_service.raise_bill(self.db, t)
        r.amount_paid, r.balance, r.status = D("500"), D("0"), "paid"
        d = self.delivery(t)
        self.approve(d)
        self.assertEqual((len(self.receivables()), d.amount_received, d.amount_due), (1, D("0.00"), D("0.00")))  # nothing is collected at this delivery
        self.assertEqual(self.receivables()[0].status, "paid")

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

    # ------------------------------------------------------- blockers

    def test_the_product_cannot_be_handed_over_while_it_is_with_the_supplier_or_not_ready(self):
        t = self.ticket(total="0")
        t.custody_state = "with_supplier"
        d = delivery_service.create_delivery(self.db, t, actor="u")
        self.assertEqual(d.outcome, "cash_back")  # no unit to hand over, so it starts as cash back
        delivery_service.update_delivery(self.db, d, {"outcome": "same_unit"})
        with self.assertRaises(HTTPException) as ctx:
            delivery_service.submit_delivery(self.db, d, actor="u")
        self.assertIn("supplier", ctx.exception.detail)
        t2 = self.ticket(total="0", status="received")
        d2 = delivery_service.create_delivery(self.db, t2, actor="u")
        delivery_service.update_delivery(self.db, d2, {"outcome": "same_unit"})
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
        self.assertEqual((payload["serial_delivered"], payload["deliver_product"], payload["outcome_label"]), ("SN-OLD", True, "Same product, same serial"))

    def test_print_is_counted(self):
        t = self.ticket(total="0")
        d = self.delivery(t)
        delivery_service.count_delivery_print(self.db, d, actor="u")
        delivery_service.count_delivery_print(self.db, d, actor="u")
        self.assertEqual(d.print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=t.id)]
        self.assertIn("delivery_copy_printed", actions)
        self.assertIn("delivery_copy_reprinted", actions)
