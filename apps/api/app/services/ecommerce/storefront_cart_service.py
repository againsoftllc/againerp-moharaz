"""Production storefront cart — ecommerce_items SSOT (STEP 05)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.auth_user import AuthUser
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.ecommerce_item import EcommerceItem
from app.models.storefront_cart import StorefrontCart, StorefrontCartItem
from app.security import new_session_token
from app.services.ecommerce.ecommerce_item_service import (
    EcommerceItemService,
    _resolve_storefront_in_stock,
)
from app.services.ecommerce.checkout_tax_availability import (
    tax_is_included_in_price,
    tax_rate_percent,
)
from app.services.ecommerce.publish_service import EcommercePublishService

FREE_SHIPPING_THRESHOLD = Decimal("2000")
STANDARD_SHIPPING = Decimal("80")


class CartError(ValueError):
    """Cart business rule violation."""


@dataclass(frozen=True)
class CartLineSnapshot:
    item_id: str
    product_id: str
    slug: str
    name: str
    thumbnail: Optional[str]
    unit_price: Decimal
    compare_at_price: Optional[Decimal]
    variant_id: Optional[str]
    variant_label: Optional[str]
    sku_snapshot: Optional[str]
    attributes_json: Optional[str]
    in_stock: bool
    available_qty: int
    track_quantity: bool


@dataclass(frozen=True)
class CartValidationIssue:
    cart_item_id: str
    item_id: str
    code: str
    message: str
    blocking: bool


class StorefrontCartService:
    def __init__(self, db: Session, *, allow_out_of_stock: bool = False) -> None:
        self._db = db
        self._items = EcommerceItemService(db)
        self._publish = EcommercePublishService(db)
        # Site option "Stock Checkout": when on, an out-of-stock line is a
        # warning the shopper can push past instead of a hard stop.
        self._allow_out_of_stock = allow_out_of_stock

    def load_cart(self, cart_id: str) -> StorefrontCart:
        cart = (
            self._db.query(StorefrontCart)
            .options(joinedload(StorefrontCart.items))
            .filter(StorefrontCart.id == cart_id)
            .first()
        )
        if not cart:
            raise CartError("Cart not found")
        return cart

    def get_or_create_cart(
        self,
        *,
        cart_token: Optional[str] = None,
        user: Optional[AuthUser] = None,
    ) -> StorefrontCart:
        if user:
            user_cart = (
                self._db.query(StorefrontCart)
                .options(joinedload(StorefrontCart.items))
                .filter(StorefrontCart.user_id == user.id)
                .first()
            )
            if user_cart:
                if cart_token and user_cart.cart_token != cart_token:
                    guest = self._find_by_token(cart_token)
                    if guest and guest.id != user_cart.id:
                        self.merge_carts(guest, user_cart)
                return self.load_cart(user_cart.id)

        if cart_token:
            cart = self._find_by_token(cart_token)
            if cart:
                if user and not cart.user_id:
                    cart.user_id = user.id
                    self._db.commit()
                return self.load_cart(cart.id)

        cart = StorefrontCart(cart_token=new_session_token(), user_id=user.id if user else None)
        self._db.add(cart)
        self._db.commit()
        return self.load_cart(cart.id)

    def _find_by_token(self, cart_token: str) -> Optional[StorefrontCart]:
        return (
            self._db.query(StorefrontCart)
            .options(joinedload(StorefrontCart.items))
            .filter(StorefrontCart.cart_token == cart_token)
            .first()
        )

    def resolve_ecommerce_item(
        self,
        *,
        item_id: Optional[str] = None,
        product_id: Optional[str] = None,
    ) -> EcommerceItem:
        ec: Optional[EcommerceItem] = None
        if item_id:
            ec = self._items.get_by_item_id(item_id)
        elif product_id:
            ec = self._publish.get_published_by_catalog_product_id(product_id)
            if not ec:
                ec = (
                    self._db.query(EcommerceItem)
                    .filter(EcommerceItem.catalog_product_id == product_id)
                    .first()
                )
        if not ec or not self._publish.is_storefront_live(ec):
            raise CartError("Product is not available")
        return ec

    def _resolve_variant(
        self,
        ec: EcommerceItem,
        variant_id: Optional[str],
    ) -> Optional[CatalogProductVariant]:
        if not variant_id:
            return None
        variant = self._db.get(CatalogProductVariant, variant_id)
        if not variant or variant.product_id != ec.catalog_product_id:
            raise CartError("Variant is not available")
        if variant.status != "published":
            raise CartError("Variant is not available")
        return variant

    def build_line_snapshot(
        self,
        ec: EcommerceItem,
        *,
        variant_id: Optional[str] = None,
        attributes: Optional[dict[str, Any]] = None,
        warehouse_id: Optional[str] = None,
    ) -> CartLineSnapshot:
        view = self._items.resolve_storefront_from_ecommerce(ec)
        if not view:
            raise CartError("Product is not available")

        variant = self._resolve_variant(ec, variant_id)
        unit_price = ec.selling_price
        compare_at = ec.compare_at_price
        variant_label: Optional[str] = None
        sku_snapshot = view.slug
        # Storefront stock follows catalog Manage Stock / Stock Status only —
        # warehouse inventory is not used for Buy Now / cart availability.
        available_qty = view.stock
        in_stock = view.in_stock

        if variant:
            unit_price = variant.price
            variant_label = variant.name
            sku_snapshot = variant.sku
            available_qty = variant.stock
            in_stock = _resolve_storefront_in_stock(
                stock=variant.stock,
                track_quantity=view.track_quantity,
                stock_status=view.stock_status,
            )

        # Cash discount = special/selling; Regular (EMI base) = compare_at when higher.
        cash_price = ec.special_price if ec.special_price is not None else unit_price
        regular_price = compare_at if compare_at is not None and compare_at > cash_price else cash_price

        payment_mode = ""
        if isinstance(attributes, dict):
            payment_mode = str(attributes.get("payment_mode") or attributes.get("paymentMethod") or "").strip().lower()

        if payment_mode in {"emi", "regular", "regular_emi"}:
            unit_price = regular_price
        else:
            unit_price = cash_price

        attributes_json = json.dumps(attributes, sort_keys=True) if attributes else None

        return CartLineSnapshot(
            item_id=ec.item_id,
            product_id=view.id,
            slug=view.slug,
            name=view.name,
            thumbnail=view.thumbnail,
            unit_price=unit_price,
            compare_at_price=compare_at if compare_at is not None else regular_price,
            variant_id=variant.id if variant else None,
            variant_label=variant_label,
            sku_snapshot=sku_snapshot,
            attributes_json=attributes_json,
            in_stock=in_stock,
            available_qty=available_qty,
            track_quantity=view.track_quantity,
        )

    def _line_key(
        self,
        item_id: str,
        variant_id: Optional[str],
        attributes_json: Optional[str],
    ) -> tuple[str, Optional[str], Optional[str]]:
        return item_id, variant_id, attributes_json

    def add_item(
        self,
        cart: StorefrontCart,
        *,
        quantity: int,
        item_id: Optional[str] = None,
        product_id: Optional[str] = None,
        variant_id: Optional[str] = None,
        attributes: Optional[dict[str, Any]] = None,
    ) -> StorefrontCart:
        if quantity < 1 or quantity > 99:
            raise CartError("Quantity must be between 1 and 99")

        ec = self.resolve_ecommerce_item(item_id=item_id, product_id=product_id)
        snapshot = self.build_line_snapshot(
            ec,
            variant_id=variant_id,
            attributes=attributes,
            warehouse_id=cart.warehouse_id,
        )

        if not snapshot.in_stock and not self._allow_out_of_stock:
            raise CartError("Product out of stock")

        key = self._line_key(snapshot.item_id, snapshot.variant_id, snapshot.attributes_json)
        existing = next(
            (
                row
                for row in cart.items
                if self._line_key(row.item_id, row.variant_id, row.attributes_json) == key
            ),
            None,
        )

        if existing:
            new_qty = min(existing.quantity + quantity, 99)
            if snapshot.track_quantity and new_qty > snapshot.available_qty:
                raise CartError(f"Only {snapshot.available_qty} available")
            existing.quantity = new_qty
            self._refresh_line_totals(existing)
        else:
            if snapshot.track_quantity and quantity > snapshot.available_qty:
                raise CartError(f"Only {snapshot.available_qty} available")
            line = StorefrontCartItem(
                cart_id=cart.id,
                item_id=snapshot.item_id,
                product_id=snapshot.product_id,
                variant_id=snapshot.variant_id,
                attributes_json=snapshot.attributes_json,
                slug=snapshot.slug,
                sku_snapshot=snapshot.sku_snapshot,
                name_snapshot=snapshot.name,
                variant_label=snapshot.variant_label,
                thumbnail=snapshot.thumbnail,
                unit_price=snapshot.unit_price,
                compare_at_price=snapshot.compare_at_price,
                quantity=quantity,
            )
            self._refresh_line_totals(line)
            self._db.add(line)

        self._db.commit()
        return self.load_cart(cart.id)

    def update_item_quantity(self, cart: StorefrontCart, item_id: str, quantity: int) -> StorefrontCart:
        line = self._get_line(cart, item_id)
        if quantity <= 0:
            self._db.delete(line)
        else:
            ec = self.resolve_ecommerce_item(item_id=line.item_id)
            snapshot = self.build_line_snapshot(
                ec,
                variant_id=line.variant_id,
                attributes=json.loads(line.attributes_json) if line.attributes_json else None,
                warehouse_id=cart.warehouse_id,
            )
            if quantity > 99:
                raise CartError("Maximum quantity is 99")
            if snapshot.track_quantity and quantity > snapshot.available_qty:
                raise CartError(f"Only {snapshot.available_qty} available")
            line.quantity = quantity
            self._refresh_line_totals(line)
        self._db.commit()
        return self.load_cart(cart.id)

    def remove_item(self, cart: StorefrontCart, line_id: str) -> StorefrontCart:
        line = self._get_line(cart, line_id)
        self._db.delete(line)
        # A Ready Build's discount is one lump sum for the whole set of parts
        # it priced — removing any one of them invalidates that number.
        cart.ready_build_id = None
        cart.ready_build_discount = Decimal("0")
        self._db.commit()
        return self.load_cart(cart.id)

    def clear_cart(self, cart: StorefrontCart) -> StorefrontCart:
        for line in list(cart.items):
            self._db.delete(line)
        cart.coupon_code = None
        cart.coupon_discount = Decimal("0")
        cart.ready_build_id = None
        cart.ready_build_discount = Decimal("0")
        self._db.commit()
        return self.load_cart(cart.id)

    def apply_coupon(self, cart: StorefrontCart, code: str) -> StorefrontCart:
        from app.services.marketing.coupon_service import CouponError, resolve_coupon_discount

        cart = self.load_cart(cart.id)
        subtotal = sum((line.unit_price * line.quantity for line in cart.items), Decimal("0"))
        try:
            resolved = resolve_coupon_discount(self._db, code, subtotal)
        except CouponError as exc:
            raise CartError(str(exc)) from exc
        if not resolved:
            raise CartError("Please enter a valid promo code")
        cart.coupon_code = resolved.code
        cart.coupon_discount = resolved.amount
        self._db.commit()
        return self.load_cart(cart.id)

    def remove_coupon(self, cart: StorefrontCart) -> StorefrontCart:
        cart = self.load_cart(cart.id)
        cart.coupon_code = None
        cart.coupon_discount = Decimal("0")
        self._db.commit()
        return self.load_cart(cart.id)

    def merge_carts(self, guest: StorefrontCart, user_cart: StorefrontCart) -> StorefrontCart:
        for guest_line in list(guest.items):
            key = self._line_key(guest_line.item_id, guest_line.variant_id, guest_line.attributes_json)
            existing = next(
                (
                    row
                    for row in user_cart.items
                    if self._line_key(row.item_id, row.variant_id, row.attributes_json) == key
                ),
                None,
            )
            if existing:
                existing.quantity = min(existing.quantity + guest_line.quantity, 99)
                self._refresh_line_totals(existing)
                self._db.delete(guest_line)
            else:
                guest_line.cart_id = user_cart.id
        self._db.delete(guest)
        self._db.commit()
        return self.load_cart(user_cart.id)

    def validate_cart(
        self,
        cart: StorefrontCart,
        *,
        sync_prices: bool = False,
    ) -> List[CartValidationIssue]:
        issues: List[CartValidationIssue] = []

        for line in list(cart.items):
            ec = (
                self._db.query(EcommerceItem)
                .filter(EcommerceItem.item_id == line.item_id)
                .first()
            )
            if not ec or not self._publish.is_storefront_live(ec):
                issues.append(
                    CartValidationIssue(
                        cart_item_id=line.id,
                        item_id=line.item_id,
                        code="unpublished",
                        message=f"{line.name_snapshot} is no longer available",
                        blocking=True,
                    ),
                )
                continue

            try:
                snapshot = self.build_line_snapshot(
                    ec,
                    variant_id=line.variant_id,
                    attributes=json.loads(line.attributes_json) if line.attributes_json else None,
                    warehouse_id=cart.warehouse_id,
                )
            except CartError as exc:
                code = "variant_unavailable" if line.variant_id else "deleted"
                issues.append(
                    CartValidationIssue(
                        cart_item_id=line.id,
                        item_id=line.item_id,
                        code=code,
                        message=str(exc),
                        blocking=True,
                    ),
                )
                continue

            stock_blocks = not self._allow_out_of_stock
            if not snapshot.in_stock:
                issues.append(
                    CartValidationIssue(
                        cart_item_id=line.id,
                        item_id=line.item_id,
                        code="out_of_stock",
                        message=f"{line.name_snapshot} is out of stock",
                        blocking=stock_blocks,
                    ),
                )
            elif snapshot.track_quantity and line.quantity > snapshot.available_qty:
                issues.append(
                    CartValidationIssue(
                        cart_item_id=line.id,
                        item_id=line.item_id,
                        code="out_of_stock",
                        message=f"Only {snapshot.available_qty} of {line.name_snapshot} available",
                        blocking=stock_blocks,
                    ),
                )

            if snapshot.unit_price != line.unit_price:
                issues.append(
                    CartValidationIssue(
                        cart_item_id=line.id,
                        item_id=line.item_id,
                        code="price_changed",
                        message=f"Price updated for {line.name_snapshot}",
                        blocking=False,
                    ),
                )
                if sync_prices:
                    line.unit_price = snapshot.unit_price
                    line.compare_at_price = snapshot.compare_at_price
                    line.name_snapshot = snapshot.name
                    line.slug = snapshot.slug
                    line.thumbnail = snapshot.thumbnail
                    self._refresh_line_totals(line)

        if sync_prices:
            self._recalculate_cart(cart)
            self._db.commit()

        return issues

    def _get_line(self, cart: StorefrontCart, line_id: str) -> StorefrontCartItem:
        line = next((row for row in cart.items if row.id == line_id), None)
        if not line:
            raise CartError("Cart item not found")
        return line

    def _tax_rate(self) -> Decimal:
        """Admin-configured rate, or 0 when prices are already tax-inclusive."""
        if tax_is_included_in_price(self._db):
            return Decimal("0")
        return tax_rate_percent(self._db)

    def _refresh_line_totals(self, line: StorefrontCartItem, rate: Optional[Decimal] = None) -> None:
        if rate is None:
            rate = self._tax_rate()
        line.line_total = line.unit_price * line.quantity
        line.tax_amount = (line.line_total * rate / Decimal("100")).quantize(Decimal("0.01"))

    def _recalculate_cart(self, cart: StorefrontCart) -> None:
        subtotal = sum((line.unit_price * line.quantity for line in cart.items), Decimal("0"))
        # Refresh coupon discount from marketing_coupons when a code is set
        if cart.coupon_code:
            from app.services.marketing.coupon_service import CouponError, resolve_coupon_discount

            try:
                resolved = resolve_coupon_discount(self._db, cart.coupon_code, subtotal)
                if resolved:
                    cart.coupon_code = resolved.code
                    cart.coupon_discount = resolved.amount
                else:
                    cart.coupon_code = None
                    cart.coupon_discount = Decimal("0")
            except CouponError:
                cart.coupon_code = None
                cart.coupon_discount = Decimal("0")
        else:
            cart.coupon_discount = Decimal("0")

        # Same admin-configured rate the checkout uses, so cart and checkout agree.
        rate = self._tax_rate()
        cart.tax_total = (
            max(subtotal - cart.coupon_discount, Decimal("0")) * rate / Decimal("100")
        ).quantize(Decimal("0.01"))
        cart.shipping_estimate = self._shipping_estimate(subtotal)
        for line in cart.items:
            self._refresh_line_totals(line, rate)

    def _shipping_estimate(self, subtotal: Decimal) -> Decimal:
        if subtotal <= 0:
            return Decimal("0")
        if subtotal >= FREE_SHIPPING_THRESHOLD:
            return Decimal("0")
        return STANDARD_SHIPPING

    def build_read_model(self, cart: StorefrontCart, issues: Optional[List[CartValidationIssue]] = None) -> dict:
        self._recalculate_cart(cart)
        subtotal = sum((line.unit_price * line.quantity for line in cart.items), Decimal("0"))
        item_count = sum(line.quantity for line in cart.items)
        discount = cart.coupon_discount or Decimal("0")
        ready_build_discount = cart.ready_build_discount or Decimal("0")
        shipping = cart.shipping_estimate or Decimal("0")
        tax = cart.tax_total or Decimal("0")
        grand_total = max(Decimal("0"), subtotal - discount - ready_build_discount + shipping + tax)
        validation = issues if issues is not None else self.validate_cart(cart)
        blocking = any(i.blocking for i in validation)

        return {
            "cart_token": cart.cart_token,
            "user_id": cart.user_id,
            "items": [
                {
                    "id": line.id,
                    "item_id": line.item_id,
                    "product_id": line.product_id,
                    "variant_id": line.variant_id,
                    "attributes": json.loads(line.attributes_json) if line.attributes_json else None,
                    "slug": line.slug,
                    "sku": line.sku_snapshot,
                    "name": line.name_snapshot,
                    "variant_label": line.variant_label,
                    "thumbnail": line.thumbnail,
                    "unit_price": line.unit_price,
                    "compare_at_price": line.compare_at_price,
                    "quantity": line.quantity,
                    "tax_amount": line.tax_amount,
                    "line_total": line.line_total,
                }
                for line in cart.items
            ],
            "item_count": item_count,
            "subtotal": subtotal,
            "coupon_code": cart.coupon_code,
            "coupon_discount": discount,
            "ready_build_id": cart.ready_build_id,
            "ready_build_discount": ready_build_discount,
            "warehouse_id": cart.warehouse_id,
            "tax_total": tax,
            "shipping_estimate": shipping,
            "grand_total": grand_total,
            "valid": not blocking,
            "issues": [
                {
                    "cart_item_id": issue.cart_item_id,
                    "item_id": issue.item_id,
                    "code": issue.code,
                    "message": issue.message,
                    "blocking": issue.blocking,
                }
                for issue in validation
            ],
        }
