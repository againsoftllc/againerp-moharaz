"""Quotation acceptance -> Final Order -> Basic Invoice — SPEC.md §28-29.

Reuses the existing CommerceOrder/CommerceOrderItem tables (SPEC §61 —
do not duplicate core order tables) rather than a parallel vendor_orders
table. The AR side reuses the polymorphic FinanceReceivable ledger instead
of the legacy Invoice model, which hard-FKs to commerce_customers and can't
point at a vendor.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.finance import FinanceReceivable
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_invoice import VendorInvoice
from app.models.vendor.vendor_order_request import VendorOrderRequest
from app.models.vendor.vendor_quotation import VendorQuotation
from app.services.vendor.vendor_notification_service import notify
from app.services.core.sequence_service import next_number as allocate_number

DEFAULT_DUE_DAYS = 15


def _log(db: Session, *, entity_type: str, entity_id: str, action: str, performed_by: str) -> None:
    db.add(
        CollabActivity(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type="user",
        )
    )


def _next_order_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "vendor.order",
        initial=lambda: db.query(CommerceOrder).filter(CommerceOrder.vendor_id.isnot(None)).count() + 1,
    )


def _next_invoice_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "vendor.invoice",
        initial=lambda: db.query(VendorInvoice).count() + 1,
    )


def convert_quotation_to_order(db: Session, *, quotation_id: str, performed_by: str) -> CommerceOrder:
    quotation = db.get(VendorQuotation, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if quotation.status != "accepted":
        raise HTTPException(status_code=409, detail="Only an accepted quotation can be converted to an order")

    existing = db.query(CommerceOrder).filter(CommerceOrder.vendor_quotation_id == quotation.id).first()
    if existing:
        return existing

    vendor = db.get(Vendor, quotation.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    order = CommerceOrder(
        order_number=_next_order_number(db),
        status="confirmed",
        payment_status="unpaid",
        source="Vendor Portal",
        customer_id=None,
        customer_name=vendor.company_name,
        customer_phone=vendor.phone,
        customer_email=vendor.email,
        billing_address=vendor.city,
        shipping_address=vendor.city,
        payment_method=vendor.preferred_payment_method or "Credit Terms",
        subtotal=quotation.subtotal,
        discount_amount=quotation.discount_amount,
        tax_amount=quotation.tax_amount,
        shipping_amount=quotation.shipping_amount,
        grand_total=quotation.grand_total,
        due_amount=quotation.grand_total,
        notes=quotation.notes,
        vendor_id=vendor.id,
        vendor_quotation_id=quotation.id,
        vendor_order_request_id=quotation.order_request_id,
    )
    db.add(order)
    db.flush()

    for line in quotation.items:
        product = db.query(CatalogProduct).filter(CatalogProduct.item_id == line.item_id).first()
        db.add(
            CommerceOrderItem(
                order_id=order.id,
                product_id=product.id if product else line.item_id,
                item_id=line.item_id,
                sku=line.sku_snapshot,
                name=line.name_snapshot,
                quantity=line.quantity,
                unit_price=line.unit_price,
                discount_amount=line.discount_amount,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
        )

    order_request = db.get(VendorOrderRequest, quotation.order_request_id)
    if order_request:
        order_request.status = "converted_to_order"

    invoice = _create_invoice(db, vendor=vendor, order=order, quotation=quotation)

    _log(db, entity_type="vendor_order_request", entity_id=quotation.order_request_id, action="converted_to_order", performed_by=performed_by)
    _log(db, entity_type="vendor_quotation", entity_id=quotation.id, action="converted_to_order", performed_by=performed_by)
    _log(db, entity_type="vendor_invoice", entity_id=invoice.id, action="invoice_created", performed_by=performed_by)
    notify(
        db,
        vendor_id=vendor.id,
        event="invoice_created",
        title=f"Invoice {invoice.invoice_number} issued",
        message=f"{invoice.grand_total} due {invoice.due_date.isoformat()}.",
        entity_type="vendor_invoice",
        entity_id=invoice.id,
    )

    db.commit()
    db.refresh(order)
    return order


def _create_invoice(db: Session, *, vendor: Vendor, order: CommerceOrder, quotation: VendorQuotation) -> VendorInvoice:
    today = date.today()
    invoice = VendorInvoice(
        invoice_number=_next_invoice_number(db),
        vendor_id=vendor.id,
        order_id=order.id,
        quotation_id=quotation.id,
        status="unpaid",
        bill_date=today,
        due_date=today + timedelta(days=DEFAULT_DUE_DAYS),
        subtotal=order.subtotal,
        tax_amount=order.tax_amount,
        shipping_amount=order.shipping_amount,
        grand_total=order.grand_total,
    )
    db.add(invoice)
    db.flush()

    db.add(
        FinanceReceivable(
            company_id=vendor.company_id,
            customer_id=vendor.id,
            source_type="vendor_invoice",
            source_id=invoice.id,
            invoice_number=invoice.invoice_number,
            amount=invoice.grand_total,
            amount_paid=Decimal("0"),
            balance=invoice.grand_total,
            tax_amount=invoice.tax_amount,
            due_date=invoice.due_date,
            status="open",
        )
    )
    return invoice


def list_invoices(db: Session, *, vendor_id: Optional[str] = None):
    q = db.query(VendorInvoice)
    if vendor_id:
        q = q.filter(VendorInvoice.vendor_id == vendor_id)
    return q.order_by(VendorInvoice.created_at.desc())


def get_invoice(db: Session, invoice_id: str, *, vendor_id: Optional[str] = None) -> VendorInvoice:
    row = db.get(VendorInvoice, invoice_id)
    if not row or (vendor_id and row.vendor_id != vendor_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return row


def get_receivable_for_invoice(db: Session, invoice_id: str) -> Optional[FinanceReceivable]:
    return (
        db.query(FinanceReceivable)
        .filter(FinanceReceivable.source_type == "vendor_invoice", FinanceReceivable.source_id == invoice_id)
        .first()
    )
