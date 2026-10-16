"""Vendor-facing quotations, invoices, and final orders — SPEC.md §25,29."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.vendor_portal_auth import VendorIdentity, require_vendor_permission
from app.models.commerce_order import CommerceOrder
from app.models.vendor.vendor import Vendor
from app.schemas.vendor.order import (
    VendorFinalOrderRead,
    VendorFinalOrderResponse,
    VendorInvoiceListResponse,
    VendorInvoiceRead,
    VendorInvoiceResponse,
)
from app.schemas.vendor.negotiation import VendorNegotiationRequest, VendorNegotiationResponse, VendorNegotiationRead
from app.schemas.vendor.quotation import (
    VendorQuotationItemRead,
    VendorQuotationListResponse,
    VendorQuotationRead,
    VendorQuotationResponse,
)
from app.services.vendor import vendor_order_conversion_service, vendor_quotation_service

router = APIRouter(prefix="/vendor-portal", tags=["vendor-portal-quotation"])


def _quotation_read(db: Session, row) -> VendorQuotationRead:
    vendor = db.get(Vendor, row.vendor_id)
    return VendorQuotationRead(
        id=row.id,
        quotation_number=row.quotation_number,
        order_request_id=row.order_request_id,
        vendor_id=row.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
        status=row.status,
        revision_number=row.revision_number,
        previous_quotation_id=row.previous_quotation_id,
        superseded_by_id=row.superseded_by_id,
        subtotal=row.subtotal,
        discount_amount=row.discount_amount,
        tax_amount=row.tax_amount,
        shipping_amount=row.shipping_amount,
        grand_total=row.grand_total,
        payment_terms=row.payment_terms,
        delivery_terms=row.delivery_terms,
        valid_until=row.valid_until,
        notes=row.notes,
        viewed_at=row.viewed_at,
        responded_at=row.responded_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        items=[
            VendorQuotationItemRead(
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


@router.get("/quotations", response_model=VendorQuotationListResponse)
def list_quotations(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.quotation.view")),
    db: Session = Depends(get_db),
) -> VendorQuotationListResponse:
    rows = vendor_quotation_service.list_quotations(db, vendor_id=identity.vendor_id).all()
    return VendorQuotationListResponse(data=[_quotation_read(db, r) for r in rows], total=len(rows))


@router.get("/quotations/{quotation_id}", response_model=VendorQuotationResponse)
def get_quotation(
    quotation_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.quotation.view")),
    db: Session = Depends(get_db),
) -> VendorQuotationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id, vendor_id=identity.vendor_id)
    row = vendor_quotation_service.mark_viewed(db, row)
    return VendorQuotationResponse(data=_quotation_read(db, row))


@router.post("/quotations/{quotation_id}/accept", response_model=VendorQuotationResponse)
def accept_quotation(
    quotation_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.quotation.accept")),
    db: Session = Depends(get_db),
) -> VendorQuotationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id, vendor_id=identity.vendor_id)
    row = vendor_quotation_service.respond(db, row, accept=True, performed_by=identity.user.id)
    return VendorQuotationResponse(data=_quotation_read(db, row))


@router.post("/quotations/{quotation_id}/negotiate", response_model=VendorNegotiationResponse, status_code=201)
def negotiate_quotation(
    quotation_id: str,
    payload: VendorNegotiationRequest,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.quotation.accept")),
    db: Session = Depends(get_db),
) -> VendorNegotiationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id, vendor_id=identity.vendor_id)
    negotiation = vendor_quotation_service.request_negotiation(
        db,
        row,
        vendor_user_id=identity.user.id,
        request_type=payload.request_type,
        message=payload.message,
        requested_price=payload.requested_price,
        requested_quantity=payload.requested_quantity,
        requested_delivery_date=payload.requested_delivery_date,
        requested_payment_terms=payload.requested_payment_terms,
    )
    return VendorNegotiationResponse(
        data=VendorNegotiationRead(
            id=negotiation.id,
            quotation_id=negotiation.quotation_id,
            vendor_id=negotiation.vendor_id,
            request_type=negotiation.request_type,
            message=negotiation.message,
            requested_price=negotiation.requested_price,
            requested_quantity=negotiation.requested_quantity,
            requested_delivery_date=negotiation.requested_delivery_date,
            requested_payment_terms=negotiation.requested_payment_terms,
            status=negotiation.status,
            admin_response=negotiation.admin_response,
            resulting_quotation_id=negotiation.resulting_quotation_id,
            created_at=negotiation.created_at,
        )
    )


@router.post("/quotations/{quotation_id}/reject", response_model=VendorQuotationResponse)
def reject_quotation(
    quotation_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.quotation.accept")),
    db: Session = Depends(get_db),
) -> VendorQuotationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id, vendor_id=identity.vendor_id)
    row = vendor_quotation_service.respond(db, row, accept=False, performed_by=identity.user.id)
    return VendorQuotationResponse(data=_quotation_read(db, row))


def _order_read(order: CommerceOrder) -> VendorFinalOrderRead:
    return VendorFinalOrderRead(
        id=order.id,
        order_number=order.order_number,
        status=order.status,
        payment_status=order.payment_status,
        vendor_id=order.vendor_id,
        vendor_quotation_id=order.vendor_quotation_id,
        vendor_order_request_id=order.vendor_order_request_id,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        tax_amount=order.tax_amount,
        shipping_amount=order.shipping_amount,
        grand_total=order.grand_total,
        paid_amount=order.paid_amount,
        due_amount=order.due_amount,
        created_at=order.created_at,
    )


@router.get("/orders", response_model=list[VendorFinalOrderRead])
def list_orders(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.view")),
    db: Session = Depends(get_db),
) -> list[VendorFinalOrderRead]:
    rows = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.vendor_id == identity.vendor_id)
        .order_by(CommerceOrder.created_at.desc())
        .all()
    )
    return [_order_read(r) for r in rows]


@router.get("/orders/{order_id}", response_model=VendorFinalOrderResponse)
def get_order(
    order_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.order.view")),
    db: Session = Depends(get_db),
) -> VendorFinalOrderResponse:
    order = db.get(CommerceOrder, order_id)
    if not order or order.vendor_id != identity.vendor_id:
        raise HTTPException(status_code=404, detail="Order not found")
    return VendorFinalOrderResponse(data=_order_read(order))


def _invoice_read(db: Session, row) -> VendorInvoiceRead:
    receivable = vendor_order_conversion_service.get_receivable_for_invoice(db, row.id)
    return VendorInvoiceRead(
        id=row.id,
        invoice_number=row.invoice_number,
        vendor_id=row.vendor_id,
        vendor_name=None,
        order_id=row.order_id,
        quotation_id=row.quotation_id,
        status=row.status,
        bill_date=row.bill_date,
        due_date=row.due_date,
        subtotal=row.subtotal,
        tax_amount=row.tax_amount,
        shipping_amount=row.shipping_amount,
        grand_total=row.grand_total,
        amount_paid=receivable.amount_paid if receivable else 0,
        balance=receivable.balance if receivable else row.grand_total,
        created_at=row.created_at,
    )


@router.get("/invoices", response_model=VendorInvoiceListResponse)
def list_invoices(
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.invoice.view")),
    db: Session = Depends(get_db),
) -> VendorInvoiceListResponse:
    rows = vendor_order_conversion_service.list_invoices(db, vendor_id=identity.vendor_id).all()
    return VendorInvoiceListResponse(data=[_invoice_read(db, r) for r in rows], total=len(rows))


@router.get("/invoices/{invoice_id}", response_model=VendorInvoiceResponse)
def get_invoice(
    invoice_id: str,
    identity: VendorIdentity = Depends(require_vendor_permission("vendor.invoice.view")),
    db: Session = Depends(get_db),
) -> VendorInvoiceResponse:
    row = vendor_order_conversion_service.get_invoice(db, invoice_id, vendor_id=identity.vendor_id)
    return VendorInvoiceResponse(data=_invoice_read(db, row))
