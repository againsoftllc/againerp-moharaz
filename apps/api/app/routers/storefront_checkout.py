from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_optional_storefront_customer,
)
from app.models.storefront_cart import StorefrontCart
from app.routers.storefront_cart import get_cart_context
from app.schemas.storefront import (
    StorefrontCheckoutCreate,
    StorefrontCheckoutOptionsResponse,
    StorefrontCheckoutOptionsRead,
    StorefrontCheckoutPreviewRequest,
    StorefrontCheckoutPreviewResponse,
    StorefrontCheckoutRead,
    StorefrontCheckoutResponse,
    StorefrontCheckoutTotalsRead,
    StorefrontEmiBankRead,
    StorefrontPaymentOptionRead,
    StorefrontPreparedPaymentRead,
    StorefrontShippingOptionRead,
)
from app.services.site_resolver import request_site_options, resolve_site
from app.services.storefront_site_options import commerce_option
from app.services.ecommerce.checkout_tax_availability import (
    load_tax_settings,
    tax_is_included_in_price,
    tax_rate_percent,
)
from app.services.ecommerce.storefront_checkout_service import (
    CheckoutError,
    CheckoutPlaceRequest,
    StorefrontCheckoutService,
)

router = APIRouter(prefix="/checkout", tags=["storefront-checkout"])


def _service(db: Session, *, allow_out_of_stock: bool = False) -> StorefrontCheckoutService:
    return StorefrontCheckoutService(db, allow_out_of_stock=allow_out_of_stock)


def _place_request_from_payload(
    payload: StorefrontCheckoutCreate,
    *,
    customer_id: str,
) -> CheckoutPlaceRequest:
    legacy = payload.model_dump()
    billing, shipping, _same = StorefrontCheckoutService.address_from_legacy_payload(legacy)
    return CheckoutPlaceRequest(
        billing=billing,
        shipping=shipping,
        shipping_method=payload.shipping_method,
        payment_method=payload.payment_method,
        coupon_code=payload.coupon_code,
        notes=payload.notes,
        # Always bind to the authenticated storefront customer — never trust client customer_id.
        customer_id=customer_id,
    )


@router.get("/options", response_model=StorefrontCheckoutOptionsResponse)
def checkout_options(db: Session = Depends(get_db)) -> StorefrontCheckoutOptionsResponse:
    raw = _service(db).get_options()
    return StorefrontCheckoutOptionsResponse(
        data=StorefrontCheckoutOptionsRead(
            shipping_methods=[StorefrontShippingOptionRead(**m) for m in raw["shipping_methods"]],
            payment_methods=[StorefrontPaymentOptionRead(**m) for m in raw["payment_methods"]],
            zones=list(raw.get("zones") or []),
            inside_zones=list(raw.get("inside_zones") or []),
            district_rates=raw.get("district_rates") or {},
            free_threshold=raw.get("free_threshold"),
            default_method=str(raw.get("default_method") or "standard"),
            time_slots_enabled=bool(raw.get("time_slots_enabled", True)),
            reward_points_enabled=bool(raw.get("reward_points_enabled", False)),
            emi_banks=[StorefrontEmiBankRead(**b) for b in (raw.get("emi_banks") or [])],
            tax_rate_percent=tax_rate_percent(db),
            tax_label=str(load_tax_settings(db).get("tax.label") or "VAT"),
            tax_included_in_price=tax_is_included_in_price(db),
        ),
    )


@router.post("/preview", response_model=StorefrontCheckoutPreviewResponse)
def checkout_preview(
    payload: StorefrontCheckoutPreviewRequest,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCheckoutPreviewResponse:
    if not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    totals = _service(db).preview(
        cart,
        shipping_method=payload.shipping_method,
        coupon_code=payload.coupon_code,
        district=payload.district or "",
    )
    return StorefrontCheckoutPreviewResponse(
        data=StorefrontCheckoutTotalsRead(
            subtotal=totals.subtotal,
            discount=totals.discount,
            tax=totals.tax,
            shipping=totals.shipping,
            grand_total=totals.grand_total,
            coupon_code=totals.coupon_code,
        ),
    )


@router.post("", response_model=StorefrontCheckoutResponse)
def submit_checkout(
    payload: StorefrontCheckoutCreate,
    http_request: Request,
    cart: StorefrontCart = Depends(get_cart_context),
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext | None = Depends(get_optional_storefront_customer),
) -> StorefrontCheckoutResponse:
    if not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    storefront_customer = None
    customer_id = ""
    if ctx is not None:
        _session, _identity, storefront_customer = ctx
        customer_id = storefront_customer.id

    options = request_site_options(db, http_request)
    if ctx is None and not commerce_option(options, "guest_checkout"):
        raise HTTPException(status_code=401, detail="Please sign in to place an order")

    request = _place_request_from_payload(payload, customer_id=customer_id)
    site = resolve_site(db, http_request)
    service = _service(db, allow_out_of_stock=commerce_option(options, "stock_checkout"))
    try:
        result = service.place_order(
            cart,
            request,
            storefront_customer=storefront_customer,
            site_id=site.id if site else None,
        )
    except CheckoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    order = result.order
    prepared = result.prepared_payment
    return StorefrontCheckoutResponse(
        data=StorefrontCheckoutRead(
            id=order.id,
            order_number=order.order_number,
            email=order.customer_email,
            grand_total=order.grand_total,
            payment_method=order.payment_method,
            invoice_id=result.invoice_id,
            payment_record_id=result.payment_record_id,
            prepared_payment=StorefrontPreparedPaymentRead(
                payment_method=prepared.payment_method,
                amount=prepared.amount,
                status=prepared.status,
                provider=prepared.provider,
                requires_action=prepared.requires_action,
                client_payload=prepared.client_payload,
            )
            if prepared
            else None,
        ),
    )
