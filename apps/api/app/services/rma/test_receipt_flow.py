"""RMA supplier receipt (docs/RMA.md Stage D) — in-memory SQLite, stock and the supplier-job upsert replaced by recorders.

What it proves: a receipt is opened only for a dispatched claim and starts as "same product, same serial"; the four types
(same unit, same product with a new serial, a different product, cash back) each validate and post their own way: a new serial
needs the serial-change permission, must be new and needs a reason; a different product is stocked as that product and the RMA
holds it from then on; cash back brings no unit, writes the original off the transit stock and posts the money through an RMA
settlement. Approving posts ONE stock event; a rejected or sent-back receipt creates no stock; the supplier's reply copy has no
customer details.
"""

from __future__ import annotations

from datetime import date
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
import app.models.hrm  # noqa: F401
import app.models.party  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinancePaymentAccount
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.rma import (
    RmaCharge,
    RmaDelivery,
    RmaSettlement,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaSupplierReceipt,
    RmaTicket,
)
from app.services.inventory import serial_service
from app.services.rma import claim_service, complaint_service, receipt_service, rma_service

CO = "default"
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaSupplierReceipt.__table__,
    RmaDelivery.__table__,
    RmaSettlement.__table__,
    RmaStatusHistory.__table__,
    RmaStockEvent.__table__,
    CollabActivity.__table__,
    InventoryWarehouse.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
    FinancePaymentAccount.__table__,
    CommerceSupplier.__table__,
]


class FakeStock:
    posted: list = []
    items: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity, data.source_line_id))
        FakeStock.items.append((data.movement_type, data.item_id))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        return SimpleNamespace(id=f"rev-{movement_id}")


def fake_upsert_supplier_job(db, ticket, *, supplier_id, status="draft", **kwargs):
    job = db.query(RmaSupplierJob).filter(RmaSupplierJob.rma_id == ticket.id).first()
    if job is None:
        job = RmaSupplierJob(rma_id=ticket.id, supplier_id=supplier_id)
        db.add(job)
    job.supplier_id, job.supplier_name, job.status = supplier_id, "Supplier Co", status
    job.dispatched_at = kwargs.get("dispatched_at")
    job.returned_at = kwargs.get("returned_at")
    job.outcome = kwargs.get("outcome")
    db.flush()
    return job


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class ReceiptFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted = []
        FakeStock.items = []
        self.settlements: list = []

        def fake_create_settlement(db, ticket, data, *, user):
            self.settlements.append(("create", data))
            return SimpleNamespace(id="stl-1", settlement_number="STL-2026-0001")

        def fake_decide_settlement(db, s, *, decision, reason, user):
            self.settlements.append(("decide", decision))
            return s

        for target, replacement in (
            ("app.services.rma.settlement_service.create_settlement", fake_create_settlement),
            ("app.services.rma.settlement_service.decide_settlement", fake_decide_settlement),
            ("app.services.inventory.stock_movement_service.StockMovementService", FakeStock),
            ("app.services.rma.rma_service.upsert_supplier_job", fake_upsert_supplier_job),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.db.add(self.store)
        self.db.add(Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"))
        self.db.add(Item(id="item-2", company_id=CO, sku="SKU-2", name="Keyboard", item_type="physical", status="active"))
        self.db.add(FinancePaymentAccount(id="acct-1", company_id=CO, name="Cash box", gl_account_id="gl-1"))
        self.db.add(CommerceSupplier(id="sup-1", company_id=CO, party_id="party-1", vendor_code="V-1", name="Supplier Co"))
        self.db.flush()
        self.db.add(CatalogProduct(id="prod-1", company_id=CO, item_id="item-1", name="Mouse", slug="mouse", sku="SKU-1", status="published"))
        self.db.add(
            InventorySerial(company_id=CO, serial_number="SN-OLD", item_id="item-1", sku="SKU-1", product_name="Mouse", status="sold")
        )
        self.db.flush()

    def dispatched(self):
        """An approved RMA with serial SN-OLD, its claim dispatched: the unit is with the supplier."""
        ticket = RmaTicket(
            company_id=CO,
            rma_number="RMA-2026-0001",
            customer_name="Rakibul Hasan",
            customer_phone="01711000000",
            sku="SKU-1",
            item_id="item-1",
            product_name="Mouse",
            serial_number="SN-OLD",
            fault_reported="No power",
            internal_notes="SECRET-NOTE",
            status="pending_approval",
            warehouse_id=self.store.id,
            order_id="order-1",
            purchased_at=date(2026, 5, 1),
            supplier_id="sup-1",
            supplier_name="Supplier Co",
            supplier_source="traced",
        )
        self.db.add(ticket)
        self.db.flush()
        complaint_service.decide(self.db, ticket, decision="approved", reason=None, user=_user())
        claim = claim_service.create_claim(self.db, ticket, actor="u")
        claim_service.submit_claim(self.db, claim, actor="u")
        claim_service.decide_claim(self.db, claim, decision="approved", reason=None, user=_user())
        claim_service.dispatch_claim(self.db, claim, user=_user("Dispatcher"))
        FakeStock.posted.clear()  # only count what the receipt posts
        FakeStock.items.clear()
        return ticket, claim

    def submitted(self, ticket, claim, **changes):
        receipt = receipt_service.create_receipt(self.db, claim, actor="u")
        if changes:
            receipt_service.update_receipt(self.db, receipt, changes, actor="u", can_change_serial=True)
        receipt_service.submit_receipt(self.db, receipt, actor="u")
        return receipt

    def approve(self, receipt, can_change_serial=True):
        return receipt_service.decide_receipt(
            self.db, receipt, decision="approved", reason=None, user=_user("Receiver"), can_change_serial=can_change_serial
        )

    # ------------------------------------------------------------ create

    def test_receipt_needs_a_dispatched_claim_and_starts_with_the_sent_serial(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertEqual((r.status, r.sent_serial, r.received_serial, r.supplier_name), ("draft", "SN-OLD", "SN-OLD", "Supplier Co"))
        self.assertEqual(r.warehouse_id, self.store.id)
        self.assertRegex(r.receipt_number, r"^RRC-\d{4}-0001$")

    def test_an_undispatched_claim_has_nothing_to_receive(self):
        ticket = RmaTicket(
            company_id=CO, rma_number="RMA-2026-0009", customer_name="x", sku="SKU-1", item_id="item-1", fault_reported="x",
            status="received", warehouse_id=self.store.id, supplier_id="s", supplier_name="S", supplier_source="traced", custody_state="in_rma_store",
        )
        self.db.add(ticket)
        self.db.flush()
        claim = claim_service.create_claim(self.db, ticket, actor="u")
        with self.assertRaises(HTTPException):
            receipt_service.create_receipt(self.db, claim, actor="u")

    def test_one_open_receipt_per_claim(self):
        ticket, claim = self.dispatched()
        receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertEqual(ctx.exception.status_code, 409)

    # ------------------------------------------------------ serial rules

    def test_a_new_serial_needs_the_serial_change_permission(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        new_serial = {"outcome": "same_product", "received_serial": "SN-NEW"}
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.update_receipt(self.db, r, dict(new_serial), actor="u", can_change_serial=False)
        self.assertEqual(ctx.exception.status_code, 403)
        receipt_service.update_receipt(self.db, r, dict(new_serial), actor="u", can_change_serial=True)
        self.assertEqual((r.outcome, r.received_serial), ("same_product", "SN-NEW"))

    def test_the_type_decides_the_serial(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        # same unit: whatever is typed, the serial is the one that was sent
        receipt_service.update_receipt(self.db, r, {"received_serial": "SN-NEW"}, actor="u", can_change_serial=True)
        self.assertEqual((r.outcome, r.received_serial), ("same_unit", "SN-OLD"))
        receipt_service.update_receipt(self.db, r, {"outcome": "same_product", "received_serial": "SN-NEW"}, actor="u", can_change_serial=True)
        self.assertEqual(r.received_serial, "SN-NEW")
        # going back to the same unit puts the sent serial back, with no permission
        receipt_service.update_receipt(self.db, r, {"outcome": "same_unit"}, actor="u", can_change_serial=False)
        self.assertEqual(r.received_serial, "SN-OLD")
        # cash back: nothing comes back, so there is no serial
        receipt_service.update_receipt(self.db, r, {"outcome": "cash_back"}, actor="u", can_change_serial=False)
        self.assertIsNone(r.received_serial)

    def test_a_received_serial_that_already_exists_is_refused(self):
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-TAKEN", item_id="item-1", sku="SKU-1", status="in_stock"))
        self.db.flush()
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.update_receipt(self.db, r, {"outcome": "same_product", "received_serial": "sn-taken"}, actor="u", can_change_serial=True)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(r.received_serial, "SN-OLD")

    # --------------------------------------------------------- approval

    def test_approving_the_same_unit_stocks_it_back_exactly_once(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        self.assertEqual(FakeStock.posted, [])  # nothing before approval
        self.approve(r)
        transit = claim_service.supplier_transit_store(self.db, CO, ensure=False)
        self.assertEqual(
            FakeStock.posted,
            [("transfer_out", transit.id, 1, "receipt"), ("transfer_in", self.store.id, 1, "receipt")],
        )
        self.assertEqual((r.status, r.decided_by_name), ("approved", "Receiver"))
        self.assertEqual((ticket.status, ticket.custody_state), ("returned_from_supplier", "replacement_received"))
        self.assertEqual(ticket.received_serial_number, "SN-OLD")
        self.assertEqual(self.db.query(RmaSupplierJob).one().status, "returned")
        sn = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        self.assertEqual(sn.warehouse_id, self.store.id)
        self.assertIn("Back from", sn.notes)
        # the same document cannot post twice
        with self.assertRaises(HTTPException):
            self.approve(r)
        self.assertEqual(len(FakeStock.posted), 2)
        self.assertEqual(self.db.query(RmaStockEvent).filter_by(rma_id=ticket.id, event_key="receipt").count(), 1)

    def test_a_different_serial_is_linked_and_the_original_is_kept(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="same_product", received_serial="SN-NEW", outcome_note="Supplier sent a new unit")
        self.approve(r)
        old = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        new = serial_service.find_by_number(self.db, "SN-NEW", company_id=CO)
        self.assertEqual(ticket.serial_number, "SN-OLD")  # never overwritten
        self.assertEqual(ticket.received_serial_number, "SN-NEW")
        self.assertEqual((old.status, old.replaced_by_serial), ("replaced", "SN-NEW"))
        self.assertIn("Replaced by SN-NEW", old.notes)
        self.assertEqual((new.status, new.replaces_serial, new.rma_id, new.warehouse_id), ("in_service", "SN-OLD", ticket.id, self.store.id))
        self.assertEqual((new.source_type, new.source_id, new.supplier_id), ("rma_replacement", r.id, "sup-1"))
        self.assertEqual(len(FakeStock.posted), 2)

    def test_approving_a_different_serial_needs_the_serial_change_permission(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="same_product", received_serial="SN-NEW", outcome_note="New unit")
        with self.assertRaises(HTTPException) as ctx:
            self.approve(r, can_change_serial=False)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual((r.status, ticket.status, ticket.custody_state), ("pending_approval", "sent_to_supplier", "with_supplier"))
        self.assertEqual(FakeStock.posted, [])

    def test_a_serial_registered_after_the_draft_is_caught_at_approval(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="same_product", received_serial="SN-RACE", outcome_note="New unit")
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-RACE", item_id="item-1", sku="SKU-1", status="in_stock"))
        self.db.flush()
        with self.assertRaises(HTTPException) as ctx:
            self.approve(r)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(FakeStock.posted, [])

    def test_rejected_or_sent_back_receipts_create_no_stock(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        with self.assertRaises(HTTPException):  # a reason is required
            receipt_service.decide_receipt(self.db, r, decision="rejected", reason=" ", user=_user(), can_change_serial=True)
        receipt_service.decide_receipt(self.db, r, decision="correction_requested", reason="Wrong serial", user=_user(), can_change_serial=True)
        self.assertEqual((r.status, FakeStock.posted), ("correction_requested", []))
        receipt_service.submit_receipt(self.db, r, actor="u")
        receipt_service.decide_receipt(self.db, r, decision="rejected", reason="Not our unit", user=_user(), can_change_serial=True)
        self.assertEqual((r.status, FakeStock.posted), ("rejected", []))
        self.assertEqual((ticket.status, ticket.custody_state), ("sent_to_supplier", "with_supplier"))
        # a rejected receipt frees the claim for a new one
        again = receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertNotEqual(again.id, r.id)

    def test_plain_move_to_back_from_supplier_is_blocked_while_the_unit_is_with_the_supplier(self):
        ticket, claim = self.dispatched()
        rma_service.change_status(self.db, ticket, "at_supplier", actor="u")
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, ticket, "returned_from_supplier", actor="u")
        self.assertIn("supplier receipt", ctx.exception.detail)

    def test_an_approved_receipt_cannot_be_cancelled_a_draft_can(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        self.approve(r)
        with self.assertRaises(HTTPException):
            receipt_service.cancel_receipt(self.db, r, actor="u", reason="x")
        d = RmaSupplierReceipt(
            company_id=CO, rma_id=ticket.id, claim_id=claim.id, receipt_number="RRC-X-1", status="draft", supplier_id="s", outcome="same_unit"
        )
        self.db.add(d)
        self.db.flush()
        receipt_service.cancel_receipt(self.db, d, actor="u", reason="typo")
        self.assertEqual(d.status, "cancelled")

    def test_cancelling_the_rma_after_receipt_is_still_refused_for_stock_that_moved_on(self):
        ticket, claim = self.dispatched()
        self.approve(self.submitted(ticket, claim))
        with self.assertRaises(HTTPException):
            rma_service.change_status(self.db, ticket, "cancelled", actor="u", note="changed mind")

    # --------------------------------------------- the four types of receipt

    def test_the_reason_is_optional_for_every_type(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        receipt_service.update_receipt(self.db, r, {"outcome": "same_product", "received_serial": "SN-NEW"}, actor="u", can_change_serial=True)
        self.assertIsNone(r.outcome_note)
        receipt_service.submit_receipt(self.db, r, actor="u")  # no reason typed: still fine
        self.assertEqual(r.status, "pending_approval")

    def test_same_product_must_come_with_a_serial_that_differs(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        receipt_service.update_receipt(self.db, r, {"outcome": "same_product", "outcome_note": "New unit"}, actor="u", can_change_serial=True)
        with self.assertRaises(HTTPException) as ctx:  # still the serial that was sent
            receipt_service.submit_receipt(self.db, r, actor="u")
        self.assertIn("differ", ctx.exception.detail)

    def test_a_different_product_is_stocked_as_that_product_and_held_by_the_rma(self):
        ticket, claim = self.dispatched()
        r = self.submitted(
            ticket, claim, outcome="different_product", received_item_id="item-2", received_serial="KB-001", outcome_note="Mouse discontinued, keyboard sent instead"
        )
        self.assertEqual((r.received_sku, r.received_product_name), ("SKU-2", "Keyboard"))
        self.approve(r)
        transit = claim_service.supplier_transit_store(self.db, CO, ensure=False)
        # the original leaves the transit stock; the product that came back is stocked into the RMA store
        self.assertEqual(
            FakeStock.posted,
            [("stock_adjustment_out", transit.id, 1, "receipt"), ("stock_adjustment_in", self.store.id, 1, "receipt")],
        )
        self.assertEqual(FakeStock.items, [("stock_adjustment_out", "item-1"), ("stock_adjustment_in", "item-2")])
        self.assertEqual((ticket.item_id, ticket.sku), ("item-1", "SKU-1"))  # what was claimed is never rewritten
        self.assertEqual((ticket.held_item_id, ticket.held_sku, ticket.held_product_name), ("item-2", "SKU-2", "Keyboard"))
        self.assertEqual((ticket.status, ticket.custody_state, ticket.received_serial_number), ("returned_from_supplier", "replacement_received", "KB-001"))
        new = serial_service.find_by_number(self.db, "KB-001", company_id=CO)
        self.assertEqual((new.item_id, new.sku, new.replaces_serial, new.status), ("item-2", "SKU-2", "SN-OLD", "in_service"))
        old = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        self.assertEqual((old.status, old.replaced_by_serial), ("replaced", "KB-001"))
        # a later stock event (the customer delivery) moves what is held, not what was claimed
        complaint_service.post_stock_event(
            self.db, ticket, "delivery", [complaint_service.StockLeg(self.store.id, "rma_replacement", 1, "handed over")], custody_state="delivered", actor="u"
        )
        self.assertEqual(FakeStock.items[-1], ("rma_replacement", "item-2"))

    def test_a_different_product_has_to_be_a_different_product_with_its_own_serial(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:  # the product that was sent is not "different"
            receipt_service.update_receipt(
                self.db, r, {"outcome": "different_product", "received_item_id": "item-1", "received_serial": "X-1"}, actor="u", can_change_serial=True
            )
        self.assertIn("product that was sent", ctx.exception.detail)
        receipt_service.update_receipt(
            self.db, r, {"outcome": "different_product", "received_item_id": "item-2", "outcome_note": "Discontinued"}, actor="u", can_change_serial=True
        )
        with self.assertRaises(HTTPException):  # no serial for the new product yet
            receipt_service.submit_receipt(self.db, r, actor="u")

    def test_a_different_product_needs_the_serial_change_permission_to_approve(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="different_product", received_item_id="item-2", received_serial="KB-9", outcome_note="Swap")
        with self.assertRaises(HTTPException) as ctx:
            self.approve(r, can_change_serial=False)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(FakeStock.posted, [])

    def test_cash_back_brings_no_unit_and_posts_the_money_through_a_settlement(self):
        ticket, claim = self.dispatched()
        r = self.submitted(
            ticket, claim, outcome="cash_back", refund_amount=1500, refund_account_id="acct-1", outcome_note="Supplier is out of stock", supplier_delivery_ref="CN-12"
        )
        self.assertEqual((r.received_serial, r.received_item_id), (None, None))
        self.assertEqual(FakeStock.posted, [])  # nothing before approval
        self.assertEqual(self.settlements, [])
        self.approve(r)
        transit = claim_service.supplier_transit_store(self.db, CO, ensure=False)
        # only the original leaves the transit stock: nothing is stocked into the RMA store
        self.assertEqual(FakeStock.posted, [("stock_adjustment_out", transit.id, 1, "receipt")])
        self.assertEqual((ticket.status, ticket.custody_state, ticket.received_serial_number), ("returned_from_supplier", "cash_back", None))
        self.assertEqual(r.settlement_id, "stl-1")
        kind, data = self.settlements[0]
        self.assertEqual(
            (kind, data["party_type"], data["party_id"], data["direction"], data["amount"], data["purpose"], data["payment_account_id"], data["reference"]),
            ("create", "supplier", "party-1", "in", 1500, "refund_settlement", "acct-1", "CN-12"),
        )
        self.assertIn("Supplier is out of stock", data["purpose_note"])
        self.assertEqual(self.settlements[1], ("decide", "approved"))
        old = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        self.assertEqual(old.status, "replaced")
        self.assertIn("cash back", old.notes)
        # no unit is handed over after a cash back, so the RMA can be closed once the customer is settled
        rma_service.change_status(self.db, ticket, "closed", actor="u", note="Customer refunded")
        self.assertEqual(ticket.status, "closed")

    def test_cash_back_needs_an_amount_and_an_account(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        receipt_service.update_receipt(self.db, r, {"outcome": "cash_back", "outcome_note": "No stock"}, actor="u", can_change_serial=False)
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.submit_receipt(self.db, r, actor="u")
        self.assertIn("amount", ctx.exception.detail)
        receipt_service.update_receipt(self.db, r, {"refund_amount": 800}, actor="u", can_change_serial=False)
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.submit_receipt(self.db, r, actor="u")
        self.assertIn("account", ctx.exception.detail)
        with self.assertRaises(HTTPException):  # an account that does not exist
            receipt_service.update_receipt(self.db, r, {"refund_account_id": "nope"}, actor="u", can_change_serial=False)
        receipt_service.update_receipt(self.db, r, {"refund_account_id": "acct-1", "outcome_note": " "}, actor="u", can_change_serial=False)
        receipt_service.submit_receipt(self.db, r, actor="u")  # the reason is optional once the money details are in
        self.assertEqual(r.status, "pending_approval")

    def test_changing_the_type_clears_what_the_new_type_does_not_use(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        receipt_service.update_receipt(
            self.db, r, {"outcome": "different_product", "received_item_id": "item-2", "received_serial": "KB-5"}, actor="u", can_change_serial=True
        )
        self.assertEqual(r.received_sku, "SKU-2")
        receipt_service.update_receipt(self.db, r, {"outcome": "cash_back", "refund_amount": 10, "refund_account_id": "acct-1"}, actor="u", can_change_serial=True)
        self.assertEqual((r.received_item_id, r.received_sku, r.received_serial), (None, None, None))
        receipt_service.update_receipt(self.db, r, {"outcome": "same_unit"}, actor="u", can_change_serial=True)
        self.assertEqual((r.refund_amount, r.refund_account_id, r.received_serial), (None, None, "SN-OLD"))

    # ------------------------------------------------------------- print

    def test_the_reply_copy_has_no_customer_details_internal_notes_or_costs(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, received_serial="SN-NEW", supplier_delivery_ref="CH-77", outcome="same_product", outcome_note="New unit")
        self.approve(r)
        payload = receipt_service.receipt_payload(self.db, r, printed_by="Staff", reprint=False)
        text = " ".join(str(v) for v in payload.values())
        for secret in ("SECRET-NOTE", "Rakibul", "01711000000"):
            self.assertNotIn(secret, text)
        for key in ("internal_notes", "customer_name", "customer_phone", "total", "cost"):
            self.assertNotIn(key, payload)
        self.assertEqual(
            (payload["serial_sent"], payload["serial_received"], payload["serial_changed"], payload["outcome_label"], payload["received_into"]),
            ("SN-OLD", "SN-NEW", True, "Same product, different serial", "RMA Store"),
        )
        self.assertEqual((payload["supplier_delivery_ref"], payload["approved_by"]), ("CH-77", "Receiver"))

    def test_print_is_counted(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        receipt_service.count_receipt_print(self.db, r, actor="u")
        receipt_service.count_receipt_print(self.db, r, actor="u")
        self.assertEqual(r.print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=ticket.id)]
        self.assertIn("receipt_copy_printed", actions)
        self.assertIn("receipt_copy_reprinted", actions)
