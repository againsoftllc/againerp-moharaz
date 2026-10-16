"""Againcart live-edit homepage CMS (opaque JSON) on the primary workspace site."""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.workspace_site import WorkspaceSite
from app.routers.workspace_sites import _sync_website_settings
from app.services.site_resolver import SITE_HOST_HEADER, resolve_site
from app.services.site_store_options import dump_site_options, load_site_options
from app.services.storefront_site_options import (
    STOREFRONT_OPTIONS_KEY,
    build_storefront_options,
)

router = APIRouter(tags=["storefront-cms"])

STOREFRONT_CACHE = "public, max-age=15, s-maxage=30, stale-while-revalidate=60"


def _assert_live_edit_secret(x_live_edit_secret: Optional[str]) -> None:
    expected = (os.getenv("LIVE_EDIT_SECRET") or os.getenv("STOREFRONT_LIVE_EDIT_SECRET") or "").strip()
    if not expected:
        return
    if not x_live_edit_secret or x_live_edit_secret.strip() != expected:
        raise HTTPException(status_code=401, detail="Live-edit secret required")


def _normalize_media_url(url: str | None) -> str:
    if not url:
        return ""
    value = url.strip()
    if not value:
        return ""
    if value.startswith("/uploads/"):
        return value
    marker = "/uploads/"
    idx = value.find(marker)
    if idx >= 0:
        return value[idx:]
    return value


def _load_cms(site: WorkspaceSite | None) -> dict[str, Any]:
    if not site:
        return {}
    raw = getattr(site, "storefront_cms_json", None) or ""
    if not raw or not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _sync_brand_from_cms(site: WorkspaceSite, content: dict[str, Any]) -> None:
    """Push header logos + footer contact from live-edit CMS into site brand fields."""
    header = content.get("header") if isinstance(content.get("header"), dict) else {}
    desktop = _normalize_media_url(str(header.get("logoDesktop") or ""))
    mobile = _normalize_media_url(str(header.get("logoMobile") or ""))
    if desktop:
        site.logo_url = desktop[:500]
    if mobile:
        site.logo_mobile_url = mobile[:500]
    elif desktop:
        site.logo_mobile_url = desktop[:500]

    footer = content.get("footer") if isinstance(content.get("footer"), dict) else {}
    address = str(footer.get("address") or "").strip()
    email = str(footer.get("email") or "").strip()
    phone = str(footer.get("supportPhone") or "").strip()
    whatsapp = str(footer.get("whatsappValue") or "").strip()
    hours = str(footer.get("supportHoursLabel") or "").strip()
    if address:
        site.address = address
    if email:
        site.contact_email = email[:255]
    if phone:
        site.contact_phone = phone[:50]
    if whatsapp:
        site.whatsapp_number = whatsapp[:50]
    if hours:
        site.business_hours = hours[:255]


def _sync_storefront_options_from_cms(site: WorkspaceSite, content: dict[str, Any]) -> None:
    """Mirror live-edit chrome into Site Settings → Storefront.

    Live-edit and Site Settings edit the same things from two screens. Writing
    back here keeps the admin form showing what the storefront actually renders
    instead of drifting into a stale second copy.
    """
    options = load_site_options(getattr(site, "options_json", None))
    storefront = build_storefront_options(options)

    header = content.get("header") if isinstance(content.get("header"), dict) else {}
    logo_alt = str(header.get("logoAlt") or "").strip()
    if logo_alt:
        storefront["header"]["logo_alt"] = logo_alt
    placeholder = str(header.get("searchPlaceholder") or "").strip()
    if placeholder:
        storefront["header"]["search_placeholder"] = placeholder

    cms_actions = header.get("actions") if isinstance(header.get("actions"), list) else []
    by_id = {
        str(a.get("id") or ""): a for a in cms_actions if isinstance(a, dict)
    }
    for action in storefront["header"]["actions"]:
        cur = by_id.get(action["id"])
        if not cur:
            continue
        action["label"] = str(cur.get("name") or "").strip() or action["label"]
        action["href"] = str(cur.get("href") or "").strip() or action["href"]
        action["enabled"] = cur.get("enabled", True) is not False

    footer = content.get("footer") if isinstance(content.get("footer"), dict) else {}
    hours = str(footer.get("supportHoursLabel") or "").strip()
    if hours:
        storefront["footer"]["support_hours"] = hours
    payment_image = _normalize_media_url(str(footer.get("paymentImage") or ""))
    if payment_image:
        storefront["footer"]["payment_image"] = payment_image

    memberships = footer.get("memberships")
    if isinstance(memberships, list):
        storefront["footer"]["memberships"] = [
            {
                "name": str(m.get("name") or "").strip(),
                "image": _normalize_media_url(str(m.get("image") or "")),
            }
            for m in memberships
            if isinstance(m, dict) and not m.get("hidden")
        ]

    socials = footer.get("social")
    if isinstance(socials, list):
        for row in socials:
            if not isinstance(row, dict) or row.get("hidden"):
                continue
            network = str(row.get("icon") or "").strip().lower()
            href = str(row.get("href") or "").strip()
            if network in storefront["social"] and href:
                storefront["social"][network] = href

    notice = content.get("notice") if isinstance(content.get("notice"), dict) else {}
    notice_text = str(notice.get("text") or "").strip()
    if notice_text:
        storefront["meta"]["notice_text"] = notice_text

    options[STOREFRONT_OPTIONS_KEY] = storefront
    site.options_json = dump_site_options(options)


class StorefrontCmsResponse(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class StorefrontCmsWrite(BaseModel):
    content: dict[str, Any]


@router.get("/cms", response_model=StorefrontCmsResponse)
def get_storefront_cms(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> StorefrontCmsResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    response.headers["Vary"] = SITE_HOST_HEADER
    return StorefrontCmsResponse(data=_load_cms(resolve_site(db, request)))


@router.put("/cms", response_model=StorefrontCmsResponse)
def put_storefront_cms(
    payload: StorefrontCmsWrite,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    x_live_edit_secret: Optional[str] = Header(default=None, alias="X-Live-Edit-Secret"),
) -> StorefrontCmsResponse:
    """Live-edit save — requires X-Live-Edit-Secret when configured."""
    _assert_live_edit_secret(x_live_edit_secret)
    response.headers["Cache-Control"] = "no-store"

    # Editing must land on the site the editor is previewing, not the primary one.
    site = resolve_site(db, request)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    content = payload.content if isinstance(payload.content, dict) else {}
    site.storefront_cms_json = json.dumps(content, ensure_ascii=False)
    _sync_brand_from_cms(site, content)
    _sync_storefront_options_from_cms(site, content)
    _sync_website_settings(db, site)
    db.commit()
    db.refresh(site)
    return StorefrontCmsResponse(data=_load_cms(site))
