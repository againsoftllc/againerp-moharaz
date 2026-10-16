"""Resolve stock row display fields from items SSOT (P7 — stop relying on denorm columns)."""

from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.item import Item


def resolve_stock_display(
    db: Session,
    stock: InventoryStockLevel,
    *,
    variant: Optional[CatalogProductVariant] = None,
    product: Optional[CatalogProduct] = None,
) -> Tuple[str, str, Optional[str]]:
    """
    Return (sku, name, thumbnail) for API responses.
    Identity (sku, name) comes from items; thumbnail from commerce extension.
    """
    sku = stock.sku
    name = stock.name
    thumbnail = stock.thumbnail

    item: Optional[Item] = None
    if stock.item_id:
        item = db.get(Item, stock.item_id)

    if item:
        sku = item.sku
        name = item.name

    if variant is None and stock.variant_id:
        variant = db.get(CatalogProductVariant, stock.variant_id)

    if variant and variant.name and variant.name != "Default":
        name = f"{name} — {variant.name}"
        if not item:
            sku = variant.sku

    if product is None and stock.product_id:
        product = db.get(CatalogProduct, stock.product_id)

    if product and product.thumbnail:
        thumbnail = product.thumbnail

    return sku, name, thumbnail
