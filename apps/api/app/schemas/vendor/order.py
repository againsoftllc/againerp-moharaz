from __future__ import annotations

from datetime import date as date_, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class VendorFinalOrderRead(BaseModel):
    id: str
    order_number: str
    status: str
    payment_status: str
    vendor_id: Optional[str] = None
    vendor_quotation_id: Optional[str] = None
    vendor_order_request_id: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    grand_total: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    created_at: datetime


class VendorFinalOrderResponse(BaseModel):
    data: VendorFinalOrderRead


class VendorInvoiceRead(BaseModel):
    id: str
    invoice_number: str
    vendor_id: str
    vendor_name: Optional[str] = None
    order_id: str
    quotation_id: Optional[str] = None
    status: str
    bill_date: date_
    due_date: date_
    subtotal: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    grand_total: Decimal
    amount_paid: Decimal
    balance: Decimal
    created_at: datetime


class VendorInvoiceListResponse(BaseModel):
    data: List[VendorInvoiceRead]
    total: int


class VendorInvoiceResponse(BaseModel):
    data: VendorInvoiceRead
