"""Vendor pricing engine — SPEC.md §13-17.

Single place price gets resolved for the vendor portal, cart, and (later)
order requests. Do not recompute price anywhere else — call
`resolve_vendor_price` and use its `.unit_price`.

Priority (highest wins), per §13:
  1. VendorProductPrice   — vendor-specific override for this item
  2. Vendor's own price list (vendor.price_list_id)
  3. Vendor group's price list (group.price_list_id)
  4. CatalogProduct.price — existing product/channel default

Whichever tier resolves the base price, the vendor group's
`default_discount_percent` (SPEC §16, simplified for Phase 1 — the full
rule engine is Phase 2) is then applied on top.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_group import VendorGroup
from app.models.vendor.vendor_pricing import VendorPriceListItem, VendorProductPrice

TWO_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class VendorPriceResolution:
    unit_price: Decimal
    list_price: Decimal
    discount_percent: Decimal
    source: str  # vendor_override | vendor_price_list | group_price_list | product_default


def _round(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _tier_price(db: Session, model, owner_field: str, owner_id: str, item_id: str, quantity: int):
    rows = (
        db.query(model)
        .filter(
            getattr(model, owner_field) == owner_id,
            model.item_id == item_id,
            model.is_active.is_(True),
            model.min_qty <= quantity,
        )
        .all()
    )
    applicable = [r for r in rows if r.max_qty is None or quantity <= r.max_qty]
    if not applicable:
        return None
    # Highest min_qty that still qualifies is the tightest matching quantity break.
    return max(applicable, key=lambda r: r.min_qty)


def _price_list_price(db: Session, price_list_id: Optional[str], item_id: str, quantity: int):
    if not price_list_id:
        return None
    return _tier_price(db, VendorPriceListItem, "price_list_id", price_list_id, item_id, quantity)


def resolve_vendor_price(
    db: Session,
    *,
    vendor: Vendor,
    item_id: str,
    quantity: int = 1,
) -> Optional[VendorPriceResolution]:
    quantity = max(quantity, 1)

    override = _tier_price(db, VendorProductPrice, "vendor_id", vendor.id, item_id, quantity)
    if override:
        list_price = override.unit_price
        source = "vendor_override"
    else:
        row = _price_list_price(db, vendor.price_list_id, item_id, quantity)
        if row:
            list_price = row.unit_price
            source = "vendor_price_list"
        else:
            group = db.get(VendorGroup, vendor.vendor_group_id) if vendor.vendor_group_id else None
            row = _price_list_price(db, group.price_list_id if group else None, item_id, quantity)
            if row:
                list_price = row.unit_price
                source = "group_price_list"
            else:
                product = db.query(CatalogProduct).filter(CatalogProduct.item_id == item_id).first()
                if not product:
                    return None
                list_price = product.price
                source = "product_default"

    discount_percent = Decimal("0")
    if vendor.vendor_group_id:
        group = db.get(VendorGroup, vendor.vendor_group_id)
        if group:
            discount_percent = group.default_discount_percent

    unit_price = list_price
    if discount_percent > 0:
        unit_price = _round(list_price * (Decimal("100") - discount_percent) / Decimal("100"))

    return VendorPriceResolution(
        unit_price=unit_price,
        list_price=list_price,
        discount_percent=discount_percent,
        source=source,
    )
