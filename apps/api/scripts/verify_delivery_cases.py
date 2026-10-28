"""Runs the customer-delivery types (docs/RMA.md Stage E) against the real database and the real stock / finance / settlement
services, inside ONE transaction that is rolled back at the end: nothing is kept.

    docker exec -w /app againerp-moharaz-api python scripts/verify_delivery_cases.py

Covered: the customer's own unit back with a service charge AND a fine, part collected now and the rest left owed; the same
charges left fully owed; a cash back paid to the customer while the unit stays in the RMA store (the RMA stays open); and a cash
back after the supplier kept the unit (nothing left to hand over: the RMA completes).
"""

from __future__ import annotations

import sys
import uuid
from decimal import Decimal

import main  # noqa: F401 — loads every model so the foreign keys resolve
from sqlalchemy import text

from app.database import SessionLocal
from app.models.auth_user import AuthUser
from app.models.finance import FinancePayment, FinancePaymentAccount, FinanceReceivable
from app.models.item import Item
from app.models.rma import RmaSettlement
from app.services.inventory import serial_service
from app.services.rma import complaint_service, delivery_service, rma_service

CO = "default"
failures = 0


def check(label: str, ok: bool, extra: str = "") -> None:
    global failures
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  ' + extra) if extra else ''}")


def main_run() -> int:
    db = SessionLocal()
    tables = ("rma_tickets", "inventory_serials", "inventory_stock_movements", "finance_payments", "finance_journal_entries", "finance_receivables", "rma_settlements", "rma_charges")
    before = {t: db.execute(text(f"select count(*) from {t}")).scalar() for t in tables}
    try:
        admin = db.query(AuthUser).filter(AuthUser.email == "admin@againerp.local").one()
        item = db.query(Item).filter(Item.sku == "SKU-053024").one()
        account = db.query(FinancePaymentAccount).filter(FinancePaymentAccount.name == "Cash").one()
        store = complaint_service.rma_stores(db, CO)[0]

        def on_hand(warehouse_id: str) -> int:
            return int(
                db.execute(
                    text("select coalesce(sum(on_hand), 0) from inventory_stock_levels where item_id = :i and warehouse_id = :w"),
                    {"i": item.id, "w": warehouse_id},
                ).scalar()
                or 0
            )

        def in_house_rma(tag: str):
            """An approved RMA for a registered serial; the unit is in the RMA store and being repaired."""
            serial = f"ZZD-{tag}-{uuid.uuid4().hex[:5]}".upper()
            serial_service.register_serials_or_raise(db, [serial], company_id=CO, item_id=item.id, sku=item.sku, source_type="manual")
            row = serial_service.find_by_number(db, serial, company_id=CO)
            row.status, row.customer_id, row.customer_name = "sold", "cust_001", "Rakibul Hasan"
            db.flush()
            ticket = rma_service.create_ticket(
                db,
                rma_service.TicketIntake(
                    fault_reported="ZZ verify delivery", company_id=CO, sku=item.sku, product_name=item.name, serial_number=serial,
                    customer_id="cust_001", customer_name="Rakibul Hasan", start_status="draft", created_by=admin.id,
                    warehouse_id=store.id, unit_received=True,
                ),
            )
            complaint_service.decide(db, ticket, decision="approved", reason=None, user=admin)
            rma_service.change_status(db, ticket, "in_repair", actor=admin.id)
            db.expire_all()
            return ticket, serial

        def approve(delivery):
            return delivery_service.decide_delivery(db, delivery, decision="approved", reason=None, user=admin)

        print("== 1. Same unit back, service charge + fine, part collected now")
        t, serial = in_house_rma("CHG")
        rma_service.add_charge(db, t, kind="service", description="Service charge", quantity=Decimal("1"), unit_price=Decimal("300"))
        rma_service.add_charge(db, t, kind="fine", description="Fine: liquid damage", quantity=Decimal("1"), unit_price=Decimal("200"))
        check("the charges add up (service 300 + fine 200)", Decimal(t.total) == Decimal("500"), f"({t.total})")
        store_before = on_hand(store.id)
        d = delivery_service.create_delivery(db, t, actor=admin.id)
        check("the type starts as the unit the RMA holds", d.outcome == "same_unit")
        delivery_service.update_delivery(db, d, {"amount_received": Decimal("200"), "payment_account_id": account.id, "payment_reference": "CASH-VERIFY"})
        payments_before = db.query(FinancePayment).count()
        approve(d)
        receivable = db.get(FinanceReceivable, t.receivable_id)
        check("the invoice is for the full 500; 200 was collected, 300 stays owed", receivable is not None and (receivable.amount, receivable.amount_paid, receivable.balance) == (Decimal("500.00"), Decimal("200.00"), Decimal("300.00")), f"({receivable and (receivable.amount, receivable.amount_paid, receivable.balance)})")
        settlement = db.get(RmaSettlement, d.collect_settlement_id)
        check("what was collected is an approved settlement (customer, money in)", settlement is not None and (settlement.status, settlement.direction, settlement.party_type, settlement.amount) == ("approved", "in", "customer", Decimal("200.00")))
        check("Finance posted one payment", db.query(FinancePayment).count() == payments_before + 1)
        check("the unit left the RMA store and went back with its serial", on_hand(store.id) == store_before - 1 and d.serial_delivered == serial and t.custody_state == "delivered")
        check("the RMA is completed", t.status == "closed")
        check("the delivery shows the money", (d.amount_total, d.amount_received, d.amount_due) == (Decimal("500.00"), Decimal("200.00"), Decimal("300.00")), f"({d.amount_total}, {d.amount_received}, {d.amount_due})")

        print("== 2. Same unit back, the charges left owed")
        t, serial = in_house_rma("DUE")
        rma_service.add_charge(db, t, kind="service", description="Service charge", quantity=Decimal("1"), unit_price=Decimal("300"))
        d = delivery_service.create_delivery(db, t, actor=admin.id)
        payments_before = db.query(FinancePayment).count()
        approve(d)
        receivable = db.get(FinanceReceivable, t.receivable_id)
        check("invoiced once, nothing collected, no payment posted", receivable.balance == Decimal("300.00") and receivable.amount_paid == Decimal("0.00") and db.query(FinancePayment).count() == payments_before)
        check("the delivery says the amount is due", (d.payment_state, d.amount_due) == ("due", Decimal("300.00")))

        print("== 3. Cash back to the customer, the unit stays in the RMA store")
        t, serial = in_house_rma("CASHIN")
        store_before = on_hand(store.id)
        d = delivery_service.create_delivery(db, t, actor=admin.id)
        delivery_service.update_delivery(db, d, {"outcome": "cash_back", "refund_amount": Decimal("700"), "refund_account_id": account.id})
        payments_before = db.query(FinancePayment).count()
        approve(d)
        refund = db.get(RmaSettlement, d.refund_settlement_id)
        check("the refund is an approved settlement (customer, money out, refund)", refund is not None and (refund.status, refund.direction, refund.party_type, refund.purpose, refund.amount) == ("approved", "out", "customer", "refund_settlement", Decimal("700.00")))
        check("Finance posted the payment out", db.query(FinancePayment).count() == payments_before + 1 and bool(refund.journal_entry_id))
        check("no unit moved", on_hand(store.id) == store_before and not d.stock_posted)
        check("the RMA records the refund and stays open for the unit", (t.refund_amount, t.resolution_type, t.status, t.custody_state) == (Decimal("700.00"), "refund", "in_repair", "in_rma_store"))

        print("== 4. Cash back after the supplier kept the unit")
        t, serial = in_house_rma("CASHSUP")
        t.status, t.custody_state = "returned_from_supplier", "cash_back"
        db.flush()
        d = delivery_service.create_delivery(db, t, actor=admin.id)
        check("a delivery starts as cash back (there is no unit)", d.outcome == "cash_back")
        blocker = delivery_service.summary(db, t)["deliver_blocker"] or ""
        check("a unit type is refused with the reason", "kept the unit" in blocker, f"({blocker})")
        delivery_service.update_delivery(db, d, {"refund_amount": Decimal("1200"), "refund_account_id": account.id})
        approve(d)
        check("nothing is left to hand over, so the RMA is completed", t.status == "closed")
    finally:
        db.rollback()  # nothing is kept
        after = {t: db.execute(text(f"select count(*) from {t}")).scalar() for t in tables}
        check("nothing was kept (row counts are unchanged)", after == before, "" if after == before else f"{before} -> {after}")
        db.close()
    print(f"\n{'ALL PASSED' if failures == 0 else str(failures) + ' FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main_run())
