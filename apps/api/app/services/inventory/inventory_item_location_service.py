"""Business Locations — which warehouses a product is available at (delete+insert sync)."""

from __future__ import annotations

from typing import List

from sqlalchemy.orm import Session

from app.models.inventory_item_location import InventoryItemLocation


class InventoryItemLocationService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def replace_locations(
        self,
        *,
        item_id: str,
        warehouse_ids: List[str],
        company_id: str = "default",
    ) -> None:
        """Full delete-then-insert sync of an item's available warehouses."""
        self._db.query(InventoryItemLocation).filter(
            InventoryItemLocation.item_id == item_id,
        ).delete()
        seen: set[str] = set()
        for warehouse_id in warehouse_ids:
            if not warehouse_id or warehouse_id in seen:
                continue
            seen.add(warehouse_id)
            self._db.add(
                InventoryItemLocation(
                    company_id=company_id,
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                ),
            )
        self._db.flush()
