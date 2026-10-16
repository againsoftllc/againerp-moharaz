"""Data for the shop's image sitemap: every product page's photos in one response.

The product list carries only the main photo; the previous shop's sitemap listed each product's whole gallery
(Google Images). One bulk query here instead of a product detail request per product."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog_product_media import CatalogProductMedia
from app.models.ecommerce_item import EcommerceItem
from app.models.media import Media
from app.routers.storefront_products import _public_media_url

router = APIRouter(prefix="/sitemap", tags=["storefront-sitemap"])


@router.get("/product-images")
def product_images(response: Response, db: Session = Depends(get_db)) -> dict:
    """{slug: [image url, …]} for every product whose page answers (listed, or unlisted but served by URL — the
    same products the product sitemap lists), photos in gallery order."""
    rows = (
        db.query(EcommerceItem.slug, Media.url)
        .join(CatalogProductMedia, CatalogProductMedia.product_id == EcommerceItem.catalog_product_id)
        .join(Media, Media.id == CatalogProductMedia.media_id)
        .filter(
            EcommerceItem.publish_status.in_(("published", "hidden")),
            EcommerceItem.visibility.in_(("public", "private")),
            Media.media_type == "image",
            Media.url.isnot(None),
        )
        .order_by(EcommerceItem.slug, CatalogProductMedia.sort_order, CatalogProductMedia.created_at)
        .all()
    )
    out: dict[str, list[str]] = defaultdict(list)
    for slug, url in rows:
        u = _public_media_url(url)
        if u and u not in out[slug]:
            out[slug].append(u)
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"data": out, "meta": {"products": len(out), "images": sum(len(v) for v in out.values())}}
