"""Map Elim product detail → AgainERP catalog (English + BDT sell price)."""

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
from app.models.catalog_product_variant import CatalogProductVariant
from app.schemas.product import dump_tags
from app.services.category_china_map import apply_category_to_product, resolve_china_category
from app.services.collaboration import on_item_created
from app.services.elim_client import ElimClientError, ElimPlatform, find_product
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.item_identity_service import ItemIdentityService

TWOPLACES = Decimal("0.01")
MAX_GALLERY = 24
MAX_VIDEOS = 8
MAX_VARIANTS = 80


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


def _as_http_url(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    url = value.strip()
    if url.startswith("//"):
        url = "https:" + url
    if url.startswith("http://") or url.startswith("https://"):
        return url[:1000]
    return None


def _json_dumps(value: Any) -> str:
    """Serialize for Text columns; tolerate Decimal/datetime in API payloads."""
    return json.dumps(value, ensure_ascii=False, default=str)


def _collect_urls(raw: Any) -> list[str]:
    """Normalize Elim img_urls / video_urls (list, dict, or nested) → unique http URLs."""
    found: list[str] = []
    seen: set[str] = set()

    def add(u: Optional[str]) -> None:
        if not u or u in seen:
            return
        seen.add(u)
        found.append(u)

    def walk(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, str):
            add(_as_http_url(node))
            return
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if isinstance(node, dict):
            for key in ("url", "img_url", "src", "video_url", "videoUrl", "mp4", "play_url"):
                add(_as_http_url(node.get(key)))
            for value in node.values():
                if isinstance(value, (list, dict, str)):
                    walk(value)

    walk(raw)
    return found


def _first_image(detail: dict[str, Any]) -> Optional[str]:
    urls = _collect_urls(detail.get("img_urls") or detail.get("images"))
    if urls:
        return urls[0][:500]
    for key in ("img_url", "image", "pic_url"):
        u = _as_http_url(detail.get(key))
        if u:
            return u[:500]
    return None


def _cost_cny(detail: dict[str, Any]) -> Decimal:
    return _money(_d(detail.get("promotion_price") or detail.get("coupon_price") or detail.get("price") or 0))


def _ensure_importable(detail: Any, elim_id: str) -> dict[str, Any]:
    """Reject payloads that carry no sellable product.

    Elim answers 200 with an empty body for ids that do not exist. Importing one
    yields a "Elim product <id>" row priced at 0, and the storefront cache-on-open
    path publishes it live, so it has to fail before anything is written.
    """
    if not isinstance(detail, dict):
        raise ElimClientError(f"Unexpected Elim payload for id {elim_id}", status_code=502)
    has_title = any(
        isinstance(detail.get(key), str) and detail[key].strip() for key in ("titleEn", "title")
    )
    if not has_title or _cost_cny(detail) <= 0:
        raise ElimClientError(f"No Elim product found for id {elim_id}", status_code=404)
    return detail


def _sales_volume(detail: dict[str, Any]) -> Any:
    """Elim search returns sales_volume; find/detail sometimes uses alternate keys."""
    for key in (
        "sales_volume",
        "salesVolume",
        "sold",
        "sale_count",
        "sold_count",
        "sold_quantity",
        "sale_quantity",
        "trade_count",
    ):
        value = detail.get(key)
        if value is not None and value != "":
            return value
    return None


def _english_title(detail: dict[str, Any], elim_id: str) -> str:
    title_en = detail.get("titleEn")
    if isinstance(title_en, str) and title_en.strip():
        return title_en.strip()[:255]
    title = detail.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()[:255]
    return f"Elim product {elim_id}"[:255]


def _product_description(detail: dict[str, Any]) -> Optional[str]:
    """Prefer full Elim HTML description; fall back to English title."""
    desc = detail.get("description")
    if isinstance(desc, str) and desc.strip():
        return desc.strip()
    for key in ("description_en", "desc_en", "titleEn"):
        val = detail.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:5000]
    return None


def _supplier_link(detail: dict[str, Any], platform: ElimPlatform, elim_id: str) -> str:
    for key in ("promotion_url", "link", "detail_url", "item_url"):
        link = detail.get(key)
        if isinstance(link, str) and link.startswith("http"):
            return link[:1000]
    if platform == "alibaba":
        return f"https://detail.1688.com/offer/{elim_id}.html"
    return f"https://item.taobao.com/item.htm?id={elim_id}"


def _seller_info(detail: dict[str, Any]) -> dict[str, Any]:
    review = detail.get("review") if isinstance(detail.get("review"), dict) else {}
    shop_id = detail.get("shop_id") or detail.get("seller_id")
    shop_name = detail.get("shop_name") or detail.get("seller_name")
    return {
        "id": str(shop_id) if shop_id is not None else None,
        "name": str(shop_name) if shop_name is not None else (str(shop_id) if shop_id is not None else None),
        "store_name": str(shop_name) if shop_name is not None else None,
        "level": detail.get("level"),
        "delivery_score": review.get("logistics_score"),
        "item_score": review.get("total_score") if review.get("total_score") is not None else review.get("aftersale_score"),
        "service_score": review.get("service_score"),
        "review": {
            "medal_level": review.get("medal_level"),
            "retention_rate": review.get("retention_rate"),
            "service_score": review.get("service_score"),
            "logistics_score": review.get("logistics_score"),
            "complaint_score": review.get("complaint_score"),
            "consulting_score": review.get("consulting_score"),
            "aftersale_score": review.get("aftersale_score"),
            "total_score": review.get("total_score"),
        }
        if review
        else None,
        "seller_type": detail.get("seller_type"),
    }


def _specifications_custom_groups(detail: dict[str, Any]) -> dict[str, Any]:
    """Map Elim attributes → Specs UI shape (customGroups / customAttrs)."""
    attrs_raw = detail.get("attributes") or []
    if not isinstance(attrs_raw, list) or not attrs_raw:
        return {"customGroups": [], "customAttrs": []}

    group_id = "elim-specs"
    custom_attrs: list[dict[str, Any]] = []
    for i, row in enumerate(attrs_raw):
        if not isinstance(row, dict):
            continue
        name = (row.get("nameEn") or row.get("name") or "").strip()
        value = (row.get("valueEn") or row.get("value") or "").strip()
        if not name and not value:
            continue
        custom_attrs.append(
            {
                "id": f"elim-attr-{i}",
                "groupId": group_id,
                "name": name or f"Spec {i + 1}",
                "value": value,
            }
        )
    if not custom_attrs:
        return {"customGroups": [], "customAttrs": []}
    return {
        "customGroups": [{"id": group_id, "name": "Specifications"}],
        "customAttrs": custom_attrs,
    }


def _variant_display_name(sku_row: dict[str, Any], index: int) -> str:
    options = sku_row.get("options") if isinstance(sku_row.get("options"), list) else []
    parts: list[str] = []
    for opt in options:
        if not isinstance(opt, dict):
            continue
        val = (opt.get("valueEn") or opt.get("value") or "").strip()
        if val:
            parts.append(val)
    if parts:
        return " / ".join(parts)[:255]
    return f"Variant {index + 1}"


def _sku_cost_cny(sku_row: dict[str, Any], fallback: Decimal) -> Decimal:
    return _money(
        _d(
            sku_row.get("promotion_price")
            or sku_row.get("dropship_price")
            or sku_row.get("price")
            or fallback,
            str(fallback),
        )
    )


def _store_hotlink_gallery(
    product: CatalogProduct,
    *,
    image_urls: list[str],
    video_urls: list[str],
) -> None:
    """SkyBuy-style: persist CDN URLs only — no Media rows / file downloads."""
    images = image_urls[:MAX_GALLERY]
    videos = video_urls[:MAX_VIDEOS]
    product.gallery_json = json.dumps(images, ensure_ascii=False)
    product.video_urls_json = json.dumps(videos, ensure_ascii=False)
    if images and not product.thumbnail:
        product.thumbnail = images[0][:500]


def _sync_elim_variants(
    db: Session,
    product: CatalogProduct,
    *,
    detail: dict[str, Any],
    pricing_fn,
    base_cost: Decimal,
    status: str,
) -> None:
    skus = detail.get("skus") if isinstance(detail.get("skus"), list) else []
    existing = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product.id)
        .all()
    )
    for row in existing:
        db.delete(row)
    db.flush()

    if not skus:
        product.product_type = "simple"
        db.add(
            CatalogProductVariant(
                product_id=product.id,
                company_id=product.company_id or "default",
                sku=product.sku,
                name="Default",
                price=product.price,
                stock=product.stock,
                status=status,
                is_default=True,
                sort_order=0,
            )
        )
        db.flush()
        return

    product.product_type = "variable"
    for i, sku_row in enumerate(skus[:MAX_VARIANTS]):
        if not isinstance(sku_row, dict):
            continue
        external_id = str(sku_row.get("id") or sku_row.get("spec_id") or i)
        cost = _sku_cost_cny(sku_row, base_cost)
        breakdown = pricing_fn(cost)
        options = sku_row.get("options") if isinstance(sku_row.get("options"), list) else []
        clean_options = []
        for opt in options:
            if not isinstance(opt, dict):
                continue
        clean_options.append(
            {
                "name": opt.get("nameEn") or opt.get("name"),
                "value": opt.get("valueEn") or opt.get("value"),
                "name_zh": opt.get("name"),
                "value_zh": opt.get("value"),
                "img_url": _as_http_url(
                    opt.get("img_url")
                    or opt.get("image_url")
                    or opt.get("image")
                    or opt.get("pic_url")
                    or opt.get("imageUrl")
                ),
            }
        )
        img = _as_http_url(
            sku_row.get("img_url")
            or sku_row.get("image_url")
            or sku_row.get("image")
            or sku_row.get("pic_url")
        )
        if not img and clean_options:
            img = clean_options[0].get("img_url")
        qty = sku_row.get("quantity")
        try:
            stock = max(0, int(qty)) if qty is not None else 0
        except (TypeError, ValueError):
            stock = 0
        variant_sku = _unique_sku(db, f"{product.sku}-{external_id}"[:100])
        db.add(
            CatalogProductVariant(
                product_id=product.id,
                company_id=product.company_id or "default",
                sku=variant_sku,
                name=_variant_display_name(sku_row, i),
                price=breakdown["sell_price_bdt"],
                stock=stock,
                status=status,
                is_default=(i == 0),
                sort_order=i,
                options_json=json.dumps(clean_options, ensure_ascii=False),
                external_sku_id=external_id[:100],
                image_url=(img[:1000] if img else None),
            )
        )
    db.flush()
    _backfill_variant_option_images(db, product.id)


def _backfill_variant_option_images(db: Session, product_id: str) -> None:
    """Share color/option images across SKUs so every swatch has a URL when Elim
    only attached the image to one size of that color."""
    rows = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product_id)
        .all()
    )
    if not rows:
        return

    best: dict[tuple[str, str], str] = {}
    parsed: list[tuple[Any, list[dict[str, Any]]]] = []
    for row in rows:
        try:
            opts = json.loads(row.options_json or "[]")
        except json.JSONDecodeError:
            opts = []
        if not isinstance(opts, list):
            opts = []
        clean: list[dict[str, Any]] = [o for o in opts if isinstance(o, dict)]
        parsed.append((row, clean))
        for opt in clean:
            name = str(opt.get("name") or "").strip()
            value = str(opt.get("value") or "").strip()
            img = _as_http_url(opt.get("img_url")) or _as_http_url(row.image_url)
            if name and value and img:
                best.setdefault((name.lower(), value), img)

    for row, clean in parsed:
        changed = False
        for opt in clean:
            name = str(opt.get("name") or "").strip()
            value = str(opt.get("value") or "").strip()
            if not name or not value:
                continue
            shared = best.get((name.lower(), value))
            if shared and not _as_http_url(opt.get("img_url")):
                opt["img_url"] = shared
                changed = True
        if not _as_http_url(row.image_url):
            for opt in clean:
                shared = _as_http_url(opt.get("img_url"))
                if shared:
                    row.image_url = shared[:1000]
                    changed = True
                    break
        if changed:
            row.options_json = json.dumps(clean, ensure_ascii=False)
    db.flush()


def compute_sell_price_bdt(
    *,
    cost_cny: Decimal,
    exchange_rate: Decimal,
    markup_percent: Decimal = Decimal("0"),
    profit_bdt: Decimal = Decimal("0"),
    server_charge_bdt: Decimal = Decimal("0"),
) -> dict[str, Decimal]:
    """Website sell price from Elim cost.

    cost_bdt = cost_cny × exchange_rate
    markup_bdt = cost_bdt × (markup_percent / 100)
    sell = cost_bdt + markup_bdt + profit_bdt + server_charge_bdt
    """
    cost_bdt = _money(cost_cny * exchange_rate)
    markup_pct = _money(markup_percent)
    if markup_pct < 0:
        markup_pct = Decimal("0")
    markup_bdt = _money(cost_bdt * markup_pct / Decimal("100"))
    sell = _money(cost_bdt + markup_bdt + profit_bdt + server_charge_bdt)
    return {
        "cost_cny": _money(cost_cny),
        "cost_bdt": cost_bdt,
        "exchange_rate": _money(exchange_rate),
        "markup_percent": markup_pct,
        "markup_bdt": markup_bdt,
        "profit_bdt": _money(profit_bdt),
        "server_charge_bdt": _money(server_charge_bdt),
        "sell_price_bdt": sell,
    }


def _shipping_by_sku_from_elim(detail: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Map Elim shipping_info → {sku_id: {weight_kg, weight_g, width, length, height}}."""
    raw = detail.get("shipping_info") or detail.get("shippingInfos") or []
    if not isinstance(raw, list):
        return {}
    out: dict[str, dict[str, float]] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        sku_id = row.get("id") or row.get("sku_id") or row.get("spec_id")
        if sku_id is None:
            continue
        try:
            weight_raw = float(row.get("weight") or 0)
        except (TypeError, ValueError):
            weight_raw = 0.0
        if weight_raw <= 0:
            continue
        # Elim shipping_info weight is grams (e.g. 390 → 0.39 kg).
        weight_g = weight_raw
        weight_kg = round(weight_g / 1000.0, 3)
        entry: dict[str, float] = {"weight_g": weight_g, "weight_kg": weight_kg}
        for dim in ("width", "length", "height"):
            try:
                val = float(row.get(dim) or 0)
            except (TypeError, ValueError):
                val = 0.0
            if val > 0:
                entry[dim] = val
        out[str(sku_id)] = entry
    return out


def _default_weight_kg(shipping_by_sku: dict[str, dict[str, float]]) -> Optional[float]:
    weights = [row["weight_kg"] for row in shipping_by_sku.values() if row.get("weight_kg")]
    if not weights:
        return None
    weights.sort()
    return weights[len(weights) // 2]


def _price_tiers_from_elim(
    detail: dict[str, Any],
    *,
    exchange_rate: Decimal,
    markup_percent: Decimal,
    profit_bdt: Decimal,
    server_charge_bdt: Decimal,
) -> list[dict[str, Any]]:
    """Parse Elim price_range → BDT sell tiers. Empty if no real ladder."""
    raw = detail.get("price_range") or detail.get("price_ranges") or detail.get("priceRange")
    if not isinstance(raw, list) or not raw:
        return []

    by_moq: dict[int, dict[str, Any]] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        moq_raw = row.get("moq") or row.get("begin") or row.get("begin_num") or row.get("min_qty")
        cost = _d(row.get("promotion_price") or row.get("price") or row.get("dropship_price"))
        if moq_raw is None or cost <= 0:
            continue
        try:
            min_qty = int(float(moq_raw))
        except (TypeError, ValueError):
            continue
        if min_qty < 1:
            continue
        breakdown = compute_sell_price_bdt(
            cost_cny=cost,
            exchange_rate=exchange_rate,
            markup_percent=markup_percent,
            profit_bdt=profit_bdt,
            server_charge_bdt=server_charge_bdt,
        )
        by_moq[min_qty] = {
            "min_qty": min_qty,
            "cost_cny": float(breakdown["cost_cny"]),
            "price_bdt": float(breakdown["sell_price_bdt"]),
        }

    tiers = [by_moq[k] for k in sorted(by_moq.keys())]
    # Only useful when there is a real quantity ladder (2+ steps).
    return tiers if len(tiers) >= 2 else []


DROPSHIP_SETTING_KEYS = (
    "dropship_cny_to_bdt",
    "dropship_markup_percent",
    "dropship_profit_bdt",
    "dropship_server_charge_bdt",
)


def default_pricing_from_settings(db: Optional[Any] = None) -> dict[str, Decimal]:
    """Env defaults, overlaid by platform_settings when a DB session (or fresh one) is available."""
    s = get_settings()
    result: dict[str, Decimal] = {
        "exchange_rate": _d(s.dropship_cny_to_bdt, "16"),
        "markup_percent": _d(getattr(s, "dropship_markup_percent", 30), "30"),
        "profit_bdt": _d(s.dropship_default_profit_bdt, "0"),
        "server_charge_bdt": _d(s.dropship_default_server_fee_bdt, "0"),
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

            rows = (
                session.query(PlatformSetting)
                .filter(PlatformSetting.key.in_(DROPSHIP_SETTING_KEYS))
                .all()
            )
            for row in rows:
                if row.value is None or str(row.value).strip() == "":
                    continue
                try:
                    val = _d(row.value)
                except Exception:
                    continue
                if row.key == "dropship_cny_to_bdt" and val > 0:
                    result["exchange_rate"] = val
                elif row.key == "dropship_markup_percent" and val >= 0:
                    result["markup_percent"] = val
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


def save_pricing_defaults(
    db: Session,
    *,
    exchange_rate: Decimal,
    markup_percent: Decimal,
    profit_bdt: Decimal,
    server_charge_bdt: Decimal,
) -> dict[str, Decimal]:
    """Persist dropship pricing defaults into platform_settings (storefront + import)."""
    from app.models.platform_setting import PlatformSetting

    mapping = {
        "dropship_cny_to_bdt": (exchange_rate, "CNY to BDT exchange rate for Elim products"),
        "dropship_markup_percent": (markup_percent, "Markup % added on converted Elim cost for website price"),
        "dropship_profit_bdt": (profit_bdt, "Flat profit (BDT) added after markup"),
        "dropship_server_charge_bdt": (server_charge_bdt, "Flat server/service fee (BDT) added after markup"),
    }
    for key, (value, description) in mapping.items():
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row is None:
            row = PlatformSetting(key=key, value=str(_money(value)), description=description, is_secret=False)
            db.add(row)
        else:
            row.value = str(_money(value))
            if not row.description:
                row.description = description
    db.flush()
    return default_pricing_from_settings(db)


def _system_actor(db: Session, user: Optional[AuthUser]) -> AuthUser:
    if user is not None:
        return user
    actor = (
        db.query(AuthUser)
        .filter(AuthUser.is_active.is_(True))
        .order_by(AuthUser.created_at.asc())
        .first()
    )
    if not actor:
        raise ValueError("No auth user available for catalog write (run init_db / seed admin)")
    return actor


def _publish_dropship_for_storefront(db: Session, product: CatalogProduct) -> None:
    """Make cached Elim product buyable on the frontstore."""
    product.status = "published"
    product.visibility = "public"
    product.stock_status = "in_stock"
    product.track_quantity = False
    variants = (
        db.query(CatalogProductVariant)
        .filter(CatalogProductVariant.product_id == product.id)
        .all()
    )
    for variant in variants:
        variant.status = "published"
    EcommerceItemService(db).sync_content_from_catalog(product, mirror_publish=True)
    db.flush()


def _apply_elim_detail(
    db: Session,
    product: CatalogProduct,
    *,
    detail: dict[str, Any],
    elim_id: str,
    platform: ElimPlatform,
    pricing: dict[str, Decimal],
    status: str,
    cached_from: str,
    preferred_category_id: Optional[str] = None,
) -> dict[str, Any]:
    """Write Elim rich fields onto an existing catalog product row."""
    title = _english_title(detail, elim_id)
    description = _product_description(detail)
    short = title[:500]
    thumb = _first_image(detail)
    source_url = _supplier_link(detail, platform, elim_id)
    seller = _seller_info(detail)
    image_urls = _collect_urls(detail.get("img_urls") or detail.get("images"))
    video_urls = _collect_urls(detail.get("video_urls") or detail.get("videos"))
    specs_ui = _specifications_custom_groups(detail)
    price_tiers = _price_tiers_from_elim(
        detail,
        exchange_rate=pricing["exchange_rate"],
        markup_percent=pricing.get("markup_percent", Decimal("0")),
        profit_bdt=pricing["profit_bdt"],
        server_charge_bdt=pricing["server_charge_bdt"],
    )
    shipping_by_sku = _shipping_by_sku_from_elim(detail)
    weight_kg = _default_weight_kg(shipping_by_sku)

    dropship_meta = {
        "source": "elim",
        "dropship": True,
        "elim_id": str(elim_id),
        "platform": platform,
        "currency_source": "CNY",
        "currency_sell": "BDT",
        "cost_cny": float(pricing["cost_cny"]),
        "cost_bdt": float(pricing["cost_bdt"]),
        "exchange_rate": float(pricing["exchange_rate"]),
        "markup_percent": float(pricing.get("markup_percent", Decimal("0"))),
        "markup_bdt": float(pricing.get("markup_bdt", Decimal("0"))),
        "profit_bdt": float(pricing["profit_bdt"]),
        "server_charge_bdt": float(pricing["server_charge_bdt"]),
        "sell_price_bdt": float(pricing["sell_price_bdt"]),
        "shop_name": seller.get("store_name"),
        "shop_id": seller.get("id"),
        "category_name": detail.get("category_name"),
        "supplier_link": source_url,
        "title_zh": detail.get("title") if isinstance(detail.get("title"), str) else None,
        "cached_from": cached_from,
        "image_count": len(image_urls),
        "video_count": len(video_urls),
        "variant_count": len(detail.get("skus") or []) if isinstance(detail.get("skus"), list) else 0,
        "sales_volume": _sales_volume(detail),
        "moq": detail.get("moq"),
        "price_tiers": price_tiers,
        "shipping_by_sku": shipping_by_sku,
        "weight_kg": weight_kg,
        # Full Elim /products/find (or search) body — every key from the API.
        "source_payload": detail if isinstance(detail, dict) else {"value": detail},
    }

    # Keep a flat copy under custom_specs for older admin views, plus Specs UI groups.
    # Do not nest source_payload here — dropship_meta_json is the canonical raw store.
    custom_specs = {
        **specs_ui,
        "dropship": {k: v for k, v in dropship_meta.items() if k != "source_payload"},
        "seller": seller,
        "source_url": source_url,
        "images": image_urls,
        "videos": video_urls,
        "price_tiers": price_tiers,
        "shipping_by_sku": shipping_by_sku,
        "weight_kg": weight_kg,
    }

    product.name = title
    product.description = description
    product.short_description = short
    product.price = pricing["sell_price_bdt"]
    product.thumbnail = (thumb[:500] if thumb else product.thumbnail)
    product.source_url = source_url
    product.seller_info_json = _json_dumps(seller)
    product.dropship_meta_json = _json_dumps(dropship_meta)
    product.custom_specs_json = _json_dumps(custom_specs)
    product.seo_title = title[:255]
    product.seo_description = short[:500]
    product.track_quantity = False
    product.stock_status = "in_stock"
    product.visibility = "public"
    if status in ("draft", "published", "archived"):
        product.status = status

    tags = ["elim", "dropship", platform, f"elim:{elim_id}"]
    product.tags_json = dump_tags(tags)

    # Align to local curated category (browse page id wins; else keyword / Elim name).
    if preferred_category_id or not product.category_id:
        mapped = resolve_china_category(
            db,
            title=title,
            elim_category_name=detail.get("category_name"),
            preferred_category_id=preferred_category_id,
        )
        apply_category_to_product(product, mapped)
        if mapped:
            dropship_meta["mapped_category_id"] = mapped.id
            dropship_meta["mapped_category_slug"] = mapped.slug
            product.dropship_meta_json = _json_dumps(dropship_meta)

    def pricing_for_cost(cost: Decimal) -> dict[str, Decimal]:
        return compute_sell_price_bdt(
            cost_cny=cost,
            exchange_rate=pricing["exchange_rate"],
            markup_percent=pricing.get("markup_percent", Decimal("0")),
            profit_bdt=pricing["profit_bdt"],
            server_charge_bdt=pricing["server_charge_bdt"],
        )

    _store_hotlink_gallery(product, image_urls=image_urls, video_urls=video_urls)
    _sync_elim_variants(
        db,
        product,
        detail=detail,
        pricing_fn=pricing_for_cost,
        base_cost=pricing["cost_cny"],
        status=product.status,
    )
    # Keep catalog product_type=variable when Elim SKUs exist.
    # Item SSOT collapses variable→physical→simple on mirror; re-apply after mirror.
    desired_type = product.product_type
    ItemIdentityService(db).persist_and_mirror(product)
    if desired_type == "variable":
        product.product_type = "variable"
        db.flush()
    return dropship_meta


def import_elim_product_to_catalog(
    db: Session,
    *,
    elim_id: str,
    platform: ElimPlatform,
    user: Optional[AuthUser] = None,
    lang: str = "en",
    status: str = "draft",
    exchange_rate: Optional[Decimal] = None,
    markup_percent: Optional[Decimal] = None,
    profit_bdt: Optional[Decimal] = None,
    server_charge_bdt: Optional[Decimal] = None,
    publish_for_storefront: bool = False,
    refresh_existing: bool = True,
    preferred_category_id: Optional[str] = None,
) -> tuple[CatalogProduct, bool, dict[str, Any]]:
    """
    Fetch Elim detail → English catalog row with BDT sell price.
    Returns (product, created, pricing_breakdown).

    When publish_for_storefront=True (SkyBuy-style cache-on-open), the row is
    published so storefront cart can add it immediately.

    When the SKU already exists and refresh_existing=True, re-pull Elim detail
    and refresh variations / gallery / seller / specs / description.

    preferred_category_id: local CatalogCategory id from category browse page.
    """
    actor = _system_actor(db, user)
    defaults = default_pricing_from_settings(db)
    rate = exchange_rate if exchange_rate is not None else defaults["exchange_rate"]
    markup = markup_percent if markup_percent is not None else defaults["markup_percent"]
    profit = profit_bdt if profit_bdt is not None else defaults["profit_bdt"]
    fee = server_charge_bdt if server_charge_bdt is not None else defaults["server_charge_bdt"]

    if publish_for_storefront:
        status = "published"

    sku_base = f"ELIM-{platform}-{elim_id}"[:100]
    existing = db.query(CatalogProduct).filter(CatalogProduct.sku == sku_base).first()
    cached_from = "storefront" if publish_for_storefront else "admin_import"

    detail = _ensure_importable(find_product(product_id=str(elim_id), platform=platform, lang=lang), str(elim_id))
    cost_cny = _cost_cny(detail)
    pricing = compute_sell_price_bdt(
        cost_cny=cost_cny,
        exchange_rate=rate,
        markup_percent=markup,
        profit_bdt=profit,
        server_charge_bdt=fee,
    )

    if existing:
        if refresh_existing:
            specs = _apply_elim_detail(
                db,
                existing,
                detail=detail,
                elim_id=elim_id,
                platform=platform,
                pricing=pricing,
                status=status if status in ("draft", "published", "archived") else existing.status,
                cached_from=cached_from,
                preferred_category_id=preferred_category_id,
            )
            EcommerceItemService(db).sync_content_from_catalog(
                existing,
                mirror_publish=publish_for_storefront or existing.status == "published",
            )
        else:
            try:
                specs = json.loads(existing.dropship_meta_json or existing.custom_specs_json or "{}")
            except json.JSONDecodeError:
                specs = {}
        if publish_for_storefront or existing.status == "published":
            _publish_dropship_for_storefront(db, existing)
        db.commit()
        db.refresh(existing)
        return existing, False, specs

    title = _english_title(detail, elim_id)
    slug = _unique_slug(db, _slugify(f"{title}-{elim_id}"))
    sku = _unique_sku(db, sku_base)
    identity = ItemIdentityService(db)

    row = CatalogProduct(
        id=str(uuid.uuid4()),
        name=title,
        slug=slug,
        sku=sku,
        description=None,
        short_description=title[:500],
        price=pricing["sell_price_bdt"],
        compare_at_price=None,
        stock=0,
        track_quantity=False,
        stock_status="in_stock",
        status=status if status in ("draft", "published", "archived") else "draft",
        product_type="simple",
        visibility="public",
        thumbnail=_first_image(detail),
        tags_json=dump_tags(["elim", "dropship", platform, f"elim:{elim_id}"]),
        custom_specs_json="{}",
        seo_title=title[:255],
        seo_description=title[:500],
    )
    db.add(row)
    db.flush()
    identity.persist_and_mirror(row)
    item_id = row.item_id or row.id
    on_item_created(
        db,
        item_id,
        created_by=actor.id,
        source="elim_dropship_import" if not publish_for_storefront else "elim_storefront_cache",
        company_id=row.company_id or "default",
    )

    specs = _apply_elim_detail(
        db,
        row,
        detail=detail,
        elim_id=elim_id,
        platform=platform,
        pricing=pricing,
        status=row.status,
        cached_from=cached_from,
        preferred_category_id=preferred_category_id,
    )

    should_publish = publish_for_storefront or row.status == "published"
    EcommerceItemService(db).sync_content_from_catalog(row, mirror_publish=should_publish)
    if should_publish:
        _publish_dropship_for_storefront(db, row)

    db.commit()
    db.refresh(row)
    return row, True, specs
