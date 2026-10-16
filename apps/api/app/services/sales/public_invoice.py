"""Unauthenticated sales invoice payload for a public share key."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer, load_json
from app.models.company import Company
from app.models.finance import FinancePayment, FinanceReceivable
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.company_invoice import invoice_read_values


def _money(value: Decimal | int | float | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _customer_address(customer: Optional[CommerceCustomer]) -> str:
    if not customer:
        return ""
    parts: list[str] = []
    addrs = load_json(customer.addresses_json, [])
    addr: dict[str, Any] | None = None
    if isinstance(addrs, list):
        for row in addrs:
            if isinstance(row, dict) and (row.get("isDefault") or row.get("is_default") or row.get("default")):
                addr = row
                break
        if addr is None:
            first = addrs[0] if addrs else None
            addr = first if isinstance(first, dict) else None
    if addr:
        for key in ("street", "street1", "address", "line1", "street2", "line2"):
            bit = str(addr.get(key) or "").strip()
            if bit:
                parts.append(bit)
        city_line = " ".join(
            str(addr.get(key) or "").strip()
            for key in ("city", "state", "region", "zip", "zip_code", "postal")
            if str(addr.get(key) or "").strip()
        )
        if city_line:
            parts.append(city_line)
        country = str(addr.get("country") or "").strip()
        if country:
            parts.append(country)
    extra = [customer.city, customer.region, customer.country]
    for bit in extra:
        text = (bit or "").strip()
        if text and text not in parts:
            parts.append(text)
    return ", ".join(parts)


def _company_preview(company: Company) -> dict[str, Any]:
    invoice = invoice_read_values(company)
    return {
        "name": company.name or "",
        "legal_name": company.legal_name or "",
        "logo_url": company.logo_url or "",
        "street": company.street or "",
        "street2": company.street2 or "",
        "city": company.city or "",
        "state": company.state or "",
        "zip_code": company.zip_code or "",
        "country": company.country or "",
        "phone": company.phone or "",
        "mobile": company.mobile or "",
        "email": company.email or "",
        "website": company.website or "",
        "tax_id": company.tax_id or "",
        "invoice_footer": invoice.get("invoice_footer") or "",
        "invoice_prices_include_tax": bool(invoice.get("invoice_prices_include_tax")),
        "tax_enabled": invoice.get("tax_enabled") is not False,
        "invoice_tax_rate": invoice.get("invoice_tax_rate") or 0,
        "currency_code": company.currency_code or "BDT",
        "invoice_layout": invoice.get("invoice_layout") or {},
    }


def public_invoice_by_key(db: Session, key: str) -> dict[str, Any]:
    token = (key or "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="Invoice not found")
    order = (
        db.query(SalesOrder)
        .filter(SalesOrder.public_key == token, SalesOrder.deleted_at.is_(None))
        .first()
    )
    if not order or not order.invoice_number:
        raise HTTPException(status_code=404, detail="Invoice not found")
    company = db.get(Company, order.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Invoice not found")
    customer = db.get(CommerceCustomer, order.customer_id)
    preview = _company_preview(company)
    layout = preview.pop("invoice_layout")
    lines = (
        db.query(SalesOrderLine)
        .filter(SalesOrderLine.sales_order_id == order.id)
        .order_by(SalesOrderLine.sort_order.asc(), SalesOrderLine.line_number.asc())
        .all()
    )
    receivable = (
        db.query(FinanceReceivable)
        .filter(
            FinanceReceivable.company_id == order.company_id,
            FinanceReceivable.source_type == "sales_order",
            FinanceReceivable.source_id == order.id,
        )
        .first()
    )
    paid = _money(receivable.amount_paid if receivable else 0)
    payments = (
        db.query(FinancePayment)
        .filter(
            FinancePayment.company_id == order.company_id,
            FinancePayment.source_type == "sales_order",
            FinancePayment.source_id == order.id,
            FinancePayment.direction == "inbound",
        )
        .order_by(FinancePayment.payment_date.asc(), FinancePayment.created_at.asc())
        .all()
    )
    payment_rows = [
        {"method": row.payment_method or "Payment", "amount": _money(row.amount)}
        for row in payments
        if _money(row.amount) > 0
    ]
    issued = order.invoiced_at.isoformat() if order.invoiced_at else order.order_date.isoformat()
    return {
        "company": preview,
        "layout": layout,
        "document": {
            "invoiceNumber": order.invoice_number,
            "issuedAt": issued,
            "customer": {
                "name": (customer.name if customer else "") or "Customer",
                "address": _customer_address(customer),
                "mobile": (customer.phone if customer else "") or "",
                "email": (customer.email if customer else "") or "",
            },
            "lines": [
                {
                    "name": line.name,
                    "sku": line.sku,
                    "description": line.notes or "",
                    "qty": float(line.quantity_ordered or 0),
                    "unitPrice": _money(line.unit_price),
                    "discount": _money(line.discount_amount),
                }
                for line in lines
            ],
            "paid": paid,
            "previousBalance": None,
            "payments": payment_rows,
        },
    }
