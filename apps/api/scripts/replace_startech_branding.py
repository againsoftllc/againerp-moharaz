"""Replace Star Tech branding in product HTML with Againcart (DB cleanup)."""

from __future__ import annotations

from sqlalchemy import text

from app.database import SessionLocal
from app.services.brand_rewrite import rewrite_startech_to_againcart, storefront_base

TABLE_COLUMNS: list[tuple[str, list[str]]] = [
    (
        "ecommerce_items",
        ["full_description", "short_description", "seo_description", "seo_title"],
    ),
    (
        "catalog_products",
        ["description", "short_description", "seo_description", "seo_title"],
    ),
]


def existing_columns(db, table: str, cols: list[str]) -> list[str]:
    found: list[str] = []
    for col in cols:
        row = db.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_name = :table AND column_name = :col
                """
            ),
            {"table": table, "col": col},
        ).first()
        if row:
            found.append(col)
    return found


def main() -> None:
    print(f"Againcart base URL: {storefront_base()}")
    db = SessionLocal()
    try:
        total_rows = 0
        total_fields = 0
        for table, cols in TABLE_COLUMNS:
            cols = existing_columns(db, table, cols)
            if not cols:
                print(f"{table}: no matching columns, skip")
                continue
            where = " OR ".join(
                f"COALESCE({c}, '') ILIKE '%startech%' OR COALESCE({c}, '') ILIKE '%star tech%'"
                for c in cols
            )
            rows = db.execute(
                text(f"SELECT id, {', '.join(cols)} FROM {table} WHERE {where}")
            ).fetchall()
            print(f"{table}: {len(rows)} candidate row(s) across {cols}")
            for row in rows:
                row_id = row[0]
                updates: dict[str, str] = {}
                for i, col in enumerate(cols):
                    original = row[i + 1]
                    new_val = rewrite_startech_to_againcart(original)
                    if new_val is not None and new_val != original:
                        updates[col] = new_val
                        total_fields += 1
                if not updates:
                    continue
                set_clause = ", ".join(f"{c} = :{c}" for c in updates)
                db.execute(
                    text(f"UPDATE {table} SET {set_clause} WHERE id = :id"),
                    {**updates, "id": row_id},
                )
                total_rows += 1
        db.commit()
        print(f"Updated {total_rows} row(s), {total_fields} field(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
