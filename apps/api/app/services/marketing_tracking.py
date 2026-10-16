"""Marketing Tracking plugin: per-site Google Tag Manager / GA4 / Meta Pixel settings and the Meta Conversions API.

The storefront loads the tags from GET /storefront/tracking (no secrets) and posts each event it fires in the
browser to POST /storefront/tracking/events; that is sent on to Meta's Conversions API here with the site's access
token, under the same event_id, so Meta counts it once.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.marketing_tracking_plugin import (
    DEFAULT_PIXEL_EVENTS,
    MarketingTrackingPlugin,
    MarketingTrackingSite,
)
from app.models.workspace_site import WorkspaceSite

log = logging.getLogger(__name__)

PLUGIN_ID = "marketing-tracking-default"
GRAPH_API = "https://graph.facebook.com/v21.0"
GTM_RE = re.compile(r"^GTM-[A-Z0-9]{4,12}$")
GA4_RE = re.compile(r"^G-[A-Z0-9]{4,15}$")
PIXEL_RE = re.compile(r"^[0-9]{6,20}$")


def get_plugin(db: Session) -> MarketingTrackingPlugin:
    row = db.get(MarketingTrackingPlugin, PLUGIN_ID)
    if row is None:
        row = MarketingTrackingPlugin(id=PLUGIN_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def site_events(row: Optional[MarketingTrackingSite]) -> list[str]:
    if row is None:
        return list(DEFAULT_PIXEL_EVENTS)
    try:
        events = json.loads(row.pixel_events_json or "[]")
    except ValueError:
        events = []
    return [e for e in events if e in DEFAULT_PIXEL_EVENTS] if isinstance(events, list) else []


def clean_id(value: Optional[str], pattern: re.Pattern, label: str) -> str:
    """Trimmed, upper-cased tag id; ValueError when it is not one (empty clears it)."""
    v = (value or "").strip().upper()
    if v and not pattern.match(v):
        raise ValueError(f"{label} looks wrong: {value!r}")
    return v


def public_tracking(db: Session, site: Optional[WorkspaceSite]) -> dict[str, Any]:
    """The tags the storefront of this site loads; empty when the plugin or the site is switched off."""
    plugin = db.get(MarketingTrackingPlugin, PLUGIN_ID)
    if not plugin or not plugin.installed or not plugin.enabled or site is None:
        return {"enabled": False}
    row = db.get(MarketingTrackingSite, site.id)
    if row is None or not row.enabled:
        return {"enabled": False}
    return {
        "enabled": True,
        "gtm_id": row.gtm_id,
        "ga4_id": row.ga4_id,
        "fb_pixel_id": row.fb_pixel_id,
        "pixel_events": site_events(row) if row.fb_pixel_id else [],
        "capi": bool(row.fb_pixel_id and row.capi_enabled and row.capi_access_token),
    }


# ---------- Conversions API ----------

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _phone_e164_digits(raw: str) -> str:
    """Meta wants the phone with country code, digits only: 01XXXXXXXXX → 8801XXXXXXXXX."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("01") and len(digits) == 11:
        return "88" + digits
    return digits


def build_user_data(user: Optional[dict], *, ip: str, user_agent: str, fbp: str, fbc: str) -> dict[str, Any]:
    """Meta user_data: contact fields normalised and SHA-256 hashed, browser ids and IP / agent as they are."""
    out: dict[str, Any] = {}
    if ip:
        out["client_ip_address"] = ip
    if user_agent:
        out["client_user_agent"] = user_agent
    if fbp:
        out["fbp"] = fbp
    if fbc:
        out["fbc"] = fbc
    u = user or {}
    if (u.get("email") or "").strip():
        out["em"] = [_sha256(u["email"].strip().lower())]
    phone = _phone_e164_digits(u.get("phone") or "")
    if phone:
        out["ph"] = [_sha256(phone)]
    for key, field in (("fn", "first_name"), ("ln", "last_name"), ("ct", "city")):
        v = re.sub(r"\s+", "", (u.get(field) or "").strip().lower())
        if v:
            out[key] = [_sha256(v)]
    if (u.get("external_id") or "").strip():
        out["external_id"] = [_sha256(u["external_id"].strip())]
    out.setdefault("country", [_sha256("bd")])
    return out


def send_capi(row: MarketingTrackingSite, events: list[dict[str, Any]], *, test: bool = False) -> tuple[bool, str]:
    """POST events to Meta; records the outcome on the site row (caller commits)."""
    if not row.fb_pixel_id or not row.capi_access_token:
        return False, "Pixel ID and Conversions API access token are required"
    body: dict[str, Any] = {"data": events}
    if row.capi_test_event_code:
        body["test_event_code"] = row.capi_test_event_code
    elif test:
        return False, "Add a test event code (Events Manager → Test events) to send a test event"
    try:
        res = httpx.post(
            f"{GRAPH_API}/{row.fb_pixel_id}/events",
            params={"access_token": row.capi_access_token},
            json=body,
            timeout=10,
        )
        payload = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if res.status_code == 200:
            ok, msg = True, f"Meta accepted {payload.get('events_received', len(events))} event(s)"
        else:
            ok, msg = False, (payload.get("error") or {}).get("message") or f"HTTP {res.status_code}"
    except httpx.HTTPError as exc:
        ok, msg = False, f"Could not reach Meta: {exc.__class__.__name__}"
    row.capi_last_status = ("OK · " if ok else "Error · ") + msg[:480]
    row.capi_last_sent_at = datetime.utcnow()
    if not ok:
        log.warning("Meta CAPI %s: %s", row.site_id, msg)
    return ok, msg


def capi_event(
    *,
    event_name: str,
    event_id: str,
    source_url: str,
    user_data: dict[str, Any],
    custom_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "event_name": event_name,
        "event_time": int(time.time()),
        "event_id": event_id,
        "action_source": "website",
        "user_data": user_data,
    }
    if source_url:
        event["event_source_url"] = source_url
    if custom_data:
        event["custom_data"] = custom_data
    return event
