"""Map Amazon SP-API catalog item → AgainERP catalog (USD → BDT)."""

from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.schemas.product import dump_tags
from app.services.amazon_sp_client import AmazonSpClientError, get_catalog_item
from app.services.collaboration import on_item_created
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.elim_catalog_import import _system_actor
from app.services.items.catalog_item_bridge import ensure_default_variant
from app.services.items.item_identity_service import ItemIdentityService

TWOPLACES = Decimal("0.01")
MAX_GALLERY = 24


def _json_dumps(value: Any) -> str:
    """Serialize for Text columns; tolerate non-JSON types in SP-API payloads."""
    return json.dumps(value, ensure_ascii=False, default=str)


def _d(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value is not None else default))
    except Exception:
        return Decimal(default)


def _money(value: Decimal) -> Decimal:
    return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _slugify(text: str, max_len: int = 80) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s or "product")[:max_len]


def _unique_slug(db: Session, base: str) -> str:
    slug = base
    n = 2
    while db.query(CatalogProduct).filter(CatalogProduct.slug == slug).first():
        slug = f"{base}-{n}"[:255]
        n += 1
    return slug


def _unique_sku(db: Session, base: str) -> str:
    identity = ItemIdentityService(db)
    sku = base[:100]
    n = 2
    while identity.sku_taken(sku):
        suffix = f"-{n}"
        sku = f"{base[: 100 - len(suffix)]}{suffix}"
        n += 1
    return sku


def compute_sell_price_bdt_from_usd(
    *,
    cost_usd: Decimal,
    exchange_rate: Decimal,
    profit_bdt: Decimal,
    server_charge_bdt: Decimal,
) -> dict[str, Decimal]:
    cost_bdt = _money(cost_usd * exchange_rate)
    sell = _money(cost_bdt + profit_bdt + server_charge_bdt)
    return {
        "cost_usd": _money(cost_usd),
        "cost_bdt": cost_bdt,
        "exchange_rate": _money(exchange_rate),
        "profit_bdt": _money(profit_bdt),
        "server_charge_bdt": _money(server_charge_bdt),
        "sell_price_bdt": sell,
    }


def default_amazon_pricing_from_settings(db: Optional[Any] = None) -> dict[str, Decimal]:
    """Env defaults, overlaid by platform_settings when available."""
    s = get_settings()
    result: dict[str, Decimal] = {
        "exchange_rate": _d(s.amazon_usd_to_bdt, "110"),
        "profit_bdt": _d(s.dropship_default_profit_bdt, "100"),
        "server_charge_bdt": _d(s.dropship_default_server_fee_bdt, "50"),
        "default_cost_usd": _d(s.amazon_default_cost_usd, "10"),
    }

    own_session = False
    session = db
    if session is None:
        try:
            from app.database import SessionLocal

            session = SessionLocal()
            own_session = True
        except Exception:
            session = None

    if session is not None:
        try:
            from app.models.platform_setting import PlatformSetting

            keys = (
                "amazon_usd_to_bdt",
                "dropship_profit_bdt",
                "dropship_server_charge_bdt",
            )
            rows = (
                session.query(PlatformSetting)
                .filter(PlatformSetting.key.in_(keys))
                .all()
            )
            for row in rows:
                if row.value is None or str(row.value).strip() == "":
                    continue
                try:
                    val = _d(row.value)
                except Exception:
                    continue
                if row.key == "amazon_usd_to_bdt" and val > 0:
                    result["exchange_rate"] = val
                elif row.key == "dropship_profit_bdt" and val >= 0:
                    result["profit_bdt"] = val
                elif row.key == "dropship_server_charge_bdt" and val >= 0:
                    result["server_charge_bdt"] = val
        except Exception:
            pass
        finally:
            if own_session:
                try:
                    session.close()
                except Exception:
                    pass

    return result


def _amazon_link(asin: str, marketplace_id: str) -> str:
    if marketplace_id == "A1F83G8C2ARO7P":
        return f"https://www.amazon.co.uk/dp/{asin}"
    if marketplace_id == "A1PA6795UKMFR9":
        return f"https://www.amazon.de/dp/{asin}"
    return f"https://www.amazon.com/dp/{asin}"


def _parse_summary(detail: dict[str, Any]) -> dict[str, Any]:
    summaries = detail.get("summaries")
    if isinstance(summaries, list) and summaries and isinstance(summaries[0], dict):
        s0 = summaries[0]
        return {
            "title": str(s0.get("itemName") or "").strip() or None,
            "brand": str(s0.get("brand") or "").strip() or None,
            "marketplace_id": str(s0.get("marketplaceId") or "").strip() or None,
        }
    return {"title": None, "brand": None, "marketplace_id": None}


def _collect_images(detail: dict[str, Any]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    images = detail.get("images")
    if not isinstance(images, list):
        return found
    for block in images:
        if not isinstance(block, dict):
            continue
        imgs = block.get("images")
        if not isinstance(imgs, list):
            continue
        for img in imgs:
            if not isinstance(img, dict):
                continue
            link = img.get("link")
            if isinstance(link, str) and link.startswith("http") and link not in seen:
                seen.add(link)
                found.append(link[:1000])
    return found


def _extract_cost_usd(detail: dict[str, Any], fallback: Decimal) -> Decimal:
    """Best-effort list price from catalog attributes (often missing)."""
    attrs = detail.get("attributes")
    if isinstance(attrs, dict):
        for key in ("list_price", "listPrice", "purchasable_offer", "purchasableOffer"):
            node = attrs.get(key)
            if isinstance(node, list) and node:
                node = node[0]
            if isinstance(node, dict):
                for pk in ("value", "amount", "Price", "price"):
                    if node.get(pk) is not None:
                        try:
                            return _money(_d(node[pk]))
                        except Exception:
                            pass
                currency_amount = node.get("currencyAmount") or node.get("our_price")
                if isinstance(currency_amount, list) and currency_amount:
                    ca = currency_amount[0]
                    if isinstance(ca, dict) and ca.get("amount") is not None:
                        return _money(_d(ca["amount"]))
    return _money(fallback)


def _publish_for_storefront(db: Session, product: CatalogProduct) -> None:
    product.status = "published"
    product.visibility = "public"
    EcommerceItemService(db).sync_content_from_catalog(product, mirror_publish=True)
    db.flush()


def import_amazon_asin_to_catalog(
    db: Session,
    *,
    asin: str,
    user: Optional[AuthUser] = None,
    marketplace_id: Optional[str] = None,
    status: str = "draft",
    cost_usd: Optional[Decimal] = None,
    exchange_rate: Optional[Decimal] = None,
    profit_bdt: Optional[Decimal] = None,
    server_charge_bdt: Optional[Decimal] = None,
    title_override: Optional[str] = None,
    allow_sandbox_stub: bool = True,
    publish_for_storefront: bool = False,
    refresh_existing: bool = True,
) -> tuple[CatalogProduct, bool, dict[str, Any]]:
    """
    Fetch Amazon catalog item by ASIN → local catalog row (BDT).

    Sandbox often cannot return catalog payloads; when allow_sandbox_stub=True
    we still create a stub product so AgainERP import UX can be tested.
    """
    asin_clean = re.sub(r"[^A-Za-z0-9]", "", (asin or "").strip().upper())
    if len(asin_clean) < 8:
        raise ValueError("Invalid ASIN")

    s = get_settings()
    mid = (marketplace_id or s.amazon_sp_marketplace_id or "ATVPDKIKX0DER").strip()
    defaults = default_amazon_pricing_from_settings()
    rate = exchange_rate if exchange_rate is not None else defaults["exchange_rate"]
    profit = profit_bdt if profit_bdt is not None else defaults["profit_bdt"]
    fee = server_charge_bdt if server_charge_bdt is not None else defaults["server_charge_bdt"]
    fallback_cost = cost_usd if cost_usd is not None else defaults["default_cost_usd"]

    if publish_for_storefront:
        status = "published"

    actor = _system_actor(db, user)
    sku_base = f"AMZ-{mid}-{asin_clean}"[:100]
    existing = db.query(CatalogProduct).filter(CatalogProduct.sku == sku_base).first()

    detail: dict[str, Any] = {}
    live = False
    stub_reason: Optional[str] = None
    try:
        detail = get_catalog_item(asin_clean, marketplace_ids=[mid])
        live = True
    except AmazonSpClientError as exc:
        stub_reason = str(exc)
        if not allow_sandbox_stub:
            raise
        env = (s.amazon_sp_env or "sandbox").strip().lower()
        if env != "sandbox" and not title_override:
            raise
        detail = {
            "asin": asin_clean,
            "summaries": [
                {
                    "marketplaceId": mid,
                    "itemName": (title_override or f"Amazon product {asin_clean}")[:255],
                    "brand": None,
                }
            ],
            "images": [],
            "_stub": True,
            "_stub_reason": stub_reason,
        }

    summary = _parse_summary(detail)
    title = (title_override or summary.get("title") or f"Amazon product {asin_clean}")[:255]
    brand = summary.get("brand")
    mid = summary.get("marketplace_id") or mid
    images = _collect_images(detail)
    thumb = images[0] if images else None
    source_url = _amazon_link(asin_clean, mid)
    cost = _extract_cost_usd(detail, fallback_cost)
    pricing = compute_sell_price_bdt_from_usd(
        cost_usd=cost,
        exchange_rate=rate,
        profit_bdt=profit,
        server_charge_bdt=fee,
    )

    dropship_meta = {
        "source": "amazon",
        "dropship": True,
        "asin": asin_clean,
        "marketplace_id": mid,
        "currency_source": "USD",
        "currency_sell": "BDT",
        "cost_usd": float(pricing["cost_usd"]),
        "cost_bdt": float(pricing["cost_bdt"]),
        "exchange_rate": float(pricing["exchange_rate"]),
        "profit_bdt": float(pricing["profit_bdt"]),
        "server_charge_bdt": float(pricing["server_charge_bdt"]),
        "sell_price_bdt": float(pricing["sell_price_bdt"]),
        "supplier_link": source_url,
        "live_amazon_data": live,
        "sandbox_stub": not live,
        "stub_reason": stub_reason,
        "brand": brand,
        "image_count": len(images),
        # Full SP-API catalog item body — every key returned by Amazon.
        "source_payload": detail if isinstance(detail, dict) else {"value": detail},
    }

    custom_specs = {
        "dropship": {k: v for k, v in dropship_meta.items() if k != "source_payload"},
        "source_url": source_url,
        "images": images,
        "asin": asin_clean,
    }
    gallery_json = _json_dumps(images[:MAX_GALLERY])

    if existing:
        if refresh_existing:
            existing.name = title
            existing.brand = brand
            existing.description = (
                f"<p>Imported from Amazon ASIN <strong>{asin_clean}</strong>.</p>"
                + (f"<p><em>Sandbox stub:</em> {stub_reason}</p>" if stub_reason else "")
            )
            existing.short_description = title[:500]
            existing.price = pricing["sell_price_bdt"]
            existing.thumbnail = (thumb[:500] if thumb else existing.thumbnail)
            existing.source_url = source_url
            existing.gallery_json = gallery_json
            existing.dropship_meta_json = _json_dumps(dropship_meta)
            existing.custom_specs_json = _json_dumps(custom_specs)
            existing.tags_json = dump_tags(["amazon", "dropship", f"asin:{asin_clean}"])
            if status in ("draft", "published", "archived"):
                existing.status = status
            ItemIdentityService(db).persist_and_mirror(existing)
            EcommerceItemService(db).sync_content_from_catalog(
                existing,
                mirror_publish=publish_for_storefront or existing.status == "published",
            )
        ensure_default_variant(db, existing)
        if publish_for_storefront or existing.status == "published":
            _publish_for_storefront(db, existing)
        db.commit()
        db.refresh(existing)
        return existing, False, dropship_meta

    slug = _unique_slug(db, _slugify(f"{title}-{asin_clean}"))
    sku = _unique_sku(db, sku_base)
    row = CatalogProduct(
        id=str(uuid.uuid4()),
        name=title,
        slug=slug,
        sku=sku,
        description=(
            f"<p>Imported from Amazon ASIN <strong>{asin_clean}</strong>.</p>"
            + (f"<p><em>Sandbox stub:</em> {stub_reason}</p>" if stub_reason else "")
        ),
        short_description=title[:500],
        price=pricing["sell_price_bdt"],
        compare_at_price=None,
        stock=0,
        track_quantity=False,
        stock_status="in_stock",
        status=status if status in ("draft", "published", "archived") else "draft",
        product_type="simple",
        visibility="public",
        thumbnail=thumb[:500] if thumb else None,
        brand=brand,
        source_url=source_url,
        gallery_json=gallery_json,
        dropship_meta_json=_json_dumps(dropship_meta),
        custom_specs_json=_json_dumps(custom_specs),
        tags_json=dump_tags(["amazon", "dropship", f"asin:{asin_clean}"]),
        seo_title=title[:255],
        seo_description=title[:500],
    )
    db.add(row)
    db.flush()
    ItemIdentityService(db).persist_and_mirror(row)
    ensure_default_variant(db, row)
    item_id = row.item_id or row.id
    on_item_created(
        db,
        item_id,
        created_by=actor.id,
        source="amazon_dropship_import" if not publish_for_storefront else "amazon_storefront_cache",
        company_id=row.company_id or "default",
    )
    if publish_for_storefront or row.status == "published":
        _publish_for_storefront(db, row)
    db.commit()
    db.refresh(row)
    return row, True, dropship_meta
