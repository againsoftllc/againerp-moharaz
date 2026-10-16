"""Storefront wishlist service — guest token + optional customer binding."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.ecommerce_item import EcommerceItem
from app.models.website_wishlist import WebsiteWishlist, WebsiteWishlistItem
from app.security import new_session_token
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.ecommerce.publish_service import EcommercePublishService


class WishlistError(ValueError):
    pass


class WebsiteWishlistService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._items = EcommerceItemService(db)
        self._publish = EcommercePublishService(db)

    def get_or_create(
        self,
        *,
        wishlist_token: Optional[str] = None,
        customer_id: Optional[str] = None,
    ) -> WebsiteWishlist:
        if customer_id:
            row = (
                self._db.query(WebsiteWishlist)
                .filter(WebsiteWishlist.customer_id == customer_id)
                .first()
            )
            if row:
                if wishlist_token and row.wishlist_token != wishlist_token:
                    guest = self._find_by_token(wishlist_token)
                    if guest and guest.id != row.id:
                        self.merge_guest_into(guest, row)
                return row

        if wishlist_token:
            row = self._find_by_token(wishlist_token)
            if row:
                if customer_id and not row.customer_id:
                    row.customer_id = customer_id
                    self._db.flush()
                return row

        row = WebsiteWishlist(
            wishlist_token=new_session_token(),
            customer_id=customer_id,
        )
        self._db.add(row)
        self._db.commit()
        self._db.refresh(row)
        return row

    def _find_by_token(self, token: str) -> Optional[WebsiteWishlist]:
        return (
            self._db.query(WebsiteWishlist)
            .filter(WebsiteWishlist.wishlist_token == token)
            .first()
        )

    def merge_guest_into(self, guest: WebsiteWishlist, target: WebsiteWishlist) -> None:
        existing = {i.product_id for i in target.items}
        for line in list(guest.items):
            if line.product_id in existing:
                self._db.delete(line)
                continue
            line.wishlist_id = target.id
            existing.add(line.product_id)
        self._db.delete(guest)
        self._db.commit()
        self._db.refresh(target)

    def _resolve_view(self, product_id: str):
        product = self._db.get(CatalogProduct, product_id)
        if product:
            view = self._items.resolve_storefront_product(product)
            if view:
                return view

        ec = self._publish.get_published_by_catalog_product_id(product_id)
        if not ec:
            ec = (
                self._db.query(EcommerceItem)
                .filter(EcommerceItem.item_id == product_id)
                .first()
            )
        if not ec:
            raise WishlistError("Product not found")
        if not self._publish.is_storefront_live(ec):
            raise WishlistError("Product is not available")
        catalog = self._db.get(CatalogProduct, ec.catalog_product_id) if ec.catalog_product_id else None
        if catalog:
            view = self._items.resolve_storefront_product(catalog)
            if view:
                return view
        raise WishlistError("Product is not available")

    def add_product(self, wishlist: WebsiteWishlist, product_id: str) -> WebsiteWishlist:
        view = self._resolve_view(product_id)
        existing = next((i for i in wishlist.items if i.product_id == view.id), None)
        if existing:
            return wishlist

        row = WebsiteWishlistItem(
            wishlist_id=wishlist.id,
            product_id=view.id,
            item_id=view.item_id,
            slug=view.slug,
            name_snapshot=view.name,
            thumbnail=view.thumbnail,
            unit_price=view.price or Decimal("0"),
            compare_at_price=view.compare_at_price,
            rating=Decimal("0"),
        )
        self._db.add(row)
        self._db.commit()
        self._db.refresh(wishlist)
        return wishlist

    def remove_product(self, wishlist: WebsiteWishlist, product_id: str) -> WebsiteWishlist:
        line = next((i for i in wishlist.items if i.product_id == product_id), None)
        if not line:
            raise WishlistError("Item not in wishlist")
        self._db.delete(line)
        self._db.commit()
        self._db.refresh(wishlist)
        return wishlist

    def clear(self, wishlist: WebsiteWishlist) -> WebsiteWishlist:
        for line in list(wishlist.items):
            self._db.delete(line)
        self._db.commit()
        self._db.refresh(wishlist)
        return wishlist

    def build_read(self, wishlist: WebsiteWishlist) -> dict:
        items = []
        for line in wishlist.items:
            compare = float(line.compare_at_price) if line.compare_at_price is not None else None
            price = float(line.unit_price)
            discount = None
            if compare and compare > price > 0:
                discount = round(100 - (price / compare) * 100)
            items.append(
                {
                    "id": line.id,
                    "product_id": line.product_id,
                    "item_id": line.item_id,
                    "slug": line.slug,
                    "name": line.name_snapshot,
                    "thumbnail": line.thumbnail,
                    "unit_price": price,
                    "compare_at_price": compare,
                    "discount_pct": discount,
                    "rating": float(line.rating or 0),
                }
            )
        return {
            "wishlist_token": wishlist.wishlist_token,
            "customer_id": wishlist.customer_id,
            "item_count": len(items),
            "items": items,
        }
