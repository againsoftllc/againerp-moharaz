"""Public storefront menus by slot (Monarch header / footer / catalog shop)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.website_menu import StorefrontMenuRead, StorefrontMenuResponse
from app.services.ttl_cache import TTLCache
from app.services.website_menu_service import resolve_storefront_slot

router = APIRouter(tags=["storefront-menus"])

STOREFRONT_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=120"

# Resolving the header menu (~1,100 category links, one lookup each) takes ~4 s, and every storefront page render asks
# for it. Kept for a minute per worker; the admin's menu edits clear it (routers/website_menus.py).
menu_cache = TTLCache(ttl=60)


@router.get("/menus/{slot_key:path}", response_model=StorefrontMenuResponse)
def storefront_menu(
    slot_key: str,
    response: Response,
    db: Session = Depends(get_db),
) -> StorefrontMenuResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    # Accept "footer.links" or URL-encoded variants.
    key = slot_key.strip().strip("/")
    cached = menu_cache.get(key)
    if cached is not None:
        return cached
    raw = resolve_storefront_slot(db, key)
    if not raw:
        raise HTTPException(status_code=404, detail="Menu slot not found")
    result = StorefrontMenuResponse(data=StorefrontMenuRead.model_validate(raw))
    menu_cache.set(key, result)
    return result
