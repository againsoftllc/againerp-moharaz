"""Flat URL slug resolution for storefront routing (STEP 04)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.storefront_products import _attach_review_stats, _detail_from_ec
from app.schemas.storefront import (
    StorefrontBrandResolve,
    StorefrontCategoryResolve,
    StorefrontSlugResolveResponse,
)
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

router = APIRouter(prefix="/resolve", tags=["storefront-resolve"])

STOREFRONT_CACHE = "public, max-age=60, s-maxage=120, stale-while-revalidate=300"


@router.get("/{slug}", response_model=StorefrontSlugResolveResponse)
def resolve_storefront_slug(slug: str, response: Response, db: Session = Depends(get_db)) -> StorefrontSlugResolveResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    normalized = slug.strip().lower()
    if not normalized:
        raise HTTPException(status_code=404, detail="Not found")

    service = StorefrontCatalogService(db)
    resolved = service.resolve_slug(normalized)
    if not resolved:
        raise HTTPException(status_code=404, detail="Not found")

    entity_type = resolved["type"]
    if entity_type == "product":
        ec = service.get_ec_by_slug(normalized)
        view = service.get_by_slug(normalized)
        if not view or not ec:
            raise HTTPException(status_code=404, detail="Not found")
        detail = _detail_from_ec(view, ec, db)
        if resolved.get("seo_title") and not detail.seo_title:
            detail = detail.model_copy(update={"seo_title": resolved["seo_title"]})
        if resolved.get("seo_description") and not detail.seo_description:
            detail = detail.model_copy(update={"seo_description": resolved["seo_description"]})
        related = _attach_review_stats(db, service.related(normalized))
        return StorefrontSlugResolveResponse(
            type="product",
            slug=normalized,
            product=detail,
            related=related,
        )

    if entity_type == "category":
        cat = resolved["category"]
        return StorefrontSlugResolveResponse(
            type="category",
            slug=normalized,
            category=StorefrontCategoryResolve(**cat),
        )

    if entity_type == "brand":
        brand = resolved["brand"]
        return StorefrontSlugResolveResponse(
            type="brand",
            slug=normalized,
            brand=StorefrontBrandResolve(**brand),
        )

    raise HTTPException(status_code=404, detail="Not found")
