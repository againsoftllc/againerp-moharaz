"""Production storefront cart API (STEP 05)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_optional_user
from app.models.auth_user import AuthUser
from app.models.storefront_cart import StorefrontCart
from app.schemas.storefront import (
    StorefrontCartCouponApply,
    StorefrontCartItemCreate,
    StorefrontCartItemUpdate,
    StorefrontCartMergeResponse,
    StorefrontCartRead,
    StorefrontCartResponse,
    StorefrontCartValidateRequest,
)
from app.services.ecommerce.storefront_cart_service import CartError, StorefrontCartService
from app.services.site_resolver import request_site_options
from app.services.storefront_site_options import commerce_option

router = APIRouter(prefix="/cart", tags=["storefront-cart"])

CART_HEADER = "X-Cart-Token"
STOREFRONT_CACHE = "private, no-store"


def _set_private(response: Response) -> None:
    response.headers["Cache-Control"] = STOREFRONT_CACHE


def _to_read(data: dict) -> StorefrontCartRead:
    return StorefrontCartRead(**data)


def _service(db: Session, request: Optional[Request] = None) -> StorefrontCartService:
    allow_out_of_stock = (
        commerce_option(request_site_options(db, request), "stock_checkout")
        if request is not None
        else False
    )
    return StorefrontCartService(db, allow_out_of_stock=allow_out_of_stock)


def get_cart_context(
    response: Response,
    db: Session = Depends(get_db),
    x_cart_token: Optional[str] = Header(default=None, alias=CART_HEADER),
    user: Optional[AuthUser] = Depends(get_optional_user),
) -> StorefrontCart:
    _set_private(response)
    return _service(db).get_or_create_cart(cart_token=x_cart_token, user=user)


@router.get("", response_model=StorefrontCartResponse)
def get_cart(
    response: Response,
    http_request: Request,
    validate: bool = Query(False),
    sync_prices: bool = Query(False),
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db, http_request)
    issues = service.validate_cart(cart, sync_prices=sync_prices) if validate or sync_prices else None
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart, issues=issues)))


@router.post("/items", response_model=StorefrontCartResponse)
def add_cart_item(
    payload: StorefrontCartItemCreate,
    http_request: Request,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    if not payload.item_id and not payload.product_id:
        raise HTTPException(status_code=422, detail="item_id or product_id is required")
    service = _service(db, http_request)
    try:
        cart = service.add_item(
            cart,
            quantity=payload.quantity,
            item_id=payload.item_id,
            product_id=payload.product_id,
            variant_id=payload.variant_id,
            attributes=payload.attributes,
        )
    except CartError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.patch("/items/{item_id}", response_model=StorefrontCartResponse)
def update_cart_item(
    item_id: str,
    payload: StorefrontCartItemUpdate,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db)
    try:
        cart = service.update_item_quantity(cart, item_id, payload.quantity)
    except CartError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.delete("/items/{item_id}", response_model=StorefrontCartResponse)
def remove_cart_item(
    item_id: str,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db)
    try:
        cart = service.remove_item(cart, item_id)
    except CartError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.delete("", response_model=StorefrontCartResponse)
def clear_cart(
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db)
    cart = service.clear_cart(cart)
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.post("/coupon", response_model=StorefrontCartResponse)
def apply_cart_coupon(
    payload: StorefrontCartCouponApply,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db)
    try:
        cart = service.apply_coupon(cart, payload.code)
    except CartError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.delete("/coupon", response_model=StorefrontCartResponse)
def remove_cart_coupon(
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db)
    cart = service.remove_coupon(cart)
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart)))


@router.post("/validate", response_model=StorefrontCartResponse)
def validate_cart(
    payload: StorefrontCartValidateRequest,
    http_request: Request,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    service = _service(db, http_request)
    issues = service.validate_cart(cart, sync_prices=payload.sync_prices)
    if payload.sync_prices:
        cart = service.load_cart(cart.id)
    return StorefrontCartResponse(data=_to_read(service.build_read_model(cart, issues=issues)))


@router.post("/merge", response_model=StorefrontCartMergeResponse)
def merge_guest_cart(
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
    x_cart_token: Optional[str] = Header(default=None, alias=CART_HEADER),
    user: Optional[AuthUser] = Depends(get_optional_user),
) -> StorefrontCartMergeResponse:
    if not user:
        raise HTTPException(status_code=401, detail="Login required to merge cart")
    service = _service(db)
    user_cart = service.get_or_create_cart(user=user)
    guest = service._find_by_token(x_cart_token) if x_cart_token else None
    if guest and guest.id != user_cart.id:
        user_cart = service.merge_carts(guest, user_cart)
    return StorefrontCartMergeResponse(
        data=_to_read(service.build_read_model(user_cart)),
        merged=bool(guest and guest.id != user_cart.id),
    )
