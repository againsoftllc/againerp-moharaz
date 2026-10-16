"""Slim Elim → catalog dropship import API."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import require_write_access
from app.models.auth_user import AuthUser
from app.services.elim_catalog_import import (
    compute_sell_price_bdt,
    default_pricing_from_settings,
    import_elim_product_to_catalog,
    save_pricing_defaults,
)
from app.services.elim_client import ElimClientError, find_product, raise_http, search_products

router = APIRouter(prefix="/elim", tags=["elim-import"])

Platform = Literal["taobao", "alibaba"]


class ElimSearchResponse(BaseModel):
    success: bool = True
    items: list[dict[str, Any]] = Field(default_factory=list)
    page: int = 1
    size: int = 20
    total: int = 0
    raw_message: Optional[str] = None


class ElimPricingInput(BaseModel):
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0)
    markup_percent: Optional[Decimal] = Field(default=None, ge=0)
    profit_bdt: Optional[Decimal] = Field(default=None, ge=0)
    server_charge_bdt: Optional[Decimal] = Field(default=None, ge=0)


class ElimPricingDefaultsUpdate(BaseModel):
    exchange_rate: Decimal = Field(..., gt=0)
    markup_percent: Decimal = Field(..., ge=0)
    profit_bdt: Decimal = Field(default=Decimal("0"), ge=0)
    server_charge_bdt: Decimal = Field(default=Decimal("0"), ge=0)


class ElimImportRequest(ElimPricingInput):
    elim_id: str = Field(min_length=1, max_length=64)
    platform: Platform = "taobao"
    lang: str = "en"
    status: Literal["draft", "published"] = "draft"


class ElimBulkImportRequest(ElimPricingInput):
    elim_ids: list[str] = Field(min_length=1, max_length=40)
    platform: Platform = "taobao"
    lang: str = "en"
    status: Literal["draft", "published"] = "draft"


class ElimImportResponse(BaseModel):
    created: bool
    product_id: str
    sku: str
    name: str
    slug: str
    price: str
    currency: str = "BDT"
    thumbnail: Optional[str] = None
    source_url: Optional[str] = None
    pricing: Optional[dict[str, Any]] = None


class ElimBulkImportResponse(BaseModel):
    imported: list[ElimImportResponse] = Field(default_factory=list)
    skipped: list[ElimImportResponse] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


def _map_list_item(item: dict[str, Any], platform: str) -> dict[str, Any]:
    return {
        "id": str(item.get("id") or ""),
        "title": item.get("titleEn") or item.get("title") or "",
        "title_zh": item.get("title"),
        "price": item.get("promotion_price") or item.get("price"),
        "image": item.get("img_url"),
        "sales_volume": item.get("sales_volume"),
        "seller_name": item.get("seller_name") or item.get("shop_name"),
        "link": item.get("link"),
        "platform": platform,
    }


def _to_import_response(row, created: bool, specs: dict[str, Any]) -> ElimImportResponse:
    return ElimImportResponse(
        created=created,
        product_id=row.id,
        sku=row.sku,
        name=row.name,
        slug=row.slug,
        price=str(row.price),
        currency="BDT",
        thumbnail=row.thumbnail,
        source_url=getattr(row, "source_url", None) or specs.get("supplier_link"),
        pricing={
            "cost_cny": specs.get("cost_cny"),
            "cost_bdt": specs.get("cost_bdt"),
            "exchange_rate": specs.get("exchange_rate"),
            "markup_percent": specs.get("markup_percent"),
            "markup_bdt": specs.get("markup_bdt"),
            "profit_bdt": specs.get("profit_bdt"),
            "server_charge_bdt": specs.get("server_charge_bdt"),
            "sell_price_bdt": specs.get("sell_price_bdt"),
            "supplier_link": specs.get("supplier_link"),
            "image_count": specs.get("image_count"),
            "video_count": specs.get("video_count"),
            "variant_count": specs.get("variant_count"),
        },
    )


@router.get("/status")
def elim_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_settings()
    defaults = default_pricing_from_settings(db)
    configured = bool((settings.elim_api_key or "").strip())
    return {
        "configured": configured,
        "base_url": settings.elim_base_url,
        "key_name_hint": "Againerp Testing" if configured else None,
        "pricing_defaults": {
            "exchange_rate": float(defaults["exchange_rate"]),
            "markup_percent": float(defaults["markup_percent"]),
            "profit_bdt": float(defaults["profit_bdt"]),
            "server_charge_bdt": float(defaults["server_charge_bdt"]),
        },
        "pricing_formula": "sell_bdt = cost_cny × rate × (1 + markup%/100) + profit + server_fee",
    }


@router.put("/pricing-defaults")
def elim_save_pricing_defaults(
    payload: ElimPricingDefaultsUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    saved = save_pricing_defaults(
        db,
        exchange_rate=payload.exchange_rate,
        markup_percent=payload.markup_percent,
        profit_bdt=payload.profit_bdt,
        server_charge_bdt=payload.server_charge_bdt,
    )
    db.commit()
    return {
        "success": True,
        "pricing_defaults": {k: float(v) for k, v in saved.items()},
        "message": "Pricing defaults saved. Storefront China prices will use this markup %.",
    }


@router.get("/pricing/preview")
def elim_pricing_preview(
    cost_cny: Decimal = Query(..., ge=0),
    exchange_rate: Optional[Decimal] = Query(default=None, gt=0),
    markup_percent: Optional[Decimal] = Query(default=None, ge=0),
    profit_bdt: Optional[Decimal] = Query(default=None, ge=0),
    server_charge_bdt: Optional[Decimal] = Query(default=None, ge=0),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    defaults = default_pricing_from_settings(db)
    pricing = compute_sell_price_bdt(
        cost_cny=cost_cny,
        exchange_rate=exchange_rate if exchange_rate is not None else defaults["exchange_rate"],
        markup_percent=markup_percent if markup_percent is not None else defaults["markup_percent"],
        profit_bdt=profit_bdt if profit_bdt is not None else defaults["profit_bdt"],
        server_charge_bdt=server_charge_bdt
        if server_charge_bdt is not None
        else defaults["server_charge_bdt"],
    )
    return {k: float(v) for k, v in pricing.items()}


@router.get("/search", response_model=ElimSearchResponse)
def elim_search(
    q: str = Query(..., min_length=1, max_length=200),
    platform: Platform = Query("taobao"),
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=40),
    lang: str = Query("en"),
    _user: AuthUser = Depends(require_write_access),
) -> ElimSearchResponse:
    try:
        data = search_products(q=q, platform=platform, page=page, size=size, lang=lang)
    except ElimClientError as exc:
        raise_http(exc)

    items_raw = data.get("items") or []
    if not isinstance(items_raw, list):
        items_raw = []
    paginate = data.get("paginate") or {}
    return ElimSearchResponse(
        success=bool(data.get("success", True)),
        items=[_map_list_item(i, platform) for i in items_raw if isinstance(i, dict)],
        page=int(paginate.get("current") or page),
        size=int(paginate.get("size") or size),
        total=int(paginate.get("total") or len(items_raw)),
        raw_message=data.get("message"),
    )


@router.get("/products/{elim_id}")
def elim_product_detail(
    elim_id: str,
    platform: Platform = Query("taobao"),
    lang: str = Query("en"),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    try:
        detail = find_product(product_id=elim_id, platform=platform, lang=lang)
    except ElimClientError as exc:
        raise_http(exc)
    return {"success": True, "data": detail}


@router.post("/import", response_model=ElimImportResponse)
def elim_import_to_catalog(
    payload: ElimImportRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> ElimImportResponse:
    try:
        row, created, specs = import_elim_product_to_catalog(
            db,
            elim_id=payload.elim_id.strip(),
            platform=payload.platform,
            user=user,
            lang=payload.lang,
            status=payload.status,
            exchange_rate=payload.exchange_rate,
            markup_percent=payload.markup_percent,
            profit_bdt=payload.profit_bdt,
            server_charge_bdt=payload.server_charge_bdt,
        )
    except ElimClientError as exc:
        raise_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc

    return _to_import_response(row, created, specs)


@router.post("/import/bulk", response_model=ElimBulkImportResponse)
def elim_bulk_import_to_catalog(
    payload: ElimBulkImportRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> ElimBulkImportResponse:
    imported: list[ElimImportResponse] = []
    skipped: list[ElimImportResponse] = []
    errors: list[dict[str, str]] = []

    seen: set[str] = set()
    for raw_id in payload.elim_ids:
        elim_id = str(raw_id).strip()
        if not elim_id or elim_id in seen:
            continue
        seen.add(elim_id)
        try:
            row, created, specs = import_elim_product_to_catalog(
                db,
                elim_id=elim_id,
                platform=payload.platform,
                user=user,
                lang=payload.lang,
                status=payload.status,
                exchange_rate=payload.exchange_rate,
                markup_percent=payload.markup_percent,
                profit_bdt=payload.profit_bdt,
                server_charge_bdt=payload.server_charge_bdt,
            )
            item = _to_import_response(row, created, specs)
            if created:
                imported.append(item)
            else:
                skipped.append(item)
        except ElimClientError as exc:
            errors.append({"elim_id": elim_id, "error": str(exc)})
        except Exception as exc:
            errors.append({"elim_id": elim_id, "error": str(exc)})

    return ElimBulkImportResponse(imported=imported, skipped=skipped, errors=errors)
