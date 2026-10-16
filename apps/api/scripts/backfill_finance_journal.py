#!/usr/bin/env python3
"""Backfill double-entry GL journal entries for historical Moharaz-imported
sales orders, purchase orders, and payments.

Why this exists: import_moharaz_sales.py / import_moharaz_purchases.py /
import_moharaz_returns_payments.py deliberately post only to the AR/AP
subledger (FinanceReceivable/FinancePayable/FinancePayment) and never touch
finance_journal_entries/finance_journal_lines — by design, to avoid
corrupting live stock/cash balances with retroactive postings. The
consequence: Profit & Loss, Balance Sheet, Trial Balance, General Ledger,
and Analytic Report all read exclusively from the journal, so with 0
journal entries they show ৳0 across the board despite 5,876 real sales
orders and 270 real purchase orders existing.

This script closes that gap by posting the journal entries those imports
skipped, dated to match the original transactions, WITHOUT creating any
new subledger rows or touching sales_orders/purchase_orders/customer_id/
supplier_id/vendor_id anywhere — it only writes to finance_journal_entries,
finance_journal_lines, and backfills journal_entry_id/posting_status on
the existing FinanceReceivable/FinancePayable/FinancePayment rows.

Reuses FinanceService._post_journal — the exact function every live
posting in this app already goes through (same dedup key: company_id +
source_type + source_id, same account-code resolution, same "posted"
status, same period-open check). Idempotent: re-running skips any
(source_type, source_id) pair that already has a journal entry.

--dry-run (default) runs every posting call for real, inside one
transaction, then ALWAYS rolls back at the end — so it's a genuine
preview (catches missing accounts, imbalanced lines, etc.) that is
guaranteed to persist nothing, not a hand-simulated guess. No periodic
commits happen in dry-run mode for exactly this reason. --execute is
required to actually keep the result, and commits once at the end.

Three passes:

  1. Sales revenue + COGS — one journal entry per sales_order:
       Dr Accounts Receivable (1100)   = receivable.amount
       Cr Sales Revenue (4000)         = receivable.amount - tax
       Cr Output Tax Payable (2210)    = tax (0 for this import, self-skips)
       Dr Cost of Goods Sold (5000)    = computed COGS
       Cr Inventory (1200)             = computed COGS
     COGS uses the exact same two-step fallback as the get_product_profit
     report (finance.py report_product_profit): average
     InventoryStockLevel.unit_cost for the product, else
     CatalogProduct.purchase_price, else 0 (zero-value lines self-skip).
     This is also the first time this app has ever posted a COGS/Inventory
     relief entry anywhere — a standing gap independent of this import.

  2. Purchase inventory receipt — one journal entry per purchase_order:
       Dr Inventory (1200)   = payable.amount - tax
       Dr Input Tax (1310)   = tax (0 here, self-skips)
       Cr Accounts Payable (2100) = payable.amount

  3. Payment settlements — one journal entry per finance_payment not yet
     linked to a journal entry. Real invoice/bill settlements reduce
     AR/AP; everything tagged "advance" in its notes (143 supplier
     advances worth ৳1,73,00,104, plus customer advance/other payments)
     posts to the Advances to Suppliers (1400, asset) / Customer Advances
     (2200, liability) accounts instead — a prepayment is not revenue or
     an expense, so it must never touch the P&L, exactly the distinction
     already explained to the user for why Executive Summary looked like
     a loss.

Usage:
    python3 scripts/backfill_finance_journal.py --dry-run
    python3 scripts/backfill_finance_journal.py --execute
    python3 scripts/backfill_finance_journal.py --execute --skip-payments
    python3 scripts/backfill_finance_journal.py --dry-run --limit 50
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from decimal import Decimal

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal
from app.models import crm as _crm  # noqa: F401 — register crm_projects for FK resolution
from app.models.catalog_product import CatalogProduct
from app.models.finance import FinancePayable, FinancePayment, FinanceReceivable
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.purchase_order import PurchaseOrder
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.finance.finance_service import FinanceService

COMPANY_ID = "default"


def money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def build_item_cost_map(db) -> dict[str, Decimal]:
    """item_id -> unit cost, using the exact fallback chain get_product_profit
    uses (finance.py report_product_profit): inventory stock avg unit_cost by
    product_id, else catalog_products.purchase_price, else 0."""
    sums: dict[str, list[Decimal]] = defaultdict(list)
    for row in db.query(InventoryStockLevel.product_id, InventoryStockLevel.unit_cost).filter(
        InventoryStockLevel.company_id == COMPANY_ID, InventoryStockLevel.unit_cost > 0
    ):
        sums[row.product_id].append(row.unit_cost)
    avg_costs = {pid: sum(vals) / len(vals) for pid, vals in sums.items()}

    cost_by_item: dict[str, Decimal] = {}
    for cp in db.query(CatalogProduct.item_id, CatalogProduct.id, CatalogProduct.purchase_price).filter(
        CatalogProduct.company_id == COMPANY_ID
    ):
        if not cp.item_id:
            continue
        cost = avg_costs.get(cp.id) or cp.purchase_price or Decimal("0")
        cost_by_item[cp.item_id] = money(cost)
    return cost_by_item


def backfill_sales(db, svc: FinanceService, *, limit: int | None) -> dict:
    cost_by_item = build_item_cost_map(db)

    lines_by_order: dict[str, list[SalesOrderLine]] = defaultdict(list)
    for line in db.query(SalesOrderLine).all():
        lines_by_order[line.sales_order_id].append(line)

    q = (
        db.query(SalesOrder, FinanceReceivable)
        .join(
            FinanceReceivable,
            (FinanceReceivable.source_type == "sales_order")
            & (FinanceReceivable.source_id == SalesOrder.id)
            & (FinanceReceivable.company_id == COMPANY_ID),
        )
        .filter(SalesOrder.company_id == COMPANY_ID, FinanceReceivable.journal_entry_id.is_(None))
    )
    if limit:
        q = q.limit(limit)
    pairs = q.all()

    posted, skipped, cogs_total, revenue_total = 0, 0, Decimal("0"), Decimal("0")
    for order, receivable in pairs:
        amount = money(receivable.amount)
        tax = money(receivable.tax_amount)
        net = amount - tax
        if amount <= 0:
            skipped += 1
            continue

        cogs = Decimal("0")
        for line in lines_by_order.get(order.id, []):
            unit_cost = cost_by_item.get(line.item_id, Decimal("0"))
            cogs += unit_cost * Decimal(line.quantity_ordered or 0)
        cogs = money(cogs)

        gl_lines = [
            ("1100", amount, Decimal("0"), "Sales revenue (AR)", "customer", order.customer_id, Decimal("0")),
            ("4000", Decimal("0"), net, "Sales revenue", "customer", order.customer_id, Decimal("0")),
            ("2210", Decimal("0"), tax, "Output tax", None, None, tax),
            ("5000", cogs, Decimal("0"), "Cost of goods sold", None, None, Decimal("0")),
            ("1200", Decimal("0"), cogs, "Inventory relief", None, None, Decimal("0")),
        ]

        entry = svc._post_journal(
            company_id=COMPANY_ID,
            entry_date=order.order_date,
            description=f"Historical sale — {order.order_number}",
            source_type="sales_order",
            source_id=order.id,
            lines=gl_lines,
        )
        receivable.journal_entry_id = entry.id
        receivable.posting_status = "posted"

        posted += 1
        cogs_total += cogs
        revenue_total += net
        if posted % 500 == 0:
            print(f"  … {posted}/{len(pairs)} sales posted")

    return {
        "orders_seen": len(pairs),
        "posted": posted,
        "skipped_zero_amount": skipped,
        "revenue_total": str(revenue_total),
        "cogs_total": str(cogs_total),
        "gross_profit": str(revenue_total - cogs_total),
    }


def backfill_purchases(db, svc: FinanceService, *, limit: int | None) -> dict:
    q = (
        db.query(PurchaseOrder, FinancePayable)
        .join(
            FinancePayable,
            (FinancePayable.source_type == "purchase_order")
            & (FinancePayable.source_id == PurchaseOrder.id)
            & (FinancePayable.company_id == COMPANY_ID),
        )
        .filter(PurchaseOrder.company_id == COMPANY_ID, FinancePayable.journal_entry_id.is_(None))
    )
    if limit:
        q = q.limit(limit)
    pairs = q.all()

    posted, skipped, inventory_total = 0, 0, Decimal("0")
    for order, payable in pairs:
        amount = money(payable.amount)
        tax = money(payable.tax_amount)
        net = amount - tax
        if amount <= 0:
            skipped += 1
            continue

        gl_lines = [
            ("1200", net, Decimal("0"), "Inventory received", "supplier", order.supplier_id, Decimal("0")),
            ("1310", tax, Decimal("0"), "Input tax", None, None, tax),
            ("2100", Decimal("0"), amount, "Accounts payable", "supplier", order.supplier_id, Decimal("0")),
        ]

        entry = svc._post_journal(
            company_id=COMPANY_ID,
            entry_date=order.order_date,
            description=f"Historical purchase — {order.po_number}",
            source_type="purchase_order",
            source_id=order.id,
            lines=gl_lines,
        )
        payable.journal_entry_id = entry.id
        payable.posting_status = "posted"

        posted += 1
        inventory_total += net
        if posted % 500 == 0:
            print(f"  … {posted}/{len(pairs)} purchases posted")

    return {
        "orders_seen": len(pairs),
        "posted": posted,
        "skipped_zero_amount": skipped,
        "inventory_total": str(inventory_total),
    }


def _payment_kind(payment: FinancePayment) -> str:
    notes = (payment.notes or "").lower()
    return "advance" if "advance" in notes else "settlement"


def backfill_payments(db, svc: FinanceService, *, limit: int | None) -> dict:
    q = db.query(FinancePayment).filter(
        FinancePayment.company_id == COMPANY_ID, FinancePayment.journal_entry_id.is_(None)
    )
    if limit:
        q = q.limit(limit)
    payments = q.all()

    posted, skipped = 0, 0
    by_kind: dict[str, dict] = defaultdict(lambda: {"count": 0, "amount": Decimal("0")})
    for payment in payments:
        amount = money(payment.amount)
        if amount <= 0:
            skipped += 1
            continue
        kind = _payment_kind(payment)
        direction = payment.direction
        party_type = payment.party_type
        party_id = payment.party_id

        if direction == "inbound" and party_type == "customer" and kind == "settlement":
            gl_lines = [
                ("1000", amount, Decimal("0"), "Customer payment received", "customer", party_id, Decimal("0")),
                ("1100", Decimal("0"), amount, "Receivable settled", "customer", party_id, Decimal("0")),
            ]
            bucket = "customer_settlement"
        elif direction == "inbound" and party_type == "customer":
            gl_lines = [
                ("1000", amount, Decimal("0"), "Customer advance received", "customer", party_id, Decimal("0")),
                ("2200", Decimal("0"), amount, "Customer advance", "customer", party_id, Decimal("0")),
            ]
            bucket = "customer_advance"
        elif direction == "outbound" and party_type == "supplier" and kind == "settlement":
            gl_lines = [
                ("2100", amount, Decimal("0"), "Payable settled", "supplier", party_id, Decimal("0")),
                ("1000", Decimal("0"), amount, "Supplier payment made", "supplier", party_id, Decimal("0")),
            ]
            bucket = "supplier_settlement"
        elif direction == "outbound" and party_type == "supplier":
            gl_lines = [
                ("1400", amount, Decimal("0"), "Advance to supplier", "supplier", party_id, Decimal("0")),
                ("1000", Decimal("0"), amount, "Supplier advance paid", "supplier", party_id, Decimal("0")),
            ]
            bucket = "supplier_advance"
        elif direction == "outbound" and party_type == "customer":
            # Refund to a customer — treated as a sales return, not a fresh expense.
            gl_lines = [
                ("4200", amount, Decimal("0"), "Sales return / refund", "customer", party_id, Decimal("0")),
                ("1000", Decimal("0"), amount, "Refund paid", "customer", party_id, Decimal("0")),
            ]
            bucket = "customer_refund"
        else:
            skipped += 1
            continue

        entry = svc._post_journal(
            company_id=COMPANY_ID,
            entry_date=payment.payment_date,
            description=f"Historical payment — {payment.payment_number or payment.id}",
            source_type="moharaz_payment_settlement",
            source_id=payment.id,
            lines=gl_lines,
        )
        payment.journal_entry_id = entry.id

        posted += 1
        by_kind[bucket]["count"] += 1
        by_kind[bucket]["amount"] += amount
        if posted % 1000 == 0:
            print(f"  … {posted}/{len(payments)} payments posted")

    return {
        "payments_seen": len(payments),
        "posted": posted,
        "skipped": skipped,
        "by_kind": {k: {"count": v["count"], "amount": str(v["amount"])} for k, v in by_kind.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Preview only (also the default)")
    parser.add_argument("--execute", action="store_true", help="Actually persist changes")
    parser.add_argument("--skip-sales", action="store_true")
    parser.add_argument("--skip-purchases", action="store_true")
    parser.add_argument("--skip-payments", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows processed per pass (testing)")
    args = parser.parse_args()

    execute = bool(args.execute)
    if args.dry_run and execute:
        print("ERROR: --dry-run and --execute are mutually exclusive.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    svc = FinanceService(db)
    try:
        report: dict = {"mode": "EXECUTED" if execute else "DRY-RUN (will roll back)"}

        if not args.skip_sales:
            print("Pass 1/3 — Sales revenue + COGS")
            report["sales"] = backfill_sales(db, svc, limit=args.limit)

        if not args.skip_purchases:
            print("Pass 2/3 — Purchase inventory receipts")
            report["purchases"] = backfill_purchases(db, svc, limit=args.limit)

        if not args.skip_payments:
            print("Pass 3/3 — Payment settlements + advances")
            report["payments"] = backfill_payments(db, svc, limit=args.limit)

        if execute:
            db.commit()
        else:
            db.rollback()

        print()
        print("=" * 60)
        print(f"FINANCE JOURNAL BACKFILL — {report['mode']}")
        print("=" * 60)
        import json

        print(json.dumps(report, indent=2))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
