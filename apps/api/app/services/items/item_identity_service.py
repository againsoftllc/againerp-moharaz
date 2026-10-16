"""Universal Item identity SSOT — single write/read path for sku, name, type, status."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.item import Item
from app.services.items.catalog_item_bridge import (
    catalog_product_type_to_item_type,
    catalog_status_to_item_status,
)
from app.services.items.constants import (
    ITEM_STATUS_TO_CATALOG_STATUS,
    ITEM_TYPE_TO_CATALOG_PRODUCT_TYPE,
)
from app.services.items.interfaces import ItemCreateInput, ItemUpdateInput
from app.services.items.item_repository import SqlAlchemyItemRepository


class ItemIdentityService:
    """Items table is the authoritative identity store (ADR-014 P7)."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = SqlAlchemyItemRepository(db)

    def write_identity_to_ssot(self, product: CatalogProduct) -> str:
        """
        Persist identity fields from a catalog commerce row into `items`.
        Uses product.id as item.id when no link exists (stable 1:1 during migration).
        """
        item_id = product.item_id or product.id
        payload = ItemUpdateInput(
            sku=product.sku,
            name=product.name,
            item_type=catalog_product_type_to_item_type(product.product_type),
            status=catalog_status_to_item_status(product.status),
        )
        if self._repo.get_by_id(item_id):
            self._repo.update(item_id, payload)
        else:
            self._repo.create(
                ItemCreateInput(
                    id=item_id,
                    company_id=product.company_id,
                    sku=product.sku,
                    name=product.name,
                    item_type=payload.item_type or "physical",
                    status=payload.status or "draft",
                ),
            )
        product.item_id = item_id
        self._db.flush()
        return item_id

    def mirror_identity_to_catalog(self, product: CatalogProduct) -> None:
        """Mirror deprecated identity columns on catalog_products from items (API compat)."""
        if not product.item_id:
            return
        item = self._db.get(Item, product.item_id)
        if not item:
            return
        product.sku = item.sku
        product.name = item.name
        product.status = ITEM_STATUS_TO_CATALOG_STATUS.get(item.status, product.status)
        product.product_type = ITEM_TYPE_TO_CATALOG_PRODUCT_TYPE.get(
            item.item_type,
            product.product_type,
        )
        self._db.flush()

    def persist_and_mirror(self, product: CatalogProduct) -> str:
        """Write identity to SSOT then mirror back to catalog_products."""
        item_id = self.write_identity_to_ssot(product)
        self.mirror_identity_to_catalog(product)
        return item_id

    def resolve_identity(
        self,
        product: CatalogProduct,
    ) -> dict[str, str]:
        """Read identity for API responses — items first, catalog mirror fallback."""
        item = self._db.get(Item, product.item_id) if product.item_id else None
        return self.identity_from_item(product, item)

    @staticmethod
    def identity_from_item(
        product: CatalogProduct,
        item: Optional[Item],
    ) -> dict[str, str]:
        """Same as resolve_identity, with the items row already loaded (list pages batch it)."""
        if item:
            return {
                "sku": item.sku,
                "name": item.name,
                "status": ITEM_STATUS_TO_CATALOG_STATUS.get(item.status, product.status),
                "product_type": ITEM_TYPE_TO_CATALOG_PRODUCT_TYPE.get(
                    item.item_type,
                    product.product_type,
                ),
            }
        return {
            "sku": product.sku,
            "name": product.name,
            "status": product.status,
            "product_type": product.product_type,
        }

    def archive_linked_item(self, item_id: Optional[str]) -> None:
        """
        Archive the items SSOT row when its catalog product is permanently deleted.

        Items has no hard-delete/is_deleted concept (ADR-014 P7) — "archived" is the
        terminal status already used for the draft -> active -> archived lifecycle
        (see CATALOG_STATUS_TO_ITEM_STATUS), and every other module keeps FK
        references to items.id (some RESTRICT on transaction history), so hard
        deleting the row is unsafe. Archiving removes it from active pickers
        (e.g. the Sales "Add a product" search) without breaking those references.
        """
        if not item_id:
            return
        self._repo.update(item_id, ItemUpdateInput(status="archived"))

    def mirror_item_to_linked_catalog_products(self, item_id: str) -> int:
        """When items API updates identity, refresh catalog mirror rows."""
        item = self._db.get(Item, item_id)
        if not item:
            return 0
        rows = (
            self._db.query(CatalogProduct)
            .filter(CatalogProduct.item_id == item_id)
            .all()
        )
        for product in rows:
            product.sku = item.sku
            product.name = item.name
            product.status = ITEM_STATUS_TO_CATALOG_STATUS.get(item.status, product.status)
            product.product_type = ITEM_TYPE_TO_CATALOG_PRODUCT_TYPE.get(
                item.item_type,
                product.product_type,
            )
        if rows:
            self._db.flush()
        return len(rows)

    def sku_taken(
        self,
        sku: str,
        *,
        company_id: str = "default",
        exclude_item_id: Optional[str] = None,
        exclude_product_id: Optional[str] = None,
    ) -> bool:
        """Uniqueness check against items SSOT and legacy catalog mirror."""
        item_query = self._db.query(Item).filter(
            Item.company_id == company_id,
            Item.sku == sku,
        )
        if exclude_item_id:
            item_query = item_query.filter(Item.id != exclude_item_id)
        if item_query.first():
            return True

        catalog_query = self._db.query(CatalogProduct).filter(CatalogProduct.sku == sku)
        if exclude_product_id:
            catalog_query = catalog_query.filter(CatalogProduct.id != exclude_product_id)
        return catalog_query.first() is not None
