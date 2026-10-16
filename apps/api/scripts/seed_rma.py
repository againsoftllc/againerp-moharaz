"""Seed a handful of warranty claims across the RMA workflow.

Builds on the seeded orders so each claim has a real customer and purchase date
behind it, which is what makes the warranty verdict meaningful. Idempotent —
matched on the RMA number, so re-running only fills gaps.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.commerce_supplier import CommerceSupplier
from app.models.rma import RmaCharge, RmaStatusHistory, RmaSupplierJob, RmaTicket
from app.services.rma import rma_service

COMPANY = "default"

# Claims need products that actually carry a warranty term. The catalog seed
# leaves `warranty` empty, so give a few demo SKUs a realistic one.
WARRANTY_BACKFILL = {
    "SKU-AMD-7800X3D": "3 years",
    "SKU-ANK-737": "1 year",
    "SKU-APC-1KVA": "2 years",
    "SKU-LOGI-MX3S": "1 year",
    "SKU-SNY-XM5": "1 year",
    "SKU-DELL-15": "6 months",
}


def _backfill_warranty(db: Session) -> int:
    filled = 0
    for sku, term in WARRANTY_BACKFILL.items():
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == sku).first()
        if product and not (product.warranty or "").strip():
            product.warranty = term
            filled += 1
    if filled:
        db.flush()
    return filled


def _walk(db: Session, ticket: RmaTicket, path: list[str], actor: str = "seed") -> None:
    for status in path:
        rma_service.change_status(db, ticket, status, actor=actor, note="Seeded stage")


def seed_rma(db: Session) -> dict[str, int]:
    created: dict[str, int] = {"warranty_backfilled": _backfill_warranty(db)}

    if db.query(RmaTicket).count() > 0:
        created["tickets"] = 0
        return created

    orders = (
        db.query(CommerceOrder)
        .order_by(CommerceOrder.created_at.desc())
        .limit(6)
        .all()
    )
    if not orders:
        created["tickets"] = 0
        return created

    supplier = (
        db.query(CommerceSupplier)
        .filter(CommerceSupplier.status != "blocked")
        .order_by(CommerceSupplier.name)
        .first()
    )

    def first_sku(order: CommerceOrder) -> Optional[str]:
        item = (
            db.query(CommerceOrderItem)
            .filter(CommerceOrderItem.order_id == order.id)
            .first()
        )
        return item.sku if item else None

    plans = [
        # (fault, serial, path, charges, supplier job, bill)
        (
            "Unit shuts down under sustained load.",
            "SN-DEMO-10021",
            ["diagnosing", "in_repair"],
            [],
            False,
            False,
        ),
        (
            "No power at all, dead on arrival after 14 months.",
            "SN-DEMO-10022",
            ["diagnosing", "awaiting_approval", "in_repair", "ready_for_delivery"],
            [
                ("part", "Replacement power board", Decimal("1"), Decimal("3200"), Decimal("5")),
                ("labour", "Bench diagnostics (1.5h)", Decimal("1.5"), Decimal("750"), Decimal("0")),
            ],
            False,
            True,
        ),
        (
            "Intermittent fault — needs manufacturer inspection.",
            "SN-DEMO-10023",
            ["diagnosing", "sent_to_supplier", "at_supplier"],
            [],
            True,
            False,
        ),
        (
            "Screen flicker reported by customer.",
            "SN-DEMO-10024",
            ["diagnosing", "in_repair", "ready_for_delivery", "delivered"],
            [("labour", "Cable reseat and test", Decimal("1"), Decimal("500"), Decimal("0"))],
            False,
            False,
        ),
        (
            "Physical damage — liquid ingress.",
            "SN-DEMO-10025",
            ["diagnosing", "rejected"],
            [],
            False,
            False,
        ),
    ]

    made = 0
    for order, (fault, serial, path, charges, needs_supplier, should_bill) in zip(orders, plans):
        sku = first_sku(order)
        if not sku:
            continue

        ticket = rma_service.create_ticket(
            db,
            rma_service.TicketIntake(
                fault_reported=fault,
                company_id=COMPANY,
                order_number=order.order_number,
                sku=sku,
                serial_number=serial,
                received_by="Service desk",
                accessories="Box, cable",
                priority="normal",
                created_by="seed",
            ),
        )

        if needs_supplier and supplier:
            rma_service.upsert_supplier_job(
                db,
                ticket,
                supplier_id=supplier.id,
                status="dispatched",
                dispatched_at=date.today() - timedelta(days=4),
                supplier_reference=f"SUP-RMA-{made + 1:04d}",
                expected_return_date=date.today() + timedelta(days=10),
                notes="Sent for manufacturer inspection.",
            )

        for kind, description, qty, price, tax in charges:
            rma_service.add_charge(
                db,
                ticket,
                kind=kind,
                description=description,
                quantity=qty,
                unit_price=price,
                tax_rate=tax,
            )

        _walk(db, ticket, path)

        if should_bill:
            # Out-of-warranty repairs get invoiced; force the verdict so the demo
            # shows a billed claim even when the seeded order is recent.
            rma_service.set_warranty(
                db,
                ticket,
                status="out_of_warranty",
                note="Purchased outside the covered period.",
                expires_on=date.today() - timedelta(days=45),
                actor="seed",
            )
            if ticket.customer_id and ticket.total > 0:
                rma_service.raise_bill(db, ticket, due_date=date.today() + timedelta(days=30))

        made += 1

    created["tickets"] = made
    created["charges"] = db.query(RmaCharge).count()
    created["supplier_jobs"] = db.query(RmaSupplierJob).count()
    created["history_entries"] = db.query(RmaStatusHistory).count()
    db.commit()
    return created


def main() -> None:
    import scripts.init_db  # noqa: F401 — register all models

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        created = seed_rma(db)
        print(f"  RMA seed: {created.get('tickets', 0)} ticket(s)")
        for key in sorted(created):
            print(f"    {key}: {created[key]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
