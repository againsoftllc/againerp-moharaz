"""Per-item history feeds for the product drawer (sales, purchases, ledger, RMA, prices)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class PageMeta(BaseModel):
    total: int
    page: int
    per_page: int


class LabelValue(BaseModel):
    value: str
    label: str


# ---- sales -------------------------------------------------------------------


class ProductSalesRow(BaseModel):
    id: str
    date: Optional[dt.date] = None
    order_id: str
    order_number: str
    invoice_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    status: str


class ProductSalesMeta(PageMeta):
    sum_qty: int
    sum_total: Decimal


class ProductSalesResponse(BaseModel):
    data: List[ProductSalesRow]
    meta: ProductSalesMeta


# ---- purchases ---------------------------------------------------------------


class ProductPurchaseRow(BaseModel):
    id: str
    date: Optional[dt.date] = None
    po_id: str
    po_number: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    quantity_ordered: int
    quantity_received: int
    unit_cost: Decimal
    line_total: Decimal
    status: str


class ProductPurchaseMeta(PageMeta):
    sum_qty: int
    sum_total: Decimal
    # Over every counted purchase line in the period (not just this page): the cheapest and dearest unit cost paid, and the
    # average cost per unit (total spent / total quantity, so a big order weighs more than a small one). Null with no purchases.
    min_cost: Optional[Decimal] = None
    max_cost: Optional[Decimal] = None
    avg_cost: Optional[Decimal] = None


class ProductPurchaseResponse(BaseModel):
    data: List[ProductPurchaseRow]
    meta: ProductPurchaseMeta


# ---- stock ledger --------------------------------------------------------------


class ProductLedgerRow(BaseModel):
    id: str
    date: Optional[dt.date] = None
    reference: Optional[str] = None
    movement_type: str
    movement_label: str
    direction: str
    qty_in: int
    qty_out: int
    balance: int
    warehouse_id: str
    warehouse_name: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    party_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[dt.datetime] = None


class ProductLedgerMeta(PageMeta):
    opening_balance: int
    closing_balance: int
    movement_types: List[LabelValue]


class ProductLedgerResponse(BaseModel):
    data: List[ProductLedgerRow]
    meta: ProductLedgerMeta


# ---- RMA -----------------------------------------------------------------------


class ProductRmaRow(BaseModel):
    id: str
    rma_number: str
    serial_number: Optional[str] = None
    customer_name: Optional[str] = None
    order_number: Optional[str] = None
    warranty_status: str
    warranty_expires_on: Optional[dt.date] = None
    status: str
    resolution_type: Optional[str] = None
    created_at: Optional[dt.datetime] = None


class ProductRmaResponse(BaseModel):
    data: List[ProductRmaRow]
    meta: PageMeta


# ---- price history ---------------------------------------------------------------


class ProductPriceRow(BaseModel):
    id: str
    date: Optional[dt.datetime] = None
    price_type: str
    price_label: str
    old_price: Optional[Decimal] = None
    new_price: Optional[Decimal] = None
    changed_by_name: Optional[str] = None


class ProductPriceMeta(PageMeta):
    price_types: List[LabelValue]


class ProductPriceResponse(BaseModel):
    data: List[ProductPriceRow]
    meta: ProductPriceMeta
