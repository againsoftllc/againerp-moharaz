"""Runs the four supplier-receipt types (docs/RMA.md Stage D) against the real database and the real stock / finance services,
inside ONE transaction that is rolled back at the end: nothing is kept.

    docker exec -w /app againerp-moharaz-api python scripts/verify_receipt_cases.py

Covered: same product / same serial, same product / new serial, different product / new serial (stocked as that product, held by
the RMA, delivered as that product), and cash back (no unit, original written off, money posted to Finance through a settlement).
"""

from __future__ import annotations

import sys
import uuid
from decimal import Decimal

from sqlalchemy import text

import main  # noqa: F401 — loads every model so the foreign keys resolve
from app.database import SessionLocal
from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.models.finance import FinancePayment, FinancePaymentAccount
from app.models.item import Item
from app.models.rma import RmaSettlement
from app.services.inventory import serial_service
from app.services.rma import claim_service, complaint_service, delivery_service, receipt_service, rma_service

CO = "default"
failures = 0


def check(label: str, ok: bool, extra: str = "") -> None:
    global failures
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  ' + extra) if extra else ''}")


def main() -> int:
    db = SessionLocal()
    try:
        counts_before = {t: db.execute(text(f"select count(*) from {t}")).scalar() for t in ("rma_tickets", "inventory_serials", "inventory_stock_movements", "finance_payments", "finance_journal_entries", "rma_settlements")}
        admin = db.query(AuthUser).filter(AuthUser.email == "admin@againerp.local").one()
        item_a = db.query(Item).filter(Item.sku == "SKU-053024").one()
        item_b = db.query(Item).filter(Item.sku == "SKU-173504").one()
        for item in (item_a, item_b):
            assert db.query(CatalogProduct.id).filter(CatalogProduct.item_id == item.id).first(), f"{item.sku} has no catalog product"
        account = db.query(FinancePaymentAccount).filter(FinancePaymentAccount.name == "Cash").one()
        supplier_id = "sup_001"
        store = complaint_service.rma_stores(db, CO)[0]

        def on_hand(item_id: str, warehouse_id: str) -> int:
            row = db.execute(
                text("select coalesce(sum(on_hand), 0) from inventory_stock_levels where item_id = :i and warehouse_id = :w"),
                {"i": item_id, "w": warehouse_id},
            ).scalar()
            return int(row or 0)

        def dispatched(tag: str):
            """A received RMA for a registered serial, its claim dispatched: the unit is with the supplier."""
            serial = f"ZZV-{tag}-{uuid.uuid4().hex[:5]}".upper()
            serial_service.register_serials_or_raise(db, [serial], company_id=CO, item_id=item_a.id, sku=item_a.sku, source_type="manual")
            serial_service.find_by_number(db, serial, company_id=CO).status = "sold"
            db.flush()
            ticket = rma_service.create_ticket(
                db,
                rma_service.TicketIntake(
                    fault_reported="ZZ verify receipt",
                    company_id=CO,
                    sku=item_a.sku,
                    product_name=item_a.name,
                    serial_number=serial,
                    customer_name="ZZ Verify",
                    start_status="draft",
                    created_by=admin.id,
                    supplier_id=supplier_id,
                    supplier_override_reason="receipt verification",
                    can_override=True,
                    warehouse_id=store.id,
                    unit_received=True,
                ),
            )
            complaint_service.decide(db, ticket, decision="approved", reason=None, user=admin)  # an approver approves a draft in one step
            claim = claim_service.create_claim(db, ticket, actor=admin.id)
            claim_service.submit_claim(db, claim, actor=admin.id)
            claim_service.decide_claim(db, claim, decision="approved", reason=None, user=admin)
            claim_service.dispatch_claim(db, claim, user=admin)
            db.expire_all()  # the receipt is a separate request in real life: it reads the ticket fresh
            return ticket, claim, serial

        def received(ticket, claim, **changes):
            receipt = receipt_service.create_receipt(db, claim, actor=admin.id)
            receipt_service.update_receipt(db, receipt, changes, actor=admin.id, can_change_serial=True)
            receipt_service.submit_receipt(db, receipt, actor=admin.id)
            receipt_service.decide_receipt(db, receipt, decision="approved", reason=None, user=admin, can_change_serial=True)
            return receipt

        print("== 1. Same product, same serial")
        t, c, serial = dispatched("SAME")
        transit = claim_service.supplier_transit_store(db, CO, ensure=False)
        a_store, a_transit = on_hand(item_a.id, store.id), on_hand(item_a.id, transit.id)
        r = received(t, c, outcome="same_unit")
        check("the unit is back in the RMA store (+1) and out of the transit stock (-1)", on_hand(item_a.id, store.id) == a_store + 1 and on_hand(item_a.id, transit.id) == a_transit - 1)
        check("the serial is the one that was sent", t.received_serial_number == serial and r.received_serial == serial)
        check("the RMA is back from the supplier and holds the claimed product", (t.status, t.custody_state, t.held_item_id) == ("returned_from_supplier", "replacement_received", None))

        print("== 2. Same product, different serial")
        t, c, serial = dispatched("NEWSN")
        a_store, a_transit = on_hand(item_a.id, store.id), on_hand(item_a.id, transit.id)
        new_serial = f"ZZV-NEW-{uuid.uuid4().hex[:5]}".upper()
        r = received(t, c, outcome="same_product", received_serial=new_serial, outcome_note="Replaced under warranty")
        check("stock moves exactly like a same-unit receipt", on_hand(item_a.id, store.id) == a_store + 1 and on_hand(item_a.id, transit.id) == a_transit - 1)
        new, old = serial_service.find_by_number(db, new_serial, company_id=CO), serial_service.find_by_number(db, serial, company_id=CO)
        check("the new serial is registered under the same product and linked", new.item_id == item_a.id and new.replaces_serial == serial and new.status == "in_service")
        check("the original serial is kept and marked replaced", old.status == "replaced" and old.replaced_by_serial == new_serial)

        print("== 3. Different product, different serial")
        t, c, serial = dispatched("DIFF")
        a_store, a_transit, b_store = on_hand(item_a.id, store.id), on_hand(item_a.id, transit.id), on_hand(item_b.id, store.id)
        b_serial = f"ZZV-B-{uuid.uuid4().hex[:5]}".upper()
        r = received(t, c, outcome="different_product", received_item_id=item_b.id, received_serial=b_serial, outcome_note="Original model discontinued")
        check("the original is written off the transit stock (-1) and nothing of it comes back", on_hand(item_a.id, transit.id) == a_transit - 1 and on_hand(item_a.id, store.id) == a_store)
        check("the other product is stocked into the RMA store (+1)", on_hand(item_b.id, store.id) == b_store + 1)
        check("the claimed product is never rewritten; the RMA holds the new one", t.item_id == item_a.id and t.held_item_id == item_b.id and t.held_sku == item_b.sku)
        newb = serial_service.find_by_number(db, b_serial, company_id=CO)
        check("the new serial is registered under the OTHER product", newb.item_id == item_b.id and newb.sku == item_b.sku and newb.replaces_serial == serial)
        delivery = delivery_service.create_delivery(db, t, actor=admin.id)
        delivery_service.update_delivery(db, delivery, {"preset": "without_payment", "deliver_product": True, "payment_state": "none"})
        delivery_service.submit_delivery(db, delivery, actor=admin.id)
        delivery_service.decide_delivery(db, delivery, decision="approved", reason=None, user=admin)
        check("the customer delivery hands over the OTHER product (store B back to where it was)", on_hand(item_b.id, store.id) == b_store and on_hand(item_a.id, store.id) == a_store)
        check("the delivery serial is the new unit's", delivery.serial_delivered == b_serial and t.status == "closed", f"({delivery.serial_delivered}, {t.status})")

        print("== 4. Cash back")
        t, c, serial = dispatched("CASH")
        a_store, a_transit = on_hand(item_a.id, store.id), on_hand(item_a.id, transit.id)
        payments_before = db.query(FinancePayment).count()
        r = received(t, c, outcome="cash_back", refund_amount=Decimal("2500"), refund_account_id=account.id, outcome_note="Supplier is out of stock", supplier_delivery_ref="CN-VERIFY")
        check("no unit comes back: the transit stock is written off (-1), the RMA store is untouched", on_hand(item_a.id, transit.id) == a_transit - 1 and on_hand(item_a.id, store.id) == a_store)
        check("the RMA is marked cash back and has no serial coming back", (t.status, t.custody_state, t.received_serial_number) == ("returned_from_supplier", "cash_back", None))
        settlement = db.get(RmaSettlement, r.settlement_id)
        check("an approved RMA settlement was made: supplier, money in, refund", settlement is not None and (settlement.status, settlement.direction, settlement.party_type, settlement.purpose, settlement.amount) == ("approved", "in", "supplier", "refund_settlement", Decimal("2500.00")), f"({settlement and settlement.settlement_number})")
        check("Finance posted the money (one payment, with a journal entry)", db.query(FinancePayment).count() == payments_before + 1 and bool(settlement and settlement.journal_entry_id))
        check("the original serial is retired", serial_service.find_by_number(db, serial, company_id=CO).status == "replaced")
        blocker = delivery_service.summary(db, t)["deliver_blocker"]
        check("a customer delivery says there is no unit to hand over", "cash back" in (blocker or "").lower(), f"({blocker})")
        rma_service.change_status(db, t, "closed", actor=admin.id, note="Customer refunded")
        check("the RMA can be closed once the customer is settled", t.status == "closed")
    finally:
        db.rollback()  # nothing is kept
        after = {t: db.execute(text(f"select count(*) from {t}")).scalar() for t in counts_before}
        check("nothing was kept (row counts are unchanged)", after == counts_before, "" if after == counts_before else f"{counts_before} -> {after}")
        db.close()
    print(f"\n{'ALL PASSED' if failures == 0 else str(failures) + ' FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
