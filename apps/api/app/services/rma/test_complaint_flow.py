"""RMA complaint intake + approval (docs/RMA.md Stage A–B) — in-memory SQLite, the stock service replaced by a recorder.

What it proves: approval stocks a unit into the RMA store exactly once (a repeat posts nothing), a rejection or a
send-back posts nothing, a remote request is stocked when it is received, a cancellation takes the intake back through
a reversal, protected fields need the override permission and a reason, and the customer receipt never carries
internal notes or costs.
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.hrm  # noqa: F401
import app.models.catalog_brand  # noqa: F401 — catalog_products foreign keys
import app.models.catalog_category  # noqa: F401
import app.models.catalog_attribute_profile  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
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
from app.services.rma import complaint_service, rma_service

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
    Item.__table__,
    CatalogProduct.__table__,
]


class FakeStock:
    """Stands in for StockMovementService: records what would have been posted."""

    posted: list = []
    reversed: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity, data.source_line_id))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        FakeStock.reversed.append(movement_id)
        return SimpleNamespace(id=f"rev-{movement_id}")


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class ComplaintFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted, FakeStock.reversed = [], []
        patcher = patch("app.services.inventory.stock_movement_service.StockMovementService", FakeStock)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.plain = InventoryWarehouse(company_id=CO, code="MAIN", name="Main", type="Main warehouse")
        self.db.add_all([self.store, self.plain])
        # item-1 already has a catalog product; item-2 (archived, never catalogued) does not
        self.db.add_all(
            [
                Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"),
                Item(id="item-2", company_id=CO, sku="SKU-OLD", name="Old fan", item_type="physical", status="archived"),
            ]
        )
        self.db.flush()
        self.db.add(
            CatalogProduct(id="prod-1", company_id=CO, item_id="item-1", name="Mouse", slug="mouse", sku="SKU-1", status="published")
        )
        self.db.flush()

    def ticket(self, **over) -> RmaTicket:
        data = dict(
            company_id=CO,
            rma_number=f"RMA-2026-{self.db.query(RmaTicket).count() + 1:04d}",
            customer_name="Rakibul",
            customer_phone="017",
            sku="SKU-1",
            item_id="item-1",
            product_name="Mouse",
            serial_number=None,
            fault_reported="No power",
            status="pending_approval",
            warehouse_id=self.store.id,
            order_id="order-1",
        )
        data.update(over)
        row = RmaTicket(**data)
        self.db.add(row)
        self.db.flush()
        return row

    # --------------------------------------------------- catalog link

    def test_item_without_a_catalog_product_gets_an_archived_one_so_it_can_be_stocked(self):
        t = self.ticket(item_id="item-2", sku="SKU-OLD")
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(len(FakeStock.posted), 1)
        made = self.db.query(CatalogProduct).filter_by(item_id="item-2").one()
        self.assertEqual((made.status, made.sku, made.on_website, made.not_for_selling), ("archived", "SKU-OLD", False, True))
        # the catalog list validates every product against {public, private}; a made-up value breaks the whole catalog page
        self.assertIn(made.visibility, ("public", "private"))
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=t.id)]
        self.assertIn("catalog_link_created", actions)
        # a second claim on the same item reuses it
        t2 = self.ticket(item_id="item-2", sku="SKU-OLD")
        complaint_service.decide(self.db, t2, decision="approved", reason=None, user=_user())
        self.assertEqual(self.db.query(CatalogProduct).filter_by(item_id="item-2").count(), 1)

    def test_item_with_a_catalog_product_is_left_alone(self):
        t = self.ticket()
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(self.db.query(CatalogProduct).count(), 1)
        self.assertEqual(self.db.query(CatalogProduct).one().status, "published")

    # ---------------------------------------------------------- approval

    def test_approval_stocks_the_unit_once(self):
        t = self.ticket()
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(t.status, "received")
        self.assertEqual(t.complaint_decision, "approved")
        self.assertEqual(t.custody_state, "in_rma_store")
        self.assertEqual(t.complaint_decided_by_name, "Approver")
        self.assertEqual(len(FakeStock.posted), 1)
        self.assertEqual(FakeStock.posted[0][:3], ("customer_return", self.store.id, 1))
        # approving again is refused, and posting the intake again posts nothing
        with self.assertRaises(HTTPException):
            complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertFalse(complaint_service.post_intake_stock(self.db, t, actor="user-1"))
        self.assertEqual(len(FakeStock.posted), 1)
        self.assertEqual(self.db.query(RmaStockEvent).filter_by(rma_id=t.id).count(), 1)

    def test_approval_needs_an_rma_store(self):
        t = self.ticket(warehouse_id=self.plain.id)
        with self.assertRaises(HTTPException) as ctx:
            complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(t.status, "pending_approval")
        self.assertEqual(FakeStock.posted, [])
        t.warehouse_id = None
        with self.assertRaises(HTTPException):
            complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())

    def test_rejection_and_send_back_post_nothing_and_need_a_reason(self):
        t = self.ticket()
        with self.assertRaises(HTTPException):
            complaint_service.decide(self.db, t, decision="rejected", reason="  ", user=_user())
        complaint_service.decide(self.db, t, decision="rejected", reason="Physical damage", user=_user())
        self.assertEqual((t.status, t.complaint_decision_reason), ("rejected", "Physical damage"))
        self.assertEqual(FakeStock.posted, [])
        self.assertIsNone(t.custody_state)

    def test_correction_loop(self):
        t = self.ticket()
        complaint_service.decide(self.db, t, decision="correction_requested", reason="Add the serial", user=_user())
        self.assertEqual(t.status, "correction_requested")
        complaint_service.submit_for_approval(self.db, t, actor="user-1")
        self.assertEqual(t.status, "pending_approval")
        self.assertIsNone(t.complaint_decision)
        self.assertEqual(FakeStock.posted, [])

    def test_plain_status_change_cannot_approve(self):
        t = self.ticket()
        for target in ("approved", "rejected", "correction_requested"):
            with self.assertRaises(HTTPException):
                rma_service.change_status(self.db, t, target, actor="u")
        self.assertEqual(t.status, "pending_approval")

    def test_diagnosis_required_blocks_submit_until_reported(self):
        t = self.ticket(status="draft", diagnosis_required=True)
        with self.assertRaises(HTTPException):
            complaint_service.submit_for_approval(self.db, t, actor="u")
        t.diagnosis_report = "Board burnt"
        complaint_service.submit_for_approval(self.db, t, actor="u")
        self.assertEqual(t.status, "pending_approval")

    # ---------------------------------------------------- remote request

    def test_remote_request_is_stocked_when_it_arrives(self):
        t = self.ticket(unit_received=False)
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(t.status, "approved")
        self.assertEqual(FakeStock.posted, [])
        rma_service.change_status(self.db, t, "received", actor="u")
        self.assertEqual(len(FakeStock.posted), 1)
        self.assertEqual(t.custody_state, "in_rma_store")

    # ------------------------------------------------------- reversal

    def test_cancel_after_intake_reverses_through_the_ledger_once(self):
        t = self.ticket()
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        rma_service.change_status(self.db, t, "cancelled", actor="u", note="Customer took it back")
        self.assertEqual(FakeStock.reversed, ["mv-1"])
        self.assertIsNone(t.custody_state)
        event = self.db.query(RmaStockEvent).filter_by(rma_id=t.id, event_key="intake").one()
        self.assertIsNotNone(event.reversed_at)
        # nothing left to reverse the second time
        self.assertFalse(complaint_service.reverse_intake_stock(self.db, t, actor="u", reason="again"))
        self.assertEqual(FakeStock.reversed, ["mv-1"])

    def test_no_reversal_once_the_unit_moved_on(self):
        t = self.ticket()
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.db.add(RmaStockEvent(rma_id=t.id, event_key="dispatch", quantity=1))
        self.db.flush()
        with self.assertRaises(HTTPException):
            complaint_service.reverse_intake_stock(self.db, t, actor="u", reason="x")

    # ---------------------------------------------- protected fields

    def test_protected_fields_need_override_and_a_reason(self):
        t = self.ticket(serial_number="SN-1", customer_name="Rakibul")
        with self.assertRaises(HTTPException) as no_perm:
            complaint_service.check_protected_changes(t, {"serial_number": "SN-2"}, can_override=False, reason="typo")
        self.assertEqual(no_perm.exception.status_code, 403)
        with self.assertRaises(HTTPException) as no_reason:
            complaint_service.check_protected_changes(t, {"serial_number": "SN-2"}, can_override=True, reason=" ")
        self.assertEqual(no_reason.exception.status_code, 400)
        changed = complaint_service.check_protected_changes(t, {"serial_number": "SN-2"}, can_override=True, reason="typo")
        self.assertEqual(changed, {"serial_number": ("SN-1", "SN-2")})
        # an unchanged value and an unprotected field are free
        self.assertEqual(
            complaint_service.check_protected_changes(t, {"serial_number": "SN-1", "fault_reported": "x"}, can_override=False, reason=None),
            {},
        )

    def test_walk_in_customer_details_stay_editable(self):
        t = self.ticket(order_id=None, customer_name="Walk-in")
        self.assertEqual(
            complaint_service.check_protected_changes(t, {"customer_name": "Karim"}, can_override=False, reason=None), {}
        )

    # ---------------------------------------------------------- receipt

    def test_receipt_has_no_internal_notes_or_costs(self):
        t = self.ticket(
            internal_notes="SECRET-NOTE",
            total=Decimal("999.00"),
            labour_total=Decimal("500.00"),
            parts_total=Decimal("499.00"),
            charge_estimate=Decimal("250.00"),
            accessories="Box",
            condition_notes="Scratched",
            promised_delivery_date=None,
        )
        payload = complaint_service.receipt_payload(self.db, t, printed_by="Staff", reprint=False)
        text = " ".join(str(v) for v in payload.values())
        self.assertNotIn("SECRET-NOTE", text)
        for key in ("internal_notes", "total", "labour_total", "parts_total", "cost"):
            self.assertNotIn(key, payload)
        self.assertEqual(payload["charge_estimate"], "250.00")
        self.assertEqual(payload["problem"], "No power")
        self.assertEqual(payload["receipt_no"], f"CR-{t.rma_number.replace('RMA-', '')}")

    def test_receipt_print_is_counted(self):
        t = self.ticket()
        complaint_service.count_receipt_print(self.db, t, actor="u")
        complaint_service.count_receipt_print(self.db, t, actor="u")
        self.assertEqual(t.receipt_print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=t.id).order_by(CollabActivity.created_at)]
        self.assertIn("receipt_printed", actions)
        self.assertIn("receipt_reprinted", actions)

    # ------------------------------------------------- prior history

    def test_prior_history_finds_earlier_claims_on_the_serial(self):
        old = self.ticket(serial_number="SN-9", status="closed")
        new = self.ticket(serial_number="SN-9")
        found = complaint_service.prior_tickets(self.db, CO, serial_number="sn-9", exclude_id=new.id)
        self.assertEqual([t.id for t in found], [old.id])
        self.assertEqual(complaint_service.prior_tickets(self.db, CO, serial_number=""), [])
