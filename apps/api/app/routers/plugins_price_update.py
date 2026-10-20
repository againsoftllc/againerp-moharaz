from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

import logging
from concurrent.futures import ThreadPoolExecutor

from app.database import SessionLocal, get_db
from app.deps.auth import get_current_user, require_permission, require_write_access, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.models.price_update_plugin import PriceUpdateCompetitorSite, PriceUpdateMatch, PriceUpdatePlugin
from app.schemas.price_update_plugin import (
    PriceCaptureLookupRequest,
    PriceCaptureLookupResponse,
    PriceCaptureProduct,
    PriceCaptureRequest,
    PriceApplyRequest,
    PriceApplyResponse,
    PriceApplyRow,
    PriceDiscoverConfirmRequest,
    PriceDiscoverConfirmResponse,
    PriceDiscoverStepRequest,
    PriceDiscoverStepResponse,
    PriceSyncQueueItem,
    PriceSyncQueueResponse,
    PriceSyncResultRequest,
    PriceUpdateCompetitorCreate,
    PriceUpdateCompetitorListResponse,
    PriceUpdateCompetitorRead,
    PriceUpdateCompetitorUpdate,
    PriceUpdateMatchListResponse,
    PriceUpdateMatchRead,
    PriceUpdatePluginResponse,
    PriceUpdatePluginRead,
    PriceUpdatePluginUpdate,
    PriceUpdateRefreshRequest,
    PriceUpdateSetUrlRequest,
    PriceUpdateVerifyRequest,
)
from app.services.plugins import price_capture
from app.services.plugins import price_update_service as svc

router = APIRouter(prefix="/plugins/price-update", tags=["plugins-price-update"])
logger = logging.getLogger(__name__)


def _settings_read(row: PriceUpdatePlugin) -> PriceUpdatePluginRead:
    return PriceUpdatePluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        google_api_key_hint=row.google_api_key_hint,
        google_api_key_configured=bool(row.google_api_key),
        use_site_search=bool(row.use_site_search),
        use_sitemap_match=bool(row.use_sitemap_match),
        use_google_search=bool(row.use_google_search),
        use_google_price=bool(row.use_google_price),
        use_ai_pick=bool(row.use_ai_pick),
        use_ai_price_read=bool(row.use_ai_price_read),
        use_ai_web_search=bool(row.use_ai_web_search),
        auto_sync_hours=int(row.auto_sync_hours if row.auto_sync_hours is not None else 6),
        last_auto_sync_at=row.last_auto_sync_at,
        google_search_engine_id=row.google_search_engine_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _competitor_read(row: PriceUpdateCompetitorSite) -> PriceUpdateCompetitorRead:
    return PriceUpdateCompetitorRead(
        id=row.id, label=row.label, domain=row.domain, enabled=row.enabled, created_at=row.created_at,
    )


def _match_read(row: PriceUpdateMatch) -> PriceUpdateMatchRead:
    return PriceUpdateMatchRead(
        id=row.id,
        product_id=row.product_id,
        competitor=row.competitor,
        matched_url=row.matched_url,
        matched_title=row.matched_title,
        manual_url=row.manual_url,
        price=row.price,
        regular_price=row.regular_price,
        currency=row.currency,
        in_stock=row.in_stock,
        stock_label=row.stock_label,
        status=row.status,
        status_message=row.status_message,
        last_checked_at=row.last_checked_at,
        verified=bool(row.verified),
        verified_at=row.verified_at,
        verified_by=row.verified_by,
    )


@router.get("", response_model=PriceUpdatePluginResponse)
def get_price_update_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdatePluginResponse:
    return PriceUpdatePluginResponse(data=_settings_read(svc.get_or_create_settings(db, company_id)))


@router.post("/install", response_model=PriceUpdatePluginResponse)
def install_price_update_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdatePluginResponse:
    row = svc.get_or_create_settings(db, company_id)
    row.installed = True
    row.enabled = True
    db.commit()
    db.refresh(row)
    return PriceUpdatePluginResponse(data=_settings_read(row))


@router.delete("/install", response_model=PriceUpdatePluginResponse)
def uninstall_price_update_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdatePluginResponse:
    row = svc.get_or_create_settings(db, company_id)
    row.installed = False
    row.enabled = False
    db.commit()
    db.refresh(row)
    return PriceUpdatePluginResponse(data=_settings_read(row))


@router.patch("", response_model=PriceUpdatePluginResponse)
def update_price_update_plugin(
    payload: PriceUpdatePluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdatePluginResponse:
    row = svc.get_or_create_settings(db, company_id)
    if not row.installed:
        row.installed = True
        row.enabled = True
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.google_api_key is not None:
        key = payload.google_api_key.strip()
        row.google_api_key = key
        row.google_api_key_hint = svc.key_hint(key)
    if payload.google_search_engine_id is not None:
        row.google_search_engine_id = payload.google_search_engine_id.strip()
    if payload.auto_sync_hours is not None:
        row.auto_sync_hours = max(0, min(168, int(payload.auto_sync_hours)))
    for method in ("use_site_search", "use_sitemap_match", "use_google_search", "use_google_price", "use_ai_pick", "use_ai_price_read", "use_ai_web_search"):
        value = getattr(payload, method)
        if value is not None:
            setattr(row, method, value)
    db.commit()
    db.refresh(row)
    return PriceUpdatePluginResponse(data=_settings_read(row))


@router.get("/competitors", response_model=PriceUpdateCompetitorListResponse)
def list_price_update_competitors(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateCompetitorListResponse:
    rows = svc.list_competitor_sites(db, company_id)
    return PriceUpdateCompetitorListResponse(data=[_competitor_read(r) for r in rows])


@router.post("/competitors", response_model=PriceUpdateCompetitorRead)
def add_price_update_competitor(
    payload: PriceUpdateCompetitorCreate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateCompetitorRead:
    row = svc.add_competitor_site(db, company_id=company_id, domain=payload.domain, label=payload.label)
    return _competitor_read(row)


@router.patch("/competitors/{competitor_id}", response_model=PriceUpdateCompetitorRead)
def update_price_update_competitor(
    competitor_id: str,
    payload: PriceUpdateCompetitorUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateCompetitorRead:
    row = svc.set_competitor_enabled(
        db, company_id=company_id, competitor_id=competitor_id, enabled=payload.enabled,
    )
    return _competitor_read(row)


@router.delete("/competitors/{competitor_id}", status_code=204)
def delete_price_update_competitor(
    competitor_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    svc.remove_competitor_site(db, company_id=company_id, competitor_id=competitor_id)


@router.get("/matches/saved", response_model=PriceUpdateMatchListResponse)
def get_saved_price_update_matches(
    status: Optional[str] = Query(None, pattern="^(draft|published|unlisted|archived)$"),
    channel: Optional[str] = Query(None, pattern="^(catalog|dropshipping)$"),
    compact: bool = Query(False, description="Leave out rows nothing was ever read for"),
    limit: int = Query(5000, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchListResponse:
    """Saved competitor status for a whole list (by product status), one page at a time - no product ids in the URL."""
    rows = svc.list_saved_matches(db, company_id=company_id, status=status, channel=channel, compact=compact, limit=limit, offset=offset)
    return PriceUpdateMatchListResponse(data=[_match_read(r) for r in rows])


@router.get("/matches", response_model=PriceUpdateMatchListResponse)
def get_price_update_matches(
    product_ids: str = Query(..., description="Comma-separated catalog product ids"),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchListResponse:
    ids = [p.strip() for p in product_ids.split(",") if p.strip()]
    rows = svc.list_matches(db, company_id=company_id, product_ids=ids)
    return PriceUpdateMatchListResponse(data=[_match_read(r) for r in rows])


@router.post("/matches/manual-url", response_model=PriceUpdateMatchRead)
def set_manual_match_url(
    payload: PriceUpdateSetUrlRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchRead:
    row = svc.set_manual_match(
        db,
        company_id=company_id,
        product_id=payload.product_id,
        competitor=payload.competitor,
        url=payload.url,
        verified=payload.verified,
        verified_by=user.name or user.email,
    )
    return _match_read(row)


class PriceUpdateRemoveLinkRequest(BaseModel):
    product_id: str
    competitor: str


@router.post("/matches/remove-link", response_model=PriceUpdateMatchRead)
def remove_match_link(
    payload: PriceUpdateRemoveLinkRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchRead:
    """Remove the saved competitor link for one product (its price and stock go with it)."""
    row = svc.remove_match_link(db, company_id=company_id, product_id=payload.product_id, competitor=payload.competitor)
    return _match_read(row)


@router.post("/matches/{match_id}/verify", response_model=PriceUpdateMatchRead)
def verify_match_link(
    match_id: str,
    payload: PriceUpdateVerifyRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchRead:
    """Mark (or unmark) a saved link as checked by an admin."""
    row = db.get(PriceUpdateMatch, match_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Link not found")
    if payload.verified and not row.matched_url:
        raise HTTPException(status_code=400, detail="There's no link to verify yet")
    svc.set_verified(row, payload.verified, user.name or user.email)
    db.commit()
    db.refresh(row)
    return _match_read(row)


@router.post("/refresh", response_model=PriceUpdateMatchListResponse)
def refresh_price_update_matches(
    payload: PriceUpdateRefreshRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchListResponse:
    settings = svc.get_or_create_settings(db, company_id)
    if not settings.installed or not settings.enabled:
        raise HTTPException(status_code=400, detail="Install and enable the Price Update plugin first")

    competitors = (
        [payload.competitor]
        if payload.competitor
        else [c.id for c in svc.enabled_competitors(db, company_id)]
    )
    if not competitors:
        raise HTTPException(status_code=400, detail="No competitors enabled")

    # Small, synchronous, on-demand refresh — "real-time" means "fetched right now when you click".
    # Bounded so one request can't hang on many slow competitor fetches.
    MAX_PRODUCTS_PER_CALL = 20
    product_ids = [
        pid
        for pid in payload.product_ids[:MAX_PRODUCTS_PER_CALL]
        if (p := db.get(CatalogProduct, pid)) is not None and (p.company_id or "default") == company_id
    ]

    # Each competitor site is read in its own thread (with its own DB session): sites wait on
    # their own pacing, not on each other, so five products × three sites take about as long as
    # five products on one site. Within a site, pages are still read one at a time.
    def run_site(competitor: str) -> list[tuple[str, str, PriceUpdateMatchRead]]:
        site_db = SessionLocal()
        try:
            site_settings = svc.get_or_create_settings(site_db, company_id)
            out = []
            for pid in product_ids:
                product = site_db.get(CatalogProduct, pid)
                if product is None:
                    continue
                try:
                    match = svc.refresh_product_competitor(
                        site_db,
                        company_id=company_id,
                        product=product,
                        competitor=competitor,
                        settings=site_settings,
                        allow_ai=payload.allow_ai,
                    )
                except Exception:
                    site_db.rollback()
                    logger.exception("Price refresh failed for %s on %s", pid, competitor)
                    continue
                out.append((pid, competitor, _match_read(match)))
            return out
        finally:
            site_db.close()

    if len(competitors) == 1:
        rows = run_site(competitors[0])
    else:
        with ThreadPoolExecutor(max_workers=min(len(competitors), 8)) as pool:
            rows = [r for site_rows in pool.map(run_site, competitors) for r in site_rows]
    order = {pid: i for i, pid in enumerate(product_ids)}
    site_order = {c: i for i, c in enumerate(competitors)}
    rows.sort(key=lambda r: (order.get(r[0], 0), site_order.get(r[1], 0)))
    results = [r[2] for r in rows]
    return PriceUpdateMatchListResponse(data=results)


# ── "Send to AgainERP" browser extension ─────────────────────────────────────


def _capture_product(product: CatalogProduct, likely: bool = False) -> PriceCaptureProduct:
    return PriceCaptureProduct(
        id=product.id, name=product.name, sku=product.sku, price=product.price,
        thumbnail=product.thumbnail, likely=likely,
    )


@router.post("/capture/lookup", response_model=PriceCaptureLookupResponse)
def lookup_captured_page(
    payload: PriceCaptureLookupRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceCaptureLookupResponse:
    """Which competitor this page is, and which of our products it probably is."""
    site = price_capture.competitor_for_url(db, company_id, payload.url)
    linked = [
        db.get(CatalogProduct, m.product_id)
        for m in price_capture.linked_products(db, company_id, payload.url)
    ]
    linked = [p for p in linked if p is not None]
    linked_ids = {p.id for p in linked}
    suggestions = [
        _capture_product(p, ok)
        for p, ok in price_capture.suggest_products(db, company_id, payload.title, payload.price)
        if p.id not in linked_ids
    ]
    return PriceCaptureLookupResponse(
        domain=price_capture.site_domain(payload.url),
        competitor=_competitor_read(site) if site else None,
        linked=[_capture_product(p, True) for p in linked],
        suggestions=suggestions,
    )


@router.post("/capture", response_model=PriceUpdateMatchRead)
def save_captured_price(
    payload: PriceCaptureRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchRead:
    """Save a price read in the admin's own browser — no server-side fetch, so bot checks
    (Cloudflare) on the competitor's site don't matter."""
    row = price_capture.save_capture(
        db,
        company_id=company_id,
        product_id=payload.product_id,
        url=payload.url,
        competitor=payload.competitor,
        add_competitor_label=payload.add_competitor_label,
        title=payload.title,
        price=payload.price,
        regular_price=payload.regular_price,
        in_stock=payload.in_stock,
        stock_label=payload.stock_label,
    )
    return _match_read(row)


@router.get("/capture/queue", response_model=PriceSyncQueueResponse)
def get_browser_sync_queue(
    stale_hours: float = Query(3, ge=0, le=24 * 30),
    limit: int = Query(40, ge=1, le=200),
    only_failed: bool = Query(False, description="Only links the server couldn't read"),
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> PriceSyncQueueResponse:
    """Saved links the extension's auto-sync should re-read now."""
    rows = price_capture.sync_queue(db, company_id, stale_hours=stale_hours, limit=limit, only_failed=only_failed)
    return PriceSyncQueueResponse(
        data=[
            PriceSyncQueueItem(
                match_id=m.id, product_id=p.id, product_name=p.name, competitor=site.id,
                competitor_label=site.label, competitor_domain=site.domain, url=m.matched_url, status=m.status,
            )
            for m, p, site in rows
        ]
    )


@router.post("/capture/auto", response_model=PriceUpdateMatchRead)
def save_browser_sync_result(
    payload: PriceSyncResultRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceUpdateMatchRead:
    row = price_capture.save_auto_result(
        db,
        company_id=company_id,
        match_id=payload.match_id,
        page_url=payload.page_url,
        title=payload.title,
        price=payload.price,
        regular_price=payload.regular_price,
        in_stock=payload.in_stock,
        stock_label=payload.stock_label,
        error=payload.error,
    )
    return _match_read(row)


@router.post("/capture/discover", response_model=PriceDiscoverStepResponse)
def discover_link_step(
    payload: PriceDiscoverStepRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceDiscoverStepResponse:
    """Browser-assisted link discovery for sites that block this server: the extension reads
    the sitemap files we ask for, then opens the candidate pages we return."""
    result = price_capture.discover_step(
        db, company_id=company_id, product_id=payload.product_id, competitor=payload.competitor,
        documents=[d.model_dump() for d in payload.documents],
    )
    return PriceDiscoverStepResponse(**result)


@router.post("/capture/discover/confirm", response_model=PriceDiscoverConfirmResponse)
def discover_link_confirm(
    payload: PriceDiscoverConfirmRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PriceDiscoverConfirmResponse:
    ok, reason, match = price_capture.discover_confirm(
        db, company_id=company_id, product_id=payload.product_id, competitor=payload.competitor,
        url=payload.url, title=payload.title, price=payload.price, regular_price=payload.regular_price,
        in_stock=payload.in_stock, stock_label=payload.stock_label, closest=payload.closest,
    )
    return PriceDiscoverConfirmResponse(ok=ok, reason=reason, match=_match_read(match))


@router.post("/apply", response_model=PriceApplyResponse)
def apply_competitor_values(
    payload: PriceApplyRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PriceApplyResponse:
    """Copy the picked competitors' price or stock into our catalog products. dry_run=true only
    previews the changes (what the confirm dialog shows)."""
    from app.services.plugins import price_apply

    items = [(i.product_id, i.competitor) for i in payload.items][:2000]
    rows = (
        price_apply.plan(db, company_id=company_id, items=items, field=payload.field)
        if payload.dry_run
        else price_apply.apply(db, company_id=company_id, user=user, items=items, field=payload.field)
    )
    return PriceApplyResponse(data=[PriceApplyRow(**{k: v for k, v in r.items() if k != "new_status"}) for r in rows])
