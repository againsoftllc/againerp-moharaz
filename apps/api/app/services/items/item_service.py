"""Item domain service — core CRUD over ItemRepository."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.services.items.interfaces import ItemCreateInput, ItemRecord, ItemUpdateInput
from app.services.items.item_repository import SqlAlchemyItemRepository


class ItemService:
    def __init__(self, db: Session) -> None:
        self._repo = SqlAlchemyItemRepository(db)

    def get(self, item_id: str, *, company_id: Optional[str] = None) -> Optional[ItemRecord]:
        record = self._repo.get_by_id(item_id)
        if record is not None and company_id is not None and record.company_id != company_id:
            return None
        return record

    def list(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ItemRecord]:
        return self._repo.list_items(
            company_id=company_id,
            status=status,
            limit=limit,
            offset=offset,
        )

    def create(self, data: ItemCreateInput) -> ItemRecord:
        return self._repo.create(data)

    def update(
        self,
        item_id: str,
        data: ItemUpdateInput,
        *,
        company_id: Optional[str] = None,
    ) -> Optional[ItemRecord]:
        if company_id is not None:
            existing = self._repo.get_by_id(item_id)
            if existing is None or existing.company_id != company_id:
                return None
        return self._repo.update(item_id, data)
