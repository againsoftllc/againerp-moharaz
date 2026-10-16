"""Vendor cart — SPEC.md §18.

Cart lines store only (item_id, quantity). Price/stock/eligibility are
always resolved live through the same services the catalog browse endpoints
use, so a vendor never sees a stale price in the cart.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.item import Item
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_cart import VendorCart, VendorCartItem
from app.models.vendor.vendor_group import VendorGroup
from app.services.vendor.vendor_catalog_visibility_service import resolve_visibility
from app.services.vendor.vendor_pricing_service import resolve_vendor_price
from app.services.vendor.vendor_stock_visibility import resolve_stock_display


@dataclass(frozen=True)
class CartLineView:
    item_id: str
    sku: str
    name: str
    quantity: int
    list_price: Decimal
    unit_price: Decimal
    line_total: Decimal
    stock_status: str
    orderable: bool
    issue: Optional[str]  # None when the line is submittable


@dataclass(frozen=True)
class CartView:
    cart_id: str
    lines: list[CartLineView]
    subtotal: Decimal
    min_order_quantity: int
    has_blocking_issues: bool


def get_or_create_cart(db: Session, vendor_id: str) -> VendorCart:
    cart = db.query(VendorCart).filter(VendorCart.vendor_id == vendor_id).first()
    if cart:
        return cart
    cart = VendorCart(vendor_id=vendor_id)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart


def set_item_quantity(db: Session, *, vendor_id: str, item_id: str, quantity: int) -> VendorCart:
    if not db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")

    cart = get_or_create_cart(db, vendor_id)
    row = db.query(VendorCartItem).filter(VendorCartItem.cart_id == cart.id, VendorCartItem.item_id == item_id).first()

    if quantity <= 0:
        if row:
            db.delete(row)
            db.commit()
        return cart

    if row:
        row.quantity = quantity
    else:
        db.add(VendorCartItem(cart_id=cart.id, item_id=item_id, quantity=quantity))
    db.commit()
    return cart


def clear_cart(db: Session, cart: VendorCart) -> None:
    db.query(VendorCartItem).filter(VendorCartItem.cart_id == cart.id).delete()
    db.commit()


def build_cart_view(db: Session, vendor: Vendor, cart: VendorCart) -> CartView:
    min_order_quantity = 1
    if vendor.vendor_group_id:
        group = db.get(VendorGroup, vendor.vendor_group_id)
        if group and group.min_order_quantity:
            min_order_quantity = group.min_order_quantity

    lines: list[CartLineView] = []
    subtotal = Decimal("0")
    has_blocking_issues = False

    rows = db.query(VendorCartItem).filter(VendorCartItem.cart_id == cart.id).all()
    for row in rows:
        item = db.get(Item, row.item_id)
        product = db.query(CatalogProduct).filter(CatalogProduct.item_id == row.item_id).first()

        issue: Optional[str] = None
        if not item:
            issue = "Item no longer exists"
        elif not product or product.status != "published":
            issue = "Product is no longer available"
        elif not resolve_visibility(db, vendor=vendor, item_id=row.item_id):
            issue = "This product is not available to your account"

        pricing = None if issue else resolve_vendor_price(db, vendor=vendor, item_id=row.item_id, quantity=row.quantity)
        if not issue and not pricing:
            issue = "No price available for this vendor"

        stock = None
        if not issue and product:
            stock = resolve_stock_display(db, vendor=vendor, product_id=product.id, min_qty=min_order_quantity)
            if stock.status == "out_of_stock":
                issue = "Out of stock"

        if not issue and row.quantity < min_order_quantity:
            issue = f"Minimum order quantity is {min_order_quantity}"

        list_price = pricing.list_price if pricing else Decimal("0")
        unit_price = pricing.unit_price if pricing else Decimal("0")
        line_total = (unit_price * row.quantity) if pricing else Decimal("0")
        if not issue:
            subtotal += line_total
        else:
            has_blocking_issues = True

        lines.append(
            CartLineView(
                item_id=row.item_id,
                sku=item.sku if item else "—",
                name=item.name if item else "Unknown item",
                quantity=row.quantity,
                list_price=list_price,
                unit_price=unit_price,
                line_total=line_total,
                stock_status=stock.status if stock else "unknown",
                orderable=issue is None,
                issue=issue,
            )
        )

    return CartView(
        cart_id=cart.id,
        lines=lines,
        subtotal=subtotal,
        min_order_quantity=min_order_quantity,
        has_blocking_issues=has_blocking_issues,
    )
