"""Storefront product catalog API — ecommerce_items only (STEP 04)."""

from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.services.ecommerce.spec_value_cleanup import FILTER_BUCKET_SPECS, clean_spec_value, is_filter_bucket
from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_optional_storefront_customer,
)
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_product import CatalogProduct
from app.services.core.module_settings import get_module_setting
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.catalog_product_review import CatalogProductReview
from app.models.catalog_product_qa import CatalogProductQa
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_media import EcommerceItemMedia
from app.models.catalog_product_media import CatalogProductMedia
from app.models.media import Media
from app.schemas.catalog_product_review import parse_review_media
from app.services.brand_rewrite import rewrite_startech_to_againcart
from app.services.site_resolver import request_site_options
from app.services.storefront_site_options import commerce_option
from app.schemas.storefront import (
    StorefrontFacetAttributeOptionRead,
    StorefrontFacetAttributeRead,
    StorefrontFacetBrandRead,
    StorefrontFacetsRead,
    StorefrontFacetsResponse,
    StorefrontPriceTierRead,
    StorefrontProductDetailRead,
    StorefrontProductDetailResponse,
    StorefrontProductListMeta,
    StorefrontProductListResponse,
    StorefrontProductRead,
    StorefrontProductResponse,
    StorefrontQaCreate,
    StorefrontQaCreateResponse,
    StorefrontQaListMeta,
    StorefrontQaListResponse,
    StorefrontQaRead,
    StorefrontReviewCreate,
    StorefrontReviewCreateResponse,
    StorefrontReviewListMeta,
    StorefrontReviewListResponse,
    StorefrontReviewRead,
    StorefrontSellerInfoRead,
    StorefrontSpecGroupRead,
    StorefrontSpecItemRead,
    StorefrontVariantOptionRead,
    StorefrontVariantRead,
)
from app.services.ecommerce.storefront_catalog_service import (
    SORT_AVAILABILITY,
    SORT_BESTSELLING,
    SORT_FEATURED,
    SORT_NEWEST,
    SORT_PRICE_ASC,
    SORT_PRICE_DESC,
    StorefrontCatalogService,
)
from app.services.core.sequence_service import next_number as allocate_number

router = APIRouter(prefix="/products", tags=["storefront-products"])

STOREFRONT_CACHE = "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
STOREFRONT_NO_CACHE = "private, no-store, max-age=0, must-revalidate"

SORT_ALIASES = {
    "relevance": SORT_NEWEST,
    "newest": SORT_NEWEST,
    "price_asc": SORT_PRICE_ASC,
    "price_desc": SORT_PRICE_DESC,
    "best_selling": SORT_BESTSELLING,
    "bestselling": SORT_BESTSELLING,
    "featured": SORT_FEATURED,
    "availability": SORT_AVAILABILITY,
}


def _set_cache(response: Response) -> None:
    response.headers["Cache-Control"] = STOREFRONT_CACHE


def _set_no_cache(response: Response) -> None:
    response.headers["Cache-Control"] = STOREFRONT_NO_CACHE
    response.headers["Pragma"] = "no-cache"


def _view_to_read(
    view,
    *,
    rating: Optional[float] = None,
    review_count: Optional[int] = None,
    filter_attributes: Optional[dict[str, str]] = None,
) -> StorefrontProductRead:
    return StorefrontProductRead(
        id=view.id,
        item_id=view.item_id,
        slug=view.slug,
        name=view.name,
        price=view.price,
        compare_at_price=view.compare_at_price,
        stock=view.stock,
        track_quantity=view.track_quantity,
        stock_status=view.stock_status,
        brand=view.brand,
        category=view.category,
        thumbnail=view.thumbnail,
        in_stock=view.in_stock,
        short_description=rewrite_startech_to_againcart(view.short_description),
        featured=view.featured,
        sku=getattr(view, "sku", None),
        updated_at=getattr(view, "updated_at", None),
        rating=rating,
        review_count=review_count,
        filter_attributes=filter_attributes or {},
    )


def _review_to_read(row: CatalogProductReview) -> StorefrontReviewRead:
    media = parse_review_media(getattr(row, "media_json", None), row.customer_image_url)
    return StorefrontReviewRead(
        id=row.id,
        customer_name=row.customer_name,
        rating=int(row.rating or 0),
        title=row.title or "",
        body=row.body or "",
        created_at=row.created_at,
        is_verified_purchase=bool(row.is_verified_purchase),
        helpful_votes=int(row.helpful_votes or 0),
        media_urls=[item.url for item in media if item.url],
    )


def _aggregate_approved_reviews(
    db: Session,
    product_ids: list[str],
) -> dict[str, tuple[float, int]]:
    """Map catalog product id → (average_rating, review_count) for approved reviews."""
    ids = [pid for pid in product_ids if pid]
    if not ids:
        return {}
    rows = (
        db.query(
            CatalogProductReview.product_id,
            func.avg(CatalogProductReview.rating),
            func.count(CatalogProductReview.id),
        )
        .filter(
            CatalogProductReview.product_id.in_(ids),
            CatalogProductReview.status == "approved",
        )
        .group_by(CatalogProductReview.product_id)
        .all()
    )
    out: dict[str, tuple[float, int]] = {}
    for product_id, avg_rating, count in rows:
        if not product_id or not count:
            continue
        out[str(product_id)] = (round(float(avg_rating), 2), int(count))
    return out


def _load_approved_reviews(
    db: Session,
    catalog_product_id: Optional[str],
    *,
    limit: int = 50,
) -> list[StorefrontReviewRead]:
    if not catalog_product_id:
        return []
    rows = (
        db.query(CatalogProductReview)
        .filter(
            CatalogProductReview.product_id == catalog_product_id,
            CatalogProductReview.status == "approved",
        )
        .order_by(CatalogProductReview.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_review_to_read(row) for row in rows]


def _qa_to_read(row: CatalogProductQa) -> StorefrontQaRead:
    return StorefrontQaRead(
        id=row.id,
        customer_name=row.customer_name,
        question=row.question,
        answer=row.answer,
        answered_by=row.answered_by,
        status=row.status,
        is_verified=bool(row.is_verified),
        created_at=row.created_at,
    )


def _load_public_qa(
    db: Session,
    catalog_product_id: Optional[str],
    *,
    limit: int = 50,
) -> list[StorefrontQaRead]:
    """Public Q&A: answered questions, or pending ones too when Website settings → Q&A visibility says so."""
    if not catalog_product_id:
        return []
    product = db.get(CatalogProduct, catalog_product_id)
    company_id = (product.company_id if product else None) or "default"
    if not get_module_setting(db, company_id, "catalog", "group_qa_enabled"):
        return []
    shown = (
        ("answered", "pending")
        if get_module_setting(db, company_id, "catalog", "qa_public_visibility") == "all"
        else ("answered",)
    )
    rows = (
        db.query(CatalogProductQa)
        .filter(
            CatalogProductQa.product_id == catalog_product_id,
            CatalogProductQa.status.in_(shown),
        )
        .order_by(CatalogProductQa.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_qa_to_read(row) for row in rows]


def _attach_review_stats(
    db: Session,
    views: list,
) -> list[StorefrontProductRead]:
    aggregates = _aggregate_approved_reviews(db, [getattr(v, "id", None) for v in views])
    filter_map = StorefrontCatalogService(db).filter_attributes_for_products(
        [getattr(v, "id", "") for v in views],
    )
    out: list[StorefrontProductRead] = []
    for view in views:
        rating, count = aggregates.get(view.id, (None, None))
        out.append(
            _view_to_read(
                view,
                rating=rating,
                review_count=count,
                filter_attributes=filter_map.get(view.id, {}),
            ),
        )
    return out


def _parse_attribute_filters(attrs: Optional[List[str]]) -> Optional[Dict[str, List[str]]]:
    """Parse `attrs` query values shaped as `code:value` (repeatable)."""
    if not attrs:
        return None
    out: Dict[str, List[str]] = {}
    for raw in attrs:
        if not raw or ":" not in raw:
            continue
        code, value = raw.split(":", 1)
        code = code.strip()
        value = value.strip()
        if not code or not value:
            continue
        out.setdefault(code, []).append(value)
    return out or None


def _parse_url_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if not isinstance(item, str):
            continue
        value = item.strip()
        if not value:
            continue
        if value.startswith(("http://", "https://", "/uploads/")):
            out.append(_public_media_url(value))
    return out


def _public_media_url(url: str) -> str:
    """Normalize local Absolute API upload URLs to relative /uploads for storefront proxy."""
    value = (url or "").strip()
    if not value:
        return value
    if value.startswith("/uploads/"):
        return value
    marker = "/uploads/"
    idx = value.find(marker)
    if idx >= 0:
        return value[idx:]
    return value


def _catalog_product_media_urls(db: Session, catalog_product_id: str) -> list[str]:
    rows = (
        db.query(Media)
        .join(CatalogProductMedia, CatalogProductMedia.media_id == Media.id)
        .filter(
            CatalogProductMedia.product_id == catalog_product_id,
            Media.media_type == "image",
        )
        .order_by(CatalogProductMedia.sort_order, CatalogProductMedia.created_at)
        .all()
    )
    return [_public_media_url(m.url) for m in rows if m.url]


def _load_gallery(
    db: Session,
    item_id: str,
    thumbnail: Optional[str] = None,
    *,
    catalog_product_id: Optional[str] = None,
) -> list[str]:
    # Prefer Media Library attachments from catalog product (admin gallery).
    if catalog_product_id:
        media_urls = _catalog_product_media_urls(db, catalog_product_id)
        if media_urls:
            return media_urls

        product = db.get(CatalogProduct, catalog_product_id)
        if product:
            urls = _parse_url_list(getattr(product, "gallery_json", None))
            if not urls and product.custom_specs_json:
                try:
                    specs = json.loads(product.custom_specs_json)
                    if isinstance(specs, dict) and isinstance(specs.get("images"), list):
                        urls = [
                            _public_media_url(u)
                            for u in specs["images"]
                            if isinstance(u, str)
                            and u.strip().startswith(("http://", "https://", "/uploads/"))
                        ]
                except json.JSONDecodeError:
                    urls = []
            if urls:
                return urls

    rows = (
        db.query(Media)
        .join(EcommerceItemMedia, EcommerceItemMedia.media_id == Media.id)
        .filter(
            EcommerceItemMedia.item_id == item_id,
            Media.media_type == "image",
        )
        .order_by(EcommerceItemMedia.sort_order)
        .all()
    )
    urls = [_public_media_url(m.url) for m in rows if m.url]
    if urls:
        return urls

    # Last resort: catalog/product thumbnail (may still be seed placeholder)
    if catalog_product_id:
        product = db.get(CatalogProduct, catalog_product_id)
        if product and product.thumbnail:
            return [_public_media_url(product.thumbnail)]

    return [_public_media_url(thumbnail)] if thumbnail else []


def _load_video_urls(db: Session, catalog_product_id: Optional[str]) -> list[str]:
    if not catalog_product_id:
        return []
    product = db.get(CatalogProduct, catalog_product_id)
    if not product:
        return []
    urls = _parse_url_list(getattr(product, "video_urls_json", None))
    if urls:
        return urls
    if product.custom_specs_json:
        try:
            specs = json.loads(product.custom_specs_json)
            if isinstance(specs, dict) and isinstance(specs.get("videos"), list):
                return [u for u in specs["videos"] if isinstance(u, str) and u.startswith("http")]
        except json.JSONDecodeError:
            pass
    return []


def _load_price_tiers(db: Session, catalog_product_id: Optional[str]) -> list[StorefrontPriceTierRead]:
    """Quantity ladder from Elim price_range (BDT), if stored on catalog product."""
    if not catalog_product_id:
        return []
    product = db.get(CatalogProduct, catalog_product_id)
    if not product:
        return []

    def _parse_tiers(raw: Any) -> list[StorefrontPriceTierRead]:
        if not isinstance(raw, list):
            return []
        by_moq: dict[int, StorefrontPriceTierRead] = {}
        for row in raw:
            if not isinstance(row, dict):
                continue
            try:
                min_qty = int(row.get("min_qty") or row.get("moq") or 0)
                price = Decimal(str(row.get("price_bdt") or row.get("price") or 0))
            except Exception:
                continue
            if min_qty < 1 or price <= 0:
                continue
            by_moq[min_qty] = StorefrontPriceTierRead(min_qty=min_qty, price_bdt=price)
        tiers = [by_moq[k] for k in sorted(by_moq.keys())]
        return tiers if len(tiers) >= 2 else []

    raw: Any = None
    dropship_meta: dict[str, Any] = {}
    for blob in (getattr(product, "dropship_meta_json", None), product.custom_specs_json):
        if not blob:
            continue
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        if isinstance(data.get("dropship"), dict):
            dropship_meta = data["dropship"]
        elif data.get("source") == "elim":
            dropship_meta = data
        if isinstance(data.get("price_tiers"), list):
            raw = data["price_tiers"]
            break
        if isinstance(dropship_meta.get("price_tiers"), list):
            raw = dropship_meta["price_tiers"]
            break

    tiers = _parse_tiers(raw)
    if tiers:
        return tiers

    # Backfill from Elim when MOQ ladder was never stored (older cache).
    elim_id = dropship_meta.get("elim_id")
    platform = dropship_meta.get("platform") or "alibaba"
    if not elim_id:
        return []
    try:
        from app.services.elim_catalog_import import (
            _price_tiers_from_elim,
            default_pricing_from_settings,
        )
        from app.services.elim_client import find_product

        detail = find_product(product_id=str(elim_id), platform=platform, lang="en")
        pricing = default_pricing_from_settings()
        # Prefer rates persisted on the product when available.
        try:
            if dropship_meta.get("exchange_rate"):
                pricing["exchange_rate"] = Decimal(str(dropship_meta["exchange_rate"]))
            if dropship_meta.get("markup_percent") is not None:
                pricing["markup_percent"] = Decimal(str(dropship_meta["markup_percent"]))
            if dropship_meta.get("profit_bdt") is not None:
                pricing["profit_bdt"] = Decimal(str(dropship_meta["profit_bdt"]))
            if dropship_meta.get("server_charge_bdt") is not None:
                pricing["server_charge_bdt"] = Decimal(str(dropship_meta["server_charge_bdt"]))
        except Exception:
            pass
        fresh = _price_tiers_from_elim(
            detail,
            exchange_rate=pricing["exchange_rate"],
            markup_percent=pricing.get("markup_percent", Decimal("0")),
            profit_bdt=pricing["profit_bdt"],
            server_charge_bdt=pricing["server_charge_bdt"],
        )
        if not fresh:
            return []
        # Persist for next request
        dropship_meta = {**dropship_meta, "price_tiers": fresh}
        product.dropship_meta_json = json.dumps(dropship_meta, ensure_ascii=False)
        if product.custom_specs_json:
            try:
                specs = json.loads(product.custom_specs_json)
                if isinstance(specs, dict):
                    specs["price_tiers"] = fresh
                    if isinstance(specs.get("dropship"), dict):
                        specs["dropship"] = {**specs["dropship"], "price_tiers": fresh}
                    product.custom_specs_json = json.dumps(specs, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
        db.add(product)
        db.commit()
        return _parse_tiers(fresh)
    except Exception:
        return []


_BUCKET_COUNTS: Optional[dict] = None
_BUCKET_COUNTS_AT = 0.0


def _filter_bucket_counts(db: Session) -> dict:
    """(spec name, value) → how many products carry it, for the specs the old shop filters became; refreshed every
    10 minutes (it only tells a filter option, repeated across products, from a product's own figure)."""
    global _BUCKET_COUNTS, _BUCKET_COUNTS_AT
    import time

    if _BUCKET_COUNTS is not None and time.time() - _BUCKET_COUNTS_AT < 600:
        return _BUCKET_COUNTS
    from sqlalchemy import func

    rows = (
        db.query(func.lower(func.trim(CatalogAttribute.name)), func.trim(CatalogProductAttributeValue.value), func.count())
        .join(CatalogAttribute, CatalogAttribute.id == CatalogProductAttributeValue.attribute_id)
        .filter(func.lower(func.trim(CatalogAttribute.name)).in_(FILTER_BUCKET_SPECS))
        .group_by(func.lower(func.trim(CatalogAttribute.name)), func.trim(CatalogProductAttributeValue.value))
        .all()
    )
    _BUCKET_COUNTS = {(name, value): n for name, value, n in rows}
    _BUCKET_COUNTS_AT = time.time()
    return _BUCKET_COUNTS


def _load_specifications(db: Session, catalog_product_id: Optional[str]) -> list[StorefrontSpecGroupRead]:
    if not catalog_product_id:
        return []
    rows = (
        db.query(CatalogProductAttributeValue, CatalogAttribute, CatalogAttributeGroup)
        .join(CatalogAttribute, CatalogAttribute.id == CatalogProductAttributeValue.attribute_id)
        .join(CatalogAttributeGroup, CatalogAttributeGroup.id == CatalogAttribute.group_id)
        .filter(CatalogProductAttributeValue.product_id == catalog_product_id)
        .order_by(
            CatalogAttributeGroup.sort_order,
            CatalogAttribute.sort_order,
            CatalogProductAttributeValue.sort_order,
        )
        .all()
    )
    groups: dict[str, StorefrontSpecGroupRead] = {}
    order: list[str] = []
    repeats = _filter_bucket_counts(db)
    for val, attr, group in rows:
        if not val.value or not val.value.strip():
            continue
        # Filter-only attributes (e.g. imported shop filters) are not specifications.
        if attr.is_visible is False:
            continue
        # an old shop filter's range option shown as if it were the product's figure ("Screen Size 26-30 Inch")
        if is_filter_bucket(attr.name, val.value, repeats.get((attr.name.strip().lower(), val.value.strip()), 0)):
            continue
        shown = clean_spec_value(attr.name, val.value)
        if not shown.strip():
            continue
        if attr.field_type == "multi_select":
            # stored "AMD AM4,AMD AM5" (the admin's multi-select) → readable list
            shown = ", ".join(p.strip() for p in shown.split(",") if p.strip())
        if group.name not in groups:
            groups[group.name] = StorefrontSpecGroupRead(name=group.name, specs=[])
            order.append(group.name)
        groups[group.name].specs.append(StorefrontSpecItemRead(label=attr.name, value=shown))
    # Product-only specs (custom_specs_json): fields kept on this product alone. One whose groupId is a group of
    # the product's profile joins that group; the others make their own groups after the profile's.
    product = db.get(CatalogProduct, catalog_product_id)
    raw = None
    if product and product.custom_specs_json:
        try:
            raw = json.loads(product.custom_specs_json)
        except json.JSONDecodeError:
            raw = None
    custom_groups = raw.get("customGroups") if isinstance(raw, dict) else None
    custom_attrs = raw.get("customAttrs") if isinstance(raw, dict) else None
    if not isinstance(custom_attrs, list) or not custom_attrs:
        return [groups[name] for name in order]
    profile_group_names: dict[str, str] = {}
    if product.attribute_profile_id:
        profile_group_names = {
            g.id: g.name
            for g in db.query(CatalogAttributeGroup).filter(CatalogAttributeGroup.profile_id == product.attribute_profile_id)
        }
    custom_names = {
        g.get("id"): ((g.get("name") or "Specifications").strip() or "Specifications")
        for g in (custom_groups if isinstance(custom_groups, list) else [])
        if isinstance(g, dict)
    }
    for attr in custom_attrs:
        if not isinstance(attr, dict):
            continue
        label = (attr.get("name") or "").strip()
        value = (attr.get("value") or "").strip()
        gname = profile_group_names.get(attr.get("groupId")) or custom_names.get(attr.get("groupId"))
        if not (label and value and gname):
            continue
        if gname not in groups:
            groups[gname] = StorefrontSpecGroupRead(name=gname, specs=[])
            order.append(gname)
        groups[gname].specs.append(StorefrontSpecItemRead(label=label, value=value))
    return [groups[name] for name in order]


def _parse_variant_options(raw: Optional[str]) -> list[StorefrontVariantOptionRead]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[StorefrontVariantOptionRead] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        value = str(item.get("value") or "").strip()
        if not name or not value:
            continue
        img = item.get("img_url") or item.get("image_url")
        out.append(
            StorefrontVariantOptionRead(
                name=name,
                value=value,
                image_url=str(img) if isinstance(img, str) and img else None,
            )
        )
    return out


def _load_shipping_meta(db: Session, catalog_product_id: Optional[str]) -> tuple[Optional[float], dict[str, float]]:
    """Return (default_weight_kg, {external_sku_id: weight_kg}). Backfills from Elim when missing."""
    empty: tuple[Optional[float], dict[str, float]] = (None, {})
    if not catalog_product_id:
        return empty
    product = db.get(CatalogProduct, catalog_product_id)
    if not product:
        return empty

    dropship_meta: dict[str, Any] = {}
    shipping_by_sku: dict[str, Any] = {}
    weight_kg: Optional[float] = None

    for blob in (getattr(product, "dropship_meta_json", None), product.custom_specs_json):
        if not blob:
            continue
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        if isinstance(data.get("dropship"), dict):
            dropship_meta = data["dropship"]
        elif data.get("source") == "elim":
            dropship_meta = data
        if isinstance(data.get("shipping_by_sku"), dict):
            shipping_by_sku = data["shipping_by_sku"]
        elif isinstance(dropship_meta.get("shipping_by_sku"), dict):
            shipping_by_sku = dropship_meta["shipping_by_sku"]
        raw_w = data.get("weight_kg")
        if raw_w is None:
            raw_w = dropship_meta.get("weight_kg")
        if raw_w is not None:
            try:
                weight_kg = float(raw_w)
            except (TypeError, ValueError):
                weight_kg = None
        if shipping_by_sku:
            break

    def _map_weights(src: dict[str, Any]) -> dict[str, float]:
        out: dict[str, float] = {}
        for sku_id, row in src.items():
            if not isinstance(row, dict):
                continue
            try:
                w = float(row.get("weight_kg") or 0)
            except (TypeError, ValueError):
                w = 0.0
            if w <= 0 and row.get("weight_g"):
                try:
                    w = float(row["weight_g"]) / 1000.0
                except (TypeError, ValueError):
                    w = 0.0
            if w > 0:
                out[str(sku_id)] = round(w, 3)
        return out

    by_sku = _map_weights(shipping_by_sku)
    if by_sku or (weight_kg is not None and weight_kg > 0):
        if weight_kg is None or weight_kg <= 0:
            vals = sorted(by_sku.values())
            weight_kg = vals[len(vals) // 2] if vals else None
        return weight_kg, by_sku

    elim_id = dropship_meta.get("elim_id")
    platform = dropship_meta.get("platform") or "alibaba"
    if not elim_id:
        return empty
    try:
        from app.services.elim_catalog_import import (
            _default_weight_kg,
            _shipping_by_sku_from_elim,
        )
        from app.services.elim_client import find_product

        detail = find_product(product_id=str(elim_id), platform=platform, lang="en")
        fresh = _shipping_by_sku_from_elim(detail)
        fresh_default = _default_weight_kg(fresh)
        if not fresh:
            return empty
        dropship_meta = {
            **dropship_meta,
            "shipping_by_sku": fresh,
            "weight_kg": fresh_default,
        }
        product.dropship_meta_json = json.dumps(dropship_meta, ensure_ascii=False)
        if product.custom_specs_json:
            try:
                specs = json.loads(product.custom_specs_json)
                if isinstance(specs, dict):
                    specs["shipping_by_sku"] = fresh
                    specs["weight_kg"] = fresh_default
                    if isinstance(specs.get("dropship"), dict):
                        specs["dropship"] = {
                            **specs["dropship"],
                            "shipping_by_sku": fresh,
                            "weight_kg": fresh_default,
                        }
                    product.custom_specs_json = json.dumps(specs, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
        db.add(product)
        db.commit()
        return fresh_default, _map_weights(fresh)
    except Exception:
        return empty


def _load_variants(
    db: Session,
    catalog_product_id: Optional[str],
    *,
    weight_by_sku: Optional[dict[str, float]] = None,
) -> list[StorefrontVariantRead]:
    if not catalog_product_id:
        return []
    weights = weight_by_sku if weight_by_sku is not None else _load_shipping_meta(db, catalog_product_id)[1]
    rows = (
        db.query(CatalogProductVariant)
        .filter(
            CatalogProductVariant.product_id == catalog_product_id,
            CatalogProductVariant.status == "published",
        )
        .order_by(CatalogProductVariant.sort_order.asc(), CatalogProductVariant.name.asc())
        .all()
    )
    out: list[StorefrontVariantRead] = []
    for row in rows:
        options = _parse_variant_options(row.options_json)
        # Skip bare default rows with no selectable options
        if not options and len(rows) == 1:
            continue
        ext = (row.external_sku_id or "").strip()
        weight_kg = weights.get(ext) if ext else None
        out.append(
            StorefrontVariantRead(
                id=row.id,
                sku=row.sku,
                name=row.name,
                price=row.price,
                stock=int(row.stock or 0),
                image_url=row.image_url,
                is_default=bool(row.is_default),
                options=options,
                weight_kg=weight_kg,
            )
        )
    return out


def _filter_specs_for_variants(
    specs: list[StorefrontSpecGroupRead],
    variants: list[StorefrontVariantRead],
) -> list[StorefrontSpecGroupRead]:
    """Drop Color/Size-style rows from specs when they are selectable variants."""
    axis_names = {
        opt.name.strip().lower()
        for v in variants
        for opt in v.options
        if opt.name.strip()
    }
    if not axis_names:
        return specs
    cleaned: list[StorefrontSpecGroupRead] = []
    for group in specs:
        items = [s for s in group.specs if s.label.strip().lower() not in axis_names]
        # Also collapse duplicate labels remaining into unique pairs
        seen: set[tuple[str, str]] = set()
        unique: list[StorefrontSpecItemRead] = []
        for s in items:
            key = (s.label.strip().lower(), s.value.strip().lower())
            if key in seen:
                continue
            seen.add(key)
            unique.append(s)
        if unique:
            cleaned.append(StorefrontSpecGroupRead(name=group.name, specs=unique))
    return cleaned


def _load_seller_and_source(
    db: Session,
    catalog_product_id: Optional[str],
    specifications_json: Optional[str] = None,
) -> tuple[Optional[StorefrontSellerInfoRead], Optional[str]]:
    seller: Optional[dict[str, Any]] = None
    source_url: Optional[str] = None

    if catalog_product_id:
        product = db.get(CatalogProduct, catalog_product_id)
        if product:
            source_url = product.source_url
            if product.seller_info_json:
                try:
                    parsed = json.loads(product.seller_info_json)
                    if isinstance(parsed, dict):
                        seller = parsed
                except json.JSONDecodeError:
                    pass

    if seller is None and specifications_json:
        try:
            raw = json.loads(specifications_json)
            if isinstance(raw, dict):
                if isinstance(raw.get("seller"), dict):
                    seller = raw["seller"]
                if not source_url and isinstance(raw.get("source_url"), str):
                    source_url = raw["source_url"]
                dropship = raw.get("dropship")
                if not source_url and isinstance(dropship, dict) and isinstance(dropship.get("supplier_link"), str):
                    source_url = dropship["supplier_link"]
        except json.JSONDecodeError:
            pass

    if not seller:
        return None, source_url

    def _num(key: str) -> Optional[float]:
        val = seller.get(key)
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    return (
        StorefrontSellerInfoRead(
            id=str(seller["id"]) if seller.get("id") is not None else None,
            name=str(seller["name"]) if seller.get("name") is not None else None,
            store_name=str(seller["store_name"]) if seller.get("store_name") is not None else None,
            level=_num("level"),
            delivery_score=_num("delivery_score"),
            item_score=_num("item_score"),
            service_score=_num("service_score"),
        ),
        source_url,
    )


def _load_sales_and_rating(
    db: Session,
    catalog_product_id: Optional[str],
    specifications_json: Optional[str],
    seller_info: Optional[StorefrontSellerInfoRead],
) -> tuple[Optional[int], Optional[float], Optional[int]]:
    """Sold count from dropship meta; rating/count prefer catalog_product_reviews."""
    sales_volume: Optional[int] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    dropship: Optional[dict[str, Any]] = None

    if catalog_product_id:
        aggregates = _aggregate_approved_reviews(db, [catalog_product_id])
        if catalog_product_id in aggregates:
            rating, review_count = aggregates[catalog_product_id]

    if catalog_product_id:
        product = db.get(CatalogProduct, catalog_product_id)
        if product and product.dropship_meta_json:
            try:
                parsed = json.loads(product.dropship_meta_json)
                if isinstance(parsed, dict):
                    dropship = parsed
            except json.JSONDecodeError:
                pass

    if dropship is None and specifications_json:
        try:
            raw = json.loads(specifications_json)
            if isinstance(raw, dict) and isinstance(raw.get("dropship"), dict):
                dropship = raw["dropship"]
        except json.JSONDecodeError:
            pass

    if dropship:
        raw_sales = dropship.get("sales_volume")
        if raw_sales is not None:
            try:
                if isinstance(raw_sales, (int, float)):
                    sales_volume = int(raw_sales)
                else:
                    text = str(raw_sales).replace(",", "").strip()
                    digits = "".join(ch for ch in text if ch.isdigit())
                    if digits:
                        sales_volume = int(digits)
            except (TypeError, ValueError):
                sales_volume = None

    # Fallback: Elim seller score when no approved catalog reviews yet
    if rating is None and seller_info and seller_info.item_score is not None:
        score = float(seller_info.item_score)
        rating = score if score <= 5 else round(score / 20, 1)

    return sales_volume, rating, review_count


def _detail_from_ec(view, ec: EcommerceItem, db: Session) -> StorefrontProductDetailRead:
    base = _view_to_read(view)
    seller_info, source_url = _load_seller_and_source(
        db,
        ec.catalog_product_id,
        ec.specifications_json,
    )
    sales_volume, rating, review_count = _load_sales_and_rating(
        db,
        ec.catalog_product_id,
        ec.specifications_json,
        seller_info,
    )
    weight_kg, weight_by_sku = _load_shipping_meta(db, ec.catalog_product_id)
    variants = _load_variants(db, ec.catalog_product_id, weight_by_sku=weight_by_sku)
    specifications = _filter_specs_for_variants(
        _load_specifications(db, ec.catalog_product_id),
        variants,
    )
    reviews = _load_approved_reviews(db, ec.catalog_product_id)
    qa = _load_public_qa(db, ec.catalog_product_id)
    base_data = base.model_dump()
    base_data.pop("rating", None)
    base_data.pop("review_count", None)
    if base_data.get("short_description"):
        base_data["short_description"] = rewrite_startech_to_againcart(
            base_data.get("short_description")
        )

    return StorefrontProductDetailRead(
        **base_data,
        full_description=rewrite_startech_to_againcart(ec.full_description),
        seo_title=rewrite_startech_to_againcart(ec.seo_title),
        seo_description=rewrite_startech_to_againcart(ec.seo_description),
        brand_id=ec.brand_id,
        category_id=ec.primary_category_id,
        specifications=specifications,
        gallery=_load_gallery(
            db,
            ec.item_id,
            view.thumbnail,
            catalog_product_id=ec.catalog_product_id,
        ),
        video_urls=_load_video_urls(db, ec.catalog_product_id),
        seller_info=seller_info,
        # the page the product was copied from is the shop's own business: never part of the public product response
        source_url=None,
        variants=variants,
        sales_volume=sales_volume,
        rating=rating,
        review_count=review_count if review_count is not None else (len(reviews) or None),
        price_tiers=_load_price_tiers(db, ec.catalog_product_id),
        weight_kg=weight_kg,
        reviews=reviews,
        qa=qa,
    )


def _normalize_sort(sort: Optional[str]) -> str:
    if not sort:
        return SORT_NEWEST
    return SORT_ALIASES.get(sort.strip().lower(), SORT_NEWEST)


@router.get("", response_model=StorefrontProductListResponse)
def list_storefront_products(
    response: Response,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(48, ge=1, le=200),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None, description="Primary category id"),
    category_slug: Optional[str] = Query(None),
    brand: Optional[str] = Query(None, description="Brand id"),
    brand_slug: Optional[str] = Query(None),
    brands: Optional[List[str]] = Query(None, description="Multiple brand slugs (filter panel)"),
    featured: Optional[bool] = Query(None),
    on_sale: Optional[bool] = Query(None),
    price_min: Optional[Decimal] = Query(None, ge=0),
    price_max: Optional[Decimal] = Query(None, ge=0),
    in_stock: Optional[bool] = Query(None),
    attrs: Optional[List[str]] = Query(
        None,
        description="Attribute filters as code:value (repeatable), e.g. form_factor:mid_tower",
    ),
    sort: Optional[str] = Query(None),
    include_hidden: bool = Query(False, description="Also unlisted products whose pages answer by URL (sitemaps)"),
) -> StorefrontProductListResponse:
    _set_cache(response)
    service = StorefrontCatalogService(db)
    result = service.list_products(
        include_hidden=include_hidden,
        page=page,
        per_page=per_page,
        search=search,
        category_id=category,
        category_slug=category_slug,
        brand_id=brand,
        brand_slug=brand_slug,
        brand_slugs=brands,
        featured=featured,
        on_sale=on_sale,
        price_min=price_min,
        price_max=price_max,
        in_stock=in_stock,
        attribute_filters=_parse_attribute_filters(attrs),
        sort=_normalize_sort(sort),
    )
    return StorefrontProductListResponse(
        data=_attach_review_stats(db, result.items),
        meta=StorefrontProductListMeta(count=result.total, page=page, per_page=per_page),
    )


@router.get("/featured", response_model=StorefrontProductListResponse)
def featured_products(
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(12, ge=1, le=48),
) -> StorefrontProductListResponse:
    _set_cache(response)
    items = StorefrontCatalogService(db).featured(limit=limit)
    return StorefrontProductListResponse(
        data=_attach_review_stats(db, items),
        meta=StorefrontProductListMeta(count=len(items), page=1, per_page=limit),
    )


@router.get("/newest", response_model=StorefrontProductListResponse)
def newest_products(
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(12, ge=1, le=48),
) -> StorefrontProductListResponse:
    _set_cache(response)
    items = StorefrontCatalogService(db).newest(limit=limit)
    return StorefrontProductListResponse(
        data=_attach_review_stats(db, items),
        meta=StorefrontProductListMeta(count=len(items), page=1, per_page=limit),
    )


@router.get("/bestsellers", response_model=StorefrontProductListResponse)
def bestseller_products(
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(12, ge=1, le=48),
) -> StorefrontProductListResponse:
    _set_cache(response)
    items = StorefrontCatalogService(db).bestsellers(limit=limit)
    return StorefrontProductListResponse(
        data=_attach_review_stats(db, items),
        meta=StorefrontProductListMeta(count=len(items), page=1, per_page=limit),
    )


@router.get("/facets", response_model=StorefrontFacetsResponse)
def storefront_product_facets(
    response: Response,
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None, description="Primary category id"),
    category_slug: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    brands: Optional[List[str]] = Query(None, description="Active brand slug filters"),
    price_min: Optional[Decimal] = Query(None, ge=0),
    price_max: Optional[Decimal] = Query(None, ge=0),
    in_stock: Optional[bool] = Query(None),
    attrs: Optional[List[str]] = Query(
        None,
        description="Active attribute filters as code:value (repeatable)",
    ),
) -> StorefrontFacetsResponse:
    _set_cache(response)
    service = StorefrontCatalogService(db)
    result = service.facets(
        category_id=category,
        category_slug=category_slug,
        search=search,
        brand_slugs=brands,
        price_min_filter=price_min,
        price_max_filter=price_max,
        in_stock=in_stock,
        attribute_filters=_parse_attribute_filters(attrs),
    )
    return StorefrontFacetsResponse(
        data=StorefrontFacetsRead(
            brands=[StorefrontFacetBrandRead(**b) for b in result["brands"]],
            price_min=result["price_min"],
            price_max=result["price_max"],
            attributes=[
                StorefrontFacetAttributeRead(
                    id=attr["id"],
                    code=attr["code"],
                    name=attr["name"],
                    display_type=attr.get("display_type") or "multi_select",
                    options=[StorefrontFacetAttributeOptionRead(**opt) for opt in attr["options"]],
                )
                for attr in result.get("attributes", [])
            ],
        ),
    )


@router.get("/by-slug/{slug}/reviews", response_model=StorefrontReviewListResponse)
def list_storefront_product_reviews(
    slug: str,
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> StorefrontReviewListResponse:
    """Public approved reviews for a storefront product (frontstore PDP)."""
    _set_no_cache(response)
    service = StorefrontCatalogService(db)
    ec = service.get_ec_by_slug(slug)
    if not ec:
        raise HTTPException(status_code=404, detail="Product not found")
    catalog_id = ec.catalog_product_id
    reviews = _load_approved_reviews(db, catalog_id, limit=limit)
    aggregates = _aggregate_approved_reviews(db, [catalog_id] if catalog_id else [])
    average, count = aggregates.get(catalog_id or "", (None, len(reviews)))
    return StorefrontReviewListResponse(
        data=reviews,
        meta=StorefrontReviewListMeta(
            count=count if count is not None else len(reviews),
            average_rating=average,
        ),
    )


def _next_storefront_review_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "catalog.review",
        initial=lambda: 20001 + db.query(CatalogProductReview).count(),
    )


def _next_storefront_question_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "catalog.question",
        initial=lambda: 20001 + db.query(CatalogProductQa).count(),
    )


def _resolve_catalog_for_slug(db: Session, slug: str) -> tuple[EcommerceItem, CatalogProduct]:
    service = StorefrontCatalogService(db)
    ec = service.get_ec_by_slug(slug)
    if not ec or not ec.catalog_product_id:
        raise HTTPException(status_code=404, detail="Product not found")
    product = db.get(CatalogProduct, ec.catalog_product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return ec, product


@router.post("/by-slug/{slug}/reviews", response_model=StorefrontReviewCreateResponse, status_code=201)
def create_storefront_product_review(
    slug: str,
    payload: StorefrontReviewCreate,
    http_request: Request,
    db: Session = Depends(get_db),
    ctx: Optional[CustomerAuthContext] = Depends(get_optional_storefront_customer),
) -> StorefrontReviewCreateResponse:
    """Shopper review → catalog_product_reviews (pending until admin approves)."""
    options = request_site_options(db, http_request)
    if not commerce_option(options, "allow_reviews"):
        raise HTTPException(status_code=403, detail="Reviews are turned off for this store")
    if ctx is None and not commerce_option(options, "allow_guest_reviews"):
        raise HTTPException(status_code=401, detail="Please sign in to write a review")

    _ec, product = _resolve_catalog_for_slug(db, slug)
    name = payload.customer_name.strip()
    body = payload.body.strip()
    title = (payload.title or "").strip() or (body[:80] + ("…" if len(body) > 80 else ""))
    customer_id = ctx[2].id if ctx else None
    if ctx and not name:
        name = ctx[2].name or "Customer"

    sentiment = "positive" if payload.rating >= 4 else "negative" if payload.rating <= 2 else "neutral"
    # Website settings → "Auto-approve reviews": shown on the product page straight away.
    auto_approve = get_module_setting(db, product.company_id or "default", "catalog", "reviews_auto_approve")
    row = CatalogProductReview(
        id=str(uuid.uuid4()),
        review_number=_next_storefront_review_number(db),
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku or "",
        product_brand=product.brand,
        product_category=product.category,
        product_image_url=product.thumbnail,
        customer_id=customer_id,
        customer_name=name,
        review_type="text",
        status="approved" if auto_approve else "pending",
        rating=payload.rating,
        title=title,
        body=body,
        sentiment=sentiment,
        is_verified_purchase=False,
        media_json="[]",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return StorefrontReviewCreateResponse(data=_review_to_read(row))


@router.get("/by-slug/{slug}/qa", response_model=StorefrontQaListResponse)
def list_storefront_product_qa(
    slug: str,
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> StorefrontQaListResponse:
    """Public Q&A for a storefront product (frontstore PDP)."""
    _set_no_cache(response)
    service = StorefrontCatalogService(db)
    ec = service.get_ec_by_slug(slug)
    if not ec:
        raise HTTPException(status_code=404, detail="Product not found")
    qa = _load_public_qa(db, ec.catalog_product_id, limit=limit)
    return StorefrontQaListResponse(
        data=qa,
        meta=StorefrontQaListMeta(count=len(qa)),
    )


@router.post("/by-slug/{slug}/qa", response_model=StorefrontQaCreateResponse, status_code=201)
def create_storefront_product_qa(
    slug: str,
    payload: StorefrontQaCreate,
    db: Session = Depends(get_db),
    ctx: Optional[CustomerAuthContext] = Depends(get_optional_storefront_customer),
) -> StorefrontQaCreateResponse:
    """Shopper question → catalog_product_qa (pending until answered)."""
    _ec, product = _resolve_catalog_for_slug(db, slug)
    if not get_module_setting(db, product.company_id or "default", "catalog", "group_qa_enabled"):
        raise HTTPException(status_code=403, detail="Questions are turned off for this store")
    name = payload.customer_name.strip()
    if ctx and not name:
        name = ctx[2].name or "Customer"
    row = CatalogProductQa(
        id=str(uuid.uuid4()),
        question_number=_next_storefront_question_number(db),
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku or "",
        product_brand=product.brand,
        product_category=product.category,
        product_image_url=product.thumbnail,
        customer_name=name,
        question=payload.question.strip(),
        answer=None,
        status="pending",
        is_verified=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return StorefrontQaCreateResponse(data=_qa_to_read(row))


@router.get("/by-slug/{slug}", response_model=StorefrontProductDetailResponse)
def get_storefront_product_by_slug(
    slug: str,
    response: Response,
    db: Session = Depends(get_db),
) -> StorefrontProductDetailResponse:
    _set_cache(response)
    service = StorefrontCatalogService(db)
    view = service.get_by_slug(slug)
    if not view:
        raise HTTPException(status_code=404, detail="Product not found")
    ec = service.get_ec_by_slug(slug)
    if not ec:
        raise HTTPException(status_code=404, detail="Product not found")
    related = _attach_review_stats(db, service.related(slug))
    return StorefrontProductDetailResponse(
        data=_detail_from_ec(view, ec, db),
        related=related,
    )


class StorefrontRecommendationsRead(BaseModel):
    also_bought: List[StorefrontProductRead]
    category_bestsellers: List[StorefrontProductRead]
    category_name: Optional[str] = None
    category_slug: Optional[str] = None


class StorefrontRecommendationsResponse(BaseModel):
    data: StorefrontRecommendationsRead


@router.get("/recommendations/{product_id}", response_model=StorefrontRecommendationsResponse)
def product_recommendations(
    product_id: str,
    response: Response,
    db: Session = Depends(get_db),
    limit: int = Query(8, ge=1, le=24),
    bestsellers: int = Query(12, ge=1, le=24),
) -> StorefrontRecommendationsResponse:
    """For the product page's two rails, from real sales:

    - also_bought: what goes WITH it, never the same type (Monitor for a Dell monitor): products of the same webshop
      orders, most shared orders first; topped up with the bestsellers of the categories most often bought with
      this type of product
    - category_bestsellers: the bestsellers (units sold) of this product's category and the ones below it

    Only products on the storefront; in-stock ones first. Cached for five minutes."""
    from sqlalchemy.orm import aliased
    from app.models.catalog_category import CatalogCategory
    from app.models.commerce_order_item import CommerceOrderItem
    from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
    from app.services.ecommerce.storefront_catalog_service import SORT_BESTSELLING

    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    ec = db.query(EcommerceItem).filter(EcommerceItem.catalog_product_id == product_id).first()
    if ec is None:
        raise HTTPException(status_code=404, detail="Product not found")
    svc = StorefrontCatalogService(db)
    items = EcommerceItemService(db)

    def in_stock_first(views: list) -> list:
        return sorted(views, key=lambda v: 0 if v.in_stock else 1)  # stable: keeps the ranking inside each group

    # the category's bestsellers
    cat = db.get(CatalogCategory, ec.primary_category_id) if ec.primary_category_id else None
    best = []
    if cat is not None:
        best = [v for v in svc.list_products(category_id=cat.id, sort=SORT_BESTSELLING, per_page=bestsellers * 2).items if v.id != product_id]
        best = in_stock_first(best)[:bestsellers]

    # "also bought" is for what goes WITH this product, never more of the same kind: the product's type is its
    # category's parent (Monitor for "Dell", Processor for "AMD Processor"), and nothing from under it is shown
    type_cat = (db.get(CatalogCategory, cat.parent_id) if cat is not None and cat.parent_id and cat.depth >= 1 else None) or cat
    type_path = type_cat.path if type_cat is not None else None

    def other_type(q, ec_alias, cat_alias):
        q = q.join(ec_alias, ec_alias.catalog_product_id == other.product_id).outerjoin(cat_alias, cat_alias.id == ec_alias.primary_category_id)
        if type_path:
            q = q.filter(or_(cat_alias.path.is_(None), ~cat_alias.path.like(f"{type_path}%")))
        return q

    together, seen = [], {product_id} | {v.id for v in best}

    def add(view) -> None:
        if view is not None and view.id not in seen:
            together.append(view)
            seen.add(view.id)

    # 1) bought together: other products of the orders this one was in, most shared orders first
    me, other = aliased(CommerceOrderItem), aliased(CommerceOrderItem)
    oe, oc = aliased(EcommerceItem), aliased(CatalogCategory)
    n_orders = func.count(func.distinct(other.order_id))
    rows = (
        other_type(db.query(other.product_id, n_orders).join(me, me.order_id == other.order_id), oe, oc)
        .filter(me.product_id == product_id, other.product_id != product_id)
        .group_by(other.product_id)
        .order_by(n_orders.desc())
        .limit(limit * 4)
        .all()
    )
    for pid, _n in rows:
        e = db.query(EcommerceItem).filter(EcommerceItem.catalog_product_id == pid).first()
        add(items.resolve_storefront_from_ecommerce(e) if e else None)
    # an out-of-stock product never keeps an in-stock one out of the row
    n_in = lambda: sum(1 for v in together if v.in_stock)  # noqa: E731

    # 2) fewer than `limit` in stock: the bestsellers of the categories most often bought with this TYPE of product
    #    (e.g. a processor → motherboards, RAM, SSDs, coolers), a few from each in turn
    if n_in() < limit and type_path:
        me_ec, me_cat = aliased(EcommerceItem), aliased(CatalogCategory)
        cat_rows = (
            other_type(
                db.query(oc.id, n_orders)
                .join(me, me.order_id == other.order_id)
                .join(me_ec, me_ec.catalog_product_id == me.product_id)
                .join(me_cat, me_cat.id == me_ec.primary_category_id),
                oe,
                oc,
            )
            .filter(me_cat.path.like(f"{type_path}%"), oc.id.isnot(None))
            .group_by(oc.id)
            .order_by(n_orders.desc())
            .limit(limit)
            .all()
        )
        pools = []
        for cid, _n in cat_rows:
            pool = [v for v in svc.list_products(category_id=cid, sort=SORT_BESTSELLING, per_page=6).items if v.in_stock and v.id not in seen]
            if pool:
                pools.append(pool)
        while n_in() < limit and any(pools):
            for pool in pools:
                if pool and n_in() < limit:
                    add(pool.pop(0))

    return StorefrontRecommendationsResponse(
        data=StorefrontRecommendationsRead(
            also_bought=_attach_review_stats(db, in_stock_first(together)[:limit]),  # in stock first, out of stock last
            category_bestsellers=_attach_review_stats(db, best),
            category_name=cat.name if cat else None,
            category_slug=cat.slug if cat else None,
        )
    )


@router.get("/{product_id}", response_model=StorefrontProductResponse)
def get_storefront_product_by_id(
    product_id: str,
    response: Response,
    db: Session = Depends(get_db),
) -> StorefrontProductResponse:
    _set_cache(response)
    service = StorefrontCatalogService(db)
    ec = (
        service._direct_query()
        .filter(
            (EcommerceItem.catalog_product_id == product_id) | (EcommerceItem.item_id == product_id),
        )
        .first()
    )
    if not ec:
        raise HTTPException(status_code=404, detail="Product not found")
    view = service._items.resolve_storefront_from_ecommerce(ec, unlisted_ok=True)
    if not view:
        raise HTTPException(status_code=404, detail="Product not found")
    return StorefrontProductResponse(data=_attach_review_stats(db, [view])[0])
