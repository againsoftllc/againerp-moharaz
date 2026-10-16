"""Public storefront bundles — the published bundles from Website → Bundles (catalog_bundles), each with its
products as storefront list items at today's prices, and the bundle price worked out from its pricing mode:

- sum_discount: the items' total (today's prices) less `discount_percent`
- fixed: `bundle_price`

A bundle is only listed while every one of its products is live on the storefront and in stock, and it never
takes more than MAX_BUNDLE_DISCOUNT_PERCENT (5%) off the items' total."""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog_bundle import CatalogBundle
from app.routers.catalog_bundles import _bundle_price
from app.models.ecommerce_item import EcommerceItem
from app.schemas.storefront import StorefrontProductRead
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService

router = APIRouter(prefix="/bundles", tags=["storefront-bundles"])

PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300"


class StorefrontBundleItem(StorefrontProductRead):
    quantity: int = 1


class StorefrontBundleRead(BaseModel):
    slug: str
    name: str
    tagline: str = ""
    type: str = "General"
    thumbnail: Optional[str] = None
    pricing_mode: str
    items: List[StorefrontBundleItem] = Field(default_factory=list)
    total: float
    price: float
    save: float
    pct: int
    stock_status: str


class StorefrontBundleListResponse(BaseModel):
    data: List[StorefrontBundleRead]
    meta: dict


class StorefrontBundleResponse(BaseModel):
    data: StorefrontBundleRead


def _bundle_read(db: Session, bundle: CatalogBundle) -> Optional[StorefrontBundleRead]:
    """None when the bundle has no products, or one of them isn't on the storefront any more or is out of stock."""
    from app.routers.storefront_products import _attach_review_stats

    items_svc = EcommerceItemService(db)
    components = [c for c in (bundle.components_json or []) if isinstance(c, dict) and c.get("product_id")]
    if not components:
        return None
    views, quantities = [], []
    for c in components:
        pid = str(c["product_id"])
        ec = db.query(EcommerceItem).filter(EcommerceItem.catalog_product_id == pid).first()
        if ec is None:
            ec = db.query(EcommerceItem).filter(EcommerceItem.item_id == pid).first()
        view = items_svc.resolve_storefront_from_ecommerce(ec) if ec else None
        # a bundle with a product the shop can't sell right now isn't offered at all
        if view is None or not view.in_stock or (view.stock_status or "in_stock") != "in_stock":
            return None
        views.append(view)
        quantities.append(max(1, int(c.get("quantity") or 1)))

    reads = _attach_review_stats(db, views)
    items = [StorefrontBundleItem(**r.model_dump(), quantity=q) for r, q in zip(reads, quantities)]
    total = sum(Decimal(str(v.price)) * q for v, q in zip(views, quantities))
    # the same rule the admin uses (catalog_bundles._bundle_price), on today's prices
    price = min(
        _bundle_price(total, bundle.pricing_mode, Decimal(str(bundle.bundle_price or 0)), Decimal(str(bundle.discount_percent or 0))),
        total,
    )
    save = total - price

    statuses = [(v.stock_status or ("in_stock" if v.in_stock else "out_of_stock")) for v in views]
    if any(not v.in_stock for v in views) and "pre_order" not in statuses:
        stock_status = "out_of_stock"
    elif any(s in ("pre_order", "coming_soon") for s in statuses):
        stock_status = "pre_order"
    elif all(v.in_stock for v in views):
        stock_status = "in_stock"
    else:
        stock_status = "out_of_stock"

    return StorefrontBundleRead(
        slug=bundle.slug,
        name=bundle.name,
        tagline=(bundle.description or "").strip(),
        type=bundle.category or "General",
        thumbnail=bundle.thumbnail,
        pricing_mode=bundle.pricing_mode,
        items=items,
        total=float(total),
        price=float(price),
        save=float(save),
        pct=round(float(save / total * 100)) if total else 0,
        stock_status=stock_status,
    )


@router.get("", response_model=StorefrontBundleListResponse)
def list_bundles(response: Response, db: Session = Depends(get_db)) -> StorefrontBundleListResponse:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    rows = (
        db.query(CatalogBundle)
        .filter(CatalogBundle.status == "published")
        .order_by(CatalogBundle.created_at.asc(), CatalogBundle.name.asc())
        .all()
    )
    out = [b for b in (_bundle_read(db, row) for row in rows) if b is not None]
    return StorefrontBundleListResponse(data=out, meta={"count": len(out)})


@router.get("/{slug}", response_model=StorefrontBundleResponse)
def get_bundle(slug: str, response: Response, db: Session = Depends(get_db)) -> StorefrontBundleResponse:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    row = db.query(CatalogBundle).filter(CatalogBundle.slug == slug, CatalogBundle.status == "published").first()
    bundle = _bundle_read(db, row) if row else None
    if bundle is None:
        raise HTTPException(status_code=404, detail="Bundle not found")
    return StorefrontBundleResponse(data=bundle)
