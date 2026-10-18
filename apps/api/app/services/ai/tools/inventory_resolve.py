"""Finding the item and the warehouse the admin means - shared by the stock tools (adjust, transfer).

An item is found with the ranked record search (any word order, typos, Bangla / Banglish names); when two items are about equally good the
caller gets the candidates and must ask the user - never a guess. A warehouse is found by id, code or name (default: the main one).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai import record_search


class InventoryResolver:
    def __init__(self, db: Session, company_id: str | None):
        self.db = db
        self.company_id = company_id

    def conn(self):
        return self.db.get_bind().connect()

    def find_item(self, q: str) -> dict:
        with self.conn() as conn:
            rows = record_search.search_target(
                conn, company_id=self.company_id, table="items", id_col="id", label_cols=("name",), search_cols=("name", "sku", "barcode"),
                extra_cols=("sku", "status"), q=q, limit=6, trgm=record_search.has_trgm(conn),
            )
        if not rows:
            return {"error": f"No item matches '{q}'."}
        close = [r for r in rows if rows[0]["score"] - r["score"] <= 10]
        if len(close) > 1 and rows[0]["score"] < 100:
            return {"error": f"'{q}' matches several items - ask the user which one.", "candidates": [{"id": r["id"], "name": r["name"], "sku": r.get("sku")} for r in close]}
        return {"ok": rows[0]}

    def warehouse(self, q: Optional[str]) -> dict:
        with self.conn() as conn:
            if q:
                rows = conn.execute(
                    text("select id, name from inventory_warehouses where company_id = :c and is_active and (id = :q or lower(code) = lower(:q) or name ilike :like) limit 4"),
                    {"c": self.company_id, "q": q, "like": f"%{q}%"},
                ).all()
                if len(rows) == 1:
                    return {"ok": {"id": rows[0][0], "name": rows[0][1]}}
                if len(rows) > 1:
                    return {"error": f"'{q}' matches several warehouses - ask which one.", "candidates": [{"id": r[0], "name": r[1]} for r in rows]}
                return {"error": f"No warehouse matches '{q}'."}
            rows = conn.execute(
                text("select id, name from inventory_warehouses where company_id = :c and is_active order by is_default desc, created_at limit 2"), {"c": self.company_id}
            ).all()
        if not rows:
            return {"error": "There is no active warehouse."}
        return {"ok": {"id": rows[0][0], "name": rows[0][1]}}

    def tracked_by(self, item_id: str) -> Optional[str]:
        """'serial' / 'batch' when the item needs serial or batch numbers (those are done in the Inventory screen), else None."""
        with self.conn() as conn:
            row = conn.execute(
                text("select coalesce(track_serial, false), coalesce(track_batch, false) from inventory_items where company_id = :c and item_id = :i limit 1"),
                {"c": self.company_id, "i": item_id},
            ).first()
        if row and row[0]:
            return "serial"
        if row and row[1]:
            return "batch"
        return None

    def stock(self, item_id: str, warehouse_id: str) -> tuple[int, int]:
        """(on_hand, reserved) of an item in a warehouse."""
        with self.conn() as conn:
            row = conn.execute(
                text("select coalesce(on_hand, 0), coalesce(reserved, 0) from inventory_stock_levels where company_id = :c and item_id = :i and warehouse_id = :w limit 1"),
                {"c": self.company_id, "i": item_id, "w": warehouse_id},
            ).first()
        return (int(row[0]), int(row[1])) if row else (0, 0)
