"""Customer credit control at the moment of sale (OnerERP spec §15.2, §15.11).

A sales order is checked when it is confirmed (confirming issues the invoice, so that is when the customer starts to owe):
1. a customer **locked for sales** cannot buy at all;
2. a **cash-only** customer must have paid the whole order first;
3. with a credit limit, what the customer owes (ledger balance) + confirmed orders not invoiced yet + this order's unpaid part
   must stay within the limit. Until its valid-till date a **conditional limit** replaces a lower credit limit.
A credit limit of 0 means "no limit". The limits are kept on the customer (Profile → Accounting).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.commerce_customer import CommerceCustomer
from app.models.finance import FinanceReceivable
from app.models.sales import SalesOrder

ZERO = Decimal("0")
TRADE_MODES = ("both", "credit", "cash")
# confirmed orders that will become an invoice but have none yet
_UNSETTLED_ORDER_STATUSES = ("confirmed", "processing", "packed", "shipped")


def ensure_customer_credit_columns() -> None:
    """Additive columns (the project's ensure_* pattern)."""
    statements = [
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS sales_locked BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS sales_lock_reason TEXT",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS trade_mode VARCHAR(10) NOT NULL DEFAULT 'both'",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS credit_days INTEGER",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS conditional_limit NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS conditional_valid_till DATE",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS security_money NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS opening_date DATE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


@dataclass
class CreditPosition:
    ledger_balance: Decimal  # owed now (negative = the customer has an advance)
    unsettled_orders: Decimal  # confirmed orders not invoiced yet, unpaid part
    credit_limit: Decimal
    conditional_limit: Decimal
    conditional_valid_till: Optional[date]
    effective_limit: Decimal  # 0 = no limit

    @property
    def exposure(self) -> Decimal:
        return self.ledger_balance + self.unsettled_orders

    @property
    def available(self) -> Optional[Decimal]:
        return None if self.effective_limit <= 0 else self.effective_limit - self.exposure


def effective_limit(customer: CommerceCustomer, *, today: Optional[date] = None) -> Decimal:
    today = today or date.today()
    limit = money(customer.credit_limit)
    conditional = money(getattr(customer, "conditional_limit", None))
    valid_till = getattr(customer, "conditional_valid_till", None)
    if conditional > limit and valid_till and valid_till >= today:
        return conditional
    return limit


def order_due(order: SalesOrder) -> Decimal:
    """The unpaid part of an order (its Payment tab keeps what was paid)."""
    from app.services.sales.sales_service import SalesService

    meta = SalesService._load_payment_meta(order.notes) or {}
    return max(money(order.total) - money(meta.get("paid")), ZERO)


def credit_position(db: Session, customer: CommerceCustomer, *, exclude_order_id: Optional[str] = None) -> CreditPosition:
    from app.services.customer.customer_ledger_service import _payments, _receivables
    from app.services.finance.ledger_running import net_payments

    billed = sum((money(r.amount) for r in _receivables(db, customer.id)), ZERO)
    paid = net_payments(_payments(db, customer.id), paid_direction="inbound")
    invoiced_orders = {
        r.source_id
        for r in db.query(FinanceReceivable.source_id).filter(
            FinanceReceivable.customer_id == customer.id, FinanceReceivable.source_type == "sales_order"
        )
    }
    unsettled = ZERO
    for order in (
        db.query(SalesOrder)
        .filter(SalesOrder.customer_id == customer.id, SalesOrder.status.in_(_UNSETTLED_ORDER_STATUSES))
        .all()
    ):
        if order.id == exclude_order_id or order.id in invoiced_orders or order.invoice_number:
            continue
        unsettled += order_due(order)
    return CreditPosition(
        ledger_balance=money(billed - paid),
        unsettled_orders=unsettled,
        credit_limit=money(customer.credit_limit),
        conditional_limit=money(getattr(customer, "conditional_limit", None)),
        conditional_valid_till=getattr(customer, "conditional_valid_till", None),
        effective_limit=effective_limit(customer),
    )


def _fmt(value: Decimal) -> str:
    return f"{value:,.2f}"


def check_sale(db: Session, customer: Optional[CommerceCustomer], amount_due: Decimal, *, order_id: Optional[str] = None) -> None:
    """Refuse (409) a sale this customer may not make. `amount_due` is the part of the sale not paid yet."""
    if customer is None:
        return
    name = customer.name or "This customer"
    if getattr(customer, "sales_locked", False):
        reason = (getattr(customer, "sales_lock_reason", None) or "").strip()
        raise HTTPException(status_code=409, detail=f"{name} is locked for sales{f': {reason}' if reason else ''}. Unlock the customer first.")
    amount_due = money(amount_due)
    if amount_due <= 0:
        return
    if (getattr(customer, "trade_mode", None) or "both") == "cash":
        raise HTTPException(
            status_code=409,
            detail=f"{name} buys for cash only: take the full payment before confirming ({_fmt(amount_due)} is still due).",
        )
    position = credit_position(db, customer, exclude_order_id=order_id)
    if position.effective_limit <= 0:
        return
    after = position.exposure + amount_due
    if after > position.effective_limit:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Over the credit limit of {name}: "
                + (
                    f"owes {_fmt(position.ledger_balance)}"
                    if position.ledger_balance >= 0
                    else f"has an advance of {_fmt(-position.ledger_balance)}"
                )
                + f", open orders {_fmt(position.unsettled_orders)}, "
                f"this order {_fmt(amount_due)} = {_fmt(after)} against a limit of {_fmt(position.effective_limit)} "
                f"(available {_fmt(max(position.available or ZERO, ZERO))}). Take a payment, or raise the limit or give a conditional limit."
            ),
        )


def check_order_confirm(db: Session, order: SalesOrder, *, paid_at_counter: bool = False) -> None:
    """A POS sale is paid at the counter (its payment is not on the order yet), so only the sales lock applies to it."""
    customer = db.get(CommerceCustomer, order.customer_id) if order.customer_id else None
    check_sale(db, customer, ZERO if paid_at_counter else order_due(order), order_id=order.id)
