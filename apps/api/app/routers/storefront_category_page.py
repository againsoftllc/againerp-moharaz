"""Public storefront category PLP template (Monarch catalog view)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.website_category_page import (
    CategoryPageContent,
    StorefrontCategoryPageResponse,
)
from app.services.website_category_page_service import (
    ensure_category_page,
    load_category_page_raw,
)

router = APIRouter(tags=["storefront-category-page"])

STOREFRONT_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=120"


@router.get("/category-page", response_model=StorefrontCategoryPageResponse)
def storefront_category_page(
    response: Response, db: Session = Depends(get_db)
) -> StorefrontCategoryPageResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    row = ensure_category_page(db)
    raw = load_category_page_raw(row)
    content = CategoryPageContent.model_validate(raw)
    return StorefrontCategoryPageResponse(data=content)
