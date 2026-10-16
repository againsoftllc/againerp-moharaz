from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ReviewMediaItem(BaseModel):
    id: str
    url: str
    name: str = ""
    media_type: str = "image"


class ProductReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    review_number: str
    product_id: str
    product_name: str
    product_sku: str
    product_brand: Optional[str] = None
    product_category: Optional[str] = None
    product_image_url: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str
    customer_image_url: Optional[str] = None
    media: List[ReviewMediaItem] = Field(default_factory=list)
    review_type: str
    status: str
    rating: int
    title: str
    body: str
    sentiment: str
    is_verified_purchase: bool
    helpful_votes: int
    moderated_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProductReviewListMeta(BaseModel):
    count: int
    pending_count: int


class ProductReviewListResponse(BaseModel):
    data: List[ProductReviewRead]
    meta: ProductReviewListMeta


class ProductReviewResponse(BaseModel):
    data: ProductReviewRead


class ProductReviewCreate(BaseModel):
    product_id: str
    customer_name: str = Field(min_length=1, max_length=255)
    customer_image_url: Optional[str] = None
    media: List[ReviewMediaItem] = Field(default_factory=list)
    title: str = Field(min_length=1, max_length=255)
    body: str = ""
    rating: int = Field(default=5, ge=1, le=5)
    review_type: str = "text"
    status: str = "pending"
    sentiment: str = "neutral"
    is_verified_purchase: bool = False
    helpful_votes: int = 0
    notes: Optional[str] = None


class ProductReviewUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    customer_image_url: Optional[str] = None
    media: Optional[List[ReviewMediaItem]] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    body: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    review_type: Optional[str] = None
    status: Optional[str] = None
    sentiment: Optional[str] = None
    is_verified_purchase: Optional[bool] = None
    helpful_votes: Optional[int] = None
    moderated_by: Optional[str] = None
    notes: Optional[str] = None


def parse_review_media(raw: Any, fallback_url: Optional[str] = None) -> List[ReviewMediaItem]:
    items: List[ReviewMediaItem] = []
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = []
    elif isinstance(raw, list):
        parsed = raw
    else:
        parsed = []

    if isinstance(parsed, list):
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            url = str(entry.get("url") or "").strip()
            media_id = str(entry.get("id") or "").strip()
            if not url or not media_id:
                continue
            media_type = str(entry.get("media_type") or entry.get("type") or "image")
            if media_type not in {"image", "video"}:
                media_type = "image"
            items.append(
                ReviewMediaItem(
                    id=media_id,
                    url=url,
                    name=str(entry.get("name") or ""),
                    media_type=media_type,
                ),
            )

    if not items and fallback_url:
        items.append(
            ReviewMediaItem(
                id="legacy-customer-image",
                url=fallback_url,
                name="Customer photo",
                media_type="image",
            ),
        )
    return items


def dump_review_media(items: List[ReviewMediaItem]) -> str:
    return json.dumps([item.model_dump() for item in items])
