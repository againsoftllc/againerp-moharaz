"""Public storefront category + brand nav (Monarch / storefront chrome)."""

from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.storefront import (
    StorefrontBrandNavRead,
    StorefrontBrandNavResponse,
    StorefrontCategoryNavNode,
    StorefrontCategoryNavResponse,
)
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

router = APIRouter(tags=["storefront-nav"])

STOREFRONT_CACHE = "public, max-age=60, s-maxage=120, stale-while-revalidate=300"


def _category_node(raw: dict) -> StorefrontCategoryNavNode:
    return StorefrontCategoryNavNode(
        id=raw["id"],
        slug=raw["slug"],
        name=raw["name"],
        parent_id=raw.get("parent_id"),
        icon_url=raw.get("icon_url"),
        banner_url=raw.get("banner_url"),
        show_in_top_menu=bool(raw.get("show_in_top_menu", False)),
        china_search_keyword=raw.get("china_search_keyword"),
        children=[_category_node(child) for child in raw.get("children", [])],
    )


@router.get("/categories", response_model=StorefrontCategoryNavResponse)
def storefront_categories(
    response: Response,
    db: Session = Depends(get_db),
    channel: Optional[Literal["catalog", "dropshipping"]] = Query(
        default="dropshipping",
        description="catalog = Catalog → Categories · dropshipping = Dropshipping frontstore tree",
    ),
) -> StorefrontCategoryNavResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    tree = StorefrontCatalogService(db).list_categories(channel=channel or "dropshipping")
    return StorefrontCategoryNavResponse(data=[_category_node(node) for node in tree])


@router.get("/brands", response_model=StorefrontBrandNavResponse)
def storefront_brands(
    response: Response,
    db: Session = Depends(get_db),
    channel: Optional[Literal["catalog", "dropshipping"]] = Query(
        default="dropshipping",
        description="catalog = Catalog → Brands · dropshipping = Dropshipping frontstore strip",
    ),
) -> StorefrontBrandNavResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    brands = StorefrontCatalogService(db).list_brands(channel=channel or "dropshipping")
    return StorefrontBrandNavResponse(data=[StorefrontBrandNavRead(**b) for b in brands])


class StorefrontBrandCategoryRead(BaseModel):
    slug: str
    name: str
    count: int


class StorefrontBrandDirectoryRead(BaseModel):
    id: str
    slug: str
    name: str
    logo_url: Optional[str] = None
    product_count: int
    categories: List[StorefrontBrandCategoryRead]  # top-level categories it sells in, most products first


class StorefrontBrandDirectoryResponse(BaseModel):
    data: List[StorefrontBrandDirectoryRead]
    categories: List[StorefrontBrandCategoryRead]  # top-level categories with brands (count = brands), for the filter


@router.get("/brands/directory", response_model=StorefrontBrandDirectoryResponse)
def storefront_brand_directory(response: Response, db: Session = Depends(get_db)) -> StorefrontBrandDirectoryResponse:
    """The A–Z brands page: every active catalog brand that has products in the shop, with how many and the
    top-level categories (Laptop, Monitor, PC Components …) they are in. Brands with nothing listed are left out."""
    from app.models.catalog_brand import CatalogBrand
    from app.models.catalog_category import CatalogCategory
    from app.models.ecommerce_item import EcommerceItem

    response.headers["Cache-Control"] = STOREFRONT_CACHE
    rows = (
        StorefrontCatalogService(db)
        ._base_query()
        .outerjoin(CatalogCategory, CatalogCategory.id == EcommerceItem.primary_category_id)
        .filter(EcommerceItem.brand_id.isnot(None))
        .with_entities(EcommerceItem.brand_id, CatalogCategory.path, func.count(EcommerceItem.item_id))
        .group_by(EcommerceItem.brand_id, CatalogCategory.path)
        .all()
    )
    totals: dict = {}
    per_root: dict = {}
    for brand_id, path, n in rows:
        totals[brand_id] = totals.get(brand_id, 0) + n
        root = (path or "").strip("/").split("/")[0]
        if root:
            per_root.setdefault(brand_id, {}).setdefault(root, 0)
            per_root[brand_id][root] += n

    roots = {
        c.id: c
        for c in db.query(CatalogCategory).filter(
            CatalogCategory.id.in_({r for m in per_root.values() for r in m}), CatalogCategory.is_active.is_(True)
        )
    }
    brands = (
        db.query(CatalogBrand)
        .filter(CatalogBrand.id.in_(list(totals)), CatalogBrand.is_active.is_(True), CatalogBrand.channel == "catalog")
        .order_by(CatalogBrand.name.asc())
        .all()
    )
    out, brands_per_root = [], {}
    for b in brands:
        cats = sorted(((roots[r], n) for r, n in per_root.get(b.id, {}).items() if r in roots), key=lambda x: (-x[1], x[0].name))
        for c, _n in cats:
            brands_per_root[c.id] = brands_per_root.get(c.id, 0) + 1
        out.append(
            StorefrontBrandDirectoryRead(
                id=b.id,
                slug=b.slug,
                name=b.name,
                logo_url=b.logo_url,
                product_count=totals[b.id],
                categories=[StorefrontBrandCategoryRead(slug=c.slug, name=c.name, count=n) for c, n in cats],
            )
        )
    filters = sorted(brands_per_root.items(), key=lambda x: (-x[1], roots[x[0]].name))
    return StorefrontBrandDirectoryResponse(
        data=out, categories=[StorefrontBrandCategoryRead(slug=roots[r].slug, name=roots[r].name, count=n) for r, n in filters]
    )

