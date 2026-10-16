"""ERP admin: quotations, final-order conversion, invoices — SPEC.md §25,28,29."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_negotiation import VendorNegotiation
from app.schemas.vendor.order import VendorFinalOrderRead, VendorFinalOrderResponse, VendorInvoiceListResponse, VendorInvoiceRead, VendorInvoiceResponse
from app.schemas.vendor.negotiation import (
    VendorNegotiationDeclineRequest,
    VendorNegotiationListResponse,
    VendorNegotiationRead,
    VendorNegotiationResponse,
    VendorQuotationReviseRequest,
)
from app.schemas.vendor.quotation import (
    VendorQuotationCreateRequest,
    VendorQuotationItemRead,
    VendorQuotationListResponse,
    VendorQuotationRead,
    VendorQuotationResponse,
    VendorQuotationTransitionRequest,
)
from app.services.vendor import vendor_order_conversion_service, vendor_quotation_service

router = APIRouter(prefix="/vendors", tags=["vendor-quotation-admin"])


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


@router.post("/order-requests/{order_request_id}/quotation", response_model=VendorQuotationResponse, status_code=201)
def create_quotation(
    order_request_id: str,
    payload: VendorQuotationCreateRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorQuotationResponse:
    quotation = vendor_quotation_service.create_from_order_request(
        db,
        order_request_id=order_request_id,
        performed_by=user.id,
        payment_terms=payload.payment_terms,
        delivery_terms=payload.delivery_terms,
        valid_until=payload.valid_until,
        notes=payload.notes,
    )
    return VendorQuotationResponse(data=_quotation_read(db, quotation))


@router.get("/quotations", response_model=VendorQuotationListResponse)
def list_quotations(
    db: Session = Depends(get_db),
    vendor_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> VendorQuotationListResponse:
    rows = vendor_quotation_service.list_quotations(db, vendor_id=vendor_id, status=status).all()
    return VendorQuotationListResponse(data=[_quotation_read(db, r) for r in rows], total=len(rows))


@router.get("/quotations/{quotation_id}", response_model=VendorQuotationResponse)
def get_quotation(quotation_id: str, db: Session = Depends(get_db)) -> VendorQuotationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id)
    return VendorQuotationResponse(data=_quotation_read(db, row))


def _negotiation_read(row) -> VendorNegotiationRead:
    return VendorNegotiationRead(
        id=row.id,
        quotation_id=row.quotation_id,
        vendor_id=row.vendor_id,
        request_type=row.request_type,
        message=row.message,
        requested_price=row.requested_price,
        requested_quantity=row.requested_quantity,
        requested_delivery_date=row.requested_delivery_date,
        requested_payment_terms=row.requested_payment_terms,
        status=row.status,
        admin_response=row.admin_response,
        resulting_quotation_id=row.resulting_quotation_id,
        created_at=row.created_at,
    )


@router.get("/quotations/{quotation_id}/negotiations", response_model=VendorNegotiationListResponse)
def list_negotiations(quotation_id: str, db: Session = Depends(get_db)) -> VendorNegotiationListResponse:
    rows = vendor_quotation_service.list_negotiations(db, quotation_id=quotation_id)
    return VendorNegotiationListResponse(data=[_negotiation_read(r) for r in rows])


@router.post("/negotiations/{negotiation_id}/decline", response_model=VendorNegotiationResponse)
def decline_negotiation(
    negotiation_id: str,
    payload: VendorNegotiationDeclineRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorNegotiationResponse:
    negotiation = db.get(VendorNegotiation, negotiation_id)
    if not negotiation:
        raise HTTPException(status_code=404, detail="Negotiation not found")
    negotiation = vendor_quotation_service.decline_negotiation(
        db, negotiation, admin_response=payload.admin_response, performed_by=user.id
    )
    return VendorNegotiationResponse(data=_negotiation_read(negotiation))


@router.post("/quotations/{quotation_id}/revise", response_model=VendorQuotationResponse, status_code=201)
def revise_quotation(
    quotation_id: str,
    payload: VendorQuotationReviseRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorQuotationResponse:
    quotation = vendor_quotation_service.get_quotation(db, quotation_id)
    negotiation = db.get(VendorNegotiation, payload.negotiation_id) if payload.negotiation_id else None
    revised = vendor_quotation_service.create_revision(
        db,
        quotation,
        performed_by=user.id,
        items=[item.model_dump() for item in payload.items] if payload.items else None,
        payment_terms=payload.payment_terms,
        delivery_terms=payload.delivery_terms,
        valid_until=payload.valid_until,
        notes=payload.notes,
        negotiation=negotiation,
    )
    return VendorQuotationResponse(data=_quotation_read(db, revised))


@router.post("/quotations/{quotation_id}/transition", response_model=VendorQuotationResponse)
def transition_quotation(
    quotation_id: str,
    payload: VendorQuotationTransitionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorQuotationResponse:
    row = vendor_quotation_service.get_quotation(db, quotation_id)
    row = vendor_quotation_service.transition(db, row, target=payload.status, performed_by=user.id)
    return VendorQuotationResponse(data=_quotation_read(db, row))


@router.post("/quotations/{quotation_id}/convert-to-order", response_model=VendorFinalOrderResponse, status_code=201)
def convert_to_order(
    quotation_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorFinalOrderResponse:
    order = vendor_order_conversion_service.convert_quotation_to_order(db, quotation_id=quotation_id, performed_by=user.id)
    return VendorFinalOrderResponse(
        data=VendorFinalOrderRead(
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
    )


def _invoice_read(db: Session, row) -> VendorInvoiceRead:
    vendor = db.get(Vendor, row.vendor_id)
    receivable = vendor_order_conversion_service.get_receivable_for_invoice(db, row.id)
    return VendorInvoiceRead(
        id=row.id,
        invoice_number=row.invoice_number,
        vendor_id=row.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
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
    db: Session = Depends(get_db),
    vendor_id: Optional[str] = Query(default=None),
) -> VendorInvoiceListResponse:
    rows = vendor_order_conversion_service.list_invoices(db, vendor_id=vendor_id).all()
    return VendorInvoiceListResponse(data=[_invoice_read(db, r) for r in rows], total=len(rows))


@router.get("/invoices/{invoice_id}", response_model=VendorInvoiceResponse)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)) -> VendorInvoiceResponse:
    row = vendor_order_conversion_service.get_invoice(db, invoice_id)
    return VendorInvoiceResponse(data=_invoice_read(db, row))
