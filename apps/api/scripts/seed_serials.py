"""Seed the serial registry — demo units across every lifecycle stage.

Two sources feed it:
  1. The serials seed_rma.py already put on its demo tickets as free text.
     Backfilling those into the registry is what makes "warranty via serial,
     no order number needed" demonstrable on a fresh install, and keeps the
     two seeds tellling one consistent story instead of two disconnected ones.
  2. A handful of fresh units so every status (in_stock, sold, in_service,
     replaced, scrapped) has at least one row on the Serial Numbers screen.

Idempotent — register_serials reports already-known serials as duplicates
rather than failing, so re-running only fills gaps.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.inventory_serial import InventorySerial
from app.models.rma import RmaTicket
from app.services.inventory import serial_service
from app.services.rma.constants import OPEN_STATUSES

COMPANY = "default"

# A few extra units with no claim history, spread across warehouses and SKUs
# already used elsewhere in the seed data.
FRESH_IN_STOCK = [
    ("SN-STOCK-30001", "SKU-ASUS-Z790P", "wh_dhaka"),
    ("SN-STOCK-30002", "SKU-CAN-G3730", "wh_ctg"),
    ("SN-STOCK-30003", "SKU-ASUS-F15", "wh_fc"),
]

SCRAPPED = ("SN-SCRAP-40001", "SKU-ANK-737", "wh_ctg")
REPLACED = ("SN-REPL-50001", "SKU-APC-1KVA", "wh_fc")


def _backfill_from_rma(db: Session) -> dict[str, int]:
    """Register the serial each seeded ticket already carries, and match its
    registry status to where that claim actually stands."""
    registered = 0
    attached = 0

    for ticket in db.query(RmaTicket).all():
        if not ticket.serial_number or not ticket.sku:
            continue
        if serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id):
            continue

        results = serial_service.register_serials(
            db,
            [ticket.serial_number],
            company_id=ticket.company_id,
            sku=ticket.sku,
            source_type="manual",
            notes=f"Backfilled from {ticket.rma_number}",
        )
        if not results or results[0].outcome != "created":
            continue
        registered += 1
        row = serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id)
        if row is None:
            continue

        if ticket.order_number:
            serial_service.assign_to_order(
                db, [ticket.serial_number], order_number=ticket.order_number, company_id=ticket.company_id
            )

        if ticket.status in OPEN_STATUSES:
            # The claim is still live, so the unit is genuinely on the bench.
            serial_service.attach_to_rma(db, row, rma_id=ticket.id)
            attached += 1
        # Closed/rejected/delivered tickets leave the unit at "sold" —
        # assign_to_order already put it there, which is correct: it went
        # back to the customer.

    return {"registered": registered, "attached": attached}


def _fresh_units(db: Session) -> int:
    created = 0
    for serial, sku, warehouse in FRESH_IN_STOCK:
        if serial_service.find_by_number(db, serial, company_id=COMPANY):
            continue
        results = serial_service.register_serials(
            db, [serial], company_id=COMPANY, sku=sku, warehouse_id=warehouse, source_type="manual"
        )
        if results and results[0].outcome == "created":
            created += 1
    return created


def _lifecycle_examples(db: Session) -> int:
    """One scrapped and one replaced unit, so every status has a row to show."""
    made = 0

    serial, sku, warehouse = SCRAPPED
    if not serial_service.find_by_number(db, serial, company_id=COMPANY):
        results = serial_service.register_serials(
            db, [serial], company_id=COMPANY, sku=sku, warehouse_id=warehouse, source_type="manual",
            notes="Damaged in warehouse handling — written off.",
        )
        if results and results[0].outcome == "created":
            row = serial_service.find_by_number(db, serial, company_id=COMPANY)
            serial_service.set_status(db, row, "scrapped")
            made += 1

    serial, sku, warehouse = REPLACED
    if not serial_service.find_by_number(db, serial, company_id=COMPANY):
        results = serial_service.register_serials(
            db, [serial], company_id=COMPANY, sku=sku, warehouse_id=warehouse, source_type="manual",
            notes="Retired after a warranty replacement.",
        )
        if results and results[0].outcome == "created":
            row = serial_service.find_by_number(db, serial, company_id=COMPANY)
            # No live ticket backs this historical example, so the lifecycle is
            # walked directly rather than through attach_to_rma/release_from_rma.
            serial_service.set_status(db, row, "sold")
            serial_service.set_status(db, row, "in_service")
            serial_service.set_status(db, row, "replaced")
            made += 1

    return made


def seed_serials(db: Session) -> dict[str, int]:
    if db.query(InventorySerial).count() > 0:
        return {"created": 0}

    backfill = _backfill_from_rma(db)
    fresh = _fresh_units(db)
    lifecycle = _lifecycle_examples(db)
    db.commit()

    return {
        "backfilled": backfill["registered"],
        "attached_to_open_claims": backfill["attached"],
        "fresh_in_stock": fresh,
        "lifecycle_examples": lifecycle,
        "total": db.query(InventorySerial).count(),
    }


def main() -> None:
    import scripts.init_db  # noqa: F401 — register all models

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        created = seed_serials(db)
        print(f"  Serial registry: {created.get('total', 0)} serial(s)")
        for key in sorted(k for k in created if k != "total"):
            print(f"    {key}: {created[key]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
