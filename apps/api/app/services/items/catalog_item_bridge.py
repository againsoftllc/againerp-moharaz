"""Catalog product ↔ Universal Item compatibility bridge."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_variant import CatalogProductVariant
from app.services.items.constants import (
    CATALOG_PRODUCT_TYPE_TO_ITEM_TYPE,
    CATALOG_STATUS_TO_ITEM_STATUS,
)
from app.services.items.interfaces import ItemCreateInput, ItemUpdateInput
from app.services.items.item_repository import SqlAlchemyItemRepository


def catalog_product_type_to_item_type(product_type: str) -> str:
    return CATALOG_PRODUCT_TYPE_TO_ITEM_TYPE.get(product_type, "physical")


def catalog_status_to_item_status(status: str) -> str:
    return CATALOG_STATUS_TO_ITEM_STATUS.get(status, "draft")


def ensure_item_for_catalog_product(db: Session, product: CatalogProduct) -> str:
    """
    Ensure a Universal Item exists for the catalog product.
    Uses product.id as item.id for stable 1:1 mapping during migration.
    Returns item_id.
    """
    repo = SqlAlchemyItemRepository(db)

    if product.item_id:
        existing = repo.get_by_id(product.item_id)
        if existing:
            sync_item_from_catalog_product(db, product)
            _sync_ecommerce_draft(db, product)
            return product.item_id

    item_id = product.id
    existing_by_id = repo.get_by_id(item_id)
    if existing_by_id:
        product.item_id = item_id
        sync_item_from_catalog_product(db, product)
        _sync_ecommerce_draft(db, product)
        db.flush()
        return item_id

    repo.create(
        ItemCreateInput(
            id=item_id,
            company_id=product.company_id,
            sku=product.sku,
            name=product.name,
            item_type=catalog_product_type_to_item_type(product.product_type),
            status=catalog_status_to_item_status(product.status),
        ),
    )
    product.item_id = item_id
    _sync_ecommerce_draft(db, product)
    db.flush()
    return item_id


def _sync_ecommerce_draft(db: Session, product: CatalogProduct) -> None:
    """Create ecommerce extension if missing — never auto-publish existing rows."""
    from app.services.ecommerce.ecommerce_item_service import EcommerceItemService

    service = EcommerceItemService(db)
    item_id = product.item_id or product.id
    if service.get_by_item_id(item_id):
        return
    service.sync_content_from_catalog(product, mirror_publish=False)


def sync_item_from_catalog_product(db: Session, product: CatalogProduct) -> None:
    """Push identity fields to items SSOT and mirror back to catalog (P7)."""
    from app.services.items.item_identity_service import ItemIdentityService

    ItemIdentityService(db).persist_and_mirror(product)


def ensure_default_variant(db: Session, product: CatalogProduct) -> CatalogProductVariant:
    """Every stocked catalog product needs at least one variant row.

    Inventory stock levels are keyed by variant_id. Amazon/dropship imports used
    to create the product + item and skip this row, which blocked GRN posting.
    """
    existing = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product.id)
        .order_by(CatalogProductVariant.is_default.desc(), CatalogProductVariant.sort_order)
        .first()
    )
    if existing:
        return existing

    sku = (product.sku or "").strip() or f"VAR-{product.id[:8]}"
    taken = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.sku == sku)
        .first()
    )
    if taken:
        n = 2
        while True:
            candidate = f"{sku[:90]}-{n}"
            if not db.query(CatalogProductVariant).filter(CatalogProductVariant.sku == candidate).first():
                sku = candidate
                break
            n += 1

    row = CatalogProductVariant(
        company_id=product.company_id or "default",
        product_id=product.id,
        sku=sku,
        name="Default",
        price=product.price,
        stock=product.stock,
        status=product.status or "draft",
        is_default=True,
        sort_order=0,
    )
    db.add(row)
    db.flush()
    return row


def get_item_id_for_product(db: Session, product_id: str) -> Optional[str]:
    product = db.get(CatalogProduct, product_id)
    if not product:
        return None
    if product.item_id:
        return product.item_id
    return ensure_item_for_catalog_product(db, product)
