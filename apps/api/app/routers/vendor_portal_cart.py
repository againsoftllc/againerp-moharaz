"""Vendor-facing cart and order requests — SPEC.md §18, §21.

Scoped entirely by identity.vendor_id from the session, same isolation rule
as every other vendor portal endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.vendor_portal_auth import VendorIdentity, require_vendor_permission
from app.models.vendor.vendor import Vendor
from app.schemas.vendor.cart import (
    VendorCartLineRead,
    VendorCartRead,
    VendorCartResponse,
    VendorCartSetItemRequest,
    VendorCartSubmitRequest,
)
from app.schemas.vendor.credit import VendorCreditSummaryRead, VendorCreditSummaryResponse
from app.schemas.vendor.order_request import (
    VendorOrderRequestItemRead,
    VendorOrderRequestListResponse,
    VendorOrderRequestRead,
    VendorOrderRequestResponse,
)
from app.services.vendor import vendor_cart_service, vendor_credit_service, vendor_order_request_service

router = APIRouter(prefix="/vendor-portal", tags=["vendor-portal-cart"])


def _vendor(db: Session, vendor_id: str) -> Vendor:
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


def _cart_read(view) -> VendorCartRead:
    return VendorCartRead(
        cart_id=view.cart_id,
        lines=[
            VendorCartLineRead(
                item_id=l.item_id,
                sku=l.sku,
                name=l.name,
                quantity=l.quantity,
                list_price=l.list_price,
                unit_price=l.unit_price,
                line_total=l.line_total,
                stock_status=l.stock_status,
                orderable=l.orderable,
                issue=l.issue,
            )
            for l in view.lines
        ],
        subtotal=view.subtotal,
        min_order_quantity=view.min_order_quantity,
        has_blocking_issues=view.has_blocking_issues,
    )


def _order_request_read(row) -> VendorOrderRequestRead:
    return VendorOrderRequestRead(
        id=row.id,
        order_request_number=row.order_request_number,
        vendor_id=row.vendor_id,
        vendor_name=None,
        status=row.status,
        subtotal=row.subtotal,
        discount_amount=row.discount_amount,
        tax_amount=row.tax_amount,
        shipping_amount=row.shipping_amount,
        grand_total=row.grand_total,
        payment_terms=row.payment_terms,
        requested_delivery_date=row.requested_delivery_date,
        delivery_address=row.delivery_address,
        vendor_note=row.vendor_note,
        requires_credit_approval=row.requires_credit_approval,
        created_at=row.created_at,
        updated_at=row.updated_at,
        items=[
            VendorOrderRequestItemRead(
                id=i.id,
                item_id=i.item_id,
                sku_snapshot=i.sku_snapshot,
                name_snapshot=i.name_snapshot,
                unit_price=i.unit_price,
                quantity=i.quantity,
                discount_amount=i.discount_amount,
                tax_amount=i.tax_amount,
                line_total=i.line_total,
            )
            for i in row.items
        ],
    )


@router.get("/cart", response_model=VendorCartResponse)
def get_cart(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.create")),
    db: Session = Depends(get_db),
) -> VendorCartResponse:
    vendor = _vendor(db, identity.vendor_id)
    cart = vendor_cart_service.get_or_create_cart(db, vendor.id)
    view = vendor_cart_service.build_cart_view(db, vendor, cart)
    return VendorCartResponse(data=_cart_read(view))


@router.post("/cart/items", response_model=VendorCartResponse)
def set_cart_item(
    payload: VendorCartSetItemRequest,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.create")),
    db: Session = Depends(get_db),
) -> VendorCartResponse:
    vendor = _vendor(db, identity.vendor_id)
    vendor_cart_service.set_item_quantity(db, vendor_id=vendor.id, item_id=payload.item_id, quantity=payload.quantity)
    cart = vendor_cart_service.get_or_create_cart(db, vendor.id)
    view = vendor_cart_service.build_cart_view(db, vendor, cart)
    return VendorCartResponse(data=_cart_read(view))


@router.post("/cart/submit", response_model=VendorOrderRequestResponse, status_code=201)
def submit_cart(
    payload: VendorCartSubmitRequest,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.create")),
    db: Session = Depends(get_db),
) -> VendorOrderRequestResponse:
    vendor = _vendor(db, identity.vendor_id)
    cart = vendor_cart_service.get_or_create_cart(db, vendor.id)
    order_request = vendor_order_request_service.submit_cart(
        db,
        vendor=vendor,
        vendor_user_id=identity.user.id,
        cart=cart,
        notes=payload.notes,
        delivery_address=payload.delivery_address,
        requested_delivery_date=payload.requested_delivery_date,
    )
    return VendorOrderRequestResponse(data=_order_request_read(order_request))


@router.get("/credit", response_model=VendorCreditSummaryResponse)
def get_credit_summary(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.ledger.view")),
    db: Session = Depends(get_db),
) -> VendorCreditSummaryResponse:
    vendor = _vendor(db, identity.vendor_id)
    summary = vendor_credit_service.compute_credit_summary(db, vendor)
    return VendorCreditSummaryResponse(data=VendorCreditSummaryRead(**summary.__dict__))


@router.get("/order-requests", response_model=VendorOrderRequestListResponse)
def list_own_order_requests(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.view")),
    db: Session = Depends(get_db),
) -> VendorOrderRequestListResponse:
    rows = vendor_order_request_service.list_order_requests(db, vendor_id=identity.vendor_id).all()
    return VendorOrderRequestListResponse(data=[_order_request_read(r) for r in rows], total=len(rows))


@router.get("/order-requests/{order_request_id}", response_model=VendorOrderRequestResponse)
def get_own_order_request(
    order_request_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.view")),
    db: Session = Depends(get_db),
) -> VendorOrderRequestResponse:
    row = vendor_order_request_service.get_order_request(db, order_request_id, vendor_id=identity.vendor_id)
    return VendorOrderRequestResponse(data=_order_request_read(row))
