"""Public lookups that keep the previous shop's URLs working after the move (storefront 301s).

GET /storefront/redirects/lookup?path=/old-url?query → the admin's SEO redirect for that URL
    (SEO → Redirects; old OpenCart links are matched through app.services.seo.legacy_urls)
GET /storefront/redirects/image?path=catalog/x.jpg → the imported copy of an old /image/… file
    (media.source_url keeps where each imported image came from; OpenCart's resized cache copies
    "cache/catalog/x-600x315w.webp" resolve to their original)
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.media import Media
from app.models.seo_redirect import SeoRedirect
from app.services.seo.legacy_urls import legacy_key

router = APIRouter(prefix="/redirects", tags=["storefront-redirects"])

CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
# the previous shop served its images under /image/ on whatever host it had; the importers stored
# source_url = <that host>/image/<quoted path>, so the lookup matches the path and never needs the host
OLD_IMAGE_PATH = "/image/"


class RedirectRead(BaseModel):
    from_path: str
    to_path: str
    redirect_type: str


class ImageRead(BaseModel):
    url: str


@router.get("/lookup", response_model=RedirectRead)
def lookup_redirect(response: Response, path: str = Query(..., max_length=2000), db: Session = Depends(get_db)) -> RedirectRead:
    key = legacy_key(path)
    row = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.from_path == key, SeoRedirect.status == "active", SeoRedirect.to_path.isnot(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No redirect")
    response.headers["Cache-Control"] = CACHE
    return RedirectRead(from_path=key, to_path=row.to_path, redirect_type=row.redirect_type or "301")


def _image_candidates(path: str) -> list[str]:
    rel = unquote(path).strip().lstrip("/")
    rel = re.sub(r"^image/", "", rel)
    out = [rel]
    if rel.startswith("cache/"):
        original = re.sub(r"-\d+x\d+[a-z]?(?=\.[A-Za-z0-9]+$)", "", rel[len("cache/"):])
        stem, _, _ext = original.rpartition(".")
        # the cache may have re-encoded the file (e.g. .jpg → .webp)
        out += [original] + [f"{stem}.{ext}" for ext in ("jpg", "jpeg", "png", "webp", "JPG", "PNG")]
    seen: list[str] = []
    for c in out:
        if c and c not in seen:
            seen.append(c)
    return seen


# old image path → imported photo URL ("" = not imported). Old-site image links (Google Images, other sites, old
# cached pages) repeat the same paths constantly; once answered they never take a database connection again.
_IMAGE_CACHE: dict[str, str] = {}
_IMAGE_CACHE_MAX = 50_000


@router.get("/image", response_model=ImageRead)
def lookup_image(response: Response, path: str = Query(..., max_length=1000)) -> ImageRead:
    url = _IMAGE_CACHE.get(path)
    if url is None:
        from app.database import SessionLocal

        db = SessionLocal()
        try:
            tails = [OLD_IMAGE_PATH + quote(c) for c in _image_candidates(path)]
            media: Optional[Media] = (db.query(Media)
                                      .filter(or_(*[Media.source_url.endswith(x, autoescape=True) for x in tails])).first())
            url = (media.url if media and media.url else "") or ""
        finally:
            db.close()
        if len(_IMAGE_CACHE) >= _IMAGE_CACHE_MAX:
            _IMAGE_CACHE.clear()
        _IMAGE_CACHE[path] = url
    if not url:
        raise HTTPException(status_code=404, detail="Image not imported")
    response.headers["Cache-Control"] = CACHE
    return ImageRead(url=url)
