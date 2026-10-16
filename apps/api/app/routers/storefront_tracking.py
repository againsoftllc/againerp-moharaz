"""Public Marketing Tracking endpoints for the storefront (site resolved from x-storefront-host)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.marketing_tracking_plugin import MarketingTrackingSite
from app.schemas.marketing_tracking_plugin import (
    StorefrontTrackingEvent,
    StorefrontTrackingRead,
    StorefrontTrackingResponse,
)
from app.services.marketing_tracking import build_user_data, capi_event, public_tracking, send_capi, site_events
from app.services.site_resolver import SITE_HOST_HEADER, resolve_site

router = APIRouter(prefix="/tracking", tags=["storefront-tracking"])


def _client_ip(request: Request) -> str:
    """The shopper's IP: the storefront proxy forwards the edge's x-real-ip / x-forwarded-for."""
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "")


@router.get("", response_model=StorefrontTrackingResponse)
def get_storefront_tracking(request: Request, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    response.headers["Vary"] = SITE_HOST_HEADER
    data = public_tracking(db, resolve_site(db, request))
    return StorefrontTrackingResponse(data=StorefrontTrackingRead(**data))


@router.post("/events", status_code=202)
def post_storefront_tracking_event(payload: StorefrontTrackingEvent, request: Request, db: Session = Depends(get_db)):
    """One browser event, sent on to Meta's Conversions API (same event_id → deduplicated with the Pixel).
    Answers 202 whatever happens, so a tracking problem never shows to the shopper."""
    site = resolve_site(db, request)
    config = public_tracking(db, site)
    if not config.get("capi") or payload.event_name not in config.get("pixel_events", []):
        return {"sent": False}
    row = db.get(MarketingTrackingSite, site.id)
    if row is None or payload.event_name not in site_events(row):
        return {"sent": False}
    user_data = build_user_data(
        payload.user.model_dump() if payload.user else None,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        fbp=payload.fbp or "",
        fbc=payload.fbc or "",
    )
    event = capi_event(
        event_name=payload.event_name,
        event_id=payload.event_id,
        source_url=payload.event_source_url or "",
        user_data=user_data,
        custom_data=payload.custom_data,
    )
    ok, _ = send_capi(row, [event])
    db.commit()
    return {"sent": ok}
