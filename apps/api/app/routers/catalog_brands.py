from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_product import CatalogProduct
from app.schemas.brand import (
    BrandCreate,
    BrandListMeta,
    BrandListResponse,
    BrandRead,
    BrandReorderRequest,
    BrandResponse,
    BrandUpdate,
)

router = APIRouter(prefix="/brands", tags=["catalog-brands"])


def _product_counts_by_brand(db: Session) -> Dict[str, int]:
    rows = (
        db.query(CatalogProduct.brand, CatalogProduct.id)
        .filter(CatalogProduct.brand.isnot(None))
        .all()
    )
    counts: Dict[str, int] = {}
    for name, _ in rows:
        if name:
            counts[name] = counts.get(name, 0) + 1
    return counts


def _to_read(row: CatalogBrand, product_counts: Dict[str, int]) -> BrandRead:
    data = BrandRead.model_validate(row)
    data.product_count = product_counts.get(row.name, 0)
    return data


def _next_sort_order(db: Session, channel: str = "catalog") -> int:
    max_order = (
        db.query(CatalogBrand.sort_order)
        .filter(CatalogBrand.channel == channel)
        .order_by(CatalogBrand.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


@router.get("", response_model=BrandListResponse)
def list_brands(
    db: Session = Depends(get_db),
    channel: Optional[str] = Query(
        default=None,
        pattern="^(catalog|dropshipping)$",
        description="Filter Catalog vs Dropshipping (frontstore) brands",
    ),
) -> BrandListResponse:
    query = db.query(CatalogBrand)
    if channel:
        query = query.filter(CatalogBrand.channel == channel)
    rows = query.order_by(CatalogBrand.sort_order, CatalogBrand.name).all()
    product_counts = _product_counts_by_brand(db)
    data = [_to_read(r, product_counts) for r in rows]
    return BrandListResponse(data=data, meta=BrandListMeta(count=len(data)))


@router.patch("/reorder", response_model=BrandListResponse)
def reorder_brands(
    payload: BrandReorderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BrandListResponse:
    if not payload.ordered_ids:
        raise HTTPException(status_code=400, detail="ordered_ids required")

    first = db.get(CatalogBrand, payload.ordered_ids[0])
    if not first:
        raise HTTPException(status_code=404, detail="Brand not found")

    siblings = (
        db.query(CatalogBrand)
        .filter(CatalogBrand.channel == first.channel)
        .all()
    )
    row_map = {r.id: r for r in siblings}

    if set(payload.ordered_ids) != set(row_map.keys()):
        raise HTTPException(
            status_code=400,
            detail="ordered_ids must include all brands in this channel",
        )

    for index, brand_id in enumerate(payload.ordered_ids):
        row_map[brand_id].sort_order = index

    db.commit()

    all_rows = db.query(CatalogBrand).order_by(CatalogBrand.sort_order, CatalogBrand.name).all()
    product_counts = _product_counts_by_brand(db)
    data = [_to_read(r, product_counts) for r in all_rows]
    return BrandListResponse(data=data, meta=BrandListMeta(count=len(data)))


@router.get("/{brand_id}", response_model=BrandResponse)
def get_brand(brand_id: str, db: Session = Depends(get_db)) -> BrandResponse:
    row = db.get(CatalogBrand, brand_id)
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    product_counts = _product_counts_by_brand(db)
    return BrandResponse(data=_to_read(row, product_counts))


@router.post("", response_model=BrandResponse, status_code=201)
def create_brand(
    payload: BrandCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BrandResponse:
    existing = db.query(CatalogBrand).filter(CatalogBrand.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Brand slug already exists")

    data = payload.model_dump()
    # status and the live flag always agree: only a published brand is live
    status = data.get("status") or ("published" if data.get("is_active", True) else "unlisted")
    data["status"] = status
    data["is_active"] = status == "published"
    channel = data.get("channel") or "catalog"
    data["channel"] = channel
    row = CatalogBrand(**data)
    if payload.sort_order == 0:
        row.sort_order = _next_sort_order(db, channel)

    db.add(row)
    db.commit()
    db.refresh(row)

    product_counts = _product_counts_by_brand(db)
    return BrandResponse(data=_to_read(row, product_counts))


@router.patch("/{brand_id}", response_model=BrandResponse)
def update_brand(
    brand_id: str,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BrandResponse:
    row = db.get(CatalogBrand, brand_id)
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        product_counts = _product_counts_by_brand(db)
        return BrandResponse(data=_to_read(row, product_counts))

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = (
            db.query(CatalogBrand)
            .filter(CatalogBrand.slug == slug, CatalogBrand.id != brand_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Brand slug already exists")

    if changes.get("status"):
        changes["is_active"] = changes["status"] == "published"
    elif "is_active" in changes and changes["is_active"] is not None:
        # an older caller switches a brand on / off: on = published; off = unlisted (unless it is already draft / archived)
        changes["status"] = "published" if changes["is_active"] else (row.status if row.status != "published" else "unlisted")
    if changes.get("status") is None:
        changes.pop("status", None)

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    product_counts = _product_counts_by_brand(db)
    return BrandResponse(data=_to_read(row, product_counts))


@router.delete("/{brand_id}", status_code=204)
def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogBrand, brand_id)
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(row)
    db.commit()
