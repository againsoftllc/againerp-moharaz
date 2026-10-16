"""Company invoice numbering and print layout (AgainPOS invoice_schemes + invoice_layouts)."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.finance import FinanceReceivable

DEFAULT_CREDIT_PREFIX = "CN"
DEFAULT_PADDING = 4
DEFAULT_SEQUENCE = 1
DEFAULT_DUE_DAYS = 30
DEFAULT_TERMS = "Net 30"
DEFAULT_TAX = Decimal("0")
DEFAULT_FOOTER = ""
DEFAULT_CUSTOMER_SIGN = "Customer Signature"
DEFAULT_AUTHORISED_SIGN = "Authorised Signature"

DEFAULT_LAYOUT: dict[str, Any] = {
    "name": "Default",
    "design": "classic",
    "heading": "Invoice",
    "number_label": "Invoice No.",
    "date_label": "Date",
    "customer_label": "Customer",
    "product_label": "Product",
    "qty_label": "Quantity",
    "unit_price_label": "Unit Price",
    "line_subtotal_label": "Subtotal",
    "subtotal_label": "Subtotal",
    "discount_label": "Discount",
    "tax_label": "Tax",
    "total_label": "Total",
    "due_label": "Total Due",
    "paid_label": "Total Paid",
    "show_time": True,
    "show_sku": False,
    "show_brand": False,
    "show_category": True,
    "show_description": True,
    "show_logo": False,
    "show_business_name": False,
    "show_company_name": False,
    "show_legal_name": False,
    "show_location": True,
    "show_street": True,
    "show_landmark": True,
    "show_city": True,
    "show_state": True,
    "show_zip": True,
    "show_country": True,
    "show_phone": True,
    "show_mobile": True,
    "show_email": False,
    "show_website": False,
    "show_bin": True,
    "show_tax": True,
    "show_payments": True,
    "show_customer": True,
    "show_previous_balance": True,
    "show_warranty": True,
    "show_customer_signature": True,
    "show_authorised_signature": True,
    "customer_signature_label": DEFAULT_CUSTOMER_SIGN,
    "authorised_signature_label": DEFAULT_AUTHORISED_SIGN,
    "logo_url": "",
    "customer_signature_url": "",
    "authorised_signature_url": "",
}

DEFAULT_PACKING_LAYOUT: dict[str, Any] = {
    "heading": "Chalan",
    "number_label": "Chalan No.",
    "date_label": "Shipping Date",
    "order_label": "Order",
    "product_label": "Product",
    "ordered_label": "Ordered",
    "delivered_label": "Delivered",
    "prefix": "CH",
    "include_year": False,
    "padding": DEFAULT_PADDING,
    "next_sequence": DEFAULT_SEQUENCE,
    "footer": "",
    "show_time": False,
    "show_sku": True,
    "show_brand": False,
    "show_category": False,
    "show_description": False,
    "show_logo": True,
    "show_business_name": False,
    "show_company_name": False,
    "show_legal_name": False,
    "show_location": True,
    "show_street": True,
    "show_landmark": True,
    "show_city": True,
    "show_state": True,
    "show_zip": True,
    "show_country": True,
    "show_phone": True,
    "show_mobile": True,
    "show_email": False,
    "show_website": False,
    "show_bin": True,
    "show_customer": True,
    "show_warranty": False,
    "show_order": True,
    "show_shipping_date": True,
    "show_ordered": True,
    "show_delivered": True,
    "show_serial": False,
    "show_customer_signature": True,
    "show_authorised_signature": True,
    "customer_signature_label": DEFAULT_CUSTOMER_SIGN,
    "authorised_signature_label": DEFAULT_AUTHORISED_SIGN,
    "logo_url": "",
    "customer_signature_url": "",
    "authorised_signature_url": "",
}

DEFAULT_PURCHASE_LAYOUT: dict[str, Any] = {
    "heading": "Purchase Order",
    "number_label": "PO No.",
    "date_label": "Order Date",
    "vendor_label": "Vendor",
    "buyer_label": "Buyer",
    "reference_label": "Your Order Reference",
    "expected_label": "Expected Arrival",
    "warehouse_label": "Warehouse",
    "product_label": "Description",
    "qty_label": "Qty",
    "unit_cost_label": "Unit Cost",
    "discount_label": "Disc.",
    "tax_label": "Taxes",
    "amount_label": "Amount",
    "subtotal_label": "Subtotal",
    "total_label": "Total",
    "prefix": "PO",
    "include_year": False,
    "padding": DEFAULT_PADDING,
    "next_sequence": DEFAULT_SEQUENCE,
    "footer": "",
    "show_time": False,
    "show_sku": True,
    "show_logo": True,
    "show_business_name": False,
    "show_company_name": True,
    "show_legal_name": False,
    "show_location": True,
    "show_street": True,
    "show_landmark": True,
    "show_city": True,
    "show_state": True,
    "show_zip": True,
    "show_country": True,
    "show_phone": True,
    "show_mobile": True,
    "show_email": False,
    "show_website": False,
    "show_bin": True,
    "show_vendor": True,
    "show_buyer": True,
    "show_reference": True,
    "show_expected": True,
    "show_warehouse": True,
    "show_discount": True,
    "show_tax": True,
    "show_payment_terms": True,
    "show_customer_signature": True,
    "show_authorised_signature": True,
    "customer_signature_label": DEFAULT_CUSTOMER_SIGN,
    "authorised_signature_label": DEFAULT_AUTHORISED_SIGN,
    "logo_url": "",
    "customer_signature_url": "",
    "authorised_signature_url": "",
}

DEFAULT_PAYMENT_LAYOUT: dict[str, Any] = {
    "heading": "Payment Slip",
    "number_label": "Slip No.",
    "date_label": "Payment Date",
    "partner_label": "Received from",
    "method_label": "Payment Method",
    "amount_label": "Payment Amount",
    "memo_label": "Memo",
    "invoice_date_label": "Invoice Date",
    "invoice_number_label": "Invoice Number",
    "reference_label": "Reference",
    "invoice_amount_label": "Amount",
    "due_label": "Due Amount",
    "prefix": "PAY",
    "include_year": False,
    "padding": DEFAULT_PADDING,
    "next_sequence": DEFAULT_SEQUENCE,
    "footer": "",
    "show_time": False,
    "show_logo": True,
    "show_business_name": False,
    "show_company_name": True,
    "show_legal_name": False,
    "show_location": True,
    "show_street": True,
    "show_landmark": True,
    "show_city": True,
    "show_state": True,
    "show_zip": True,
    "show_country": True,
    "show_phone": True,
    "show_mobile": True,
    "show_email": False,
    "show_website": False,
    "show_bin": True,
    "show_partner": True,
    "show_method": True,
    "show_amount": True,
    "show_memo": True,
    "show_invoices": True,
    "show_customer_signature": True,
    "show_authorised_signature": True,
    "customer_signature_label": DEFAULT_CUSTOMER_SIGN,
    "authorised_signature_label": DEFAULT_AUTHORISED_SIGN,
    "logo_url": "",
    "customer_signature_url": "",
    "authorised_signature_url": "",
}


def _padding(value: Optional[int]) -> int:
    try:
        n = int(value or DEFAULT_PADDING)
    except (TypeError, ValueError):
        n = DEFAULT_PADDING
    return max(1, min(n, 8))


def _sequence(value: Optional[int]) -> int:
    try:
        n = int(value or DEFAULT_SEQUENCE)
    except (TypeError, ValueError):
        n = DEFAULT_SEQUENCE
    return max(1, n)


def due_days_of(company: Optional[Company]) -> int:
    try:
        n = int(company.invoice_due_days) if company and company.invoice_due_days is not None else DEFAULT_DUE_DAYS
    except (TypeError, ValueError):
        n = DEFAULT_DUE_DAYS
    return max(0, min(n, 365))


def format_invoice_number(
    *,
    prefix: Optional[str],
    include_year: Optional[bool],
    padding: Optional[int],
    sequence: int,
    year: Optional[int] = None,
) -> str:
    """AgainPOS scheme: blank → 0042, year → 2026/0042. Prefix is optional."""
    head = (prefix or "").strip()
    body = str(max(1, sequence)).zfill(_padding(padding))
    if include_year:
        stamped = f"{year or date.today().year}/{body}"
        return f"{head}{stamped}" if head else stamped
    return f"{head}{body}"


def parse_invoice_layout(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULT_LAYOUT)
    data: Any = raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return out
    if not isinstance(data, dict):
        return out
    for key, default in DEFAULT_LAYOUT.items():
        if key not in data:
            continue
        value = data[key]
        if isinstance(default, bool):
            out[key] = bool(value)
        elif isinstance(default, str):
            out[key] = str(value).strip() if value is not None else default
    if "show_company_name" not in data and "show_business_name" in data:
        out["show_company_name"] = bool(data["show_business_name"])
    return out


def dump_invoice_layout(layout: Any) -> str:
    return json.dumps(parse_invoice_layout(layout), ensure_ascii=False)


def parse_packing_layout(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULT_PACKING_LAYOUT)
    data: Any = raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return out
    if not isinstance(data, dict):
        return out
    for key, default in DEFAULT_PACKING_LAYOUT.items():
        if key not in data:
            continue
        value = data[key]
        if isinstance(default, bool):
            out[key] = bool(value)
        elif isinstance(default, int) and not isinstance(default, bool):
            try:
                out[key] = int(value)
            except (TypeError, ValueError):
                out[key] = default
        elif isinstance(default, str):
            out[key] = str(value).strip() if value is not None else default
    out["padding"] = _padding(out.get("padding"))
    out["next_sequence"] = _sequence(out.get("next_sequence"))
    if not str(out.get("logo_url") or "").strip() and not out.get("show_logo"):
        out["show_logo"] = True
    return out


def dump_packing_layout(layout: Any) -> str:
    return json.dumps(parse_packing_layout(layout), ensure_ascii=False)


def parse_purchase_layout(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULT_PURCHASE_LAYOUT)
    data: Any = raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return out
    if not isinstance(data, dict):
        return out
    for key, default in DEFAULT_PURCHASE_LAYOUT.items():
        if key not in data:
            continue
        value = data[key]
        if isinstance(default, bool):
            out[key] = bool(value)
        elif isinstance(default, int) and not isinstance(default, bool):
            try:
                out[key] = int(value)
            except (TypeError, ValueError):
                out[key] = default
        elif isinstance(default, str):
            out[key] = str(value).strip() if value is not None else default
    out["padding"] = _padding(out.get("padding"))
    out["next_sequence"] = _sequence(out.get("next_sequence"))
    if not str(out.get("logo_url") or "").strip() and not out.get("show_logo"):
        out["show_logo"] = True
    return out


def dump_purchase_layout(layout: Any) -> str:
    return json.dumps(parse_purchase_layout(layout), ensure_ascii=False)


def parse_payment_layout(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULT_PAYMENT_LAYOUT)
    data: Any = raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return out
    if not isinstance(data, dict):
        return out
    for key, default in DEFAULT_PAYMENT_LAYOUT.items():
        if key not in data:
            continue
        value = data[key]
        if isinstance(default, bool):
            out[key] = bool(value)
        elif isinstance(default, int) and not isinstance(default, bool):
            try:
                out[key] = int(value)
            except (TypeError, ValueError):
                out[key] = default
        elif isinstance(default, str):
            out[key] = str(value).strip() if value is not None else default
    out["padding"] = _padding(out.get("padding"))
    out["next_sequence"] = _sequence(out.get("next_sequence"))
    if not str(out.get("logo_url") or "").strip() and not out.get("show_logo"):
        out["show_logo"] = True
    return out


def dump_payment_layout(layout: Any) -> str:
    return json.dumps(parse_payment_layout(layout), ensure_ascii=False)


def _is_signature_label(line: str) -> bool:
    return "signature" in line.lower()


def peel_legacy_signature_footer(footer: str, layout: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Move old 'Customer Signature / Authorised Signature' footer lines onto layout labels."""
    out = dict(layout)
    lines = [ln.strip() for ln in (footer or "").replace("\r\n", "\n").split("\n") if ln.strip()]
    if lines and _is_signature_label(lines[0]):
        out["customer_signature_label"] = lines[0]
        out["show_customer_signature"] = True
        lines = lines[1:]
        if lines and _is_signature_label(lines[0]):
            out["authorised_signature_label"] = lines[0]
            out["show_authorised_signature"] = True
            lines = lines[1:]
    return "\n".join(lines), out


def preview_invoice_number(company: Optional[Company]) -> str:
    return format_invoice_number(
        prefix=company.invoice_prefix if company else "",
        include_year=bool(company.invoice_include_year) if company else False,
        padding=company.invoice_padding if company else DEFAULT_PADDING,
        sequence=_sequence(company.invoice_next_sequence if company else None),
    )


def apply_invoice_defaults(company: Company) -> None:
    if company.invoice_include_year is None:
        company.invoice_include_year = False
    if company.invoice_padding is None:
        company.invoice_padding = DEFAULT_PADDING
    if company.invoice_next_sequence is None:
        company.invoice_next_sequence = DEFAULT_SEQUENCE
    if company.invoice_due_days is None:
        company.invoice_due_days = DEFAULT_DUE_DAYS
    if not (company.invoice_payment_terms or "").strip():
        company.invoice_payment_terms = DEFAULT_TERMS
    if company.invoice_tax_rate is None:
        company.invoice_tax_rate = DEFAULT_TAX
    if company.invoice_prices_include_tax is None:
        company.invoice_prices_include_tax = True
    if company.tax_enabled is None:
        company.tax_enabled = True
    if not (company.credit_note_prefix or "").strip():
        company.credit_note_prefix = DEFAULT_CREDIT_PREFIX
    if company.invoice_footer is None:
        company.invoice_footer = DEFAULT_FOOTER
    if not (company.invoice_layout or "").strip():
        company.invoice_layout = json.dumps(DEFAULT_LAYOUT, ensure_ascii=False)
    if not (company.packing_layout or "").strip():
        company.packing_layout = json.dumps(DEFAULT_PACKING_LAYOUT, ensure_ascii=False)
    if not (company.purchase_layout or "").strip():
        company.purchase_layout = json.dumps(DEFAULT_PURCHASE_LAYOUT, ensure_ascii=False)
    if not (company.payment_layout or "").strip():
        company.payment_layout = json.dumps(DEFAULT_PAYMENT_LAYOUT, ensure_ascii=False)


def invoice_read_values(company: Company) -> dict:
    layout = parse_invoice_layout(company.invoice_layout)
    footer, layout = peel_legacy_signature_footer(company.invoice_footer or "", layout)
    packing = parse_packing_layout(company.packing_layout)
    purchase = parse_purchase_layout(company.purchase_layout)
    payment = parse_payment_layout(company.payment_layout)
    sequence = _sequence(company.invoice_next_sequence)
    include_year = bool(company.invoice_include_year)
    padding = _padding(company.invoice_padding)
    prefix = company.invoice_prefix or ""
    return {
        "invoice_prefix": prefix,
        "invoice_include_year": include_year,
        "invoice_padding": padding,
        "invoice_next_sequence": sequence,
        "invoice_due_days": due_days_of(company),
        "invoice_payment_terms": (company.invoice_payment_terms or "").strip() or DEFAULT_TERMS,
        "invoice_tax_rate": company.invoice_tax_rate if company.invoice_tax_rate is not None else DEFAULT_TAX,
        "invoice_prices_include_tax": True if company.invoice_prices_include_tax is None else bool(company.invoice_prices_include_tax),
        "tax_enabled": True if company.tax_enabled is None else bool(company.tax_enabled),
        "invoice_footer": footer,
        "credit_note_prefix": (company.credit_note_prefix or "").strip() or DEFAULT_CREDIT_PREFIX,
        "invoice_layout": layout,
        "invoice_next_preview": format_invoice_number(
            prefix=prefix,
            include_year=include_year,
            padding=padding,
            sequence=sequence,
        ),
        "packing_layout": packing,
        "packing_next_preview": format_invoice_number(
            prefix=packing.get("prefix") or "",
            include_year=bool(packing.get("include_year")),
            padding=packing.get("padding"),
            sequence=packing.get("next_sequence"),
        ),
        "purchase_layout": purchase,
        "purchase_next_preview": format_invoice_number(
            prefix=purchase.get("prefix") or "",
            include_year=bool(purchase.get("include_year")),
            padding=purchase.get("padding"),
            sequence=purchase.get("next_sequence"),
        ),
        "payment_layout": payment,
        "payment_next_preview": format_invoice_number(
            prefix=payment.get("prefix") or "",
            include_year=bool(payment.get("include_year")),
            padding=payment.get("padding"),
            sequence=payment.get("next_sequence"),
        ),
    }


def allocate_invoice_number(db: Session, company_id: str) -> str:
    company = db.get(Company, company_id)
    seq = _sequence(company.invoice_next_sequence if company else None)
    for _ in range(1000):
        number = format_invoice_number(
            prefix=company.invoice_prefix if company else "",
            include_year=bool(company.invoice_include_year) if company else False,
            padding=company.invoice_padding if company else DEFAULT_PADDING,
            sequence=seq,
        )
        exists = (
            db.query(FinanceReceivable.id)
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.invoice_number == number,
            )
            .first()
        )
        if not exists:
            if company:
                company.invoice_next_sequence = seq + 1
            return number
        seq += 1
    raise HTTPException(status_code=500, detail="Could not allocate an invoice number")
