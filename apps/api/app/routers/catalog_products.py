from __future__ import annotations

import json
import re
import secrets
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.database import get_db
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.catalog_product_media import CatalogProductMedia
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.catalog_attribute import CatalogAttribute
from app.models.inventory_item import InventoryItem
from app.models.inventory_item_location import InventoryItemLocation
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.media import Media
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.schemas.product import (
    ProductAddToInventory,
    ProductAddToInventoryResponse,
    ProductCreate,
    ProductDetailRead,
    ProductDetailResponse,
    ProductInventoryRead,
    ProductInventoryResponse,
    ProductInventoryUpsert,
    ProductListMeta,
    ProductListResponse,
    ProductMediaBrief,
    ProductMediaReplace,
    ProductRead,
    ProductResponse,
    ProductSpecsRead,
    ProductSpecsReplace,
    ProductSpecsResponse,
    ProductSpecValueRead,
    ProductSlugCheckResponse,
    ProductUpdate,
    ProductVariantBrief,
    dump_tags,
    load_tags,
)
from app.schemas.variant import VariantBulkReplace, VariantUpsert
from app.services.inventory.constants import MOVEMENT_OPENING_STOCK
from app.services.inventory.inventory_item_location_service import InventoryItemLocationService
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.inventory.stock_status import compute_stock_status as _compute_stock_status
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.catalog_filter_sync import connect_product_values
from app.services.collaboration import (
    on_item_archived,
    on_item_created,
    on_item_price_change,
    on_item_published,
    on_item_stock_change,
    on_item_updated,
)
from app.services.items.item_identity_service import ItemIdentityService
from app.services.core.module_settings import clean_sku_prefix, enforce_publish_rules, get_module_setting

router = APIRouter(prefix="/products", tags=["catalog-products"])


def _default_variant(db: Session, product_id: str) -> Optional[CatalogProductVariant]:
    return (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product_id)
        .order_by(CatalogProductVariant.is_default.desc(), CatalogProductVariant.sort_order)
        .first()
    )


def _resolve_brand_category(db: Session, data: dict) -> dict:
    """Resolve brand_id/category_id from names when IDs omitted (AgainERP denorm pattern)."""
    out = dict(data)
    category_id = out.get("category_id")
    category_name = out.get("category")
    if category_id:
        cat = db.get(CatalogCategory, category_id)
        if cat:
            out["category"] = cat.name
    elif category_name:
        cat = db.query(CatalogCategory).filter(CatalogCategory.name == category_name).first()
        if cat:
            out["category_id"] = cat.id

    brand_id = out.get("brand_id")
    brand_name = out.get("brand")
    if brand_id:
        brand = db.get(CatalogBrand, brand_id)
        if brand:
            out["brand"] = brand.name
    elif brand_name:
        brand = db.query(CatalogBrand).filter(CatalogBrand.name == brand_name).first()
        if brand:
            out["brand_id"] = brand.id
    return out


def _category_ids_for_product(db: Session, row: CatalogProduct) -> List[str]:
    """Multi-category list from ecommerce links; primary first. Falls back to category_id."""
    if row.item_id:
        links = (
            db.query(EcommerceItemCategory)
            .filter(EcommerceItemCategory.item_id == row.item_id)
            .order_by(EcommerceItemCategory.is_primary.desc(), EcommerceItemCategory.sort_order)
            .all()
        )
        if links:
            seen: set[str] = set()
            ids: List[str] = []
            for link in links:
                if link.category_id in seen:
                    continue
                seen.add(link.category_id)
                ids.append(link.category_id)
            return ids
    return [row.category_id] if row.category_id else []


def _normalize_category_ids(
    db: Session,
    *,
    category_ids: Optional[List[str]],
    category_id: Optional[str],
) -> List[str]:
    raw = list(category_ids or [])
    if category_id and category_id not in raw:
        raw.insert(0, category_id)
    seen: set[str] = set()
    out: List[str] = []
    for cid in raw:
        if not cid or cid in seen:
            continue
        if not db.get(CatalogCategory, cid):
            continue
        seen.add(cid)
        out.append(cid)
    return out


def _apply_product_categories(
    db: Session,
    row: CatalogProduct,
    category_ids: List[str],
) -> None:
    primary = category_ids[0] if category_ids else None
    row.category_id = primary
    if primary:
        cat = db.get(CatalogCategory, primary)
        if cat:
            row.category = cat.name
    else:
        row.category = None

    item_id = row.item_id or row.id
    EcommerceItemService(db).replace_categories(
        item_id,
        category_ids,
        primary_category_id=primary,
        company_id=row.company_id,
    )


def _apply_product_locations(
    db: Session,
    row: CatalogProduct,
    location_ids: List[str],
) -> None:
    item_id = row.item_id or row.id
    InventoryItemLocationService(db).replace_locations(
        item_id=item_id,
        warehouse_ids=location_ids,
        company_id=row.company_id,
    )


def _split_inventory_fields(data: dict) -> tuple[dict, dict]:
    inv: dict = {}
    if "alert_quantity" in data:
        inv["alert_quantity"] = data.pop("alert_quantity")
    if "unit_type" in data:
        inv["unit_type"] = data.pop("unit_type")
    if "track_serial" in data:
        inv["track_serial"] = data.pop("track_serial")
    if "track_batch" in data:
        inv["track_batch"] = data.pop("track_batch")
    if "tracking_type" in data:
        inv["tracking_type"] = data.pop("tracking_type")
    return data, inv


def _split_item_fields(data: dict) -> tuple[dict, dict]:
    """Pop the fields that belong on Item (SSOT), not CatalogProduct, out of the payload dict."""
    item_fields: dict = {}
    if "barcode" in data:
        item_fields["barcode"] = data.pop("barcode")
    if "barcode_type" in data:
        item_fields["barcode_type"] = data.pop("barcode_type")
    return data, item_fields


def _apply_product_inventory_fields(
    db: Session,
    product: CatalogProduct,
    inv_fields: dict,
) -> None:
    if not inv_fields:
        return
    alert_quantity = inv_fields.get("alert_quantity")
    unit_type = inv_fields.get("unit_type")
    track_serial = inv_fields.get("track_serial")
    track_batch = inv_fields.get("track_batch")
    tracking_type = inv_fields.get("tracking_type")
    if (
        alert_quantity is None
        and not unit_type
        and track_serial is None
        and track_batch is None
        and not tracking_type
    ):
        return
    inv = InventoryItemService(db).ensure_for_catalog_product(product)
    if alert_quantity is not None:
        inv.reorder_level = alert_quantity
        inv.min_stock = alert_quantity
        for level in (
            db.query(InventoryStockLevel)
            .filter(InventoryStockLevel.product_id == product.id)
            .all()
        ):
            level.min_qty = alert_quantity
            level.reorder_level = alert_quantity
            level.status = _compute_stock_status(level.on_hand, alert_quantity, level.max_qty)
    if isinstance(unit_type, str):
        code = unit_type.strip()[:20]
        if code:
            inv.base_uom = code
            inv.purchase_uom = code
            inv.sales_uom = code
    if tracking_type in {"none", "serial", "batch"}:
        inv.track_serial = tracking_type == "serial"
        inv.track_batch = tracking_type == "batch"
    else:
        if track_serial is not None:
            inv.track_serial = bool(track_serial)
            if inv.track_serial:
                inv.track_batch = False
        if track_batch is not None:
            inv.track_batch = bool(track_batch)
            if inv.track_batch:
                inv.track_serial = False


def _apply_product_item_fields(
    db: Session,
    product: CatalogProduct,
    item_fields: dict,
) -> None:
    if not item_fields:
        return
    if not product.item_id:
        return
    item = db.get(Item, product.item_id)
    if not item:
        return
    if item_fields.get("barcode") is not None:
        item.barcode = item_fields["barcode"]
    if item_fields.get("barcode_type") is not None:
        item.barcode_type = item_fields["barcode_type"]


class _ListPrefetch:
    """Per-page lookups for the product list, loaded in one query each.

    Reading them row by row cost ~5 queries per product (1,000+ for a 200-row
    page) and made the admin products grid slow on a full catalog.
    """

    def __init__(self, db: Session, rows: List[CatalogProduct]):
        item_ids = [r.item_id for r in rows if r.item_id]
        location_keys = [r.item_id or r.id for r in rows]
        self.items: dict[str, Item] = {}
        self.inventory: dict[str, InventoryItem] = {}
        self.locations: dict[str, List[str]] = {}
        self.category_links: dict[str, List[str]] = {}
        if item_ids:
            self.items = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
            for inv in db.query(InventoryItem).filter(InventoryItem.item_id.in_(item_ids)).all():
                # get_by_item_id returns the first match; keep that behaviour.
                self.inventory.setdefault(inv.item_id, inv)
            links = (
                db.query(EcommerceItemCategory)
                .filter(EcommerceItemCategory.item_id.in_(item_ids))
                .order_by(
                    EcommerceItemCategory.item_id,
                    EcommerceItemCategory.is_primary.desc(),
                    EcommerceItemCategory.sort_order,
                )
                .all()
            )
            for link in links:
                ids = self.category_links.setdefault(link.item_id, [])
                if link.category_id not in ids:
                    ids.append(link.category_id)
        if location_keys:
            for loc in (
                db.query(InventoryItemLocation)
                .filter(InventoryItemLocation.item_id.in_(location_keys))
                .all()
            ):
                self.locations.setdefault(loc.item_id, []).append(loc.warehouse_id)

    def category_ids(self, row: CatalogProduct) -> List[str]:
        if row.item_id and self.category_links.get(row.item_id):
            return list(self.category_links[row.item_id])
        return [row.category_id] if row.category_id else []


def _product_read(
    db: Session,
    row: CatalogProduct,
    prefetch: Optional[_ListPrefetch] = None,
    *,
    lean: bool = False,
) -> ProductRead:
    """lean=True leaves out the long text (description, short description, meta
    description, tags) — list screens never show it and it was ~85% of the payload.
    The edit form loads the full product from GET /{id}."""
    if prefetch is not None:
        item = prefetch.items.get(row.item_id) if row.item_id else None
        identity = ItemIdentityService.identity_from_item(row, item)
        inv = prefetch.inventory.get(row.item_id) if row.item_id else None
        location_ids = list(prefetch.locations.get(row.item_id or row.id, []))
        category_ids = prefetch.category_ids(row)
    else:
        identity = ItemIdentityService(db).resolve_identity(row)
        inv = InventoryItemService(db).get_by_item_id(row.item_id) if row.item_id else None
        item = db.get(Item, row.item_id) if row.item_id else None
        location_ids = (
            [
                loc.warehouse_id
                for loc in db.query(InventoryItemLocation)
                .filter(InventoryItemLocation.item_id == (row.item_id or row.id))
                .all()
            ]
        )
        category_ids = _category_ids_for_product(db, row)
    return ProductRead(
        id=row.id,
        item_id=row.item_id,
        company_id=row.company_id,
        name=identity["name"],
        slug=row.slug,
        sku=identity["sku"],
        model=row.model,
        remarks=row.remarks,
        description=None if lean else row.description,
        short_description=None if lean else row.short_description,
        price=row.price,
        compare_at_price=row.compare_at_price,
        purchase_price=getattr(row, "purchase_price", None),
        last_selling_price=getattr(row, "last_selling_price", None),
        stock=row.stock,
        track_quantity=row.track_quantity,
        barcode=item.barcode if item else None,
        barcode_type=(item.barcode_type if item and item.barcode_type else "C128"),
        not_for_selling=row.not_for_selling,
        weight=row.weight,
        tax_rate=row.tax_rate,
        tax_type=row.tax_type,
        location_ids=location_ids,
        stock_status=row.stock_status,
        status=identity["status"],
        # Catalog may keep product_type=variable for Elim SKUs while Item SSOT
        # collapses variable→physical→simple; prefer the catalog commerce type.
        product_type=row.product_type if row.product_type == "variable" else identity["product_type"],
        visibility=row.visibility,
        brand=row.brand,
        category=row.category,
        brand_id=row.brand_id,
        category_id=row.category_id,
        category_ids=category_ids,
        attribute_profile_id=row.attribute_profile_id,
        thumbnail=row.thumbnail,
        seo_title=row.seo_title,
        seo_description=None if lean else row.seo_description,
        focus_keyphrase=row.focus_keyphrase,
        warranty=row.warranty,
        origin=getattr(row, "origin", None),
        alert_quantity=inv.reorder_level if inv else 0,
        unit_type=inv.base_uom if inv else "ea",
        track_serial=bool(inv.track_serial) if inv else False,
        track_batch=bool(inv.track_batch) if inv else False,
        tracking_type=(
            "serial"
            if inv and inv.track_serial
            else "batch"
            if inv and inv.track_batch
            else "none"
        ),
        tags=[] if lean else load_tags(row.tags_json),
        custom_specs_json=row.custom_specs_json,
        variant_attributes_json=getattr(row, "variant_attributes_json", None),
        combo_components_json=getattr(row, "combo_components_json", None),
        source_url=getattr(row, "source_url", None),
        seller_info_json=getattr(row, "seller_info_json", None),
        dropship_meta_json=getattr(row, "dropship_meta_json", None),
        in_inventory=bool(getattr(row, "in_inventory", True)),
        on_website=bool(getattr(row, "on_website", True)),
        gallery_json=getattr(row, "gallery_json", None),
        video_urls_json=getattr(row, "video_urls_json", None),
        created_at=row.created_at,
        updated_at=row.updated_at,
        updated_by_name=getattr(row, "updated_by_name", None),
    )


def _variant_brief(variant: CatalogProductVariant, db: Optional[Session] = None) -> ProductVariantBrief:
    image_url = getattr(variant, "image_url", None)
    if variant.image_id and db:
        media = db.get(Media, variant.image_id)
        if media and media.url:
            image_url = media.url
    return ProductVariantBrief(
        id=variant.id,
        sku=variant.sku,
        name=variant.name,
        price=variant.price,
        purchase_price=getattr(variant, "purchase_price", None),
        stock=variant.stock,
        status=variant.status,
        is_default=variant.is_default,
        sort_order=variant.sort_order,
        image_id=variant.image_id,
        image_url=image_url,
        options_json=getattr(variant, "options_json", None),
        external_sku_id=getattr(variant, "external_sku_id", None),
    )


def _media_brief(link: CatalogProductMedia, media: Media) -> ProductMediaBrief:
    return ProductMediaBrief(
        id=link.id,
        media_id=media.id,
        url=media.url,
        name=media.name,
        media_type=media.media_type,
        sort_order=link.sort_order,
        is_primary=link.is_primary,
    )


def _parse_hotlink_urls(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [u for u in data if isinstance(u, str) and u.startswith("http")]


def _hotlink_media_briefs(row: CatalogProduct) -> list[ProductMediaBrief]:
    """SkyBuy-style CDN URL gallery when no Media library links exist."""
    images = _parse_hotlink_urls(getattr(row, "gallery_json", None))
    videos = _parse_hotlink_urls(getattr(row, "video_urls_json", None))
    if not images and not videos and row.custom_specs_json:
        try:
            specs = json.loads(row.custom_specs_json)
            if isinstance(specs, dict):
                if isinstance(specs.get("images"), list):
                    images = [u for u in specs["images"] if isinstance(u, str) and u.startswith("http")]
                if isinstance(specs.get("videos"), list):
                    videos = [u for u in specs["videos"] if isinstance(u, str) and u.startswith("http")]
        except json.JSONDecodeError:
            pass
    if not images and row.thumbnail:
        images = [row.thumbnail]

    briefs: list[ProductMediaBrief] = []
    sort = 0
    for url in images:
        briefs.append(
            ProductMediaBrief(
                id=f"hotlink-img-{sort}",
                media_id=f"hotlink-img-{sort}",
                url=url,
                name=f"Image {sort + 1}",
                media_type="image",
                sort_order=sort,
                is_primary=(sort == 0),
            )
        )
        sort += 1
    for url in videos:
        briefs.append(
            ProductMediaBrief(
                id=f"hotlink-vid-{sort}",
                media_id=f"hotlink-vid-{sort}",
                url=url,
                name=f"Video {sort + 1}",
                media_type="video",
                sort_order=sort,
                is_primary=False,
            )
        )
        sort += 1
    return briefs


def _product_detail(db: Session, row: CatalogProduct) -> ProductDetailRead:
    base = _product_read(db, row).model_dump()
    variants = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == row.id)
        .order_by(CatalogProductVariant.sort_order, CatalogProductVariant.created_at)
        .all()
    )
    media_rows = (
        db.query(CatalogProductMedia, Media)
        .join(Media, Media.id == CatalogProductMedia.media_id)
        .filter(CatalogProductMedia.product_id == row.id)
        .order_by(CatalogProductMedia.sort_order, CatalogProductMedia.created_at)
        .all()
    )
    media = [_media_brief(link, media) for link, media in media_rows]
    if not media:
        media = _hotlink_media_briefs(row)
    has_inventory = db.query(InventoryStockLevel).filter(
        InventoryStockLevel.product_id == row.id
    ).first() is not None
    ec = EcommerceItemService(db).get_by_item_id(row.item_id) if row.item_id else None
    return ProductDetailRead(
        **base,
        variants=[_variant_brief(v, db) for v in variants],
        media=media,
        has_inventory=has_inventory,
        ecommerce_publish_status=ec.publish_status if ec else None,
    )


def _apply_create_payload(payload: ProductCreate) -> tuple[dict, dict, dict, List[str]]:
    data = payload.model_dump()
    tags = data.pop("tags", [])
    data.pop("category_ids", None)
    location_ids = data.pop("location_ids", None) or []
    data["tags_json"] = dump_tags(tags)
    data, inv_fields = _split_inventory_fields(data)
    data, item_fields = _split_item_fields(data)
    return data, inv_fields, item_fields, location_ids


def _apply_update_payload(payload: ProductUpdate) -> tuple[dict, dict, dict, Optional[List[str]]]:
    data = payload.model_dump(exclude_unset=True)
    data.pop("category_ids", None)
    location_ids = data.pop("location_ids") if "location_ids" in data else None
    if "tags" in data:
        data["tags_json"] = dump_tags(data.pop("tags"))
    data, inv_fields = _split_inventory_fields(data)
    data, item_fields = _split_item_fields(data)
    return data, inv_fields, item_fields, location_ids


def _ensure_default_variant(db: Session, product: CatalogProduct) -> None:
    from app.services.items.catalog_item_bridge import ensure_default_variant

    ensure_default_variant(db, product)


def _replace_variants(
    db: Session,
    product: CatalogProduct,
    variants: List[VariantUpsert],
) -> None:
    existing = {
        v.id: v
        for v in db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product.id)
        .all()
    }
    keep_ids: set[str] = set()

    if not variants and product.product_type == "simple":
        _ensure_default_variant(db, product)
        return

    for idx, item in enumerate(variants):
        image_id = item.image_id
        if image_id:
            image = db.get(Media, image_id)
            if not image or image.company_id != product.company_id:
                image_id = None
        if item.id and item.id in existing:
            row = existing[item.id]
            keep_ids.add(row.id)
        else:
            row = CatalogProductVariant(
                product_id=product.id,
                sku=item.sku,
                name=item.name,
                price=item.price,
                purchase_price=item.purchase_price,
                stock=item.stock,
                status=item.status,
                is_default=item.is_default,
                sort_order=item.sort_order if item.sort_order else idx,
                image_id=image_id,
                options_json=item.options_json,
            )
            db.add(row)
            db.flush()
            keep_ids.add(row.id)
            continue

        row.sku = item.sku
        row.name = item.name
        row.price = item.price
        row.purchase_price = item.purchase_price
        row.stock = item.stock
        row.image_id = image_id
        row.status = item.status
        row.is_default = item.is_default
        row.sort_order = item.sort_order if item.sort_order else idx
        row.options_json = item.options_json

    for vid, row in existing.items():
        if vid not in keep_ids:
            db.delete(row)

    if variants and not any(v.is_default for v in variants):
        first = (
            db.query(CatalogProductVariant)
            .filter(CatalogProductVariant.product_id == product.id)
            .order_by(CatalogProductVariant.sort_order)
            .first()
        )
        if first:
            first.is_default = True


def _replace_media(db: Session, product: CatalogProduct, media_ids: List[str]) -> None:
    db.query(CatalogProductMedia).filter(CatalogProductMedia.product_id == product.id).delete()
    primary_url: Optional[str] = None
    attached = 0
    for media_id in media_ids:
        media = db.get(Media, media_id)
        if not media or media.company_id != product.company_id:
            continue
        db.add(
            CatalogProductMedia(
                company_id=product.company_id,
                product_id=product.id,
                media_id=media_id,
                sort_order=attached,
                is_primary=attached == 0,
            ),
        )
        if primary_url is None and media.media_type == "image":
            primary_url = media.url
        attached += 1
    if primary_url is not None:
        product.thumbnail = primary_url


def _upsert_product_inventory(
    db: Session,
    product: CatalogProduct,
    variant: CatalogProductVariant,
    payload: ProductInventoryUpsert,
) -> ProductInventoryRead:
    warehouse = db.get(InventoryWarehouse, payload.warehouse_id)
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    unit_cost = payload.unit_cost if payload.unit_cost is not None else Decimal("0")
    min_qty = payload.min_qty
    display_name = product.name
    if variant.name and variant.name != "Default":
        display_name = f"{product.name} — {variant.name}"

    inv = InventoryItemService(db).ensure_for_catalog_product(product)
    product.in_inventory = True
    item_id = product.item_id or product.id
    movement_svc = StockMovementService(db)
    row = movement_svc.lock_stock(item_id, payload.warehouse_id, product.company_id or "default")
    requested = payload.on_hand

    # Serial-tracked items come in as a list of units, never as a bare quantity.
    from app.services.inventory import serial_service

    tracks_serial = bool(inv and getattr(inv, "track_serial", False))
    serials: list[str] = []
    seen: set[str] = set()
    for raw in payload.serial_numbers or []:
        cleaned = serial_service.clean_serial(raw)
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            serials.append(cleaned)
    if serials:
        taken = [
            sn
            for sn in serials
            if serial_service.find_by_number(db, sn, company_id=product.company_id or "default")
        ]
        if taken:
            raise HTTPException(
                status_code=400,
                detail=f"Already registered: {', '.join(taken[:5])}{'…' if len(taken) > 5 else ''}",
            )
        if requested not in (None, 0, len(serials)):
            raise HTTPException(
                status_code=400,
                detail=f"{len(serials)} serial numbers for {requested} units — the quantity must match",
            )
        requested = len(serials)
    elif tracks_serial and requested:
        raise HTTPException(
            status_code=400,
            detail="This product tracks serial numbers — enter one serial per unit to add stock",
        )
    projected_on_hand = row.on_hand + requested if requested else row.on_hand
    max_qty = max(projected_on_hand * 3, 50) if projected_on_hand > 0 else 50
    reorder_level = min_qty
    row.sku = variant.sku
    row.name = display_name
    row.thumbnail = product.thumbnail
    row.min_qty = min_qty
    row.max_qty = max_qty
    row.reorder_level = reorder_level
    if payload.unit_cost is not None:
        row.unit_cost = unit_cost

    if requested is not None and requested > 0:
        # Every "Opening stock" save from the catalog is additive — it tops up
        # on-hand rather than setting an absolute target, so it can be used
        # repeatedly (AgainPOS-style quick stock top-up) without hitting the
        # "no absolute SET" ledger invariant below.
        movement_svc.apply_movement(
            MovementInput(
                item_id=item_id,
                warehouse_id=payload.warehouse_id,
                movement_type=MOVEMENT_OPENING_STOCK,
                quantity=requested,
                company_id=product.company_id or "default",
                notes="Opening stock from catalog",
                unit_cost=unit_cost,
                stock_level_id=row.id,
                source_type="catalog_opening",
                source_id=product.id,
            )
        )
        if serials:
            serial_service.register_serials_or_raise(
                db,
                serials,
                company_id=product.company_id or "default",
                item_id=item_id,
                warehouse_id=payload.warehouse_id,
                source_type="opening",
                source_id=product.id,
                notes="Opening stock from catalog",
            )
    else:
        row.status = _compute_stock_status(row.on_hand, reorder_level, max_qty)
        db.flush()

    return ProductInventoryRead(
        id=row.id,
        warehouse_id=row.warehouse_id,
        warehouse_name=warehouse.name,
        variant_id=row.variant_id,
        on_hand=row.on_hand,
        min_qty=row.min_qty,
        unit_cost=row.unit_cost,
        serials_registered=len(serials),
    )


def _load_product_specs(db: Session, product: CatalogProduct) -> ProductSpecsRead:
    rows = (
        db.query(CatalogProductAttributeValue, CatalogAttribute)
        .join(CatalogAttribute, CatalogAttribute.id == CatalogProductAttributeValue.attribute_id)
        .filter(CatalogProductAttributeValue.product_id == product.id)
        .order_by(CatalogProductAttributeValue.sort_order, CatalogAttribute.sort_order)
        .all()
    )
    return ProductSpecsRead(
        attribute_profile_id=product.attribute_profile_id,
        values=[
            ProductSpecValueRead(
                attribute_id=attr.id,
                attribute_code=attr.code,
                attribute_name=attr.name,
                value=val.value,
                sort_order=val.sort_order,
            )
            for val, attr in rows
        ],
    )


def _replace_product_specs(db: Session, product: CatalogProduct, payload: ProductSpecsReplace) -> None:
    if payload.attribute_profile_id is not None:
        product.attribute_profile_id = payload.attribute_profile_id or None

    # Filter-only attributes (is_visible = False, e.g. imported shop filters) are not
    # in the spec editor, so the editor never sends them — keep their values.
    hidden_attr_ids = db.query(CatalogAttribute.id).filter(CatalogAttribute.is_visible.is_(False))
    db.query(CatalogProductAttributeValue).filter(
        CatalogProductAttributeValue.product_id == product.id,
        CatalogProductAttributeValue.attribute_id.notin_(hidden_attr_ids),
    ).delete(synchronize_session=False)
    sent_ids = {item.attribute_id for item in payload.values if item.attribute_id}
    db.query(CatalogProductAttributeValue).filter(
        CatalogProductAttributeValue.product_id == product.id,
        CatalogProductAttributeValue.attribute_id.in_(sent_ids or {"__none__"}),
    ).delete(synchronize_session=False)

    saved: list[tuple[CatalogAttribute, str]] = []
    for idx, item in enumerate(payload.values):
        if not item.attribute_id:
            continue
        attr = db.get(CatalogAttribute, item.attribute_id)
        if not attr:
            continue
        saved.append((attr, item.value or ""))
        db.add(
            CatalogProductAttributeValue(
                product_id=product.id,
                attribute_id=item.attribute_id,
                value=item.value or "",
                sort_order=item.sort_order if item.sort_order != 0 else idx,
            ),
        )
    # a new value on a filterable spec is a new shop filter option — no separate filter setup
    connect_product_values(db, saved)


def _list_scope_query(db: Session, company_id: str, status: Optional[str], exclude_status: Optional[str], channel: Optional[str], scope: Optional[str]):
    """The products a list screen covers: company + status + Catalog/Dropshipping channel + Inventory/Website module."""
    query = db.query(CatalogProduct).filter(CatalogProduct.company_id == company_id)
    if status:
        query = query.filter(CatalogProduct.status == status)
    if exclude_status:
        query = query.filter(CatalogProduct.status != exclude_status)
    # Module split: dropship_meta_json marks Dropshipping channel products.
    if channel == "dropshipping":
        query = query.filter(CatalogProduct.dropship_meta_json.isnot(None))
    elif channel == "catalog":
        query = query.filter(CatalogProduct.dropship_meta_json.is_(None))
    # Inventory and Website keep separate product lists over the same table.
    if scope == "inventory":
        # an Unlisted product is a website draft (a title and a source link): the Inventory catalog never lists one
        query = query.filter(CatalogProduct.in_inventory.is_(True), CatalogProduct.status != "unlisted")
    elif scope == "website":
        query = query.filter(CatalogProduct.on_website.is_(True))
    return query


@router.get("/list-ids")
def list_product_ids(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(None),
    channel: Optional[str] = Query(None, pattern="^(catalog|dropshipping)$"),
    exclude_status: Optional[str] = Query(None, pattern="^(draft|published|unlisted|archived)$"),
    scope: Optional[str] = Query(None, pattern="^(inventory|website)$"),
) -> dict:
    """Just the ids a list covers - the admin compares them with its cached copy to drop deleted / moved products."""
    rows = _list_scope_query(db, company_id, status, exclude_status, channel, scope).with_entities(CatalogProduct.id).all()
    return {"data": [r[0] for r in rows]}


@router.get("", response_model=ProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None, max_length=120),
    channel: Optional[str] = Query(
        None,
        pattern="^(catalog|dropshipping)$",
        description="catalog = local inventory (no dropship meta); dropshipping = Elim/Amazon/manual dropship",
    ),
    fields: Optional[str] = Query(
        None,
        pattern="^(list|full)$",
        description="list = grid columns only (no description / short description / meta description / tags)",
    ),
    exclude_status: Optional[str] = Query(
        None,
        pattern="^(draft|published|unlisted|archived)$",
        description="Leave out products of this status (the Products list hides the Unlisted ones)",
    ),
    scope: Optional[str] = Query(
        None,
        pattern="^(inventory|website)$",
        description="inventory = Inventory module catalog; website = Website module product list",
    ),
    updated_since: Optional[datetime] = Query(
        None,
        description="Only products saved at or after this time (the admin list refreshes a cached copy with just the changes)",
    ),
    sellable: bool = Query(
        False,
        description="Only products that have a selling price (leaves out imported / placeholder rows) - used by document product search",
    ),
    brand: Optional[str] = Query(None, max_length=200, description="Only products of this brand (name)"),
    category: Optional[List[str]] = Query(None, description="Only products filed under one of these category names (repeat the parameter)"),
) -> ProductListResponse:
    query = _list_scope_query(db, company_id, status, exclude_status, channel, scope)
    if brand and brand.strip():
        query = query.filter(func.lower(CatalogProduct.brand) == brand.strip().lower())
    names = [c.strip().lower() for c in (category or []) if c and c.strip()][:200]
    if names:
        query = query.filter(func.lower(CatalogProduct.category).in_(names))
    if sellable:
        query = query.filter(CatalogProduct.price > 0)
    if updated_since:
        query = query.filter(CatalogProduct.updated_at >= updated_since)
    # every word must appear in the name, SKU, brand or model ("msi b650m wifi")
    for word in (q or "").split()[:6]:
        like = f"%{word}%"
        query = query.filter(
            CatalogProduct.name.ilike(like)
            | CatalogProduct.sku.ilike(like)
            | CatalogProduct.brand.ilike(like)
            | CatalogProduct.model.ilike(like)
        )
    total = query.count()
    # Document product search (sellable=true): what is in stock comes first, then the most recently updated.
    order = (
        (CatalogProduct.stock.desc(), CatalogProduct.updated_at.desc(), CatalogProduct.id)
        if sellable
        else (CatalogProduct.updated_at.desc(), CatalogProduct.id)
    )
    rows = (
        # Bulk-seeded rows share updated_at, so id breaks the tie — without it
        # paging is non-deterministic and rows duplicate across pages.
        query.order_by(*order)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    prefetch = _ListPrefetch(db, rows)
    lean = fields == "list"
    return ProductListResponse(
        data=[_product_read(db, r, prefetch, lean=lean) for r in rows],
        meta=ProductListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("/add-to-inventory", response_model=ProductAddToInventoryResponse)
def add_products_to_inventory(
    payload: ProductAddToInventory,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductAddToInventoryResponse:
    """Explicitly bring website products into the Inventory module's catalog (never automatic)."""
    ids = list(dict.fromkeys(payload.product_ids))
    rows = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.id.in_(ids), CatalogProduct.company_id == company_id)
        .all()
    )
    added = 0
    inv_svc = InventoryItemService(db)
    for row in rows:
        if not row.in_inventory:
            added += 1
        row.in_inventory = True
        inv_svc.ensure_for_catalog_product(row)
    db.commit()
    return ProductAddToInventoryResponse(added=added, already=len(rows) - added, missing=len(ids) - len(rows))


@router.get("/slug/check", response_model=ProductSlugCheckResponse)
def check_product_slug(
    slug: str = Query(..., min_length=1),
    exclude_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> ProductSlugCheckResponse:
    normalized = slug.strip().lower()
    if not normalized:
        return ProductSlugCheckResponse(slug=normalized, available=False, message="Slug is required")

    query = db.query(CatalogProduct).filter(
        CatalogProduct.slug == normalized, CatalogProduct.company_id == company_id
    )
    if exclude_id:
        query = query.filter(CatalogProduct.id != exclude_id)
    taken = query.first()
    if taken:
        return ProductSlugCheckResponse(
            slug=normalized,
            available=False,
            message="This URL is already in use",
        )
    return ProductSlugCheckResponse(slug=normalized, available=True)


@router.get("/{product_id}", response_model=ProductDetailResponse)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductDetailResponse(data=_product_detail(db, row))


@router.post("", response_model=ProductDetailResponse, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "create")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    identity_svc = ItemIdentityService(db)
    # Inventory products are keyed by id: a blank SKU gets a generated one, and the
    # slug (only the storefront cares) is derived from the name and de-duplicated.
    # Only a SKU that someone else already uses is a real conflict.
    sku = (payload.sku or "").strip()
    if not sku:
        sku = _generate_sku(db, identity_svc, company_id)
        payload = payload.model_copy(update={"sku": sku})
    elif identity_svc.sku_taken(sku, company_id=company_id):
        raise HTTPException(status_code=409, detail=_sku_conflict_detail(db, sku, company_id))

    payload = payload.model_copy(
        update={"slug": _free_slug(db, payload.slug or payload.name, company_id)}
    )

    data, inv_fields, item_fields, location_ids = _apply_create_payload(payload)
    data["company_id"] = company_id
    data = _resolve_brand_category(db, data)
    category_ids = _normalize_category_ids(
        db,
        category_ids=payload.category_ids,
        category_id=data.get("category_id") or payload.category_id,
    )
    if category_ids:
        data["category_id"] = category_ids[0]
        cat = db.get(CatalogCategory, category_ids[0])
        if cat:
            data["category"] = cat.name
    if data.get("status") == "published":
        enforce_publish_rules(
            db, company_id, brand=data.get("brand"), brand_id=data.get("brand_id"), category_ids=list(category_ids or [])
        )
    row = CatalogProduct(**data)
    db.add(row)
    db.flush()
    identity_svc.persist_and_mirror(row)
    item_id = row.item_id or row.id
    _apply_product_item_fields(db, row, item_fields)
    on_item_created(
        db,
        item_id,
        created_by=user.id,
        source="user",
        company_id=row.company_id,
    )
    if row.status == "published":
        on_item_published(db, item_id, performed_by=user.id, company_id=row.company_id)
    # Mirror catalog status → ecommerce so published products appear on frontstore
    EcommerceItemService(db).sync_content_from_catalog(
        row,
        mirror_publish=True,
    )
    _apply_product_categories(db, row, category_ids)
    _apply_product_locations(db, row, location_ids)
    _ensure_default_variant(db, row)
    _apply_product_inventory_fields(db, row, inv_fields)
    db.commit()
    db.refresh(row)
    return ProductDetailResponse(data=_product_detail(db, row))


def _free_slug(db: Session, wanted: str, company_id: str, *, exclude_product_id: Optional[str] = None) -> str:
    """The requested slug if nobody else has it, else `slug-2`, `slug-3`, …"""
    base = re.sub(r"[^a-z0-9]+", "-", (wanted or "").strip().lower()).strip("-") or "product"
    slug = base
    n = 2
    while True:
        query = db.query(CatalogProduct.id).filter(
            CatalogProduct.slug == slug, CatalogProduct.company_id == company_id
        )
        if exclude_product_id:
            query = query.filter(CatalogProduct.id != exclude_product_id)
        # A deleted product only archives its item; its ecommerce mirror row keeps the slug
        # under a (company_id, slug) unique index, so a new product must skip it too.
        mirror = db.query(EcommerceItem.id).filter(
            EcommerceItem.company_id == company_id, EcommerceItem.slug == slug
        )
        if exclude_product_id:
            mirror = mirror.filter(
                (EcommerceItem.catalog_product_id.is_(None)) | (EcommerceItem.catalog_product_id != exclude_product_id)
            )
        if query.first() is None and mirror.first() is None:
            return slug
        slug = f"{base}-{n}"
        n += 1


def _generate_sku(db: Session, identity_svc: "ItemIdentityService", company_id: str) -> str:
    """The next serial SKU (`SKU-000001`, `SKU-000002` ...) - a product saved with no SKU gets one.
    Website settings can turn this off (the SKU is then required) or change the prefix."""
    if not get_module_setting(db, company_id, "catalog", "auto_generate_sku"):
        raise HTTPException(status_code=400, detail="Enter a SKU. Website settings turn off automatic SKUs.")
    prefix = clean_sku_prefix(get_module_setting(db, company_id, "catalog", "sku_prefix"))
    return identity_svc.next_serial_sku(company_id, prefix=prefix)


def _sku_conflict_detail(db: Session, sku: str, company_id: str) -> str:
    other = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.sku == sku, CatalogProduct.company_id == company_id)
        .first()
    )
    if other:
        return f"SKU {sku} is already used by \"{other.name}\" — change the SKU or leave it blank to auto-generate"
    return f"SKU {sku} is already in use — change the SKU or leave it blank to auto-generate"


def _unique_slug(db: Session, base_slug: str, company_id: str) -> str:
    slug = f"{base_slug}-copy"
    n = 2
    while (
        db.query(CatalogProduct)
        .filter(CatalogProduct.slug == slug, CatalogProduct.company_id == company_id)
        .first()
    ):
        slug = f"{base_slug}-copy-{n}"
        n += 1
    return slug


def _unique_sku(db: Session, base_sku: str, company_id: str) -> str:
    sku = f"{base_sku}-COPY"
    n = 2
    while (
        db.query(CatalogProduct)
        .filter(CatalogProduct.sku == sku, CatalogProduct.company_id == company_id)
        .first()
    ):
        sku = f"{base_sku}-COPY-{n}"
        n += 1
    return sku


def _unique_variant_sku(db: Session, base_sku: str) -> str:
    sku = f"{base_sku}-COPY"
    n = 2
    while db.query(CatalogProductVariant).filter(CatalogProductVariant.sku == sku).first():
        sku = f"{base_sku}-COPY-{n}"
        n += 1
    return sku


@router.post("/{product_id}/duplicate", response_model=ProductDetailResponse, status_code=201)
def duplicate_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    source = db.get(CatalogProduct, product_id)
    if not source or (source.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    clone = CatalogProduct(
        company_id=source.company_id,
        name=f"{source.name} (Copy)",
        slug=_unique_slug(db, source.slug, company_id),
        sku=_unique_sku(db, source.sku, company_id),
        model=source.model,
        remarks=source.remarks,
        description=source.description,
        price=source.price,
        compare_at_price=source.compare_at_price,
        purchase_price=getattr(source, "purchase_price", None),
        last_selling_price=getattr(source, "last_selling_price", None),
        stock=source.stock,
        track_quantity=source.track_quantity,
        not_for_selling=getattr(source, "not_for_selling", False),
        weight=getattr(source, "weight", None),
        tax_rate=getattr(source, "tax_rate", None),
        tax_type=getattr(source, "tax_type", "exclusive"),
        stock_status=source.stock_status,
        status="draft",
        product_type=source.product_type,
        visibility="public",
        brand=source.brand,
        category=source.category,
        brand_id=source.brand_id,
        category_id=source.category_id,
        attribute_profile_id=source.attribute_profile_id,
        short_description=source.short_description,
        tags_json=source.tags_json,
        seo_title=source.seo_title,
        seo_description=source.seo_description,
        focus_keyphrase=source.focus_keyphrase,
        warranty=source.warranty,
        origin=getattr(source, "origin", None),
        thumbnail=source.thumbnail,
        custom_specs_json=source.custom_specs_json,
        variant_attributes_json=getattr(source, "variant_attributes_json", None),
        combo_components_json=getattr(source, "combo_components_json", None),
        source_url=getattr(source, "source_url", None),
        seller_info_json=getattr(source, "seller_info_json", None),
        dropship_meta_json=getattr(source, "dropship_meta_json", None),
        in_inventory=bool(getattr(source, "in_inventory", True)),
        on_website=bool(getattr(source, "on_website", True)),
        gallery_json=getattr(source, "gallery_json", None),
        video_urls_json=getattr(source, "video_urls_json", None),
    )
    db.add(clone)
    db.flush()
    ItemIdentityService(db).persist_and_mirror(clone)
    item_id = clone.item_id or clone.id
    on_item_created(
        db,
        item_id,
        created_by=user.id,
        source="user",
        company_id=clone.company_id,
    )
    EcommerceItemService(db).sync_content_from_catalog(clone, mirror_publish=True)

    variants = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == source.id)
        .order_by(CatalogProductVariant.sort_order)
        .all()
    )
    for variant in variants:
        db.add(
            CatalogProductVariant(
                product_id=clone.id,
                sku=_unique_variant_sku(db, variant.sku),
                name=variant.name,
                price=variant.price,
                stock=variant.stock,
                status=variant.status,
                is_default=variant.is_default,
                sort_order=variant.sort_order,
                image_id=variant.image_id,
            ),
        )
    if not variants:
        _ensure_default_variant(db, clone)

    media_links = (
        db.query(CatalogProductMedia)
        .filter(CatalogProductMedia.product_id == source.id)
        .order_by(CatalogProductMedia.sort_order)
        .all()
    )
    for link in media_links:
        db.add(
            CatalogProductMedia(
                company_id=clone.company_id,
                product_id=clone.id,
                media_id=link.media_id,
                sort_order=link.sort_order,
                is_primary=link.is_primary,
            ),
        )

    attr_values = (
        db.query(CatalogProductAttributeValue)
        .filter(CatalogProductAttributeValue.product_id == source.id)
        .all()
    )
    for val in attr_values:
        db.add(
            CatalogProductAttributeValue(
                product_id=clone.id,
                attribute_id=val.attribute_id,
                value=val.value,
                sort_order=val.sort_order,
            ),
        )

    db.commit()
    db.refresh(clone)
    return ProductDetailResponse(data=_product_detail(db, clone))


@router.patch("/{product_id}", response_model=ProductDetailResponse)
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    data, inv_fields, item_fields, location_ids = _apply_update_payload(payload)
    changes = _resolve_brand_category(db, data)
    payload_set = payload.model_dump(exclude_unset=True)
    category_ids_payload = (
        payload_set["category_ids"] if "category_ids" in payload_set else None
    )
    if not changes and category_ids_payload is None:
        if inv_fields or item_fields or location_ids is not None:
            _apply_product_inventory_fields(db, row, inv_fields)
            _apply_product_item_fields(db, row, item_fields)
            if location_ids is not None:
                _apply_product_locations(db, row, location_ids)
            db.commit()
            db.refresh(row)
        return ProductDetailResponse(data=_product_detail(db, row))

    slug = changes.get("slug", row.slug)
    sku = changes.get("sku", row.sku)
    identity_svc = ItemIdentityService(db)
    if "sku" in changes and not (sku or "").strip():
        # Clearing the SKU is not allowed (it's the barcode/lookup key) — keep the old one.
        changes["sku"] = row.sku
        sku = row.sku
    if identity_svc.sku_taken(
        sku,
        company_id=row.company_id,
        exclude_item_id=row.item_id,
        exclude_product_id=product_id,
    ):
        raise HTTPException(status_code=409, detail=_sku_conflict_detail(db, sku, company_id))

    # A slug clash is never a reason to refuse an inventory edit: pick the next free one.
    free = _free_slug(db, slug, company_id, exclude_product_id=product_id)
    if free != slug:
        slug = free
        changes["slug"] = free

    publishing = changes.get("status", row.status) == "published"
    if publishing and (
        {"status", "brand", "brand_id", "category_id"} & changes.keys() or category_ids_payload is not None
    ):
        enforce_publish_rules(
            db,
            company_id,
            brand=changes.get("brand", row.brand),
            brand_id=changes.get("brand_id", row.brand_id),
            category_ids=list(category_ids_payload)
            if category_ids_payload is not None
            else [changes.get("category_id", row.category_id)],
        )

    old_price = str(row.price)
    old_stock = str(row.stock)
    old_status = row.status
    old_values = {key: getattr(row, key, None) for key in changes}

    for key, value in changes.items():
        setattr(row, key, value)

    if category_ids_payload is not None:
        category_ids = _normalize_category_ids(
            db,
            category_ids=category_ids_payload,
            category_id=None,
        )
        _apply_product_categories(db, row, category_ids)
    elif "category_id" in changes:
        category_ids = _normalize_category_ids(
            db,
            category_ids=None,
            category_id=row.category_id,
        )
        _apply_product_categories(db, row, category_ids)

    if location_ids is not None:
        _apply_product_locations(db, row, location_ids)

    identity_svc.persist_and_mirror(row)
    item_id = row.item_id or row.id
    _apply_product_item_fields(db, row, item_fields)
    field_changes = {
        key: {"old": old_values.get(key), "new": value}
        for key, value in changes.items()
        if old_values.get(key) != value
    }
    on_item_updated(
        db,
        item_id,
        performed_by=user.id,
        changes=field_changes,
        company_id=row.company_id,
    )
    if "price" in changes:
        on_item_price_change(
            db,
            item_id,
            old_price=old_price,
            new_price=str(row.price),
            performed_by=user.id,
            company_id=row.company_id,
        )
    if "stock" in changes:
        on_item_stock_change(
            db,
            item_id,
            old_qty=old_stock,
            new_qty=str(row.stock),
            performed_by=user.id,
            company_id=row.company_id,
        )
    new_status = changes.get("status", old_status)
    if new_status == "published" and old_status != "published":
        on_item_published(db, item_id, performed_by=user.id, company_id=row.company_id)
    elif new_status == "archived" and old_status != "archived":
        on_item_archived(db, item_id, performed_by=user.id, company_id=row.company_id)

    EcommerceItemService(db).sync_content_from_catalog(row, mirror_publish=True)

    if row.product_type == "simple":
        default = (
            db.query(CatalogProductVariant)
            .filter(
                CatalogProductVariant.product_id == row.id,
                CatalogProductVariant.is_default.is_(True),
            )
            .first()
        )
        if default:
            if "sku" in changes:
                default.sku = row.sku
            if "price" in changes:
                default.price = row.price
            if "stock" in changes:
                default.stock = row.stock
            if "status" in changes:
                default.status = row.status

    _apply_product_inventory_fields(db, row, inv_fields)
    db.commit()
    db.refresh(row)
    return ProductDetailResponse(data=_product_detail(db, row))


@router.put("/{product_id}/variants", response_model=ProductDetailResponse)
def replace_product_variants(
    product_id: str,
    payload: VariantBulkReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    skus = [v.sku for v in payload.variants]
    if len(skus) != len(set(skus)):
        raise HTTPException(status_code=400, detail="Duplicate variant SKUs in payload")

    for item in payload.variants:
        taken = (
            db.query(CatalogProductVariant)
            .filter(
                CatalogProductVariant.sku == item.sku,
                CatalogProductVariant.product_id != product_id,
                CatalogProductVariant.id != (item.id or ""),
            )
            .first()
        )
        if taken:
            raise HTTPException(status_code=409, detail=f"Variant SKU already in use: {item.sku}")

    _replace_variants(db, row, payload.variants)
    db.commit()
    db.refresh(row)
    return ProductDetailResponse(data=_product_detail(db, row))


@router.put("/{product_id}/media", response_model=ProductDetailResponse)
def replace_product_media(
    product_id: str,
    payload: ProductMediaReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductDetailResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    _replace_media(db, row, payload.media_ids)
    EcommerceItemService(db).sync_content_from_catalog(row, mirror_publish=True)
    db.commit()
    db.refresh(row)
    return ProductDetailResponse(data=_product_detail(db, row))


@router.get("/{product_id}/specs", response_model=ProductSpecsResponse)
def get_product_specs(
    product_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> ProductSpecsResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductSpecsResponse(data=_load_product_specs(db, row))


@router.put("/{product_id}/specs", response_model=ProductSpecsResponse)
def replace_product_specs(
    product_id: str,
    payload: ProductSpecsReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductSpecsResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    _replace_product_specs(db, row, payload)
    db.commit()
    db.refresh(row)
    return ProductSpecsResponse(data=_load_product_specs(db, row))


@router.get("/{product_id}/inventory", response_model=ProductInventoryResponse)
def get_product_inventory(
    product_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> ProductInventoryResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    stock_row = (
        db.query(InventoryStockLevel, InventoryWarehouse.name)
        .join(InventoryWarehouse, InventoryStockLevel.warehouse_id == InventoryWarehouse.id)
        .filter(InventoryStockLevel.product_id == product_id)
        .order_by(InventoryStockLevel.updated_at.desc())
        .first()
    )
    if not stock_row:
        raise HTTPException(status_code=404, detail="Inventory record not found for product")

    stock, warehouse_name = stock_row
    return ProductInventoryResponse(
        data=ProductInventoryRead(
            id=stock.id,
            warehouse_id=stock.warehouse_id,
            warehouse_name=warehouse_name,
            variant_id=stock.variant_id,
            on_hand=stock.on_hand,
            min_qty=stock.min_qty,
            unit_cost=stock.unit_cost,
        ),
    )


@router.put("/{product_id}/inventory", response_model=ProductInventoryResponse)
def upsert_product_inventory(
    product_id: str,
    payload: ProductInventoryUpsert,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ProductInventoryResponse:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    variant = _default_variant(db, product_id)
    if not variant:
        raise HTTPException(status_code=400, detail="Product has no variant to track inventory")

    data = _upsert_product_inventory(db, row, variant, payload)
    db.commit()
    return ProductInventoryResponse(data=data)


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    item_id = row.item_id
    if item_id:
        ItemIdentityService(db).archive_linked_item(item_id)
        on_item_archived(db, item_id, performed_by=user.id, company_id=company_id)
    db.delete(row)
    db.commit()
