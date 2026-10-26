from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class OnHandLine(BaseModel):
    id: str
    sku: str
    name: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    on_hand: int
    reserved: int
    available: int
    incoming: int
    unit_cost: Decimal
    stock_value: Decimal
    status: str


class OnHandMeta(BaseModel):
    count: int
    total_units: int
    total_value: Decimal
    reserved_units: int
    available_units: int
    low_stock_count: int
    out_of_stock_count: int


class OnHandReportResponse(BaseModel):
    data: List[OnHandLine]
    meta: OnHandMeta
    errors: List[str] = []


class ValuationLine(BaseModel):
    id: str
    sku: str
    name: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    on_hand: int
    unit_cost: Decimal
    stock_value: Decimal
    sale_price: Decimal
    sales_value: Decimal
    profit: Decimal


class ValuationGroup(BaseModel):
    warehouse_id: str
    warehouse_name: Optional[str] = None
    sku_count: int
    units: int
    value: Decimal
    sales_value: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


class ValuationSupplierGroup(BaseModel):
    id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    sku_count: int
    units: int
    value: Decimal
    sales_value: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


class ValuationMeta(BaseModel):
    count: int
    total_units: int
    total_value: Decimal
    total_sales_value: Decimal = Decimal("0")
    total_profit: Decimal = Decimal("0")
    warehouse_count: int
    supplier_count: int = 0
    missing_price_count: int = 0
    unassigned_supplier_count: int = 0


class ValuationReportResponse(BaseModel):
    data: List[ValuationLine]
    groups: List[ValuationGroup]
    by_supplier: List[ValuationSupplierGroup] = []
    meta: ValuationMeta
    errors: List[str] = []


class SupplierValuationResponse(BaseModel):
    data: List[ValuationSupplierGroup]
    meta: ValuationMeta
    errors: List[str] = []


class MovementSummaryLine(BaseModel):
    id: str
    moved_on: Optional[date] = None
    movement_type: str
    movement_label: str
    effect: str
    sku: Optional[str] = None
    name: Optional[str] = None
    warehouse_name: Optional[str] = None
    quantity: int
    qty_before: int
    qty_after: int
    reference: Optional[str] = None
    created_at: datetime


class MovementTypeBucket(BaseModel):
    movement_type: str
    movement_label: str
    count: int
    qty_in: int
    qty_out: int


class MovementSummaryMeta(BaseModel):
    count: int
    total: int
    qty_in: int
    qty_out: int
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class MovementSummaryResponse(BaseModel):
    data: List[MovementSummaryLine]
    by_type: List[MovementTypeBucket]
    meta: MovementSummaryMeta
    errors: List[str] = []


class ProductReportItem(BaseModel):
    item_id: str
    product_id: Optional[str] = None
    name: str
    sku: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    cost_price: Decimal = Decimal("0")
    sale_price: Decimal = Decimal("0")
    track_quantity: bool = True


class ProductReportWarehouseStock(BaseModel):
    warehouse_id: str
    warehouse_name: Optional[str] = None
    on_hand: int
    reserved: int


class ProductReportStock(BaseModel):
    on_hand: int
    reserved: int
    available: int
    cost_value: Decimal
    sale_value: Decimal
    warehouses: List[ProductReportWarehouseStock] = []


class ProductReportTotals(BaseModel):
    # Movement ledger (in the period)
    purchased_qty: int
    purchased_value: Decimal
    purchase_return_qty: int
    delivered_qty: int
    adjustment_in_qty: int
    adjustment_out_qty: int
    other_in_qty: int
    other_out_qty: int
    # Sales documents (in the period)
    sold_qty: int
    sales_revenue: Decimal
    customer_return_qty: int
    customer_return_value: Decimal
    net_sold_qty: int
    net_revenue: Decimal
    cogs: Decimal
    profit: Decimal
    margin_pct: Optional[Decimal] = None
    # Serial / IMEI units sold in the period, by where their warranty stands today: still running, run out, or no expiry stamped
    # (the product's warranty text could not be read at the sale). All 0 for a product that is not serial-tracked.
    warranty_active_qty: int = 0
    warranty_expired_qty: int = 0
    warranty_unknown_qty: int = 0


class ProductReportMeta(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    movement_count: int
    movement_total: int


class ProductReportResponse(BaseModel):
    item: ProductReportItem
    stock: ProductReportStock
    totals: ProductReportTotals
    by_type: List[MovementTypeBucket]
    movements: List[MovementSummaryLine]
    meta: ProductReportMeta
    errors: List[str] = []


class ProductReportRow(BaseModel):
    """One catalog product's report, condensed to a datatable row (lifetime figures)."""

    item_id: str
    product_id: Optional[str] = None
    name: str
    sku: str
    category: Optional[str] = None
    brand: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    cost_price: Decimal = Decimal("0")
    sale_price: Decimal = Decimal("0")
    on_hand: int = 0
    reserved: int = 0
    available: int = 0
    stock_value: Decimal = Decimal("0")
    purchased_qty: int = 0
    purchased_value: Decimal = Decimal("0")
    sold_qty: int = 0
    sales_revenue: Decimal = Decimal("0")
    return_qty: int = 0
    return_value: Decimal = Decimal("0")
    net_sold_qty: int = 0
    net_revenue: Decimal = Decimal("0")
    cogs: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")
    margin_pct: Optional[Decimal] = None


class ProductReportListMeta(BaseModel):
    total: int
    page: int
    per_page: int
    # Sums over the *filtered* set, not just the current page.
    sum_stock_value: Decimal = Decimal("0")
    sum_sold_qty: int = 0
    sum_sales_revenue: Decimal = Decimal("0")
    sum_profit: Decimal = Decimal("0")


class ProductReportListResponse(BaseModel):
    data: List[ProductReportRow]
    meta: ProductReportListMeta
    errors: List[str] = []


class SerialReportLine(BaseModel):
    id: str
    serial_number: str
    sku: str
    name: str
    status: str
    warehouse_id: Optional[str] = None
    warehouse_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    source_type: str = "manual"
    received_on: Optional[date] = None
    sold_on: Optional[date] = None
    customer_name: str = ""
    order_number: Optional[str] = None
    warranty_expires_on: Optional[date] = None
    warranty_status: str = "unknown"
    days_to_warranty: Optional[int] = None
    days_in_stock: Optional[int] = None
    days_since_sold: Optional[int] = None
    rma_id: Optional[str] = None
    has_open_rma: bool = False


class SerialReportMeta(BaseModel):
    count: int
    in_stock: int = 0
    in_transit: int = 0
    sold: int = 0
    in_service: int = 0
    replaced: int = 0
    scrapped: int = 0
    lost: int = 0
    damaged: int = 0
    warranty_expiring_count: int = 0
    warranty_expired_count: int = 0
    aging_90_count: int = 0
    open_rma_count: int = 0
    no_warranty_count: int = 0


class SerialReportResponse(BaseModel):
    data: List[SerialReportLine]
    meta: SerialReportMeta


class ProfitLossReportResponse(BaseModel):
    """AgainPOS-style Profit / Loss report — periodic-inventory P&L.

    Fields with no backing data anywhere in this codebase yet (purchase/transfer
    shipping charges, purchase additional expenses, customer reward redemption
    value, sell round-off) are always 0 — flagged in each one's own comment
    rather than silently omitted, so the report's shape matches AgainPOS even
    before that data exists.
    """

    date_from: Optional[date] = None
    date_to: Optional[date] = None
    warehouse_id: Optional[str] = None

    opening_stock_by_purchase_price: Decimal
    opening_stock_by_sale_price: Decimal
    closing_stock_by_purchase_price: Decimal
    closing_stock_by_sale_price: Decimal

    total_purchase: Decimal
    total_stock_adjustment: Decimal
    total_expense: Decimal
    total_purchase_shipping_charge: Decimal
    purchase_additional_expenses: Decimal
    total_transfer_shipping_charge: Decimal
    total_sell_discount: Decimal
    total_customer_reward: Decimal
    total_sell_return: Decimal

    total_sales: Decimal
    total_sell_shipping_charge: Decimal
    sell_additional_expenses: Decimal
    total_stock_recovered: Decimal
    total_purchase_return: Decimal
    total_purchase_discount: Decimal
    total_sell_round_off: Decimal

    cogs: Decimal
    gross_profit: Decimal
    net_profit: Decimal


class ProfitBreakdownRow(BaseModel):
    key: str
    label: str
    qty: int
    revenue: Decimal
    cost: Decimal
    gross_profit: Decimal


class ProfitBreakdownMeta(BaseModel):
    count: int
    total: int
    page: int
    per_page: int
    total_gross_profit: Decimal


class ProfitBreakdownResponse(BaseModel):
    data: List[ProfitBreakdownRow]
    meta: ProfitBreakdownMeta
    errors: List[str] = []
