from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.marketing_tracking_plugin import DEFAULT_PIXEL_EVENTS, MarketingTrackingSite
from app.models.workspace_site import WorkspaceSite
from app.schemas.marketing_tracking_plugin import (
    CapiTestResponse,
    CapiTestResult,
    MarketingTrackingPluginRead,
    MarketingTrackingPluginResponse,
    MarketingTrackingPluginUpdate,
    MarketingTrackingSiteRead,
    MarketingTrackingSiteResponse,
    MarketingTrackingSiteUpdate,
)
from app.services.cloudflare_client import _mask_hint
from app.services.marketing_tracking import (
    GA4_RE,
    GTM_RE,
    PIXEL_RE,
    build_user_data,
    capi_event,
    clean_id,
    get_plugin,
    send_capi,
    site_events,
)

router = APIRouter(prefix="/plugins/marketing-tracking", tags=["plugins-marketing-tracking"])


def _sites(db: Session) -> list[WorkspaceSite]:
    return db.query(WorkspaceSite).order_by(WorkspaceSite.is_primary.desc(), WorkspaceSite.name).all()


def _site_read(site: WorkspaceSite, row: MarketingTrackingSite | None) -> MarketingTrackingSiteRead:
    return MarketingTrackingSiteRead(
        site_id=site.id,
        site_name=site.name or site.code or site.id,
        site_code=site.code or "",
        site_domain=site.primary_domain or "",
        configured=row is not None,
        enabled=row.enabled if row else True,
        gtm_id=row.gtm_id if row else "",
        ga4_id=row.ga4_id if row else "",
        fb_pixel_id=row.fb_pixel_id if row else "",
        pixel_events=site_events(row),
        capi_enabled=row.capi_enabled if row else False,
        capi_access_token_set=bool(row and row.capi_access_token),
        capi_access_token_hint=_mask_hint(row.capi_access_token) if row else "",
        capi_test_event_code=row.capi_test_event_code if row else "",
        capi_last_status=row.capi_last_status if row else "",
        capi_last_sent_at=row.capi_last_sent_at if row else None,
    )


def _read(db: Session) -> MarketingTrackingPluginRead:
    plugin = get_plugin(db)
    rows = {r.site_id: r for r in db.query(MarketingTrackingSite).all()}
    return MarketingTrackingPluginRead(
        id=plugin.id,
        installed=plugin.installed,
        enabled=plugin.enabled,
        available_events=list(DEFAULT_PIXEL_EVENTS),
        sites=[_site_read(s, rows.get(s.id)) for s in _sites(db)],
    )


def _site_or_404(db: Session, site_id: str) -> WorkspaceSite:
    site = db.get(WorkspaceSite, site_id) or db.query(WorkspaceSite).filter(WorkspaceSite.code == site_id).first()
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@router.get("", response_model=MarketingTrackingPluginResponse)
def get_marketing_tracking(db: Session = Depends(get_db), _: AuthUser = Depends(get_current_user)):
    return MarketingTrackingPluginResponse(data=_read(db))


@router.post("/install", response_model=MarketingTrackingPluginResponse)
def install_marketing_tracking(db: Session = Depends(get_db), _: AuthUser = Depends(require_write_access)):
    plugin = get_plugin(db)
    plugin.installed = True
    plugin.enabled = True
    db.commit()
    return MarketingTrackingPluginResponse(data=_read(db))


@router.delete("/install", response_model=MarketingTrackingPluginResponse)
def uninstall_marketing_tracking(db: Session = Depends(get_db), _: AuthUser = Depends(require_write_access)):
    """Stops every site's tags. The per-site settings are kept, so installing again restores them."""
    plugin = get_plugin(db)
    plugin.installed = False
    plugin.enabled = False
    db.commit()
    return MarketingTrackingPluginResponse(data=_read(db))


@router.patch("", response_model=MarketingTrackingPluginResponse)
def update_marketing_tracking(
    payload: MarketingTrackingPluginUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
):
    plugin = get_plugin(db)
    if payload.enabled is not None:
        if payload.enabled and not plugin.installed:
            raise HTTPException(status_code=400, detail="Install the plugin first")
        plugin.enabled = payload.enabled
    db.commit()
    return MarketingTrackingPluginResponse(data=_read(db))


@router.patch("/sites/{site_id}", response_model=MarketingTrackingSiteResponse)
def update_marketing_tracking_site(
    site_id: str,
    payload: MarketingTrackingSiteUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
):
    site = _site_or_404(db, site_id)
    row = db.get(MarketingTrackingSite, site.id)
    if row is None:
        row = MarketingTrackingSite(site_id=site.id, company_id=site.company_id or "default",
                                    pixel_events_json=json.dumps(DEFAULT_PIXEL_EVENTS))
        db.add(row)
    try:
        if payload.gtm_id is not None:
            row.gtm_id = clean_id(payload.gtm_id, GTM_RE, "Google Tag Manager ID (GTM-XXXXXXX)")
        if payload.ga4_id is not None:
            row.ga4_id = clean_id(payload.ga4_id, GA4_RE, "GA4 Measurement ID (G-XXXXXXXXXX)")
        if payload.fb_pixel_id is not None:
            row.fb_pixel_id = clean_id(payload.fb_pixel_id, PIXEL_RE, "Meta Pixel ID (digits only)")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.pixel_events is not None:
        unknown = [e for e in payload.pixel_events if e not in DEFAULT_PIXEL_EVENTS]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown events: {', '.join(unknown)}")
        row.pixel_events_json = json.dumps([e for e in DEFAULT_PIXEL_EVENTS if e in payload.pixel_events])
    if payload.clear_capi_access_token:
        row.capi_access_token = ""
    elif payload.capi_access_token and payload.capi_access_token.strip():
        row.capi_access_token = payload.capi_access_token.strip()
    if payload.capi_test_event_code is not None:
        row.capi_test_event_code = payload.capi_test_event_code.strip()[:40]
    if payload.capi_enabled is not None:
        row.capi_enabled = payload.capi_enabled
    db.commit()
    db.refresh(row)
    return MarketingTrackingSiteResponse(data=_site_read(site, row))


@router.post("/sites/{site_id}/test-capi", response_model=CapiTestResponse)
def test_marketing_tracking_capi(
    site_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
):
    """Sends one PageView with the site's test event code; it shows under Events Manager → Test events."""
    site = _site_or_404(db, site_id)
    row = db.get(MarketingTrackingSite, site.id)
    if row is None:
        raise HTTPException(status_code=400, detail="Save the site's Pixel settings first")
    url = f"https://{site.primary_domain}/" if site.primary_domain else ""
    event = capi_event(
        event_name="PageView",
        event_id=f"capi-test-{uuid.uuid4().hex[:12]}",
        source_url=url,
        user_data=build_user_data(None, ip="", user_agent="AgainERP Conversions API test", fbp="", fbc=""),
    )
    ok, message = send_capi(row, [event], test=True)
    db.commit()
    return CapiTestResponse(data=CapiTestResult(ok=ok, message=message))
