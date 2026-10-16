"""Ecommerce item extension — sync, publish, storefront resolution."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_media import CatalogProductMedia
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.models.ecommerce_item_media import EcommerceItemMedia
from app.models.media import Media
from app.services.ecommerce.constants import (
    CATALOG_STATUS_TO_PUBLISH,
    STOREFRONT_LIVE_STATUSES,
    PUBLISH_TO_CATALOG_STATUS,
)
from app.services.ecommerce.publish_service import EcommercePublishService
from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product
from app.services.items.item_identity_service import ItemIdentityService


def _load_tags(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _dump_tags(tags: List[str]) -> str:
    return json.dumps(tags or [])


def _resolve_storefront_in_stock(
    *,
    stock: int,
    track_quantity: bool,
    stock_status: Optional[str],
) -> bool:
    status = (stock_status or "").strip().lower() or None

    if not track_quantity:
        if status in ("out_of_stock", "coming_soon"):
            return False
        return True

    if status in ("out_of_stock", "coming_soon"):
        return False
    return stock > 0


@dataclass(frozen=True)
class StorefrontProductView:
    id: str
    item_id: str
    slug: str
    name: str
    price: Decimal
    compare_at_price: Optional[Decimal]
    stock: int
    track_quantity: bool
    stock_status: Optional[str]
    brand: str
    category: str
    thumbnail: Optional[str]
    in_stock: bool
    short_description: Optional[str] = None
    featured: bool = False
    sku: Optional[str] = None
    # when the listing or its catalog product last changed (sitemap lastmod)
    updated_at: Optional[datetime] = None


class EcommerceItemService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_item_id(self, item_id: str) -> Optional[EcommerceItem]:
        return (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.item_id == item_id)
            .first()
        )

    def get_by_catalog_product_id(self, product_id: str) -> Optional[EcommerceItem]:
        return (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.catalog_product_id == product_id)
            .first()
        )

    def ensure_draft_for_catalog_product(self, product: CatalogProduct) -> EcommerceItem:
        """Create or update ecommerce extension as draft — does NOT auto-publish."""
        item_id = ensure_item_for_catalog_product(self._db, product)
        row = self.get_by_item_id(item_id)
        if not row:
            row = EcommerceItem(
                item_id=item_id,
                company_id=product.company_id,
                catalog_product_id=product.id,
                publish_status="draft",
                slug=product.slug,
            )
            self._db.add(row)
            self._db.flush()
        return self.sync_content_from_catalog(product, row=row, mirror_publish=True)

    def sync_content_from_catalog(
        self,
        product: CatalogProduct,
        *,
        row: Optional[EcommerceItem] = None,
        mirror_publish: bool = True,
    ) -> EcommerceItem:
        """Push catalog merchandising fields into ecommerce_items (not identity)."""
        item_id = product.item_id or ensure_item_for_catalog_product(self._db, product)
        ec = row or self.get_by_item_id(item_id)
        if not ec:
            ec = EcommerceItem(
                item_id=item_id,
                company_id=product.company_id,
                catalog_product_id=product.id,
                publish_status="draft",
                slug=product.slug,
            )
            self._db.add(ec)
            self._db.flush()

        ec.catalog_product_id = product.id
        ec.slug = product.slug
        ec.visibility = product.visibility
        ec.short_description = product.short_description
        ec.full_description = product.description
        ec.specifications_json = product.custom_specs_json
        ec.primary_category_id = product.category_id
        ec.brand_id = product.brand_id
        ec.seo_title = product.seo_title
        ec.seo_description = product.seo_description
        ec.seo_keywords_json = product.tags_json or "[]"
        ec.schema_ready = bool(product.seo_title and product.seo_description)
        ec.selling_price = product.price
        ec.compare_at_price = product.compare_at_price
        ec.thumbnail_url = product.thumbnail
        ec.sort_order = 0

        if mirror_publish:
            ec.publish_status = CATALOG_STATUS_TO_PUBLISH.get(product.status, "draft")
            if product.visibility == "private" and ec.publish_status == "published":
                ec.publish_status = "hidden"

        ec.is_active = ec.publish_status == "published"
        self._sync_categories(product, item_id)
        self._sync_media_from_catalog(product, item_id)
        self._db.flush()
        return ec

    def sync_to_catalog_product(self, ec: EcommerceItem, product: CatalogProduct) -> None:
        """Mirror ecommerce fields back to catalog_products for backward-compatible APIs."""
        product.slug = ec.slug
        product.short_description = ec.short_description
        product.description = ec.full_description
        product.custom_specs_json = ec.specifications_json
        product.category_id = ec.primary_category_id
        product.brand_id = ec.brand_id
        product.seo_title = ec.seo_title
        product.seo_description = ec.seo_description
        product.tags_json = ec.seo_keywords_json
        product.price = ec.selling_price
        product.compare_at_price = ec.compare_at_price
        product.thumbnail = ec.thumbnail_url
        product.visibility = ec.visibility
        product.status = PUBLISH_TO_CATALOG_STATUS.get(ec.publish_status, "draft")
        self._db.flush()

    def publish(self, item_id: str) -> EcommerceItem:
        return EcommercePublishService(self._db).publish(item_id)

    def unpublish(self, item_id: str, *, hidden: bool = False) -> EcommerceItem:
        return EcommercePublishService(self._db).unpublish(item_id, hidden=hidden)

    def archive(self, item_id: str) -> EcommerceItem:
        return EcommercePublishService(self._db).archive(item_id)

    def submit_for_review(self, item_id: str) -> EcommerceItem:
        return EcommercePublishService(self._db).submit_for_review(item_id)

    def reject_review(self, item_id: str) -> EcommerceItem:
        return EcommercePublishService(self._db).reject_review(item_id)

    def restore(self, item_id: str) -> EcommerceItem:
        return EcommercePublishService(self._db).restore(item_id)

    def list_storefront_items(
        self,
        *,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        featured: Optional[bool] = None,
    ) -> list[EcommerceItem]:
        """Published ecommerce rows only — storefront never lists from catalog_products."""
        from app.models.item import Item

        query = (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                EcommerceItem.visibility == "public",
            )
        )
        if featured is not None:
            query = query.filter(EcommerceItem.featured == featured)
        if category_id:
            query = query.filter(EcommerceItem.primary_category_id == category_id)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                (EcommerceItem.slug.ilike(term))
                | (Item.name.ilike(term))
                | (Item.sku.ilike(term)),
            )
        return query.order_by(EcommerceItem.sort_order, EcommerceItem.updated_at.desc()).all()

    def resolve_storefront_from_ecommerce(
        self, ec: EcommerceItem, *, unlisted_ok: bool = False
    ) -> Optional[StorefrontProductView]:
        """Build storefront view from ecommerce_items — catalog used only for stock bridge.

        unlisted_ok: also unlisted products that keep their own page (product page, sitemap);
        lists, cart and builders leave it off."""
        publish_svc = EcommercePublishService(self._db)
        live = publish_svc.is_reachable_by_url(ec) if unlisted_ok else publish_svc.is_storefront_live(ec)
        if not live:
            return None

        product: Optional[CatalogProduct] = None
        if ec.catalog_product_id:
            product = self._db.get(CatalogProduct, ec.catalog_product_id)

        identity = ItemIdentityService(self._db)
        from app.models.item import Item

        item = self._db.get(Item, ec.item_id)
        name = ec.slug
        sku: Optional[str] = None
        if product:
            resolved = identity.resolve_identity(product)
            name = resolved["name"]
            sku = (resolved.get("sku") or product.sku or "").strip() or None
        if item:
            name = item.name if not product else name
            sku = (item.sku or sku or "").strip() or None
        if not name:
            name = ec.slug

        brand_name = "Unknown"
        category_name = "Uncategorized"
        if ec.brand_id:
            from app.models.catalog_brand import CatalogBrand

            brand = self._db.get(CatalogBrand, ec.brand_id)
            if brand:
                brand_name = brand.name
        elif product and product.brand:
            brand_name = product.brand

        if ec.primary_category_id:
            from app.models.catalog_category import CatalogCategory

            cat = self._db.get(CatalogCategory, ec.primary_category_id)
            if cat:
                category_name = cat.name
        elif product and product.category:
            category_name = product.category

        stock = product.stock if product else 0
        track_quantity = product.track_quantity if product else True
        stock_status = product.stock_status if product else None

        effective_price = ec.selling_price
        if ec.special_price is not None:
            effective_price = ec.special_price

        in_stock = _resolve_storefront_in_stock(
            stock=stock,
            track_quantity=track_quantity,
            stock_status=stock_status,
        )

        catalog_id = ec.catalog_product_id or ec.item_id

        return StorefrontProductView(
            id=catalog_id,
            item_id=ec.item_id,
            slug=ec.slug,
            name=name,
            price=effective_price,
            compare_at_price=ec.compare_at_price,
            stock=stock,
            track_quantity=track_quantity,
            stock_status=stock_status,
            brand=brand_name,
            category=category_name,
            thumbnail=ec.thumbnail_url,
            in_stock=in_stock,
            short_description=ec.short_description,
            featured=bool(ec.featured),
            sku=sku,
            updated_at=max((d for d in (ec.updated_at, product.updated_at if product else None) if d), default=None),
        )

    def is_storefront_visible(self, product: CatalogProduct, ec: Optional[EcommerceItem]) -> bool:
        if ec:
            return EcommercePublishService(self._db).is_storefront_live(ec)
        return False

    def resolve_storefront_product(self, product: CatalogProduct) -> Optional[StorefrontProductView]:
        ec = self.get_by_item_id(product.item_id) if product.item_id else self.get_by_catalog_product_id(product.id)
        if not ec:
            return None
        return self.resolve_storefront_from_ecommerce(ec)

    def _sync_categories(self, product: CatalogProduct, item_id: str) -> None:
        if not product.category_id:
            return
        existing = (
            self._db.query(EcommerceItemCategory)
            .filter(
                EcommerceItemCategory.item_id == item_id,
                EcommerceItemCategory.category_id == product.category_id,
            )
            .first()
        )
        if not existing:
            self._db.add(
                EcommerceItemCategory(
                    item_id=item_id,
                    company_id=product.company_id,
                    category_id=product.category_id,
                    is_primary=True,
                    sort_order=0,
                ),
            )
        else:
            existing.is_primary = True

        (
            self._db.query(EcommerceItemCategory)
            .filter(
                EcommerceItemCategory.item_id == item_id,
                EcommerceItemCategory.category_id != product.category_id,
            )
            .update({EcommerceItemCategory.is_primary: False}, synchronize_session=False)
        )

    def _sync_media_from_catalog(self, product: CatalogProduct, item_id: str) -> None:
        links = (
            self._db.query(CatalogProductMedia, Media)
            .join(Media, Media.id == CatalogProductMedia.media_id)
            .filter(CatalogProductMedia.product_id == product.id)
            .order_by(CatalogProductMedia.sort_order)
            .all()
        )
        if not links:
            return

        for idx, (link, media) in enumerate(links):
            row = (
                self._db.query(EcommerceItemMedia)
                .filter(
                    EcommerceItemMedia.item_id == item_id,
                    EcommerceItemMedia.media_id == link.media_id,
                )
                .first()
            )
            if not row:
                row = EcommerceItemMedia(
                    item_id=item_id,
                    company_id=product.company_id,
                    media_id=link.media_id,
                )
                self._db.add(row)
            row.sort_order = link.sort_order if link.sort_order else idx
            row.is_primary = link.is_primary or idx == 0
            row.is_featured = link.is_primary or idx == 0
            if row.is_featured and media.url:
                ec = self.get_by_item_id(item_id)
                if ec:
                    ec.featured_media_id = link.media_id
                    # Always mirror featured Media Library URL onto ecommerce thumbnail
                    # so storefront does not keep stale seed placeholders (picsum).
                    ec.thumbnail_url = media.url
                    if not product.thumbnail or "picsum.photos" in (product.thumbnail or ""):
                        product.thumbnail = media.url

    def replace_categories(
        self,
        item_id: str,
        category_ids: List[str],
        *,
        primary_category_id: Optional[str] = None,
        company_id: str = "default",
    ) -> None:
        self._db.query(EcommerceItemCategory).filter(EcommerceItemCategory.item_id == item_id).delete()
        primary = primary_category_id or (category_ids[0] if category_ids else None)
        for idx, cat_id in enumerate(category_ids):
            self._db.add(
                EcommerceItemCategory(
                    item_id=item_id,
                    company_id=company_id,
                    category_id=cat_id,
                    is_primary=cat_id == primary,
                    sort_order=idx,
                ),
            )
        ec = self.get_by_item_id(item_id)
        if ec and primary:
            ec.primary_category_id = primary
        self._db.flush()
