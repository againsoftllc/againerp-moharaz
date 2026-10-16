from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_review import CatalogProductReview
from app.schemas.catalog_product_review import (
    ProductReviewCreate,
    ProductReviewListMeta,
    ProductReviewListResponse,
    ProductReviewRead,
    ProductReviewResponse,
    ProductReviewUpdate,
    ReviewMediaItem,
    dump_review_media,
    parse_review_media,
)
from app.services.core.sequence_service import next_number as allocate_number

router = APIRouter(prefix="/reviews", tags=["catalog-reviews"])

ALLOWED_STATUS = {"pending", "approved", "rejected", "archived", "spam"}
ALLOWED_TYPES = {"text", "photo", "video", "verified"}
ALLOWED_SENTIMENT = {"positive", "negative", "neutral", "mixed"}


def _to_read(row: CatalogProductReview) -> ProductReviewRead:
    media = parse_review_media(getattr(row, "media_json", None), row.customer_image_url)
    data = ProductReviewRead.model_validate(row)
    return data.model_copy(
        update={
            "media": media,
            "customer_image_url": media[0].url if media else row.customer_image_url,
        },
    )


def _apply_media(row: CatalogProductReview, media: List[ReviewMediaItem]) -> None:
    row.media_json = dump_review_media(media)
    row.customer_image_url = media[0].url if media else None
    if media and row.review_type == "text":
        if any(item.media_type == "video" for item in media):
            row.review_type = "video"
        elif any(item.media_type == "image" for item in media):
            row.review_type = "photo"


def _next_review_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "catalog.review",
        initial=lambda: 20001 + db.query(CatalogProductReview).count(),
    )


@router.get("", response_model=ProductReviewListResponse)
def list_reviews(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> ProductReviewListResponse:
    query = db.query(CatalogProductReview).order_by(CatalogProductReview.created_at.desc())

    if status:
        query = query.filter(CatalogProductReview.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            (CatalogProductReview.review_number.ilike(term))
            | (CatalogProductReview.product_name.ilike(term))
            | (CatalogProductReview.customer_name.ilike(term))
            | (CatalogProductReview.title.ilike(term)),
        )

    rows = query.all()
    data = [_to_read(row) for row in rows]
    pending = sum(1 for row in rows if row.status == "pending")
    return ProductReviewListResponse(
        data=data,
        meta=ProductReviewListMeta(count=len(data), pending_count=pending),
    )


@router.post("", response_model=ProductReviewResponse, status_code=201)
def create_review(
    payload: ProductReviewCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductReviewResponse:
    product = db.get(CatalogProduct, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    status = payload.status if payload.status in ALLOWED_STATUS else "pending"
    review_type = payload.review_type if payload.review_type in ALLOWED_TYPES else "text"
    sentiment = payload.sentiment if payload.sentiment in ALLOWED_SENTIMENT else "neutral"
    media = list(payload.media)
    if not media and payload.customer_image_url:
        media = [
            ReviewMediaItem(
                id="legacy-customer-image",
                url=payload.customer_image_url,
                name="Customer photo",
                media_type="image",
            ),
        ]

    row = CatalogProductReview(
        id=str(uuid.uuid4()),
        review_number=_next_review_number(db),
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku or "",
        product_brand=product.brand,
        product_category=product.category,
        product_image_url=product.thumbnail,
        customer_name=payload.customer_name.strip(),
        review_type=review_type,
        status=status,
        rating=payload.rating,
        title=payload.title.strip(),
        body=payload.body or "",
        sentiment=sentiment,
        is_verified_purchase=payload.is_verified_purchase,
        helpful_votes=max(0, payload.helpful_votes),
        notes=payload.notes,
        moderated_by="Admin" if status != "pending" else None,
        media_json="[]",
    )
    _apply_media(row, media)
    db.add(row)
    db.commit()
    db.refresh(row)
    return ProductReviewResponse(data=_to_read(row))


@router.get("/{review_id}", response_model=ProductReviewResponse)
def get_review(review_id: str, db: Session = Depends(get_db)) -> ProductReviewResponse:
    row = db.get(CatalogProductReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    return ProductReviewResponse(data=_to_read(row))


@router.patch("/{review_id}", response_model=ProductReviewResponse)
def update_review(
    review_id: str,
    payload: ProductReviewUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductReviewResponse:
    row = db.get(CatalogProductReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")

    updates = payload.model_dump(exclude_unset=True)
    media_update = updates.pop("media", None)
    if "status" in updates and updates["status"] not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    if "review_type" in updates and updates["review_type"] not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid review type")
    if "sentiment" in updates and updates["sentiment"] not in ALLOWED_SENTIMENT:
        raise HTTPException(status_code=400, detail="Invalid sentiment")

    for key, value in updates.items():
        setattr(row, key, value)

    if media_update is not None:
        _apply_media(row, [ReviewMediaItem.model_validate(item) for item in media_update])

    if updates.get("status") and updates["status"] != "pending" and not row.moderated_by:
        row.moderated_by = "Admin"

    db.commit()
    db.refresh(row)
    return ProductReviewResponse(data=_to_read(row))
