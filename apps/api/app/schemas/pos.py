from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class PosSessionRead(BaseModel):
    id: str
    company_id: str
    warehouse_id: str
    terminal_id: Optional[str] = None
    register_name: str
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None
    status: str
    opening_float: Decimal
    closing_cash: Optional[Decimal] = None
    expected_cash: Optional[Decimal] = None
    cash_variance: Optional[Decimal] = None
    total_sales: Decimal
    total_returns: Decimal
    sale_count: int
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None
    opening_note: Optional[str] = None
    closing_note: Optional[str] = None

    model_config = {"from_attributes": True}


class PosSessionOpen(BaseModel):
    warehouse_id: Optional[str] = None
    terminal_id: Optional[str] = None
    register_name: str = "Register 1"
    opening_float: Decimal = Field(default=Decimal("0"), ge=0)
    cashier_name: Optional[str] = None
    notes: Optional[str] = None
    opening_note: Optional[str] = None


class PosSessionClose(BaseModel):
    closing_cash: Decimal = Field(ge=0)
    notes: Optional[str] = None


class PosTerminalRead(BaseModel):
    id: str
    company_id: str
    name: str
    code: str
    warehouse_id: str
    default_cash_account_id: Optional[str] = None
    payment_methods: List[str] = Field(default_factory=list)
    receipt_printer: Optional[str] = None
    barcode_scanner: Optional[str] = None
    customer_display: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PosTerminalCreate(BaseModel):
    name: str
    code: str
    warehouse_id: str
    default_cash_account_id: Optional[str] = None
    payment_methods: List[str] = Field(default_factory=lambda: ["cash", "card"])
    receipt_printer: Optional[str] = None
    barcode_scanner: Optional[str] = None
    customer_display: Optional[str] = None
    status: str = "active"


class PosTerminalUpdate(BaseModel):
    name: Optional[str] = None
    warehouse_id: Optional[str] = None
    default_cash_account_id: Optional[str] = None
    payment_methods: Optional[List[str]] = None
    receipt_printer: Optional[str] = None
    barcode_scanner: Optional[str] = None
    customer_display: Optional[str] = None
    status: Optional[str] = None


class PosProductRead(BaseModel):
    item_id: str
    sku: str
    barcode: Optional[str] = None
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit_price: float
    on_hand: int
    available: int
    thumbnail: Optional[str] = None
    track_serial: bool = False
    warranty: Optional[str] = None
    warranty_end: Optional[str] = None
    scanned_serial: Optional[str] = None
    serial_status: Optional[str] = None


class PosSerialRead(BaseModel):
    id: str
    serial_number: str
    status: str
    warehouse_id: Optional[str] = None


class PosCartLineRead(BaseModel):
    id: str
    item_id: str
    line_number: int
    sku: str
    name: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
    serial_number: Optional[str] = None
    warranty_text: Optional[str] = None
    thumbnail: Optional[str] = None
    available: Optional[int] = None

    model_config = {"from_attributes": True}


class PosCartRead(BaseModel):
    id: str
    session_id: str
    warehouse_id: str
    customer_id: Optional[str] = None
    cart_number: str
    status: str
    subtotal: Decimal
    tax_total: Decimal
    discount_total: Decimal
    order_discount: Decimal = Decimal("0")
    total: Decimal
    sales_order_id: Optional[str] = None
    held_label: Optional[str] = None
    held_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    lines: List[PosCartLineRead] = Field(default_factory=list)


class PosLineAdd(BaseModel):
    item_id: str
    quantity: int = Field(default=1, ge=1)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    serial_number: Optional[str] = None


class PosLineQtyUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=0)
    discount_amount: Optional[Decimal] = Field(default=None, ge=0)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0)


class PosHoldRequest(BaseModel):
    label: Optional[str] = None


class PosDiscountRequest(BaseModel):
    amount: Decimal = Field(ge=0)


class PosPaymentInput(BaseModel):
    payment_method: str
    amount: Decimal = Field(gt=0)
    reference: Optional[str] = None
    card_last4: Optional[str] = None


class PosCompleteRequest(BaseModel):
    payments: List[PosPaymentInput] = Field(min_length=1)
    client_mutation_id: Optional[str] = None


class PosReceiptRead(BaseModel):
    id: str
    receipt_number: str
    sales_order_id: str
    invoice_number: str
    receipt_data: dict[str, Any]
    printed_at: Optional[datetime] = None
    created_at: datetime


class PosCompleteResponse(BaseModel):
    cart: PosCartRead
    receipt: PosReceiptRead


class PosReturnLineInput(BaseModel):
    item_id: str
    quantity: int = Field(ge=1)
    refund_amount: Decimal = Field(ge=0)
    sales_order_line_id: Optional[str] = None
    serial_number: Optional[str] = None


class PosReturnCreate(BaseModel):
    original_sales_order_id: str
    lines: List[PosReturnLineInput] = Field(min_length=1)
    refund_method: str = "cash"
    reason: Optional[str] = None
    client_mutation_id: Optional[str] = None


class PosReturnRead(BaseModel):
    id: str
    return_number: str
    original_sales_order_id: str
    status: str
    refund_total: Decimal
    refund_method: str
    reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PosCashMovementCreate(BaseModel):
    direction: str
    amount: Decimal = Field(gt=0)
    reason: str = "other"
    note: Optional[str] = None


class PosCashMovementRead(BaseModel):
    id: str
    session_id: str
    direction: str
    amount: Decimal
    reason: str
    note: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PosDashboardRead(BaseModel):
    open_session_count: int
    completed_sale_count: int
    held_cart_count: int
    today: dict[str, Any] = Field(default_factory=dict)
    current_session: Optional[dict[str, Any]] = None
    recent_orders: List[dict[str, Any]] = Field(default_factory=list)


class PosDashboardResponse(BaseModel):
    data: PosDashboardRead


class PosSettingsUpdate(BaseModel):
    default_customer_id: Optional[str] = None
    default_warehouse_id: Optional[str] = None
    default_tax_rate: Optional[float] = None
    default_payment_method: Optional[str] = None
    receipt_size: Optional[str] = None
    receipt_footer: Optional[str] = None
    return_policy: Optional[str] = None
    show_warranty: Optional[bool] = None
    allow_discount: Optional[bool] = None
    allow_price_override: Optional[bool] = None
    require_customer: Optional[bool] = None
    require_opening_cash: Optional[bool] = None
    require_closing_cash: Optional[bool] = None
    logo_url: Optional[str] = None


def terminal_to_read(row) -> PosTerminalRead:
    try:
        methods = json.loads(row.payment_methods_json or "[]")
    except json.JSONDecodeError:
        methods = ["cash", "card"]
    return PosTerminalRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        code=row.code,
        warehouse_id=row.warehouse_id,
        default_cash_account_id=row.default_cash_account_id,
        payment_methods=methods if isinstance(methods, list) else ["cash", "card"],
        receipt_printer=row.receipt_printer,
        barcode_scanner=row.barcode_scanner,
        customer_display=row.customer_display,
        status=row.status,
        created_at=row.created_at,
    )


def cart_to_read(cart, lines) -> PosCartRead:
    return PosCartRead(
        id=cart.id,
        session_id=cart.session_id,
        warehouse_id=cart.warehouse_id,
        customer_id=cart.customer_id,
        cart_number=cart.cart_number,
        status=cart.status,
        subtotal=cart.subtotal,
        tax_total=cart.tax_total,
        discount_total=cart.discount_total,
        order_discount=getattr(cart, "order_discount", Decimal("0")) or Decimal("0"),
        total=cart.total,
        sales_order_id=cart.sales_order_id,
        held_label=cart.held_label,
        held_at=cart.held_at,
        completed_at=cart.completed_at,
        notes=cart.notes,
        lines=[PosCartLineRead.model_validate(l) for l in lines],
    )


def receipt_to_read(receipt) -> PosReceiptRead:
    return PosReceiptRead(
        id=receipt.id,
        receipt_number=receipt.receipt_number,
        sales_order_id=receipt.sales_order_id,
        invoice_number=receipt.invoice_number,
        receipt_data=json.loads(receipt.receipt_json or "{}"),
        printed_at=receipt.printed_at,
        created_at=receipt.created_at,
    )
