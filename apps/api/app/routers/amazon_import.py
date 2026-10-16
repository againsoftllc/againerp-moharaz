"""Admin Amazon SP-API → catalog import (Elim-style)."""

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
from app.services.amazon_catalog_import import (
    default_amazon_pricing_from_settings,
    import_amazon_asin_to_catalog,
)
from app.services.amazon_sp_client import (
    AmazonSpClientError,
    is_configured,
    raise_http,
    search_catalog_items,
)
from app.services.amazon_sp_client import base_url as amazon_base_url

router = APIRouter(prefix="/amazon", tags=["amazon-import"])


class AmazonSearchResponse(BaseModel):
    success: bool = True
    items: list[dict[str, Any]] = Field(default_factory=list)
    page: int = 1
    size: int = 20
    total: int = 0
    message: Optional[str] = None


class AmazonImportRequest(BaseModel):
    asin: str = Field(min_length=8, max_length=20)
    marketplace_id: Optional[str] = Field(default=None, max_length=32)
    status: Literal["draft", "published"] = "draft"
    cost_usd: Optional[Decimal] = Field(default=None, ge=0)
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0)
    profit_bdt: Optional[Decimal] = Field(default=None, ge=0)
    server_charge_bdt: Optional[Decimal] = Field(default=None, ge=0)
    title: Optional[str] = Field(default=None, max_length=255)
    allow_sandbox_stub: bool = True


class AmazonBulkImportRequest(BaseModel):
    asins: list[str] = Field(min_length=1, max_length=40)
    marketplace_id: Optional[str] = Field(default=None, max_length=32)
    status: Literal["draft", "published"] = "draft"
    cost_usd: Optional[Decimal] = Field(default=None, ge=0)
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0)
    profit_bdt: Optional[Decimal] = Field(default=None, ge=0)
    server_charge_bdt: Optional[Decimal] = Field(default=None, ge=0)
    allow_sandbox_stub: bool = True


class AmazonImportResponse(BaseModel):
    created: bool
    product_id: str
    sku: str
    name: str
    slug: str
    price: str
    currency: str = "BDT"
    thumbnail: Optional[str] = None
    source_url: Optional[str] = None
    live_amazon_data: bool = False
    sandbox_stub: bool = False
    pricing: Optional[dict[str, Any]] = None


class AmazonBulkImportResponse(BaseModel):
    imported: list[AmazonImportResponse] = Field(default_factory=list)
    skipped: list[AmazonImportResponse] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


def _to_response(row, created: bool, specs: dict[str, Any]) -> AmazonImportResponse:
    return AmazonImportResponse(
        created=created,
        product_id=row.id,
        sku=row.sku,
        name=row.name,
        slug=row.slug,
        price=str(row.price),
        thumbnail=row.thumbnail,
        source_url=row.source_url or specs.get("supplier_link"),
        live_amazon_data=bool(specs.get("live_amazon_data")),
        sandbox_stub=bool(specs.get("sandbox_stub")),
        pricing={
            "cost_usd": specs.get("cost_usd"),
            "cost_bdt": specs.get("cost_bdt"),
            "exchange_rate": specs.get("exchange_rate"),
            "profit_bdt": specs.get("profit_bdt"),
            "server_charge_bdt": specs.get("server_charge_bdt"),
            "sell_price_bdt": specs.get("sell_price_bdt"),
        },
    )


@router.get("/status")
def amazon_import_status() -> dict[str, Any]:
    s = get_settings()
    defaults = default_amazon_pricing_from_settings()
    configured = is_configured()
    return {
        "configured": configured,
        "app_name": s.amazon_sp_app_name or "Againsoft",
        "env": (s.amazon_sp_env or "sandbox").strip().lower(),
        "region": (s.amazon_sp_region or "na").strip().lower(),
        "base_url": amazon_base_url() if configured else None,
        "marketplace_id": s.amazon_sp_marketplace_id or "ATVPDKIKX0DER",
        "pricing_defaults": {k: float(v) for k, v in defaults.items()},
        "note": (
            "Sandbox catalog is static mock only. Keyword search matches exactly: "
            "samsung,tv (or 'samsung tv'). ASIN detail matches: B07N4M94X4. "
            "Other queries need AMAZON_SP_ENV=production."
        ),
    }


@router.get("/search", response_model=AmazonSearchResponse)
def amazon_import_search(
    q: str = Query(..., min_length=1, max_length=200),
    marketplace_id: Optional[str] = Query(None, max_length=32),
    size: int = Query(12, ge=1, le=40),
    _user: AuthUser = Depends(require_write_access),
) -> AmazonSearchResponse:
    s = get_settings()
    mid = (marketplace_id or s.amazon_sp_marketplace_id or "ATVPDKIKX0DER").strip()
    try:
        data = search_catalog_items(keywords=q.strip(), marketplace_ids=[mid], page_size=size)
    except AmazonSpClientError as exc:
        if exc.status_code == 400:
            return AmazonSearchResponse(
                success=False,
                items=[],
                total=0,
                message=(
                    f"{exc}. Sandbox only matches keywords: samsung,tv "
                    "(try that exact phrase). Or paste ASIN B07N4M94X4."
                ),
            )
        raise_http(exc)

    items_raw = data.get("items") or []
    items: list[dict[str, Any]] = []
    if isinstance(items_raw, list):
        for row in items_raw:
            if not isinstance(row, dict) or not row.get("asin"):
                continue
            summaries = row.get("summaries") if isinstance(row.get("summaries"), list) else []
            s0 = summaries[0] if summaries and isinstance(summaries[0], dict) else {}
            image = None
            images = row.get("images")
            if isinstance(images, list) and images and isinstance(images[0], dict):
                imgs = images[0].get("images")
                if isinstance(imgs, list) and imgs and isinstance(imgs[0], dict):
                    image = imgs[0].get("link")
            items.append(
                {
                    "asin": str(row["asin"]),
                    "title": s0.get("itemName") or str(row["asin"]),
                    "brand": s0.get("brand"),
                    "image": image,
                    "marketplace_id": s0.get("marketplaceId") or mid,
                }
            )
    return AmazonSearchResponse(success=True, items=items, total=len(items), size=size)


@router.post("/import", response_model=AmazonImportResponse)
def amazon_import_one(
    payload: AmazonImportRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> AmazonImportResponse:
    try:
        row, created, specs = import_amazon_asin_to_catalog(
            db,
            asin=payload.asin,
            user=user,
            marketplace_id=payload.marketplace_id,
            status=payload.status,
            cost_usd=payload.cost_usd,
            exchange_rate=payload.exchange_rate,
            profit_bdt=payload.profit_bdt,
            server_charge_bdt=payload.server_charge_bdt,
            title_override=payload.title,
            allow_sandbox_stub=payload.allow_sandbox_stub,
        )
    except AmazonSpClientError as exc:
        raise_http(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc
    return _to_response(row, created, specs)


@router.post("/import/bulk", response_model=AmazonBulkImportResponse)
def amazon_import_bulk(
    payload: AmazonBulkImportRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> AmazonBulkImportResponse:
    imported: list[AmazonImportResponse] = []
    skipped: list[AmazonImportResponse] = []
    errors: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in payload.asins:
        asin = str(raw).strip().upper()
        if not asin or asin in seen:
            continue
        seen.add(asin)
        try:
            row, created, specs = import_amazon_asin_to_catalog(
                db,
                asin=asin,
                user=user,
                marketplace_id=payload.marketplace_id,
                status=payload.status,
                cost_usd=payload.cost_usd,
                exchange_rate=payload.exchange_rate,
                profit_bdt=payload.profit_bdt,
                server_charge_bdt=payload.server_charge_bdt,
                allow_sandbox_stub=payload.allow_sandbox_stub,
            )
            item = _to_response(row, created, specs)
            (imported if created else skipped).append(item)
        except Exception as exc:
            errors.append({"asin": asin, "error": str(exc)})
    return AmazonBulkImportResponse(imported=imported, skipped=skipped, errors=errors)
