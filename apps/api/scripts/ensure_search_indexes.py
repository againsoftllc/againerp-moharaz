"""Install pg_trgm and the trigram indexes the AI's record search needs (docs/AI/ai.md, step 2.1).

`ILIKE '%word%'` cannot use a normal index, so on a big table (36,000 items, 36,000 products, 1,800 customers here) every search scans
the whole table. A GIN trigram index makes it an index lookup and also powers the typo fallback (similarity). Safe to run again
(IF NOT EXISTS). If the database user may not create the extension (some managed hosts), it says so and the search still works,
only without the typo fallback and the speed-up.

    python -m scripts.ensure_search_indexes
"""
from __future__ import annotations

from sqlalchemy import text

import scripts.init_db  # noqa: F401 - registers every model
from app.database import engine

# table -> columns people search by (only tables where a scan hurts)
INDEXES: dict[str, tuple[str, ...]] = {
    "items": ("name", "sku"),
    "catalog_products": ("name", "sku"),
    "commerce_customers": ("name", "customer_code", "phone", "email"),
    "commerce_suppliers": ("name", "vendor_code"),
    "sales_orders": ("order_number", "invoice_number"),
    "sales_invoices": ("invoice_number",),
    "purchase_orders": ("po_number",),
    "hrm_employees": ("name", "employee_code"),
}


def ensure_search_indexes() -> str:
    """Returns a one-line report."""
    with engine.begin() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        except Exception as exc:  # noqa: BLE001
            return f"pg_trgm could not be installed ({str(exc).splitlines()[0][:120]}) - search works without the typo fallback / speed-up"
    made = 0
    with engine.begin() as conn:
        existing = {t for (t,) in conn.execute(text("select table_name from information_schema.tables where table_schema = 'public'"))}
        cols = {(t, c) for t, c in conn.execute(text("select table_name, column_name from information_schema.columns where table_schema = 'public'"))}
        for table, columns in INDEXES.items():
            if table not in existing:
                continue
            for col in columns:
                if (table, col) not in cols:
                    continue
                conn.execute(text(f'CREATE INDEX IF NOT EXISTS ix_trgm_{table}_{col} ON "{table}" USING gin (("{col}"::text) gin_trgm_ops)'))
                made += 1
    return f"pg_trgm on; {made} trigram indexes ensured"


if __name__ == "__main__":
    print(ensure_search_indexes())
