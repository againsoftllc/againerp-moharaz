"""SQLAlchemy implementation of ItemRepository."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.item import Item
from app.services.items.interfaces import ItemCreateInput, ItemRecord, ItemUpdateInput


def item_to_record(row: Item) -> ItemRecord:
    return ItemRecord(
        id=row.id,
        company_id=row.company_id,
        sku=row.sku,
        barcode=row.barcode,
        name=row.name,
        item_type=row.item_type,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlAlchemyItemRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, item_id: str) -> Optional[ItemRecord]:
        row = self._db.get(Item, item_id)
        return item_to_record(row) if row else None

    def get_by_sku(self, company_id: str, sku: str) -> Optional[ItemRecord]:
        row = (
            self._db.query(Item)
            .filter(Item.company_id == company_id, Item.sku == sku)
            .first()
        )
        return item_to_record(row) if row else None

    def list_items(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ItemRecord]:
        query = self._db.query(Item).filter(Item.company_id == company_id)
        if status:
            query = query.filter(Item.status == status)
        rows = (
            query.order_by(Item.updated_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return [item_to_record(row) for row in rows]

    def create(self, data: ItemCreateInput) -> ItemRecord:
        row = Item(
            id=data.id or str(uuid.uuid4()),
            company_id=data.company_id,
            sku=data.sku,
            barcode=data.barcode,
            name=data.name,
            item_type=data.item_type,
            status=data.status,
        )
        self._db.add(row)
        self._db.flush()
        return item_to_record(row)

    def update(self, item_id: str, data: ItemUpdateInput) -> Optional[ItemRecord]:
        row = self._db.get(Item, item_id)
        if not row:
            return None
        updates = {
            "sku": data.sku,
            "barcode": data.barcode,
            "name": data.name,
            "item_type": data.item_type,
            "status": data.status,
        }
        for key, value in updates.items():
            if value is not None:
                setattr(row, key, value)
        self._db.flush()
        return item_to_record(row)
