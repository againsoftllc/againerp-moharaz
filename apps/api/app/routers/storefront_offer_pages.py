"""Public storefront deal / offer landing pages."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.marketing_offer import MarketingOffer
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

router = APIRouter(tags=["storefront-offer-pages"])

STOREFRONT_CACHE = "public, max-age=30"


def _set_cache(response: Response, value: str = STOREFRONT_CACHE) -> None:
    response.headers["Cache-Control"] = value


def _fmt_display(dt: datetime) -> str:
    return dt.strftime("%d %b %Y")


def _fmt_iso(dt: datetime) -> str:
    return dt.isoformat()


def _is_public(row: MarketingOffer, now: datetime) -> bool:
    if row.status == "disabled":
        return False
    if row.status == "draft":
        return False
    if row.status == "ended":
        return False
    if row.status == "running":
        return True
    if row.status == "scheduled":
        return row.starts_at <= now <= row.ends_at
    # fallback: treat unknown as live if within window
    return row.starts_at <= now <= row.ends_at


class StorefrontOfferSummary(BaseModel):
    slug: str
    title: str
    description: str
    image: str
    startDate: str
    endDate: str
    endDateISO: str
    outletLabel: str


class StorefrontOfferProduct(BaseModel):
    id: str
    item_id: str
    slug: str
    name: str
    price: float
    compare_at_price: Optional[float] = None
    thumbnail: Optional[str] = None
    brand: Optional[str] = None
    in_stock: bool = True


class StorefrontOfferSection(BaseModel):
    key: str
    label: str
    category_slug: str
    products: List[StorefrontOfferProduct]


class StorefrontOfferDetail(StorefrontOfferSummary):
    sections: List[StorefrontOfferSection]


class StorefrontOfferListResponse(BaseModel):
    data: List[StorefrontOfferSummary]


class StorefrontOfferDetailResponse(BaseModel):
    data: StorefrontOfferDetail


def _product_dict(view) -> StorefrontOfferProduct:
    return StorefrontOfferProduct(
        id=view.id,
        item_id=view.item_id,
        slug=view.slug,
        name=view.name,
        price=float(view.price),
        compare_at_price=float(view.compare_at_price) if view.compare_at_price is not None else None,
        thumbnail=view.thumbnail,
        brand=view.brand or None,
        in_stock=bool(view.in_stock),
    )


def _summary(row: MarketingOffer) -> StorefrontOfferSummary:
    return StorefrontOfferSummary(
        slug=row.slug,
        title=row.title,
        description=row.description or "",
        image=row.image_url or "/images/offers/placeholder.svg",
        startDate=_fmt_display(row.starts_at),
        endDate=_fmt_display(row.ends_at),
        endDateISO=_fmt_iso(row.ends_at),
        outletLabel=row.outlet_label or "All Outlet",
    )


def _detail(db: Session, row: MarketingOffer) -> StorefrontOfferDetail:
    from app.models.catalog_category import CatalogCategory
    from sqlalchemy import case

    catalog = StorefrontCatalogService(db)
    limit = max(1, min(int(getattr(row, "products_limit", 12) or 12), 48))
    sections: List[StorefrontOfferSection] = []
    for section in sorted(row.sections or [], key=lambda s: (s.sort_order, s.label)):
        slug = (section.category_slug or "").strip()
        if not slug:
            continue
        cat = (
            db.query(CatalogCategory)
            .filter(CatalogCategory.slug == slug)
            .order_by(
                case((CatalogCategory.channel == "catalog", 0), else_=1),
                CatalogCategory.sort_order.asc(),
            )
            .first()
        )
        if not cat:
            # Unknown slug must NOT fall through to unfiltered catalog dump.
            continue
        result = catalog.list_products(
            category_id=cat.id,
            per_page=limit,
            page=1,
        )
        products = [_product_dict(v) for v in result.items]
        if not products:
            continue
        sections.append(
            StorefrontOfferSection(
                key=section.key or section.category_slug,
                label=section.label,
                category_slug=section.category_slug,
                products=products,
            )
        )
    base = _summary(row)
    return StorefrontOfferDetail(**base.model_dump(), sections=sections)


@router.get("/offer-pages", response_model=StorefrontOfferListResponse)
def list_offer_pages(response: Response, db: Session = Depends(get_db)) -> StorefrontOfferListResponse:
    _set_cache(response)
    now = datetime.utcnow()
    rows = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .order_by(MarketingOffer.sort_order.asc(), MarketingOffer.starts_at.desc())
        .all()
    )
    live = [row for row in rows if _is_public(row, now)]
    # Prefer running within date window for listing
    visible: List[MarketingOffer] = []
    for row in live:
        if row.ends_at < now:
            continue
        if row.status == "scheduled" and row.starts_at > now:
            continue
        if row.status in {"running", "scheduled"} or (row.starts_at <= now <= row.ends_at):
            visible.append(row)
    return StorefrontOfferListResponse(data=[_summary(row) for row in visible])


@router.get("/offer-pages/{slug}", response_model=StorefrontOfferDetailResponse)
def get_offer_page(
    slug: str,
    response: Response,
    db: Session = Depends(get_db),
) -> StorefrontOfferDetailResponse:
    _set_cache(response)
    clean = slug.strip().strip("/")
    row = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .filter(MarketingOffer.slug == clean)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    now = datetime.utcnow()
    if not _is_public(row, now) and row.status not in {"running", "scheduled"}:
        raise HTTPException(status_code=404, detail="Offer not found")
    detail = _detail(db, row)
    if not detail.sections and row.status != "running":
        # still show hero for empty catalog categories when offer is running
        pass
    return StorefrontOfferDetailResponse(data=detail)
