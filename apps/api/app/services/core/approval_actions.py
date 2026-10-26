"""The finalizing actions that wait for approval (docs/approval.md), one entry per line of the user's list.

Adding an action = one `ApprovalAction` below: the group it belongs to on the Approve screen, the HTTP call that finalizes
it, and a describer that tells the Approve list which document it is. Nothing else in the endpoint changes.

Where the list names a document this ERP has no feature for yet (Adjustment Claim, Adjustment Claim Finalize) there is
no entry: add one here when the feature exists.
"""

from __future__ import annotations

import re
from dataclasses import replace
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.core.approval_gate import ApprovalAction, Described


# ------------------------------------------------------------------------------------------------ helpers


def _money(value: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(value)) if value is not None and str(value).strip() != "" else None
    except Exception:
        return None


def _get(db: Session, model: Any, row_id: Optional[str]) -> Any:
    return db.get(model, row_id) if row_id else None


def _customer_name(db: Session, customer_id: Optional[str]) -> Optional[str]:
    from app.models.commerce_customer import CommerceCustomer

    row = _get(db, CommerceCustomer, customer_id)
    return row.name if row else None


def _supplier_name(db: Session, supplier_id: Optional[str]) -> Optional[str]:
    from app.models.commerce_supplier import CommerceSupplier

    row = _get(db, CommerceSupplier, supplier_id)
    return row.name if row else None


def _warehouse_name(db: Session, warehouse_id: Optional[str]) -> Optional[str]:
    from app.models.inventory_warehouse import InventoryWarehouse

    row = _get(db, InventoryWarehouse, warehouse_id)
    return row.name if row else None


def _decision_is(value: str):
    return lambda body: str(body.get("decision", "")).lower() == value


# ------------------------------------------------------------------------------------------------ purchase


def _d_goods_receive(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
    from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine

    receipt = _get(db, PurchaseReceipt, p.get("receipt_id"))
    if receipt is None:
        return Described(entity_id=p.get("receipt_id"))
    po = _get(db, PurchaseOrder, receipt.purchase_order_id)
    total = Decimal("0")
    units = 0
    for line in db.query(PurchaseReceiptLine).filter(PurchaseReceiptLine.purchase_receipt_id == receipt.id).all():
        units += int(line.quantity_received or 0)
        po_line = _get(db, PurchaseOrderLine, line.purchase_order_line_id)
        if po_line is not None:
            net = Decimal(po_line.unit_cost or 0)
            if po_line.quantity_ordered:
                net -= Decimal(po_line.discount_amount or 0) / Decimal(po_line.quantity_ordered)
            total += net * Decimal(line.quantity_received or 0) * (1 + Decimal(po_line.tax_rate or 0) / 100)
    where = _warehouse_name(db, receipt.warehouse_id)
    return Described(
        reference=receipt.receipt_number,
        party=_supplier_name(db, receipt.supplier_id),
        amount=total.quantize(Decimal("0.01")) if total else None,
        summary=f"Post goods receipt{f' for {po.po_number}' if po else ''}: {units} unit(s) into {where or 'the warehouse'}, payable raised.",
        entity_id=receipt.id,
    )


def _d_purchase_return(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.purchase_return import PurchaseReturn

    ret = _get(db, PurchaseReturn, p.get("return_id"))
    if ret is None:
        return Described(entity_id=p.get("return_id"))
    return Described(
        reference=ret.return_number,
        party=_supplier_name(db, ret.supplier_id),
        amount=_money(ret.credit_amount),
        summary=f"Credit the purchase return: goods leave {_warehouse_name(db, ret.warehouse_id) or 'the warehouse'}, supplier credit posted.",
        entity_id=ret.id,
    )


def _d_stock_adjustment(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.inventory_stock_adjustment import InventoryStockAdjustment

    adj = _get(db, InventoryStockAdjustment, p.get("adjustment_id"))
    if adj is None:
        return Described(entity_id=p.get("adjustment_id"))
    lines = list(getattr(adj, "lines", []) or [])
    change = sum(int(getattr(line, "adjustment_qty", 0) or 0) for line in lines)
    return Described(
        reference=adj.adjustment_number,
        party=_warehouse_name(db, adj.warehouse_id),
        summary=f"Apply the stock adjustment ({adj.reason}): {len(lines)} item(s), net {change:+d} unit(s) in stock.",
        entity_id=adj.id,
    )


# ------------------------------------------------------------------------------------------------ sales


def _d_quotation_approve(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesQuotation

    quote = _get(db, SalesQuotation, p.get("quotation_id"))
    if quote is None:
        return Described(entity_id=p.get("quotation_id"))
    return Described(
        reference=quote.quotation_number,
        party=_customer_name(db, quote.customer_id),
        amount=_money(quote.total),
        summary="Approve the quotation so it can become a sales order.",
        entity_id=quote.id,
    )


def _d_sales_order(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesOrder

    order = _get(db, SalesOrder, p.get("order_id"))
    if order is None:
        return Described(entity_id=p.get("order_id"))
    return Described(
        reference=order.order_number,
        party=_customer_name(db, order.customer_id),
        amount=_money(getattr(order, "total", None)),
        summary="Confirm the sales order: reserves stock, delivers, issues the invoice and posts the receivable.",
        entity_id=order.id,
    )


def _d_sales_order_bulk(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesOrder

    ids = [i for i in (body.get("ids") or []) if isinstance(i, str)]
    orders = db.query(SalesOrder).filter(SalesOrder.id.in_(ids)).all() if ids else []
    numbers = sorted(o.order_number for o in orders)
    total = sum((Decimal(str(getattr(o, "total", 0) or 0)) for o in orders), Decimal("0"))
    return Described(
        reference=", ".join(numbers[:3]) + (f" +{len(numbers) - 3}" if len(numbers) > 3 else "") if numbers else None,
        amount=total or None,
        summary=f"Confirm {len(ids)} sales order(s) in one go.",
    )


def _d_delivery(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesDelivery, SalesOrder

    delivery = _get(db, SalesDelivery, p.get("delivery_id"))
    if delivery is None:
        return Described(entity_id=p.get("delivery_id"))
    order = _get(db, SalesOrder, delivery.sales_order_id)
    return Described(
        reference=delivery.delivery_number,
        party=_customer_name(db, delivery.customer_id),
        amount=_money(getattr(order, "total", None)) if order else None,
        summary=f"Post the delivery challan{f' for {order.order_number}' if order else ''}: stock leaves {_warehouse_name(db, delivery.warehouse_id) or 'the warehouse'}.",
        entity_id=delivery.id,
    )


def _d_invoice_issue(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesOrder

    order = _get(db, SalesOrder, p.get("order_id"))
    if order is None:
        return Described(entity_id=p.get("order_id"))
    return Described(
        reference=order.order_number,
        party=_customer_name(db, order.customer_id),
        amount=_money(getattr(order, "total", None)),
        summary="Issue the invoice for this order and post the receivable.",
        entity_id=order.id,
    )


def _d_invoice_link(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    described = _d_invoice_issue(db, p, body)
    described.summary = f"Link invoice {body.get('invoice_number') or ''} to the order and post the receivable.".replace("  ", " ")
    return described


def _d_invoice_create(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    total = Decimal("0")
    for line in body.get("lines") or []:
        if isinstance(line, dict):
            total += (_money(line.get("quantity")) or Decimal("0")) * (_money(line.get("rate")) or Decimal("0"))
    return Described(
        party=_customer_name(db, body.get("customer_id")),
        amount=total or None,
        summary="Create and post a sales invoice (the amount shown is before tax).",
    )


def _d_sales_return_credit(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales_return import SalesReturn

    ret = _get(db, SalesReturn, p.get("return_id"))
    if ret is None:
        return Described(entity_id=p.get("return_id"))
    return Described(
        reference=ret.return_number,
        party=_customer_name(db, ret.customer_id),
        amount=_money(ret.credit_amount),
        summary="Credit the sales return: stock back in, credit note posted.",
        entity_id=ret.id,
    )


def _d_sales_return_create(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.sales import SalesOrder

    order = _get(db, SalesOrder, body.get("sales_order_id"))
    units = sum(int(_money(line.get("quantity_returned")) or 0) for line in body.get("lines") or [] if isinstance(line, dict))
    return Described(
        reference=order.order_number if order else None,
        party=_customer_name(db, order.customer_id) if order else None,
        summary=f"Create the sales return and credit it right away: {units} unit(s) back in stock, credit note posted.",
        entity_id=order.id if order else None,
    )


def _d_party_adjustment(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    return Described(
        reference=(body.get("reference") or None),
        party=_customer_name(db, p.get("customer_id")),
        amount=_money(body.get("amount")),
        summary="Adjust the customer's balance: a manual debit is added to their ledger.",
        entity_id=p.get("customer_id"),
    )


def _d_transfer(verb: str):
    def describe(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
        from app.models.inventory_stock_transfer import InventoryStockTransfer

        transfer = _get(db, InventoryStockTransfer, p.get("transfer_id"))
        if transfer is None:
            return Described(entity_id=p.get("transfer_id"))
        source = _warehouse_name(db, transfer.from_warehouse_id) or "source"
        dest = _warehouse_name(db, transfer.to_warehouse_id) or "destination"
        what = f"Ship the transfer: stock leaves {source} for {dest}." if verb == "ship" else f"Receive the transfer: stock lands in {dest} from {source}."
        return Described(reference=transfer.transfer_number, party=f"{source} → {dest}", summary=what, entity_id=transfer.id)

    return describe


# ------------------------------------------------------------------------------------------------ RMA


def _d_rma_ticket(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.rma import RmaTicket

    ticket = _get(db, RmaTicket, p.get("ticket_id"))
    if ticket is None:
        return Described(entity_id=p.get("ticket_id"))
    return Described(
        reference=ticket.rma_number,
        party=ticket.customer_name,
        summary=f"Approve the complaint and receive the unit: {ticket.product_name or 'product'}"
        + (f" ({ticket.serial_number})" if ticket.serial_number else "")
        + ".",
        entity_id=ticket.id,
    )


def _d_rma_delivery(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.rma import RmaDelivery, RmaTicket

    delivery = _get(db, RmaDelivery, p.get("delivery_id"))
    if delivery is None:
        return Described(entity_id=p.get("delivery_id"))
    ticket = _get(db, RmaTicket, delivery.rma_id)
    return Described(
        reference=delivery.delivery_number,
        party=ticket.customer_name if ticket else None,
        amount=_money(delivery.amount_total),
        summary="Approve the customer delivery: the unit leaves the RMA store and any charges are billed.",
        entity_id=delivery.id,
    )


def _d_rma_claim(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.rma import RmaSupplierClaim

    claim = _get(db, RmaSupplierClaim, p.get("claim_id"))
    if claim is None:
        return Described(entity_id=p.get("claim_id"))
    return Described(
        reference=claim.claim_number,
        party=claim.supplier_name,
        summary=f"Approve the replacement claim for {claim.product_name or 'the product'}"
        + (f" ({claim.serial_number})" if claim.serial_number else "")
        + ".",
        entity_id=claim.id,
    )


def _d_rma_receipt(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.rma import RmaSupplierReceipt

    receipt = _get(db, RmaSupplierReceipt, p.get("receipt_id"))
    if receipt is None:
        return Described(entity_id=p.get("receipt_id"))
    return Described(
        reference=receipt.receipt_number,
        party=receipt.supplier_name,
        summary="Approve the replacement receipt: the unit comes back from the supplier into the RMA store.",
        entity_id=receipt.id,
    )


# ------------------------------------------------------------------------------------------------ finance


def _d_customer_collection(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    amount = _money(body.get("amount"))
    off = _money(body.get("write_off_amount"))
    return Described(
        reference=(body.get("reference") or None),
        party=_customer_name(db, p.get("customer_id")),
        amount=amount,
        summary=f"Receive a {body.get('payment_method') or 'payment'} from the customer"
        + (f", with a {off:,.2f} write-off" if off else "")
        + ".",
        entity_id=p.get("customer_id"),
    )


def _d_receivable_collection(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.finance import FinanceReceivable

    row = _get(db, FinanceReceivable, p.get("receivable_id"))
    return Described(
        reference=(row.invoice_number if row else None) or body.get("reference"),
        party=_customer_name(db, row.customer_id) if row else None,
        amount=_money(body.get("amount")),
        summary="Settle the receivable: money received into the chosen account.",
        entity_id=p.get("receivable_id"),
    )


def _d_invoice_collection(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    return Described(
        reference=body.get("reference") or None,
        amount=_money(body.get("amount")),
        summary="Record a payment received against the invoice.",
        entity_id=p.get("invoice_id"),
    )


def _d_supplier_payment(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    inbound = str(body.get("direction", "")).lower() == "inbound"
    return Described(
        reference=body.get("reference") or None,
        party=_supplier_name(db, p.get("supplier_id")),
        amount=_money(body.get("amount")),
        summary="Record a refund received from the supplier." if inbound else f"Pay the supplier by {body.get('payment_method') or 'payment'}.",
        entity_id=p.get("supplier_id"),
    )


def _d_payable_payment(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.finance import FinancePayable

    row = _get(db, FinancePayable, p.get("payable_id"))
    return Described(
        reference=(row.reference_number if row else None) or body.get("reference"),
        party=_supplier_name(db, row.supplier_id) if row else None,
        amount=_money(body.get("amount")),
        summary="Settle the payable: money paid out of the chosen account.",
        entity_id=p.get("payable_id"),
    )


def _d_expense_payment(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.finance import FinanceExpense

    row = _get(db, FinanceExpense, p.get("expense_id"))
    return Described(
        reference=row.expense_number if row else None,
        party=(row.description if row else None),
        amount=_money(body.get("amount")) or (_money(row.total) if row else None),
        summary="Pay the expense out of the chosen account.",
        entity_id=p.get("expense_id"),
    )


def _d_account_transfer(db: Session, p: dict[str, str], body: dict[str, Any]) -> Described:
    from app.models.finance import FinancePaymentAccount

    source = _get(db, FinancePaymentAccount, body.get("from_account_id"))
    dest = _get(db, FinancePaymentAccount, body.get("to_account_id"))
    return Described(
        reference=body.get("reference") or None,
        party=f"{getattr(source, 'name', '?')} → {getattr(dest, 'name', '?')}",
        amount=_money(body.get("amount")),
        summary="Post a voucher moving money between two payment accounts.",
    )


# ------------------------------------------------------------------------------------------------ registry

ACTIONS: list[ApprovalAction] = [
    # ---- Purchase
    ApprovalAction("purchase.goods_receive", "purchase", "Goods Receive", "POST",
                   r"purchase/receipts/(?P<receipt_id>[^/]+)/post", describe=_d_goods_receive),
    ApprovalAction("purchase.purchase_return", "purchase", "Purchase Return", "POST",
                   r"purchase/returns/(?P<return_id>[^/]+)/credit", describe=_d_purchase_return),
    ApprovalAction("purchase.stock_adjustment", "purchase", "Stock Adjustment", "POST",
                   r"inventory/stock-adjustments/(?P<adjustment_id>[^/]+)/apply",
                   describe=_d_stock_adjustment, base_modules=("inventory",)),
    # ---- Sales
    ApprovalAction("sales.quotation", "sales", "Quotation", "PATCH",
                   r"sales/quotations/(?P<quotation_id>[^/]+)/status",
                   when=lambda b: str(b.get("status", "")).lower() == "approved", describe=_d_quotation_approve),
    ApprovalAction("sales.sales_order", "sales", "Sales Order", "POST",
                   r"sales/orders/(?P<order_id>[^/]+)/confirm", describe=_d_sales_order),
    ApprovalAction("sales.sales_order_bulk", "sales", "Sales Order", "POST",
                   r"sales/orders/bulk-status",
                   when=lambda b: str(b.get("status", "")).lower() == "confirmed", describe=_d_sales_order_bulk),
    ApprovalAction("sales.delivery_challan", "sales", "Delivery Challan", "POST",
                   r"sales/deliveries/(?P<delivery_id>[^/]+)/post", describe=_d_delivery),
    ApprovalAction("sales.invoice", "sales", "Invoice", "POST",
                   r"sales/orders/(?P<order_id>[^/]+)/invoice", describe=_d_invoice_issue),
    ApprovalAction("sales.invoice_link", "sales", "Invoice", "POST",
                   r"sales/orders/(?P<order_id>[^/]+)/link-invoice", describe=_d_invoice_link),
    ApprovalAction("sales.invoice_create", "sales", "Invoice", "POST",
                   r"sales/invoices", describe=_d_invoice_create),
    ApprovalAction("sales.sales_return", "sales", "Sales Return", "POST",
                   r"sales/returns/(?P<return_id>[^/]+)/credit", describe=_d_sales_return_credit),
    ApprovalAction("sales.sales_return_create", "sales", "Sales Return", "POST",
                   r"sales/returns", when=lambda b: bool(b.get("auto_credit")), describe=_d_sales_return_create),
    ApprovalAction("sales.party_adjustment", "sales", "Party Adjustment", "POST",
                   r"commerce/customers/(?P<customer_id>[^/]+)/ledger/invoices",
                   describe=_d_party_adjustment, base_modules=("customers",)),
    ApprovalAction("sales.product_transfer_ship", "sales", "Product Transfer", "POST",
                   r"inventory/stock-transfers/(?P<transfer_id>[^/]+)/ship",
                   describe=_d_transfer("ship"), base_modules=("inventory",)),
    ApprovalAction("sales.product_transfer_receive", "sales", "Product Transfer", "POST",
                   r"inventory/stock-transfers/(?P<transfer_id>[^/]+)/receive",
                   describe=_d_transfer("receive"), base_modules=("inventory",)),
    # ---- RMA: the privileged RMA modules people already hold keep working as "may approve"
    ApprovalAction("rma.complain_receive", "rma", "Complain Receive", "POST",
                   r"rma/tickets/(?P<ticket_id>[^/]+)/decision", when=_decision_is("approved"),
                   describe=_d_rma_ticket, alt_modules=("rma_approve",)),
    ApprovalAction("rma.customer_delivery", "rma", "Customer Delivery", "POST",
                   r"rma/deliveries/(?P<delivery_id>[^/]+)/decision", when=_decision_is("approved"),
                   describe=_d_rma_delivery, alt_modules=("rma_delivery_approve",)),
    ApprovalAction("rma.replacement_claim", "rma", "Replacement Claim", "POST",
                   r"rma/claims/(?P<claim_id>[^/]+)/decision", when=_decision_is("approved"),
                   describe=_d_rma_claim, alt_modules=("rma_claim_approve",)),
    ApprovalAction("rma.replacement_receive", "rma", "Replacement Receive", "POST",
                   r"rma/receipts/(?P<receipt_id>[^/]+)/decision", when=_decision_is("approved"),
                   describe=_d_rma_receipt, alt_modules=("rma_receive_approve",)),
    # ---- Accounts & Finance
    ApprovalAction("finance.collection", "finance", "Collection", "POST",
                   r"commerce/customers/(?P<customer_id>[^/]+)/ledger/payments",
                   describe=_d_customer_collection, base_modules=("customers",)),
    ApprovalAction("finance.collection_receivable", "finance", "Collection", "POST",
                   r"finance/receivables/(?P<receivable_id>[^/]+)/settle", describe=_d_receivable_collection),
    ApprovalAction("finance.collection_invoice", "finance", "Collection", "POST",
                   r"sales/invoices/(?P<invoice_id>[^/]+)/payments",
                   describe=_d_invoice_collection, base_modules=("sales",)),
    ApprovalAction("finance.payment", "finance", "Payment", "POST",
                   r"commerce/suppliers/(?P<supplier_id>[^/]+)/payments",
                   describe=_d_supplier_payment, base_modules=("purchase",)),
    ApprovalAction("finance.payment_payable", "finance", "Payment", "POST",
                   r"finance/payables/(?P<payable_id>[^/]+)/settle", describe=_d_payable_payment),
    ApprovalAction("finance.payment_expense", "finance", "Payment", "POST",
                   r"finance/expenses/(?P<expense_id>[^/]+)/pay", describe=_d_expense_payment),
    ApprovalAction("finance.voucher", "finance", "Voucher", "POST",
                   r"finance/payment-accounts/transfer", describe=_d_account_transfer),
]

ACTION_BY_KEY: dict[str, ApprovalAction] = {a.key: a for a in ACTIONS}
COMPILED: dict[str, "re.Pattern[str]"] = {a.key: a.compiled() for a in ACTIONS}


# ------------------------------------------------------------------------------------------------ original drawers

# Calls that move ONE document forward, named by the path: an approver who finalizes that document straight from its own
# drawer also settles the request waiting for it. Payments and vouchers carry their own values, so they never auto-close.
_CLOSES_ON_DIRECT = frozenset(
    {
        "purchase.goods_receive",
        "purchase.purchase_return",
        "purchase.stock_adjustment",
        "sales.quotation",
        "sales.sales_order",
        "sales.delivery_challan",
        "sales.invoice",
        "sales.invoice_link",
        "sales.sales_return",
        "sales.product_transfer_ship",
        "sales.product_transfer_receive",
        "rma.complain_receive",
        "rma.customer_delivery",
        "rma.replacement_claim",
        "rma.replacement_receive",
    }
)
ACTIONS = [replace(a, closes_on_direct=True) if a.key in _CLOSES_ON_DIRECT else a for a in ACTIONS]
ACTION_BY_KEY = {a.key: a for a in ACTIONS}


def resolve_target(
    db: Session,
    key: str,
    params: dict[str, str],
    body: dict[str, Any],
    described: Described,
) -> tuple[Optional[str], Optional[str]]:
    """The record whose OWN drawer the Approve screen opens for a request, as (kind, id); (None, None) = there is none.

    The kinds are the ones the web opens: sales_order, quotation, sales_return, purchase_receipt, purchase_return,
    stock_adjustment, stock_transfer, customer, supplier, rma_ticket.
    """
    eid = described.entity_id
    if key == "purchase.goods_receive":
        return "purchase_receipt", params.get("receipt_id")
    if key == "purchase.purchase_return":
        return "purchase_return", params.get("return_id")
    if key == "purchase.stock_adjustment":
        return "stock_adjustment", params.get("adjustment_id")
    if key == "sales.quotation":
        return "quotation", params.get("quotation_id")
    if key in ("sales.sales_order", "sales.invoice", "sales.invoice_link"):
        return "sales_order", params.get("order_id")
    if key == "sales.sales_order_bulk":
        ids = [i for i in (body.get("ids") or []) if isinstance(i, str)]
        return ("sales_order", ids[0]) if len(ids) == 1 else (None, None)
    if key == "sales.delivery_challan":
        from app.models.sales import SalesDelivery

        delivery = _get(db, SalesDelivery, params.get("delivery_id"))
        return ("sales_order", delivery.sales_order_id) if delivery is not None else (None, None)
    if key == "sales.sales_return":
        return "sales_return", params.get("return_id")
    if key == "sales.sales_return_create":
        return ("sales_order", body.get("sales_order_id")) if body.get("sales_order_id") else (None, None)
    if key in ("sales.product_transfer_ship", "sales.product_transfer_receive"):
        return "stock_transfer", params.get("transfer_id")
    if key in ("sales.party_adjustment", "finance.collection"):
        return "customer", params.get("customer_id")
    if key == "finance.collection_receivable":
        from app.models.finance import FinanceReceivable

        row = _get(db, FinanceReceivable, params.get("receivable_id"))
        return ("customer", row.customer_id) if row is not None and row.customer_id else (None, None)
    if key == "finance.payment":
        return "supplier", params.get("supplier_id")
    if key == "finance.payment_payable":
        from app.models.finance import FinancePayable

        row = _get(db, FinancePayable, params.get("payable_id"))
        return ("supplier", row.supplier_id) if row is not None and row.supplier_id else (None, None)
    if key == "rma.complain_receive":
        return "rma_ticket", params.get("ticket_id")
    if key == "rma.customer_delivery":
        from app.models.rma import RmaDelivery

        row = _get(db, RmaDelivery, params.get("delivery_id"))
        return ("rma_ticket", row.rma_id) if row is not None else (None, None)
    if key == "rma.replacement_claim":
        from app.models.rma import RmaSupplierClaim

        row = _get(db, RmaSupplierClaim, params.get("claim_id"))
        return ("rma_ticket", row.rma_id) if row is not None else (None, None)
    if key == "rma.replacement_receive":
        from app.models.rma import RmaSupplierReceipt

        row = _get(db, RmaSupplierReceipt, params.get("receipt_id"))
        return ("rma_ticket", row.rma_id) if row is not None else (None, None)
    # sales.invoice_create, finance.collection_invoice, finance.payment_expense, finance.voucher: nothing to open
    return None, None
