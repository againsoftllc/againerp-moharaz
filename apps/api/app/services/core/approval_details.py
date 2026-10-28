"""What an approver sees when they open a request on Inventory > Approve (docs/approval.md).

A request stores the call that is waiting, not a copy of the document. So the drawer is built from the record the call
points at, read *now*: the header facts, the lines, and for a call that carries its own values (a payment, a voucher) those
values next to the party's balance. Each builder returns a `DocumentView`; the web renders it as the drawer's Document tab,
so a new document type needs a builder here and nothing in the web.

Builders never raise: a record that is gone reads as "no longer exists", a missing field is left out.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.services.core.approval_actions import (
    _customer_name,
    _get,
    _money,
    _supplier_name,
    _warehouse_name,
)


@dataclass
class Fact:
    label: str
    value: str
    # "warn" / "bad" / "good" colour the value; None = plain
    tone: Optional[str] = None


@dataclass
class Column:
    key: str
    label: str
    align: str = "left"  # left | right


@dataclass
class Table:
    title: str
    columns: list[Column]
    rows: list[dict[str, str]]
    # one totals row under the table, same keys as the rows
    footer: Optional[dict[str, str]] = None
    # row keys whose value should be flagged (for example "In stock" below what the order needs)
    warn_rows: list[int] = field(default_factory=list)


@dataclass
class Link:
    """A record the approver can open in its own drawer to cross-check (the web knows how to open each `kind`)."""

    kind: str  # sales_order | quotation | stock_adjustment | stock_transfer
    id: str
    label: str


@dataclass
class DocumentView:
    heading: str = ""
    facts: list[Fact] = field(default_factory=list)
    tables: list[Table] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


Builder = Callable[[Session, dict[str, str], dict[str, Any]], DocumentView]


# ------------------------------------------------------------------------------------------------ formatting


def _money_s(value: Any) -> str:
    m = _money(value)
    return f"{m:,.2f}" if m is not None else "—"


def _int_s(value: Any) -> str:
    try:
        return f"{int(Decimal(str(value))):,}"
    except Exception:
        return "—"


def _date_s(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.strftime("%d/%m/%Y")
    return str(value) if value else "—"


def _serials_s(raw: Any) -> str:
    if not raw:
        return "—"
    try:
        values = json.loads(raw) if isinstance(raw, str) else list(raw)
    except Exception:
        return "—"
    values = [str(v) for v in values if v]
    if not values:
        return "—"
    return ", ".join(values[:6]) + (f" +{len(values) - 6} more" if len(values) > 6 else "")


def _facts(*pairs: tuple[str, Any]) -> list[Fact]:
    """Drops pairs with nothing to say, so the drawer never shows a column of dashes."""
    out: list[Fact] = []
    for pair in pairs:
        label, value = pair[0], pair[1]
        tone = pair[2] if len(pair) > 2 else None
        if value is None or str(value).strip() in ("", "—"):
            continue
        out.append(Fact(label, str(value), tone))
    return out


def _missing(what: str) -> DocumentView:
    return DocumentView(heading=what, notes=[f"{what} no longer exists, so there is nothing to show. Approving will fail."])


def _on_hand(db: Session, item_id: Optional[str], warehouse_id: Optional[str]) -> Optional[int]:
    from app.models.inventory_stock_level import InventoryStockLevel

    if not item_id or not warehouse_id:
        return None
    total = (
        db.query(func.coalesce(func.sum(InventoryStockLevel.on_hand), 0))
        .filter(InventoryStockLevel.item_id == item_id, InventoryStockLevel.warehouse_id == warehouse_id)
        .scalar()
    )
    return int(total or 0)


# ------------------------------------------------------------------------------------------------ purchase


def _receipt(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
    from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine

    r = _get(db, PurchaseReceipt, p.get("receipt_id"))
    if r is None:
        return _missing("This goods receipt")
    po = _get(db, PurchaseOrder, r.purchase_order_id)
    rows: list[dict[str, str]] = []
    total = Decimal("0")
    units = 0
    for line in db.query(PurchaseReceiptLine).filter(PurchaseReceiptLine.purchase_receipt_id == r.id).all():
        pol = _get(db, PurchaseOrderLine, line.purchase_order_line_id)
        net = Decimal("0")
        if pol is not None:
            net = Decimal(pol.unit_cost or 0)
            if pol.quantity_ordered:
                net -= Decimal(pol.discount_amount or 0) / Decimal(pol.quantity_ordered)
        amount = net * Decimal(line.quantity_received or 0) * (1 + Decimal(getattr(pol, "tax_rate", 0) or 0) / 100)
        total += amount
        units += int(line.quantity_received or 0)
        rows.append(
            {
                "product": f"{getattr(pol, 'name', '') or '—'}" + (f"  ·  {pol.sku}" if pol is not None and pol.sku else ""),
                "ordered": _int_s(getattr(pol, "quantity_ordered", None)),
                "before": _int_s(getattr(pol, "quantity_received", None)),
                "now": _int_s(line.quantity_received),
                "cost": _money_s(net),
                "amount": _money_s(amount),
                "serials": _serials_s(line.serials_json),
            }
        )
    return DocumentView(
        heading=f"Goods receipt {r.receipt_number}",
        facts=_facts(
            ("Receipt", r.receipt_number),
            ("Purchase order", po.po_number if po else None),
            ("Supplier", _supplier_name(db, r.supplier_id)),
            ("Received into", _warehouse_name(db, r.warehouse_id)),
            ("Receipt date", _date_s(r.receipt_date)),
            ("Received by", r.received_by),
            ("Status", r.status.title()),
            ("Notes", r.notes),
        ),
        tables=[
            Table(
                "Items received",
                [
                    Column("product", "Product"),
                    Column("ordered", "Ordered", "right"),
                    Column("before", "Received before", "right"),
                    Column("now", "Receiving now", "right"),
                    Column("cost", "Unit cost", "right"),
                    Column("amount", "Amount", "right"),
                    Column("serials", "Serials"),
                ],
                rows,
                footer={"product": "Total", "now": _int_s(units), "amount": _money_s(total)},
            )
        ],
        notes=["Approving adds these units to stock and raises the supplier payable."],
    )


def _purchase_return(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
    from app.models.purchase_return import PurchaseReturn, PurchaseReturnLine

    r = _get(db, PurchaseReturn, p.get("return_id"))
    if r is None:
        return _missing("This purchase return")
    po = _get(db, PurchaseOrder, r.purchase_order_id)
    rows: list[dict[str, str]] = []
    units = 0
    for line in db.query(PurchaseReturnLine).filter(PurchaseReturnLine.purchase_return_id == r.id).all():
        pol = _get(db, PurchaseOrderLine, line.purchase_order_line_id)
        units += int(line.quantity_returned or 0)
        rows.append(
            {
                "product": f"{getattr(pol, 'name', '') or '—'}" + (f"  ·  {pol.sku}" if pol is not None and pol.sku else ""),
                "qty": _int_s(line.quantity_returned),
                "cost": _money_s(line.unit_cost),
                "tax": f"{Decimal(line.tax_rate or 0):g}%",
                "serials": _serials_s(line.serials_json),
            }
        )
    return DocumentView(
        heading=f"Purchase return {r.return_number}",
        facts=_facts(
            ("Return", r.return_number),
            ("Purchase order", po.po_number if po else None),
            ("Supplier", _supplier_name(db, r.supplier_id)),
            ("Goods leave", _warehouse_name(db, r.warehouse_id)),
            ("Reason", (r.reason or "").replace("_", " ").title()),
            ("Return date", _date_s(r.return_date)),
            ("Requested by", r.requested_by),
            ("Status", r.status.title()),
            ("Subtotal", _money_s(r.subtotal)),
            ("Tax", _money_s(r.tax_amount)),
            ("Credit from supplier", _money_s(r.credit_amount), "good"),
            ("Notes", r.notes),
        ),
        tables=[
            Table(
                "Items going back",
                [
                    Column("product", "Product"),
                    Column("qty", "Qty", "right"),
                    Column("cost", "Unit cost", "right"),
                    Column("tax", "Tax", "right"),
                    Column("serials", "Serials"),
                ],
                rows,
                footer={"product": "Total", "qty": _int_s(units)},
            )
        ],
        notes=["Approving takes these units out of stock and posts the credit note on the supplier's account."],
    )


def _adjustment(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.inventory_stock_adjustment import InventoryStockAdjustment

    a = _get(db, InventoryStockAdjustment, p.get("adjustment_id"))
    if a is None:
        return _missing("This stock adjustment")
    rows: list[dict[str, str]] = []
    warn: list[int] = []
    net = 0
    for i, line in enumerate(getattr(a, "lines", []) or []):
        diff = int(line.adjustment_qty or 0)
        net += diff
        # the on-hand figure may have moved since the count was taken: the apply is refused when it did
        now = _on_hand(db, line.item_id, a.warehouse_id)
        if now is not None and now != int(line.system_qty or 0):
            warn.append(i)
        rows.append(
            {
                "product": f"{line.name or '—'}" + (f"  ·  {line.sku}" if line.sku else ""),
                "system": _int_s(line.system_qty),
                "counted": _int_s(line.physical_qty),
                "change": f"{diff:+d}",
                "now": _int_s(now) if now is not None else "—",
            }
        )
    notes = ["Approving sets the on-hand quantity to the counted quantity."]
    if warn:
        notes.append("Stock on hand has changed since this count (marked): approving will be refused until the adjustment is redone.")
    return DocumentView(
        links=[Link("stock_adjustment", a.id, a.adjustment_number)],
        heading=f"Stock adjustment {a.adjustment_number}",
        facts=_facts(
            ("Adjustment", a.adjustment_number),
            ("Location", _warehouse_name(db, a.warehouse_id)),
            ("Reason", (a.reason or "").replace("_", " ").title()),
            ("Date", _date_s(a.adjustment_date)),
            ("Reference", a.reference_number),
            ("Status", a.status.title()),
            ("Details", a.reason_details),
            ("Notes", a.notes),
        ),
        tables=[
            Table(
                "Counted items",
                [
                    Column("product", "Product"),
                    Column("system", "System qty", "right"),
                    Column("counted", "Counted", "right"),
                    Column("change", "Change", "right"),
                    Column("now", "On hand now", "right"),
                ],
                rows,
                footer={"product": "Net change", "change": f"{net:+d}"},
                warn_rows=warn,
            )
        ],
        notes=notes,
    )


# ------------------------------------------------------------------------------------------------ sales


def _order_lines_table(db: Session, order: Any, title: str = "Order lines") -> Table:
    from app.models.sales import SalesOrderLine

    rows: list[dict[str, str]] = []
    warn: list[int] = []
    units = 0
    total = Decimal("0")
    for i, line in enumerate(
        db.query(SalesOrderLine).filter(SalesOrderLine.sales_order_id == order.id).order_by(SalesOrderLine.line_number).all()
    ):
        qty = int(line.quantity_ordered or 0)
        units += qty
        total += Decimal(line.line_total or 0)
        have = _on_hand(db, line.item_id, order.warehouse_id)
        # confirming sells stock: flag a line the location cannot cover
        if have is not None and have < qty and order.status in ("draft", "pending"):
            warn.append(i)
        rows.append(
            {
                "product": f"{line.name or '—'}" + (f"  ·  {line.sku}" if line.sku else ""),
                "qty": _int_s(qty),
                "price": _money_s(line.unit_price),
                "discount": _money_s(line.discount_amount),
                "tax": _money_s(line.tax_amount),
                "total": _money_s(line.line_total),
                "stock": _int_s(have) if have is not None else "—",
                "serials": _serials_s(line.serial_numbers_json),
            }
        )
    return Table(
        title,
        [
            Column("product", "Product"),
            Column("qty", "Qty", "right"),
            Column("price", "Unit price", "right"),
            Column("discount", "Discount", "right"),
            Column("tax", "Tax", "right"),
            Column("total", "Amount", "right"),
            Column("stock", "In stock here", "right"),
            Column("serials", "Serials"),
        ],
        rows,
        footer={"product": "Total", "qty": _int_s(units), "total": _money_s(total)},
        warn_rows=warn,
    )


def _sales_order(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesOrder

    order = _get(db, SalesOrder, p.get("order_id"))
    if order is None:
        return _missing("This sales order")
    table = _order_lines_table(db, order)
    notes = ["Approving confirms the order: stock is reserved and delivered, the invoice is issued and the receivable posted."]
    if table.warn_rows:
        notes.append("A line asks for more than the location holds (marked). Approving will be refused unless negative stock is allowed.")
    return DocumentView(
        links=[Link("sales_order", order.id, order.order_number)],
        heading=f"Sales order {order.order_number}",
        facts=_facts(
            ("Order", order.order_number),
            ("Customer", _customer_name(db, order.customer_id)),
            ("Sold from", _warehouse_name(db, order.warehouse_id)),
            ("Order date", _date_s(order.order_date)),
            ("Promised delivery", _date_s(order.expected_date)),
            ("Payment terms", order.payment_terms),
            ("Sales rep", order.sales_rep),
            ("Status", (order.status or "").title()),
            ("Subtotal", _money_s(order.subtotal)),
            ("Discount", _money_s(order.discount_total)),
            ("Tax", _money_s(order.tax_total)),
            ("Total", _money_s(order.total), "good"),
            ("Notes", order.notes),
        ),
        tables=[table],
        notes=notes,
    )


def _sales_order_bulk(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesOrder

    ids = [i for i in (body.get("ids") or []) if isinstance(i, str)]
    orders = db.query(SalesOrder).filter(SalesOrder.id.in_(ids)).all() if ids else []
    total = sum((Decimal(str(o.total or 0)) for o in orders), Decimal("0"))
    return DocumentView(
        links=[Link("sales_order", o.id, o.order_number) for o in sorted(orders, key=lambda o: o.order_number)],
        heading=f"{len(orders)} sales order(s)",
        tables=[
            Table(
                "Orders to confirm",
                [
                    Column("order", "Order"),
                    Column("customer", "Customer"),
                    Column("status", "Status"),
                    Column("total", "Total", "right"),
                ],
                [
                    {
                        "order": o.order_number,
                        "customer": _customer_name(db, o.customer_id) or "—",
                        "status": (o.status or "").title(),
                        "total": _money_s(o.total),
                    }
                    for o in sorted(orders, key=lambda o: o.order_number)
                ],
                footer={"order": "Total", "total": _money_s(total)},
            )
        ],
        notes=["Approving confirms every order listed: stock is reserved and delivered, invoices issued and receivables posted."],
    )


def _quotation(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesQuotation, SalesQuotationLine

    q = _get(db, SalesQuotation, p.get("quotation_id"))
    if q is None:
        return _missing("This quotation")
    rows = [
        {
            "product": f"{line.name or '—'}" + (f"  ·  {line.sku}" if line.sku else ""),
            "qty": _int_s(line.quantity),
            "price": _money_s(line.unit_price),
            "discount": _money_s(line.discount_amount),
            "tax": _money_s(line.tax_amount),
            "total": _money_s(line.line_total),
        }
        for line in db.query(SalesQuotationLine)
        .filter(SalesQuotationLine.sales_quotation_id == q.id)
        .order_by(SalesQuotationLine.line_number)
        .all()
    ]
    return DocumentView(
        links=[Link("quotation", q.id, q.quotation_number)],
        heading=f"Quotation {q.quotation_number}",
        facts=_facts(
            ("Quotation", q.quotation_number),
            ("Customer", _customer_name(db, q.customer_id)),
            ("Quote date", _date_s(q.quote_date)),
            ("Valid until", _date_s(q.valid_until)),
            ("Sales rep", q.sales_rep),
            ("Status", (q.status or "").title()),
            ("Subtotal", _money_s(q.subtotal)),
            ("Discount", _money_s(q.discount_total)),
            ("Tax", _money_s(q.tax_total)),
            ("Total", _money_s(q.total), "good"),
            ("Notes", q.notes),
        ),
        tables=[
            Table(
                "Quoted items",
                [
                    Column("product", "Product"),
                    Column("qty", "Qty", "right"),
                    Column("price", "Unit price", "right"),
                    Column("discount", "Discount", "right"),
                    Column("tax", "Tax", "right"),
                    Column("total", "Amount", "right"),
                ],
                rows,
                footer={"product": "Total", "total": _money_s(q.total)},
            )
        ],
        notes=["Approving marks the quotation approved, so it can be turned into a sales order."],
    )


def _delivery(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesDelivery, SalesDeliveryLine, SalesOrder, SalesOrderLine

    d = _get(db, SalesDelivery, p.get("delivery_id"))
    if d is None:
        return _missing("This delivery challan")
    order = _get(db, SalesOrder, d.sales_order_id)
    rows: list[dict[str, str]] = []
    warn: list[int] = []
    units = 0
    for i, line in enumerate(db.query(SalesDeliveryLine).filter(SalesDeliveryLine.sales_delivery_id == d.id).all()):
        sol = _get(db, SalesOrderLine, line.sales_order_line_id)
        units += int(line.quantity_delivered or 0)
        have = _on_hand(db, line.item_id, d.warehouse_id)
        if have is not None and have < int(line.quantity_delivered or 0):
            warn.append(i)
        rows.append(
            {
                "product": f"{getattr(sol, 'name', '') or '—'}" + (f"  ·  {sol.sku}" if sol is not None and sol.sku else ""),
                "ordered": _int_s(getattr(sol, "quantity_ordered", None)),
                "delivered": _int_s(getattr(sol, "quantity_delivered", None)),
                "now": _int_s(line.quantity_delivered),
                "stock": _int_s(have) if have is not None else "—",
            }
        )
    return DocumentView(
        links=[Link("sales_order", order.id, order.order_number)] if order else [],
        heading=f"Delivery challan {d.delivery_number}",
        facts=_facts(
            ("Delivery", d.delivery_number),
            ("Sales order", order.order_number if order else None),
            ("Customer", _customer_name(db, d.customer_id)),
            ("Delivered from", _warehouse_name(db, d.warehouse_id)),
            ("Delivery date", _date_s(d.delivery_date)),
            ("Delivered by", d.delivered_by),
            ("Status", (d.status or "").title()),
            ("Notes", d.notes),
        ),
        tables=[
            Table(
                "Items delivered",
                [
                    Column("product", "Product"),
                    Column("ordered", "Ordered", "right"),
                    Column("delivered", "Delivered before", "right"),
                    Column("now", "Delivering now", "right"),
                    Column("stock", "In stock here", "right"),
                ],
                rows,
                footer={"product": "Total", "now": _int_s(units)},
                warn_rows=warn,
            )
        ],
        notes=["Approving posts the delivery: these units leave the location's stock."],
    )


def _invoice_for_order(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    view = _sales_order(db, p, body)
    view.notes = ["Approving issues the invoice for this order and posts the receivable on the customer's account."]
    if body.get("invoice_number"):
        view.facts.insert(0, Fact("Invoice to link", str(body["invoice_number"])))
    return view


def _invoice_create(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    rows: list[dict[str, str]] = []
    total = Decimal("0")
    for line in body.get("lines") or []:
        if not isinstance(line, dict):
            continue
        qty = _money(line.get("quantity")) or Decimal("0")
        rate = _money(line.get("rate")) or Decimal("0")
        total += qty * rate
        rows.append(
            {
                "product": str(line.get("name") or line.get("description") or "—"),
                "qty": f"{qty:g}",
                "rate": _money_s(rate),
                "amount": _money_s(qty * rate),
            }
        )
    return DocumentView(
        heading="New sales invoice",
        facts=_facts(
            ("Customer", _customer_name(db, body.get("customer_id"))),
            ("Invoice date", _date_s(body.get("bill_date"))),
            ("Due date", _date_s(body.get("due_date"))),
            ("Tax rate", f"{body['tax_rate']}%" if body.get("tax_rate") not in (None, "") else None),
            ("Notes", body.get("notes")),
        ),
        tables=[
            Table(
                "Invoice lines",
                [Column("product", "Item"), Column("qty", "Qty", "right"), Column("rate", "Rate", "right"), Column("amount", "Amount", "right")],
                rows,
                footer={"product": "Subtotal (before tax)", "amount": _money_s(total)},
            )
        ],
        notes=["Approving creates the invoice and posts the receivable. The invoice number and tax total are set when it is created."],
    )


def _return_lines(db: Session, lines: list[Any]) -> tuple[list[dict[str, str]], int, Decimal]:
    from app.models.sales import SalesOrderLine

    rows: list[dict[str, str]] = []
    units = 0
    total = Decimal("0")
    for line in lines:
        sol = _get(db, SalesOrderLine, getattr(line, "sales_order_line_id", None))
        qty = int(getattr(line, "quantity_returned", 0) or 0)
        price = Decimal(getattr(line, "unit_price", None) or getattr(sol, "unit_price", 0) or 0)
        units += qty
        total += price * qty
        rows.append(
            {
                "product": f"{getattr(sol, 'name', '') or '—'}" + (f"  ·  {sol.sku}" if sol is not None and sol.sku else ""),
                "qty": _int_s(qty),
                "price": _money_s(price),
                "amount": _money_s(price * qty),
                "serials": _serials_s(getattr(line, "serial_numbers_json", None)),
            }
        )
    return rows, units, total


_RETURN_COLUMNS = [
    Column("product", "Product"),
    Column("qty", "Qty", "right"),
    Column("price", "Unit price", "right"),
    Column("amount", "Amount", "right"),
    Column("serials", "Serials"),
]


def _sales_return(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesOrder
    from app.models.sales_return import SalesReturn, SalesReturnLine

    r = _get(db, SalesReturn, p.get("return_id"))
    if r is None:
        return _missing("This sales return")
    order = _get(db, SalesOrder, r.sales_order_id)
    rows, units, _total = _return_lines(db, db.query(SalesReturnLine).filter(SalesReturnLine.sales_return_id == r.id).all())
    return DocumentView(
        links=[Link("sales_order", order.id, order.order_number)] if order else [],
        heading=f"Sales return {r.return_number}",
        facts=_facts(
            ("Return", r.return_number),
            ("Sales order", order.order_number if order else None),
            ("Customer", _customer_name(db, r.customer_id)),
            ("Goods come back to", _warehouse_name(db, r.warehouse_id)),
            ("Reason", (r.reason or "").replace("_", " ").title()),
            ("Return date", _date_s(r.return_date)),
            ("Requested by", r.requested_by),
            ("Status", (r.status or "").title()),
            ("Subtotal", _money_s(r.subtotal)),
            ("Tax", _money_s(r.tax_amount)),
            ("Credit to customer", _money_s(r.credit_amount), "good"),
            ("Notes", r.notes),
        ),
        tables=[Table("Items returned", _RETURN_COLUMNS, rows, footer={"product": "Total", "qty": _int_s(units)})],
        notes=["Approving puts these units back in stock and posts the credit note on the customer's account."],
    )


def _sales_return_create(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.sales import SalesOrder

    order = _get(db, SalesOrder, body.get("sales_order_id"))

    class _Row:  # the body's line, shaped like a stored return line
        def __init__(self, raw: dict[str, Any]):
            self.sales_order_line_id = raw.get("sales_order_line_id")
            self.quantity_returned = raw.get("quantity_returned") or 0
            self.unit_price = None
            self.serial_numbers_json = json.dumps(raw.get("serial_numbers") or [])

    rows, units, total = _return_lines(db, [_Row(r) for r in body.get("lines") or [] if isinstance(r, dict)])
    return DocumentView(
        links=[Link("sales_order", order.id, order.order_number)] if order else [],
        heading="New sales return (credited at once)",
        facts=_facts(
            ("Sales order", order.order_number if order else None),
            ("Customer", _customer_name(db, order.customer_id) if order else None),
            ("Goods come back to", _warehouse_name(db, body.get("warehouse_id")) if body.get("warehouse_id") else None),
            ("Reason", str(body.get("reason") or "").replace("_", " ").title() or None),
            ("Return date", _date_s(body.get("return_date"))),
            ("Notes", body.get("notes")),
        ),
        tables=[Table("Items returned", _RETURN_COLUMNS, rows, footer={"product": "Total", "qty": _int_s(units), "amount": _money_s(total)})],
        notes=["Approving creates the return and credits it right away: stock comes back and the credit note is posted."],
    )


def _open_balance(db: Session, kind: str, party_id: Optional[str]) -> Optional[Decimal]:
    """What a customer owes (receivables) or what is owed to a supplier (payables) right now."""
    from app.models.finance import FinancePayable, FinanceReceivable

    if not party_id:
        return None
    model, column = (FinanceReceivable, FinanceReceivable.customer_id) if kind == "customer" else (FinancePayable, FinancePayable.supplier_id)
    value = db.query(func.coalesce(func.sum(model.balance), 0)).filter(column == party_id).scalar()
    return Decimal(str(value or 0))


def _party_adjustment(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    amount = _money(body.get("amount")) or Decimal("0")
    due = _open_balance(db, "customer", p.get("customer_id"))
    return DocumentView(
        heading="Manual debit on a customer's account",
        facts=_facts(
            ("Customer", _customer_name(db, p.get("customer_id"))),
            ("Amount", _money_s(amount), "warn"),
            ("Invoice date", _date_s(body.get("invoice_date"))),
            ("Due date", _date_s(body.get("due_date"))),
            ("Reference", body.get("reference")),
            ("Customer owes now", _money_s(due) if due is not None else None),
            ("Customer will owe", _money_s(due + amount) if due is not None else None, "warn"),
            ("Notes", body.get("notes")),
        ),
        notes=["Approving adds this amount to what the customer owes and posts it to the ledger."],
    )


def _transfer(verb: str) -> Builder:
    def build(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
        from app.models.inventory_stock_transfer import InventoryStockTransfer, InventoryStockTransferLine

        t = _get(db, InventoryStockTransfer, p.get("transfer_id"))
        if t is None:
            return _missing("This stock transfer")
        receiving = {str(r.get("line_id")): r for r in (body.get("lines") or []) if isinstance(r, dict)} if verb == "receive" else {}
        rows: list[dict[str, str]] = []
        warn: list[int] = []
        units = 0
        for i, line in enumerate(db.query(InventoryStockTransferLine).filter(InventoryStockTransferLine.transfer_id == t.id).all()):
            moving = int(
                (receiving.get(line.id, {}) or {}).get("quantity", 0) if verb == "receive" else line.quantity or 0
            )
            units += moving
            have = _on_hand(db, line.item_id, t.from_warehouse_id) if verb == "ship" else None
            if verb == "ship" and have is not None and have < moving:
                warn.append(i)
            row = {
                "product": f"{line.name or '—'}" + (f"  ·  {line.sku}" if line.sku else ""),
                "qty": _int_s(line.quantity),
                "shipped": _int_s(line.shipped_qty),
                "now": _int_s(moving),
            }
            if verb == "ship":
                row["stock"] = _int_s(have) if have is not None else "—"
            rows.append(row)
        columns = [
            Column("product", "Product"),
            Column("qty", "Requested", "right"),
            Column("shipped", "Shipped", "right"),
            Column("now", "Shipping now" if verb == "ship" else "Receiving now", "right"),
        ]
        if verb == "ship":
            columns.append(Column("stock", "In stock at source", "right"))
        return DocumentView(
            links=[Link("stock_transfer", t.id, t.transfer_number)],
            heading=f"Stock transfer {t.transfer_number}",
            facts=_facts(
                ("Transfer", t.transfer_number),
                ("From", _warehouse_name(db, t.from_warehouse_id)),
                ("To", _warehouse_name(db, t.to_warehouse_id)),
                ("Transfer date", _date_s(t.transfer_date)),
                ("Reference", t.reference_number),
                ("Status", (t.status or "").replace("_", " ").title()),
                ("Notes", t.notes),
            ),
            tables=[Table("Items", columns, rows, footer={"product": "Total", "now": _int_s(units)}, warn_rows=warn)],
            notes=[
                "Approving ships the transfer: these units leave the source location now."
                if verb == "ship"
                else "Approving receives the transfer: these units land at the destination."
            ],
        )

    return build


# ------------------------------------------------------------------------------------------------ RMA


def _rma_ticket(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.rma import RmaTicket

    t = _get(db, RmaTicket, p.get("ticket_id"))
    if t is None:
        return _missing("This RMA ticket")
    return DocumentView(
        heading=f"RMA {t.rma_number}",
        facts=_facts(
            ("RMA", t.rma_number),
            ("Customer", t.customer_name),
            ("Phone", t.customer_phone),
            ("Product", t.product_name),
            ("SKU", t.sku),
            ("Serial", t.serial_number),
            ("Quantity", _int_s(t.quantity)),
            ("Order", t.order_number),
            ("Purchased on", _date_s(t.purchased_at)),
            ("Warranty", (t.warranty_status or "").replace("_", " ").title() or None),
            ("Warranty until", _date_s(t.warranty_expires_on) if t.warranty_expires_on else None),
            ("Unit received", "Yes" if t.unit_received else "No"),
            ("Fault reported", t.fault_reported),
            ("Condition", t.condition_notes),
            ("Accessories", t.accessories),
            ("Estimated charge", _money_s(t.charge_estimate) if t.charge_estimate else None),
            ("Notes from the sender", body.get("reason")),
        ),
        notes=[
            "Approving accepts the complaint."
            + (" The received unit goes into the RMA store." if t.unit_received else " No stock moves until the unit is received.")
        ],
    )


def _rma_delivery(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.rma import RmaDelivery, RmaTicket

    d = _get(db, RmaDelivery, p.get("delivery_id"))
    if d is None:
        return _missing("This RMA delivery")
    t = _get(db, RmaTicket, d.rma_id)
    from app.services.rma.constants import DELIVERY_OUTCOMES

    refund = d.outcome == "cash_back"
    return DocumentView(
        heading=f"RMA delivery {d.delivery_number}",
        facts=_facts(
            ("Delivery", d.delivery_number),
            ("RMA", t.rma_number if t else None),
            ("Customer", t.customer_name if t else None),
            ("Type", DELIVERY_OUTCOMES.get(d.outcome, d.outcome)),
            ("Product", (t.held_product_name or t.product_name) if t else None, "warn" if t is not None and t.held_sku else None),
            ("Serial delivered", None if refund else (d.serial_delivered or (t.serial_number if t else None))),
            ("Cash back to the customer", _money_s(d.refund_amount) if refund else None, "warn" if refund else None),
            ("Delivered to", d.delivered_to),
            ("Delivery date", _date_s(d.delivery_date)),
            ("Charges (service charge, fine…)", _money_s(d.amount_total)),
            ("Collected now", _money_s(d.amount_received)),
            ("Still due", _money_s(d.amount_due), "warn" if (d.amount_due or 0) else None),
            ("Payment reference", d.payment_reference),
            ("Notes", d.notes),
        ),
        notes=(
            ["Approving pays the cash back to the customer. No unit goes back."]
            if refund
            else ["Approving hands the unit back: it leaves the RMA store and the RMA is completed."]
        )
        + (["The charges are billed to the customer; what is collected now is posted to Finance."] if (d.amount_total or 0) else []),
    )


def _rma_claim(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.rma import RmaSupplierClaim, RmaTicket

    c = _get(db, RmaSupplierClaim, p.get("claim_id"))
    if c is None:
        return _missing("This replacement claim")
    t = _get(db, RmaTicket, c.rma_id)
    return DocumentView(
        heading=f"Replacement claim {c.claim_number}",
        facts=_facts(
            ("Claim", c.claim_number),
            ("RMA", t.rma_number if t else None),
            ("Customer", t.customer_name if t else None),
            ("Supplier", c.supplier_name),
            ("Supplier reference", c.supplier_reference),
            ("Product", c.product_name),
            ("SKU", c.sku),
            ("Serial", c.serial_number),
            ("Quantity", _int_s(c.quantity)),
            ("Problem", c.problem),
            ("Diagnosis", c.diagnosis),
            ("Accessories sent", c.accessories_sent),
            ("Purchased from supplier (receipt)", c.purchase_receipt_no),
            ("Notes", c.notes),
        ),
        notes=["Approving accepts the claim against the supplier. The unit is sent out in a separate dispatch step."],
    )


def _rma_receipt(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.rma import RmaSupplierReceipt, RmaTicket

    r = _get(db, RmaSupplierReceipt, p.get("receipt_id"))
    if r is None:
        return _missing("This replacement receipt")
    t = _get(db, RmaTicket, r.rma_id)
    changed = r.outcome in ("same_product", "different_product")
    from app.services.rma.constants import RECEIPT_OUTCOMES

    return DocumentView(
        heading=f"Replacement receipt {r.receipt_number}",
        facts=_facts(
            ("Receipt", r.receipt_number),
            ("RMA", t.rma_number if t else None),
            ("Supplier", r.supplier_name),
            ("Supplier reference", r.supplier_delivery_ref),
            ("Serial sent", r.sent_serial),
            ("Serial received", r.received_serial, "warn" if changed else None),
            ("Product received", r.received_sku, "warn" if r.outcome == "different_product" else None),
            ("Cash back", str(r.refund_amount) if r.outcome == "cash_back" and r.refund_amount is not None else None, "warn"),
            ("Outcome", RECEIPT_OUTCOMES.get(r.outcome, r.outcome)),
            ("Reason", r.outcome_note),
            ("Received on", _date_s(r.received_date)),
            ("Received by", r.received_by),
            ("Condition", r.condition_notes),
            ("Accessories received", r.accessories_received),
        ),
        notes=(
            ["Approving posts the money the supplier paid to Finance. No unit comes back."]
            if r.outcome == "cash_back"
            else ["Approving brings the unit back from the supplier into the RMA store."]
        )
        + (["The serial received differs from the serial sent."] if changed else [])
        + (["A different product than the one sent comes back."] if r.outcome == "different_product" else []),
    )


# ------------------------------------------------------------------------------------------------ finance


def _account_name(db: Session, account_id: Optional[str]) -> Optional[str]:
    from app.models.finance import FinancePaymentAccount

    row = _get(db, FinancePaymentAccount, account_id)
    return row.name if row else None


def _open_documents_table(db: Session, kind: str, party_id: Optional[str]) -> Optional[Table]:
    """The oldest open invoices / bills of the party: what a payment without a chosen document is spread over."""
    from app.models.finance import FinancePayable, FinanceReceivable

    if not party_id:
        return None
    if kind == "customer":
        model, column, number = FinanceReceivable, FinanceReceivable.customer_id, FinanceReceivable.invoice_number
    else:
        model, column, number = FinancePayable, FinancePayable.supplier_id, FinancePayable.reference_number
    rows = (
        db.query(model)
        .filter(column == party_id, model.balance > 0)
        .order_by(model.due_date.asc().nullslast())
        .limit(8)
        .all()
    )
    if not rows:
        return None
    return Table(
        "Open invoices" if kind == "customer" else "Open bills",
        [Column("ref", "Reference"), Column("due", "Due"), Column("amount", "Amount", "right"), Column("balance", "Balance", "right")],
        [
            {
                "ref": getattr(r, "invoice_number", None) or getattr(r, "reference_number", None) or "—",
                "due": _date_s(r.due_date),
                "amount": _money_s(r.amount),
                "balance": _money_s(r.balance),
            }
            for r in rows
        ],
    )


def _money_in_out(kind: str, direction: str) -> Builder:
    """Collection (customer) or payment (supplier) with the party's balance before and after."""

    def build(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
        party_id = p.get("customer_id") if kind == "customer" else p.get("supplier_id")
        amount = _money(body.get("amount")) or Decimal("0")
        write_off = _money(body.get("write_off_amount")) or Decimal("0")
        before = _open_balance(db, kind, party_id)
        refund = str(body.get("direction", "")).lower() == "inbound"
        settles = amount + write_off
        tables = []
        t = _open_documents_table(db, kind, party_id)
        if t is not None:
            tables.append(t)
        label = "Customer" if kind == "customer" else "Supplier"
        return DocumentView(
            heading=("Refund received from a supplier" if refund else direction),
            facts=_facts(
                (label, _customer_name(db, party_id) if kind == "customer" else _supplier_name(db, party_id)),
                ("Amount", _money_s(amount), "warn"),
                ("Write-off", _money_s(write_off) if write_off else None, "warn"),
                ("Date", _date_s(body.get("payment_date"))),
                ("Method", str(body.get("payment_method") or "").title() or None),
                ("Paid through", _account_name(db, body.get("payment_account_id"))),
                ("Reference", body.get("reference")),
                ("Applies to", "the chosen document" if (body.get("receivable_id") or body.get("payable_id") or body.get("receivable_ids")) else "the oldest open documents first"),
                ("Owes now" if kind == "customer" else "We owe now", _money_s(before) if before is not None else None),
                ("Owes after" if kind == "customer" else "We owe after", _money_s(max(Decimal("0"), before - settles)) if before is not None and not refund else None),
                ("Notes", body.get("notes")),
            ),
            tables=tables,
            notes=[
                "Approving records this money and posts it to the ledger and the chosen account."
                if not refund
                else "Approving records the refund received from the supplier."
            ],
        )

    return build


def _settle_document(kind: str, label: str) -> Builder:
    def build(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
        from app.models.finance import FinancePayable, FinanceReceivable

        model, key = (FinanceReceivable, "receivable_id") if kind == "customer" else (FinancePayable, "payable_id")
        row = _get(db, model, p.get(key))
        amount = _money(body.get("amount")) or Decimal("0")
        if row is None:
            return _missing(f"This {label}")
        balance = Decimal(str(row.balance or 0))
        reference = getattr(row, "invoice_number", None) or getattr(row, "reference_number", None)
        return DocumentView(
            heading=f"{label.title()} {reference or ''}".strip(),
            facts=_facts(
                ("Customer" if kind == "customer" else "Supplier", _customer_name(db, row.customer_id) if kind == "customer" else _supplier_name(db, row.supplier_id)),
                ("Reference", reference),
                ("Document amount", _money_s(row.amount)),
                ("Paid so far", _money_s(row.amount_paid)),
                ("Balance now", _money_s(balance)),
                ("Due date", _date_s(row.due_date)),
                ("This payment", _money_s(amount), "warn"),
                ("Balance after", _money_s(max(Decimal("0"), balance - amount)), "good" if balance - amount <= 0 else None),
                ("Paid through", _account_name(db, body.get("payment_account_id"))),
                ("Date", _date_s(body.get("payment_date"))),
                ("Reference given", body.get("reference")),
                ("Notes", body.get("notes")),
            ),
            notes=["Approving records the money and posts it to the ledger and the chosen account."],
        )

    return build


def _invoice_payment(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    amount = _money(body.get("amount")) or Decimal("0")
    return DocumentView(
        heading="Payment received against an invoice",
        facts=_facts(
            ("Amount", _money_s(amount), "warn"),
            ("Paid through", _account_name(db, body.get("payment_account_id"))),
            ("Date", _date_s(body.get("payment_date"))),
            ("Reference", body.get("reference")),
            ("Notes", body.get("notes")),
        ),
        notes=["Approving records the payment against the invoice and posts it to the ledger."],
    )


def _expense_payment(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    from app.models.finance import FinanceExpense

    e = _get(db, FinanceExpense, p.get("expense_id"))
    if e is None:
        return _missing("This expense")
    return DocumentView(
        heading=f"Expense {e.expense_number}",
        facts=_facts(
            ("Expense", e.expense_number),
            ("Payee", e.payee),
            ("Description", e.description),
            ("Expense date", _date_s(e.expense_date)),
            ("Amount", _money_s(e.amount)),
            ("Tax", _money_s(e.tax_amount)),
            ("Total to pay", _money_s(e.total), "warn"),
            ("Paid through", _account_name(db, body.get("payment_account_id")) or _account_name(db, e.payment_account_id)),
            ("Status", (e.status or "").title()),
            ("Notes", e.notes),
        ),
        notes=["Approving pays the expense out of the chosen account."],
    )


def _voucher(db: Session, p: dict[str, str], body: dict[str, Any]) -> DocumentView:
    return DocumentView(
        heading="Transfer between payment accounts",
        facts=_facts(
            ("From", _account_name(db, body.get("from_account_id"))),
            ("To", _account_name(db, body.get("to_account_id"))),
            ("Amount", _money_s(body.get("amount")), "warn"),
            ("Date", _date_s(body.get("payment_date"))),
            ("Reference", body.get("reference")),
            ("Notes", body.get("notes")),
        ),
        notes=["Approving posts the voucher: the amount leaves the first account and lands in the second."],
    )


# ------------------------------------------------------------------------------------------------ registry

BUILDERS: dict[str, Builder] = {
    "purchase.goods_receive": _receipt,
    "purchase.purchase_return": _purchase_return,
    "purchase.stock_adjustment": _adjustment,
    "sales.quotation": _quotation,
    "sales.sales_order": _sales_order,
    "sales.sales_order_bulk": _sales_order_bulk,
    "sales.delivery_challan": _delivery,
    "sales.invoice": _invoice_for_order,
    "sales.invoice_link": _invoice_for_order,
    "sales.invoice_create": _invoice_create,
    "sales.sales_return": _sales_return,
    "sales.sales_return_create": _sales_return_create,
    "sales.party_adjustment": _party_adjustment,
    "sales.product_transfer_ship": _transfer("ship"),
    "sales.product_transfer_receive": _transfer("receive"),
    "rma.complain_receive": _rma_ticket,
    "rma.customer_delivery": _rma_delivery,
    "rma.replacement_claim": _rma_claim,
    "rma.replacement_receive": _rma_receipt,
    "finance.collection": _money_in_out("customer", "Money received from a customer"),
    "finance.collection_receivable": _settle_document("customer", "invoice"),
    "finance.collection_invoice": _invoice_payment,
    "finance.payment": _money_in_out("supplier", "Money paid to a supplier"),
    "finance.payment_payable": _settle_document("supplier", "bill"),
    "finance.payment_expense": _expense_payment,
    "finance.voucher": _voucher,
}


def build_document(db: Session, action_key: str, path_params: dict[str, str], body: dict[str, Any]) -> DocumentView:
    """The Document tab for a held call. Never raises: a builder that fails leaves the call's own values on show."""
    builder = BUILDERS.get(action_key)
    if builder is not None:
        try:
            return builder(db, path_params, body)
        except Exception:  # noqa: BLE001 - a view is a convenience, the request itself is what matters
            db.rollback()
    facts = [Fact(str(k).replace("_", " ").title(), str(v)) for k, v in body.items() if isinstance(v, (str, int, float)) and str(v).strip()]
    return DocumentView(heading="Request", facts=facts[:16], notes=["The document could not be read; these are the values sent with the request."])
