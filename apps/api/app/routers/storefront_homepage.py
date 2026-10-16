"""Public storefront homepage content (Monarch home sections)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.website_homepage import HomepageContent, StorefrontHomepageResponse
from app.services.website_homepage_service import (
    ensure_homepage_category_pins,
    load_homepage_raw,
)

router = APIRouter(tags=["storefront-homepage"])

STOREFRONT_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=120"


@router.get("/homepage", response_model=StorefrontHomepageResponse)
def storefront_homepage(response: Response, db: Session = Depends(get_db)) -> StorefrontHomepageResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    row = ensure_homepage_category_pins(db)
    raw = load_homepage_raw(row)
    content = HomepageContent.model_validate(raw)
    return StorefrontHomepageResponse(data=content)
