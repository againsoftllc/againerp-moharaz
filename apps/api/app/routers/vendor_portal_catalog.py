"""Vendor-facing product catalog — SPEC.md §10-12.

Reuses the existing CatalogProduct/Item catalog and InventoryStockLevel
directly; nothing here duplicates product or stock data. Every row is priced
and stock-labelled through the shared vendor pricing/stock-visibility
services so the portal, cart, and orders (once built) all agree.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.vendor_portal_auth import VendorIdentity, require_vendor_permission
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_group import VendorGroup
from app.schemas.vendor.catalog import VendorProductListResponse, VendorProductRead, VendorProductResponse
from app.services.vendor.vendor_catalog_visibility_service import resolve_visibility
from app.services.vendor.vendor_pricing_service import resolve_vendor_price
from app.services.vendor.vendor_stock_visibility import resolve_stock_display

router = APIRouter(prefix="/vendor-portal", tags=["vendor-portal-catalog"])


def _to_read(db: Session, vendor: Vendor, product: CatalogProduct, *, quantity: int = 1) -> Optional[VendorProductRead]:
    if not product.item_id:
        return None

    if not resolve_visibility(db, vendor=vendor, item_id=product.item_id):
        return None

    pricing = resolve_vendor_price(db, vendor=vendor, item_id=product.item_id, quantity=quantity)
    if not pricing:
        return None

    min_order_quantity = 1
    if vendor.vendor_group_id:
        group = db.get(VendorGroup, vendor.vendor_group_id)
        if group and group.min_order_quantity:
            min_order_quantity = group.min_order_quantity

    stock = resolve_stock_display(
        db, vendor=vendor, product_id=product.id, min_qty=min_order_quantity
    )

    brand = db.get(CatalogBrand, product.brand_id) if product.brand_id else None
    category = db.get(CatalogCategory, product.category_id) if product.category_id else None

    return VendorProductRead(
        id=product.id,
        item_id=product.item_id,
        name=product.name,
        sku=product.sku,
        model=product.model,
        brand=brand.name if brand else product.brand,
        category=category.name if category else product.category,
        thumbnail=product.thumbnail,
        short_description=product.short_description,
        warranty=product.warranty,
        stock_mode=stock.mode,
        stock_status=stock.status,
        stock_label=stock.label,
        available_quantity=stock.available_quantity if stock.mode == "exact" else None,
        list_price=pricing.list_price,
        unit_price=pricing.unit_price,
        discount_percent=pricing.discount_percent,
        price_source=pricing.source,
        min_order_quantity=min_order_quantity,
        max_order_quantity=None,
        orderable=stock.status != "out_of_stock",
    )


@router.get("/products", response_model=VendorProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.products.view")),
    search: Optional[str] = Query(default=None),
    brand_id: Optional[str] = Query(default=None),
    category_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> VendorProductListResponse:
    vendor = db.get(Vendor, identity.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    q = db.query(CatalogProduct).filter(CatalogProduct.status == "published")
    if search:
        like = f"%{search.strip()}%"
        q = q.filter((CatalogProduct.name.ilike(like)) | (CatalogProduct.sku.ilike(like)))
    if brand_id:
        q = q.filter(CatalogProduct.brand_id == brand_id)
    if category_id:
        q = q.filter(CatalogProduct.category_id == category_id)

    total = q.count()
    rows = q.order_by(CatalogProduct.name.asc()).offset(offset).limit(limit).all()
    items = [item for item in (_to_read(db, vendor, r) for r in rows) if item is not None]
    return VendorProductListResponse(data=items, total=total)


@router.get("/products/{product_id}", response_model=VendorProductResponse)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.products.view")),
    quantity: int = Query(default=1, ge=1),
) -> VendorProductResponse:
    vendor = db.get(Vendor, identity.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    product = db.get(CatalogProduct, product_id)
    if not product or product.status != "published":
        raise HTTPException(status_code=404, detail="Product not found")

    read = _to_read(db, vendor, product, quantity=quantity)
    if not read:
        raise HTTPException(status_code=404, detail="Product not found")
    return VendorProductResponse(data=read)
