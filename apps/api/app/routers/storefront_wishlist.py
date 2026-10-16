"""Storefront wishlist API — website_wishlists / website_wishlist_items."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_optional_storefront_customer,
)
from app.models.website_wishlist import WebsiteWishlist
from app.services.ecommerce.website_wishlist_service import WishlistError, WebsiteWishlistService
from app.services.ecommerce.storefront_feature_flags import require_storefront_flag

router = APIRouter(prefix="/wishlist", tags=["storefront-wishlist"])

WISHLIST_HEADER = "X-Wishlist-Token"
STOREFRONT_CACHE = "private, no-store"


class WishlistItemCreate(BaseModel):
    product_id: str = Field(min_length=1, max_length=36)


class WishlistItemRead(BaseModel):
    id: str
    product_id: str
    item_id: Optional[str] = None
    slug: str
    name: str
    thumbnail: Optional[str] = None
    unit_price: float
    compare_at_price: Optional[float] = None
    discount_pct: Optional[int] = None
    rating: float = 0


class WishlistRead(BaseModel):
    wishlist_token: str
    customer_id: Optional[str] = None
    item_count: int
    items: List[WishlistItemRead]


class WishlistResponse(BaseModel):
    data: WishlistRead


def _service(db: Session) -> WebsiteWishlistService:
    return WebsiteWishlistService(db)


def _customer_id(ctx: Optional[CustomerAuthContext]) -> Optional[str]:
    if ctx is None:
        return None
    return ctx[2].id


def get_wishlist_context(
    response: Response,
    db: Session = Depends(get_db),
    x_wishlist_token: Optional[str] = Header(default=None, alias=WISHLIST_HEADER),
    ctx: Optional[CustomerAuthContext] = Depends(get_optional_storefront_customer),
) -> WebsiteWishlist:
    require_storefront_flag("wishlist")
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    return _service(db).get_or_create(
        wishlist_token=x_wishlist_token,
        customer_id=_customer_id(ctx),
    )


@router.get("", response_model=WishlistResponse)
def get_wishlist(wishlist: WebsiteWishlist = Depends(get_wishlist_context), db: Session = Depends(get_db)) -> WishlistResponse:
    return WishlistResponse(data=WishlistRead(**_service(db).build_read(wishlist)))


@router.post("/items", response_model=WishlistResponse)
def add_wishlist_item(
    payload: WishlistItemCreate,
    wishlist: WebsiteWishlist = Depends(get_wishlist_context),
    db: Session = Depends(get_db),
) -> WishlistResponse:
    try:
        wishlist = _service(db).add_product(wishlist, payload.product_id)
    except WishlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WishlistResponse(data=WishlistRead(**_service(db).build_read(wishlist)))


@router.delete("/items/{product_id}", response_model=WishlistResponse)
def remove_wishlist_item(
    product_id: str,
    wishlist: WebsiteWishlist = Depends(get_wishlist_context),
    db: Session = Depends(get_db),
) -> WishlistResponse:
    try:
        wishlist = _service(db).remove_product(wishlist, product_id)
    except WishlistError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return WishlistResponse(data=WishlistRead(**_service(db).build_read(wishlist)))


@router.delete("", response_model=WishlistResponse)
def clear_wishlist(
    wishlist: WebsiteWishlist = Depends(get_wishlist_context),
    db: Session = Depends(get_db),
) -> WishlistResponse:
    wishlist = _service(db).clear(wishlist)
    return WishlistResponse(data=WishlistRead(**_service(db).build_read(wishlist)))
