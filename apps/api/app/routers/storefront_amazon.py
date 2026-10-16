"""Public storefront Amazon SP-API (sandbox/production) — Elim-style proxy."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.amazon_sp_client import (
    AmazonSpClientError,
    base_url,
    get_catalog_item,
    get_marketplace_participations,
    is_configured,
    raise_http,
    search_catalog_items,
)

router = APIRouter(prefix="/amazon", tags=["storefront-amazon"])


class AmazonMarketplaceItem(BaseModel):
    id: str
    country_code: Optional[str] = None
    name: Optional[str] = None
    domain: Optional[str] = None
    currency: Optional[str] = None
    language: Optional[str] = None
    store_name: Optional[str] = None
    is_participating: Optional[bool] = None
    has_suspended_listings: Optional[bool] = None


class AmazonMarketplaceResponse(BaseModel):
    success: bool = True
    env: str
    region: str
    items: list[AmazonMarketplaceItem] = Field(default_factory=list)


class AmazonCatalogItem(BaseModel):
    asin: str
    title: Optional[str] = None
    brand: Optional[str] = None
    image: Optional[str] = None
    marketplace_id: Optional[str] = None
    link: Optional[str] = None


class AmazonCatalogSearchResponse(BaseModel):
    success: bool = True
    q: str
    marketplace_id: str
    env: str
    region: str
    items: list[AmazonCatalogItem] = Field(default_factory=list)
    total: int = 0
    message: Optional[str] = None
    raw_keys: list[str] = Field(default_factory=list)


class AmazonCatalogProductResponse(BaseModel):
    success: bool = True
    asin: str
    title: Optional[str] = None
    brand: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    marketplace_id: str
    link: Optional[str] = None
    env: str
    region: str
    raw: Optional[dict[str, Any]] = None


def _status_payload() -> dict[str, Any]:
    s = get_settings()
    configured = is_configured()
    return {
        "configured": configured,
        "app_name": s.amazon_sp_app_name or "Againsoft",
        "solution_id": (s.amazon_sp_solution_id or "").strip() or None,
        "env": (s.amazon_sp_env or "sandbox").strip().lower() or "sandbox",
        "region": (s.amazon_sp_region or "na").strip().lower() or "na",
        "marketplace_id": s.amazon_sp_marketplace_id or "ATVPDKIKX0DER",
        "base_url": base_url() if configured else None,
        "client_id_hint": (
            (s.amazon_sp_client_id or "")[:32] + "…"
            if (s.amazon_sp_client_id or "").strip()
            else None
        ),
    }


def _amazon_link(asin: str, marketplace_id: str) -> str:
    # US default; other marketplaces still resolve via amazon.com ASIN for now
    if marketplace_id == "A1F83G8C2ARO7P":
        return f"https://www.amazon.co.uk/dp/{asin}"
    if marketplace_id == "A1PA6795UKMFR9":
        return f"https://www.amazon.de/dp/{asin}"
    return f"https://www.amazon.com/dp/{asin}"


def _map_marketplace_rows(payload: Any) -> list[AmazonMarketplaceItem]:
    rows = payload if isinstance(payload, list) else []
    out: list[AmazonMarketplaceItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        mp = row.get("marketplace") if isinstance(row.get("marketplace"), dict) else {}
        part = row.get("participation") if isinstance(row.get("participation"), dict) else {}
        mid = str(mp.get("id") or "").strip()
        if not mid:
            continue
        out.append(
            AmazonMarketplaceItem(
                id=mid,
                country_code=mp.get("countryCode"),
                name=mp.get("name"),
                domain=mp.get("domainName"),
                currency=mp.get("defaultCurrencyCode"),
                language=mp.get("defaultLanguageCode"),
                store_name=row.get("storeName"),
                is_participating=part.get("isParticipating"),
                has_suspended_listings=part.get("hasSuspendedListings"),
            )
        )
    return out


def _first_image(item: dict[str, Any]) -> Optional[str]:
    images = item.get("images")
    if isinstance(images, list):
        for block in images:
            if not isinstance(block, dict):
                continue
            imgs = block.get("images")
            if isinstance(imgs, list) and imgs:
                for img in imgs:
                    if isinstance(img, dict) and img.get("link"):
                        return str(img["link"])
    return None


def _summary_title(item: dict[str, Any]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    summaries = item.get("summaries")
    if isinstance(summaries, list) and summaries and isinstance(summaries[0], dict):
        s0 = summaries[0]
        return (
            str(s0["itemName"]).strip() if s0.get("itemName") else None,
            str(s0["brand"]).strip() if s0.get("brand") else None,
            str(s0["marketplaceId"]) if s0.get("marketplaceId") else None,
        )
    return None, None, None


def _map_catalog_items(data: dict[str, Any], marketplace_id: str) -> list[AmazonCatalogItem]:
    items_raw = data.get("items") or []
    if not isinstance(items_raw, list):
        items_raw = []
    out: list[AmazonCatalogItem] = []
    for row in items_raw:
        if not isinstance(row, dict):
            continue
        asin = str(row.get("asin") or "").strip()
        if not asin:
            continue
        title, brand, mid = _summary_title(row)
        mid = mid or marketplace_id
        out.append(
            AmazonCatalogItem(
                asin=asin,
                title=title,
                brand=brand,
                image=_first_image(row),
                marketplace_id=mid,
                link=_amazon_link(asin, mid),
            )
        )
    return out


@router.get("/status")
def amazon_status() -> dict[str, Any]:
    """Config / env check — no Amazon call."""
    return {"success": True, **_status_payload()}


@router.get("/marketplaces", response_model=AmazonMarketplaceResponse)
def amazon_marketplaces() -> AmazonMarketplaceResponse:
    """Sellers marketplace participations (sandbox returns mock US store)."""
    s = get_settings()
    try:
        data = get_marketplace_participations()
    except AmazonSpClientError as exc:
        raise_http(exc)

    payload = data.get("payload") if isinstance(data, dict) else None
    return AmazonMarketplaceResponse(
        success=True,
        env=(s.amazon_sp_env or "sandbox").strip().lower() or "sandbox",
        region=(s.amazon_sp_region or "na").strip().lower() or "na",
        items=_map_marketplace_rows(payload),
    )


@router.get("/catalog/search", response_model=AmazonCatalogSearchResponse)
def amazon_catalog_search(
    q: str = Query(..., min_length=1, max_length=200, description="Catalog keywords"),
    marketplace_id: Optional[str] = Query(None, max_length=32),
    page_size: int = Query(10, ge=1, le=20),
) -> AmazonCatalogSearchResponse:
    """Catalog Items search (sandbox may require exact static patterns)."""
    s = get_settings()
    mid = (marketplace_id or s.amazon_sp_marketplace_id or "ATVPDKIKX0DER").strip()
    try:
        data = search_catalog_items(
            keywords=q.strip(),
            marketplace_ids=[mid],
            page_size=page_size,
        )
    except AmazonSpClientError as exc:
        # Sandbox often returns InvalidInput for free-text — surface as empty + message
        if exc.status_code == 400:
            return AmazonCatalogSearchResponse(
                success=False,
                q=q.strip(),
                marketplace_id=mid,
                env=(s.amazon_sp_env or "sandbox").strip().lower() or "sandbox",
                region=(s.amazon_sp_region or "na").strip().lower() or "na",
                items=[],
                total=0,
                message=str(exc),
            )
        raise_http(exc)

    items = _map_catalog_items(data, mid)
    return AmazonCatalogSearchResponse(
        success=True,
        q=q.strip(),
        marketplace_id=mid,
        env=(s.amazon_sp_env or "sandbox").strip().lower() or "sandbox",
        region=(s.amazon_sp_region or "na").strip().lower() or "na",
        items=items,
        total=len(items),
        raw_keys=sorted(data.keys()) if isinstance(data, dict) else [],
    )


@router.get("/catalog/items/{asin}", response_model=AmazonCatalogProductResponse)
def amazon_catalog_item(
    asin: str,
    marketplace_id: Optional[str] = Query(None, max_length=32),
) -> AmazonCatalogProductResponse:
    s = get_settings()
    mid = (marketplace_id or s.amazon_sp_marketplace_id or "ATVPDKIKX0DER").strip()
    try:
        data = get_catalog_item(asin, marketplace_ids=[mid])
    except AmazonSpClientError as exc:
        raise_http(exc)

    title, brand, smid = _summary_title(data)
    mid = smid or mid
    images: list[str] = []
    img = _first_image(data)
    if img:
        images.append(img)
    return AmazonCatalogProductResponse(
        success=True,
        asin=str(data.get("asin") or asin),
        title=title,
        brand=brand,
        images=images,
        marketplace_id=mid,
        link=_amazon_link(str(data.get("asin") or asin), mid),
        env=(s.amazon_sp_env or "sandbox").strip().lower() or "sandbox",
        region=(s.amazon_sp_region or "na").strip().lower() or "na",
        raw=data if (s.app_debug) else None,
    )
