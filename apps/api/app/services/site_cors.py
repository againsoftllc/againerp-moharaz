"""CORS origins derived from workspace_sites storefront URLs."""

from __future__ import annotations

import re
import threading
from typing import Iterable, Set
from urllib.parse import urlparse

_lock = threading.Lock()
_cached: Set[str] = set()
_loaded = False


def _origin_from_url(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not re.match(r"^https?://", value, re.I):
        value = f"https://{value}"
    try:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    except Exception:
        return None


def origins_from_site_row(row) -> Set[str]:
    found: Set[str] = set()
    for attr in (
        "storefront_url_local",
        "storefront_url_preview",
        "storefront_url_production",
    ):
        origin = _origin_from_url(getattr(row, attr, None))
        if origin:
            found.add(origin)
    domain = (getattr(row, "primary_domain", None) or "").strip()
    if domain:
        origin = _origin_from_url(domain)
        if origin:
            found.add(origin)
    aliases = (getattr(row, "domain_aliases", None) or "").split(",")
    for alias in aliases:
        origin = _origin_from_url(alias.strip())
        if origin:
            found.add(origin)
    return found


def refresh_site_cors_origins(db) -> list[str]:
    """Reload cache from all workspace sites. Returns sorted origin list."""
    from app.models.workspace_site import WorkspaceSite

    rows = db.query(WorkspaceSite).all()
    next_set: Set[str] = set()
    for row in rows:
        next_set |= origins_from_site_row(row)
    with _lock:
        global _cached, _loaded
        _cached = next_set
        _loaded = True
    return sorted(_cached)


def get_site_cors_origins(*, ensure_loaded: bool = True) -> list[str]:
    global _loaded
    if ensure_loaded and not _loaded:
        try:
            from app.database import SessionLocal

            db = SessionLocal()
            try:
                refresh_site_cors_origins(db)
            finally:
                db.close()
        except Exception:
            with _lock:
                _loaded = True
    with _lock:
        return sorted(_cached)


def is_site_cors_origin(origin: str | None) -> bool:
    if not origin:
        return False
    origins = get_site_cors_origins(ensure_loaded=True)
    return origin.rstrip("/") in origins or origin in origins


def merge_cors_origins(*groups: Iterable[str]) -> list[str]:
    merged: Set[str] = set()
    for group in groups:
        for item in group:
            cleaned = (item or "").strip().rstrip("/")
            if cleaned:
                merged.add(cleaned)
    return sorted(merged)
