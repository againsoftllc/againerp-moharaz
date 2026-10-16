"""Remove seeded commerce orders whose customer no longer exists.

The old demo seed inserted `ord_1001`..`ord_1012` against customers `c1`/`c2`/`c3`.
Those customers were dropped when the catalog was rebuilt for the IT demo, so the
orders can never mirror into `sales_orders` and only inflate the per-site order
count on Workspace -> Sites. Child rows (items, addresses, events, shipments)
cascade; the loosely-linked tables are cleared explicitly.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.database import SessionLocal

# Tables that reference an order id without a cascading foreign key.
LOOSE_REFERENCES = (
    ("commerce_order_refunds", "order_id"),
    ("commerce_order_returns", "order_id"),
    ("rma_tickets", "order_id"),
    ("storefront_customer_cases", "order_id"),
    ("bkash_payments", "order_id"),
    ("sslcommerz_payments", "order_id"),
    ("paypal_payments", "order_id"),
    ("stripe_payments", "order_id"),
)


def main() -> None:
    db = SessionLocal()
    try:
        orphans = [
            row[0]
            for row in db.execute(
                text(
                    """
                    SELECT o.id
                    FROM commerce_orders o
                    LEFT JOIN commerce_customers c ON c.id = o.customer_id
                    WHERE o.customer_id IS NULL OR c.id IS NULL
                    """
                )
            )
        ]
        if not orphans:
            print("No orphan demo orders found.")
            return

        print(f"Deleting {len(orphans)} orphan order(s): {', '.join(sorted(orphans))}")
        for table, column in LOOSE_REFERENCES:
            result = db.execute(
                text(f"DELETE FROM {table} WHERE {column} = ANY(:ids)"),
                {"ids": orphans},
            )
            if result.rowcount:
                print(f"  {table}: {result.rowcount} row(s)")

        db.execute(
            text("UPDATE inventory_serials SET order_id = NULL WHERE order_id = ANY(:ids)"),
            {"ids": orphans},
        )
        deleted = db.execute(
            text("DELETE FROM commerce_orders WHERE id = ANY(:ids)"),
            {"ids": orphans},
        )
        db.commit()
        print(f"Removed {deleted.rowcount} commerce order(s).")

        remaining = db.execute(text("SELECT COUNT(*) FROM commerce_orders")).scalar()
        sales = db.execute(
            text("SELECT COUNT(*) FROM sales_orders WHERE deleted_at IS NULL")
        ).scalar()
        print(f"commerce_orders={remaining}  sales_orders={sales}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
