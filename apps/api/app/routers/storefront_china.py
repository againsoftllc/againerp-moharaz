"""Public storefront China (Elim / Alibaba) — live search + cache-on-open."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog_category import CatalogCategory
from app.services.elim_catalog_import import (
    compute_sell_price_bdt,
    default_pricing_from_settings,
    import_elim_product_to_catalog,
)
from app.services.elim_client import (
    ElimClientError,
    find_product,
    raise_http,
    search_products,
    search_products_by_image,
    upload_image,
)

router = APIRouter(prefix="/china", tags=["storefront-china"])

Platform = Literal["taobao", "alibaba"]


class ChinaSearchItem(BaseModel):
    id: str
    title: str
    title_zh: Optional[str] = None
    image: Optional[str] = None
    link: Optional[str] = None
    platform: Platform
    cost_cny: Optional[float] = None
    price_bdt: Optional[float] = None
    # Regular (non-promo) BDT when offer/promotion price is lower.
    compare_at_price_bdt: Optional[float] = None
    sales_volume: Optional[Any] = None
    seller_name: Optional[str] = None
    rating: Optional[float] = None
    repurchase_rate: Optional[str] = None


class ChinaSearchResponse(BaseModel):
    success: bool = True
    q: str
    platform: Platform
    items: list[ChinaSearchItem] = Field(default_factory=list)
    page: int = 1
    size: int = 20
    total: int = 0
    message: Optional[str] = None


class ChinaImageSearchResponse(ChinaSearchResponse):
    image_id: Optional[str] = None


class ChinaUploadImageResponse(BaseModel):
    success: bool = True
    image_id: str
    platform: Platform = "alibaba"


MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


class LocalCacheInfo(BaseModel):
    """Local catalog row after SkyBuy-style cache-on-open."""

    created: bool
    product_id: str
    item_id: str
    slug: str
    sku: str
    name: str
    price_bdt: float
    thumbnail: Optional[str] = None
    supplier_link: Optional[str] = None
    category_id: Optional[str] = None
    category_slug: Optional[str] = None


class ChinaProductResponse(BaseModel):
    success: bool = True
    id: str
    title: str
    title_zh: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    link: Optional[str] = None
    platform: Platform
    cost_cny: Optional[float] = None
    price_bdt: Optional[float] = None
    currency: str = "BDT"
    seller_name: Optional[str] = None
    pricing: dict[str, float] = Field(default_factory=dict)
    local: Optional[LocalCacheInfo] = None


class ChinaCacheRequest(BaseModel):
    elim_id: str = Field(min_length=1, max_length=64)
    platform: Platform = "alibaba"
    lang: str = "en"
    category_id: Optional[str] = Field(default=None, max_length=36)


class ChinaCacheResponse(BaseModel):
    success: bool = True
    local: LocalCacheInfo
    elim_id: str
    platform: Platform


def _d(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _preview_bdt(
    cost_cny: Optional[Decimal],
    defaults: Optional[dict[str, Decimal]] = None,
) -> tuple[Optional[float], dict[str, float]]:
    if cost_cny is None:
        return None, {}
    pricing_defaults = defaults or default_pricing_from_settings()
    pricing = compute_sell_price_bdt(
        cost_cny=cost_cny,
        exchange_rate=pricing_defaults["exchange_rate"],
        markup_percent=pricing_defaults.get("markup_percent", Decimal("0")),
        profit_bdt=pricing_defaults["profit_bdt"],
        server_charge_bdt=pricing_defaults["server_charge_bdt"],
    )
    return float(pricing["sell_price_bdt"]), {k: float(v) for k, v in pricing.items()}


def _map_search_item(
    item: dict[str, Any],
    platform: Platform,
    defaults: Optional[dict[str, Decimal]] = None,
) -> ChinaSearchItem:
    promo = _d(item.get("promotion_price"))
    regular = _d(item.get("price") or item.get("dropship_price") or item.get("wholesale_price"))
    # Prefer promotion/offer cost when present; keep regular for compare display.
    offer_cost = promo if promo is not None else regular
    compare_cost = None
    if promo is not None and regular is not None and regular > promo:
        compare_cost = regular

    price_bdt, _ = _preview_bdt(offer_cost, defaults)
    compare_bdt, _ = _preview_bdt(compare_cost, defaults) if compare_cost is not None else (None, {})

    rating: Optional[float] = None
    raw_level = item.get("level")
    if raw_level is not None and raw_level != "":
        try:
            score = float(raw_level)
            rating = score if score <= 5 else round(score / 20, 1)
        except (TypeError, ValueError):
            rating = None

    repurchase: Optional[str] = None
    raw_retention = item.get("retention_rate")
    if isinstance(raw_retention, str) and raw_retention.strip():
        repurchase = raw_retention.strip()
    elif raw_retention is not None and raw_retention != "":
        try:
            pct = float(raw_retention)
            # Elim may send 0–1 or 0–100
            if 0 < pct <= 1:
                pct *= 100
            repurchase = f"{pct:.0f}%" if pct == int(pct) else f"{pct:.1f}%"
        except (TypeError, ValueError):
            repurchase = None

    return ChinaSearchItem(
        id=str(item.get("id") or ""),
        title=str(item.get("titleEn") or item.get("title") or "").strip(),
        title_zh=str(item["title"]).strip() if isinstance(item.get("title"), str) else None,
        image=item.get("img_url") if isinstance(item.get("img_url"), str) else None,
        link=item.get("link") if isinstance(item.get("link"), str) else None,
        platform=platform,
        cost_cny=float(offer_cost) if offer_cost is not None else None,
        price_bdt=price_bdt,
        compare_at_price_bdt=compare_bdt,
        sales_volume=item.get("sales_volume"),
        seller_name=(item.get("seller_name") or item.get("shop_name") or None),
        rating=rating,
        repurchase_rate=repurchase,
    )


def _search_response_from_elim(
    data: dict[str, Any],
    *,
    platform: Platform,
    q: str,
    page: int,
    size: int,
    image_id: Optional[str] = None,
    defaults: Optional[dict[str, Decimal]] = None,
) -> ChinaImageSearchResponse:
    items_raw = data.get("items") or []
    if not isinstance(items_raw, list):
        items_raw = []
    paginate = data.get("paginate") or {}
    pricing_defaults = defaults or default_pricing_from_settings()
    items = [
        _map_search_item(i, platform, pricing_defaults)
        for i in items_raw
        if isinstance(i, dict) and i.get("id")
    ]
    return ChinaImageSearchResponse(
        success=bool(data.get("success", True)),
        q=q,
        platform=platform,
        items=items,
        page=int(paginate.get("current") or page),
        size=int(paginate.get("size") or size),
        total=int(paginate.get("total") or len(items)),
        message=data.get("message") if isinstance(data.get("message"), str) else None,
        image_id=image_id,
    )


def _extract_upload_image_id(upload: dict[str, Any]) -> str:
    nested = upload.get("data")
    if isinstance(nested, dict) and nested.get("image_id"):
        return str(nested["image_id"]).strip()
    if upload.get("image_id"):
        return str(upload["image_id"]).strip()
    raise HTTPException(status_code=502, detail="Elim upload did not return image_id")


def _run_image_search(
    *,
    img_url: Optional[str],
    img_id: Optional[str],
    platform: Platform,
    page: int,
    size: int,
    lang: str,
    defaults: Optional[dict[str, Decimal]] = None,
) -> ChinaImageSearchResponse:
    try:
        data = search_products_by_image(
            img_url=img_url,
            img_id=img_id,
            platform=platform,
            page=page,
            size=size,
            lang=lang,
        )
    except ElimClientError as exc:
        raise_http(exc)
        raise  # unreachable — satisfies type checker

    label = "Image search"
    if img_url:
        label = img_url[:120]
    return _search_response_from_elim(
        data,
        platform=platform,
        q=label,
        page=page,
        size=size,
        image_id=img_id.strip() if img_id else None,
        defaults=defaults or default_pricing_from_settings(),
    )


def _extract_images(detail: dict[str, Any]) -> list[str]:
    images: list[str] = []
    raw_imgs = detail.get("img_urls") or detail.get("images") or []
    if isinstance(raw_imgs, list):
        for img in raw_imgs:
            if isinstance(img, str) and img:
                images.append(img)
            elif isinstance(img, dict):
                for key in ("url", "img_url", "src"):
                    if img.get(key):
                        images.append(str(img[key]))
                        break
    if not images and isinstance(detail.get("img_url"), str):
        images = [detail["img_url"]]
    return images[:20]


def _supplier_link(detail: dict[str, Any], platform: Platform, elim_id: str) -> str:
    link = detail.get("detail_url") or detail.get("link")
    if link:
        return str(link)
    if platform == "alibaba":
        return f"https://detail.1688.com/offer/{elim_id}.html"
    return f"https://item.taobao.com/item.htm?id={elim_id}"


def _to_local(db: Session, row, created: bool, specs: dict[str, Any]) -> LocalCacheInfo:
    category_slug = None
    if row.category_id:
        cat = db.get(CatalogCategory, row.category_id)
        category_slug = cat.slug if cat else None
    return LocalCacheInfo(
        created=created,
        product_id=row.id,
        item_id=row.item_id or row.id,
        slug=row.slug,
        sku=row.sku,
        name=row.name,
        price_bdt=float(row.price),
        thumbnail=row.thumbnail,
        supplier_link=specs.get("supplier_link"),
        category_id=row.category_id,
        category_slug=category_slug,
    )


def _cache_to_local(
    db: Session,
    *,
    elim_id: str,
    platform: Platform,
    lang: str = "en",
    preferred_category_id: Optional[str] = None,
) -> LocalCacheInfo:
    try:
        row, created, specs = import_elim_product_to_catalog(
            db,
            elim_id=elim_id.strip(),
            platform=platform,
            user=None,
            lang=lang,
            status="published",
            publish_for_storefront=True,
            preferred_category_id=preferred_category_id,
        )
    except ElimClientError as exc:
        raise_http(exc)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cache failed: {exc}") from exc
    return _to_local(db, row, created, specs)


@router.get("/search", response_model=ChinaSearchResponse)
def china_title_search(
    q: str = Query(..., min_length=1, max_length=200, description="Product title / keyword"),
    platform: Platform = Query("alibaba", description="alibaba = 1688, taobao = Taobao"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=40),
    lang: str = Query("en"),
    db: Session = Depends(get_db),
) -> ChinaSearchResponse:
    """Title-like search against Elim (Alibaba / Taobao). Public — no API key in browser."""
    try:
        data = search_products(q=q.strip(), platform=platform, page=page, size=size, lang=lang)
    except ElimClientError as exc:
        raise_http(exc)

    return _search_response_from_elim(
        data,
        platform=platform,
        q=q.strip(),
        page=page,
        size=size,
        defaults=default_pricing_from_settings(db),
    )


@router.get("/search-image", response_model=ChinaImageSearchResponse)
def china_image_search_get(
    img_id: Optional[str] = Query(None, max_length=256),
    img_url: Optional[str] = Query(None, max_length=2000),
    platform: Platform = Query("alibaba"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=40),
    lang: str = Query("en"),
    db: Session = Depends(get_db),
) -> ChinaImageSearchResponse:
    """Paginate image search by Elim img_id or img_url."""
    clean_id = img_id.strip() if img_id else None
    clean_url = img_url.strip() if img_url else None
    if not clean_id and not clean_url:
        raise HTTPException(status_code=422, detail="img_id or img_url is required")
    if clean_id and clean_url:
        raise HTTPException(status_code=422, detail="Use only one of img_id or img_url")
    return _run_image_search(
        img_url=clean_url,
        img_id=clean_id,
        platform=platform,
        page=page,
        size=size,
        lang=lang,
        defaults=default_pricing_from_settings(db),
    )


@router.post("/search-image", response_model=ChinaImageSearchResponse)
async def china_image_search_post(
    platform: Platform = Form("alibaba"),
    page: int = Form(1),
    size: int = Form(20),
    lang: str = Form("en"),
    img_url: Optional[str] = Form(None),
    img_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
) -> ChinaImageSearchResponse:
    """Upload image or pass img_url/img_id — search China products by picture."""
    clean_url = img_url.strip() if img_url else None
    clean_id = img_id.strip() if img_id else None
    sources = sum(bool(x) for x in (file, clean_url, clean_id))
    if sources == 0:
        raise HTTPException(status_code=422, detail="Provide file, img_url, or img_id")
    if sources > 1:
        raise HTTPException(status_code=422, detail="Use only one of file, img_url, or img_id")

    if file is not None:
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        if content_type and content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported image type")
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image file")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Image must be under 5 MB")
        filename = file.filename or "upload.jpg"
        try:
            upload = upload_image(
                file_content=raw,
                filename=filename,
                content_type=content_type or "image/jpeg",
                platform=platform,
            )
        except ElimClientError as exc:
            raise_http(exc)
        clean_id = _extract_upload_image_id(upload)

    return _run_image_search(
        img_url=clean_url,
        img_id=clean_id,
        platform=platform,
        page=max(page, 1),
        size=min(max(size, 1), 40),
        lang=lang,
        defaults=default_pricing_from_settings(db),
    )


@router.post("/upload-image", response_model=ChinaUploadImageResponse)
async def china_upload_image(
    platform: Platform = Form("alibaba"),
    file: UploadFile = File(...),
) -> ChinaUploadImageResponse:
    """Upload product photo — returns Elim image_id for visual search."""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")
    filename = file.filename or "upload.jpg"
    try:
        upload = upload_image(
            file_content=raw,
            filename=filename,
            content_type=content_type or "image/jpeg",
            platform=platform,
        )
    except ElimClientError as exc:
        raise_http(exc)
    return ChinaUploadImageResponse(
        success=True,
        image_id=_extract_upload_image_id(upload),
        platform=platform,
    )


@router.post("/cache", response_model=ChinaCacheResponse)
def china_cache_product(
    payload: ChinaCacheRequest,
    db: Session = Depends(get_db),
) -> ChinaCacheResponse:
    """SkyBuy hybrid: open/select → upsert local catalog (published) for cart."""
    preferred = payload.category_id.strip() if payload.category_id else None
    if preferred and not db.get(CatalogCategory, preferred):
        raise HTTPException(status_code=400, detail="Unknown category_id")
    local = _cache_to_local(
        db,
        elim_id=payload.elim_id,
        platform=payload.platform,
        lang=payload.lang,
        preferred_category_id=preferred,
    )
    return ChinaCacheResponse(
        success=True,
        local=local,
        elim_id=payload.elim_id.strip(),
        platform=payload.platform,
    )


@router.get("/products/{elim_id}", response_model=ChinaProductResponse)
def china_product_preview(
    elim_id: str,
    platform: Platform = Query("alibaba"),
    lang: str = Query("en"),
    cache: bool = Query(True, description="Upsert into local catalog (hybrid cache-on-open)"),
    category_id: Optional[str] = Query(None, max_length=36),
    db: Session = Depends(get_db),
) -> ChinaProductResponse:
    try:
        detail = find_product(product_id=elim_id.strip(), platform=platform, lang=lang)
    except ElimClientError as exc:
        raise_http(exc)

    if not isinstance(detail, dict):
        raise HTTPException(status_code=502, detail="Unexpected Elim product payload")

    cost = _d(detail.get("promotion_price") or detail.get("coupon_price") or detail.get("price"))
    price_bdt, pricing = _preview_bdt(cost, default_pricing_from_settings(db))
    images = _extract_images(detail)
    title = str(detail.get("titleEn") or detail.get("title") or elim_id).strip()
    link = _supplier_link(detail, platform, elim_id)

    preferred = category_id.strip() if category_id else None
    if preferred and not db.get(CatalogCategory, preferred):
        raise HTTPException(status_code=400, detail="Unknown category_id")

    local: Optional[LocalCacheInfo] = None
    if cache:
        local = _cache_to_local(
            db,
            elim_id=elim_id,
            platform=platform,
            lang=lang,
            preferred_category_id=preferred,
        )
        # Prefer cached sell price for cart consistency
        price_bdt = local.price_bdt

    return ChinaProductResponse(
        success=True,
        id=str(detail.get("id") or elim_id),
        title=(local.name if local else title)[:500],
        title_zh=str(detail["title"]).strip() if isinstance(detail.get("title"), str) else None,
        images=images or ([local.thumbnail] if local and local.thumbnail else []),
        link=str(link) if link else None,
        platform=platform,
        cost_cny=float(cost) if cost is not None else None,
        price_bdt=price_bdt,
        seller_name=(detail.get("seller_name") or detail.get("shop_name") or None),
        pricing=pricing,
        local=local,
    )
