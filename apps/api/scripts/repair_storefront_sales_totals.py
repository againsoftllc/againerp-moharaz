"""Repair sales_orders totals from linked commerce_orders (coupon/shipping/grand_total)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models.commerce_order import CommerceOrder  # noqa: E402
from app.models.sales import SalesOrder  # noqa: E402
from app.services.sales.sales_service import SalesService  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        svc = SalesService(db)
        sales_rows = (
            db.query(SalesOrder)
            .filter(SalesOrder.deleted_at.is_(None), SalesOrder.notes.isnot(None))
            .all()
        )
        fixed = 0
        for sales in sales_rows:
            notes = sales.notes or ""
            if "commerce_order_id=" not in notes:
                continue
            marker = notes.split("commerce_order_id=", 1)[1]
            commerce_id = marker.split()[0].strip().strip("·").strip()
            commerce = db.get(CommerceOrder, commerce_id)
            if not commerce:
                # try by order number
                commerce = (
                    db.query(CommerceOrder)
                    .filter(CommerceOrder.order_number == sales.order_number)
                    .first()
                )
            if not commerce:
                continue
            before = float(sales.total or 0)
            svc._ensure_storefront_payment_meta(sales, commerce)
            after = float(sales.total or 0)
            fixed += 1
            print(
                f"fixed {sales.order_number}: {before} -> {after} "
                f"(discount={commerce.discount_amount} shipping={commerce.shipping_amount})"
            )
        db.commit()
        print(f"ok repaired={fixed}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
