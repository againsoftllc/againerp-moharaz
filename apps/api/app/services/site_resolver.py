"""Resolve which storefront site a request belongs to, from its host.

The storefront never told the API which site it was, so every request fell back
to whichever row happened to be primary. Matching on the incoming host lets a
second storefront serve its own settings without any per-deployment config.

The browser talks to the storefront's own origin and Next proxies onward, which
drops the original host; the proxy re-sends it as `X-Storefront-Host`. Server
components call the API directly and attach the same header themselves.

An unmatched host falls back to the primary site, so a misconfigured domain
degrades to today's behaviour instead of serving an empty storefront.
"""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.workspace_site import WorkspaceSite

SITE_HOST_HEADER = "x-storefront-host"


def _hostname(raw: Optional[str]) -> str:
    """Reduce a URL, origin or bare host to a lowercase hostname without port."""
    value = (raw or "").strip().lower()
    if not value:
        return ""
    if "//" not in value:
        value = f"//{value}"
    try:
        netloc = urlparse(value).netloc
    except Exception:
        return ""
    if not netloc:
        return ""
    if "@" in netloc:
        netloc = netloc.rsplit("@", 1)[1]
    # Strip the port, but keep IPv6 brackets intact.
    if netloc.startswith("["):
        netloc = netloc.split("]", 1)[0].lstrip("[")
    elif ":" in netloc:
        netloc = netloc.split(":", 1)[0]
    return netloc.removeprefix("www.")


def request_hostname(request: Optional[Request]) -> str:
    """Best guess at the storefront hostname behind this request."""
    if request is None:
        return ""
    headers = request.headers
    for candidate in (
        headers.get(SITE_HOST_HEADER),
        headers.get("origin"),
        headers.get("referer"),
    ):
        host = _hostname(candidate)
        if host:
            return host
    return ""


def site_hostnames(row: WorkspaceSite) -> set[str]:
    """Every hostname that should route to this site."""
    found: set[str] = set()
    for attr in (
        "primary_domain",
        "storefront_url_local",
        "storefront_url_preview",
        "storefront_url_production",
    ):
        host = _hostname(getattr(row, attr, None))
        if host:
            found.add(host)
    for alias in (getattr(row, "domain_aliases", None) or "").split(","):
        host = _hostname(alias)
        if host:
            found.add(host)
    return found


def request_site_options(db: Session, request: Optional[Request] = None) -> dict:
    """The Option-tab values for whichever site this request belongs to."""
    from app.services.site_store_options import load_site_options

    site = resolve_site(db, request)
    return load_site_options(site.options_json if site else None)


def resolve_site(db: Session, request: Optional[Request] = None) -> Optional[WorkspaceSite]:
    """The site this request is for, or the primary site when nothing matches."""
    from app.routers.workspace_sites import get_primary_site

    host = request_hostname(request)
    if host:
        for row in db.query(WorkspaceSite).all():
            if host in site_hostnames(row):
                return row
    return get_primary_site(db)
