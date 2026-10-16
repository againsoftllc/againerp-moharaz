#!/usr/bin/env python3
"""Import MOHARAZ sell returns + payment ledger (business_id=2).

Does NOT post stock movements or GL journals — snapshot stock/cash stay as-is.

  transactions type=sell_return  → POS returns linked to original sales orders
  transaction_payments (sell)    → sales order payment meta + finance AR/payments
  transaction_payments (purchase)→ finance AP + outbound payments (supplier ledger)
  is_advance payments            → customer wallet history
  opening_balance                → customer/supplier opening_balance

Refunds (is_return=1 and credit notes) land on the original sale payment history.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.orm import Session

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal
from app.models import crm as _crm  # noqa: F401 — register crm_projects for FK resolution
from app.models.commerce_customer import CommerceCustomer, dump_json, load_json
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinancePayable, FinancePayment, FinancePaymentAccount, FinanceReceivable
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.pos import PosReturn, PosReturnLine, PosSession
from app.models.purchase_order import PurchaseOrder
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.finance.finance_service import FinanceService
from app.services.pos.constants import DEFAULT_WALK_IN_CUSTOMER_CODE

BUSINESS_ID = "2"
COMPANY_ID = "default"
DEFAULT_DUMP = Path("/tmp/erpmoharaz_main.sql")
MAP_PATH = Path("/app/uploads/moharaz_returns_payments_map.json")
CONTACT_MAP_PATH = Path("/app/uploads/moharaz_contact_map.json")
HISTORICAL_ACCOUNT_NAME = "Moharaz historical"
SESSION_ID = "mhz-sess-moharaz"
PAYMENT_META_RE = re.compile(r"<!--againerp:payment-->([\s\S]*?)<!--/againerp:payment-->")

METHOD_LABELS = {
    "cash": "Cash",
    "bank_transfer": "Manual Payment (Bank)",
    "cheque": "Cheque",
    "card": "Card",
    "other": "Other",
}


def split_sql_tuple(raw: str) -> list[str]:
    s = raw.strip()
    if s.startswith("("):
        s = s[1:]
    if s.endswith(")"):
        s = s[:-1]
    out: list[str] = []
    cur: list[str] = []
    in_s = False
    i = 0
    while i < len(s):
        ch = s[i]
        if in_s:
            if ch == "\\" and i + 1 < len(s):
                cur.append(ch)
                cur.append(s[i + 1])
                i += 2
                continue
            if ch == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    cur.append("''")
                    i += 2
                    continue
                in_s = False
                cur.append(ch)
            else:
                cur.append(ch)
            i += 1
            continue
        if ch == "'":
            in_s = True
            cur.append(ch)
        elif ch == ",":
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
        i += 1
    if cur:
        out.append("".join(cur).strip())
    return out


def unquote(value: str | None) -> str | None:
    if value is None:
        return None
    if value.upper() == "NULL":
        return None
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1].replace("''", "'").replace("\\'", "'")
    return value


def parse_table(dump_text: str, table: str) -> list[dict[str, str | None]]:
    header = re.search(rf"INSERT INTO `{table}` \(([^)]+)\) VALUES", dump_text)
    if not header:
        return []
    cols = [c.strip().strip("`") for c in header.group(1).split(",")]
    rows: list[dict[str, str | None]] = []
    for match in re.finditer(rf"INSERT INTO `{table}` \(([^)]+)\) VALUES\s*", dump_text):
        start = match.end()
        end = dump_text.find(";\n", start)
        blob = dump_text[start:end] if end != -1 else dump_text[start:]
        for line in blob.splitlines():
            line = line.strip().rstrip(",")
            if not line.startswith("("):
                continue
            fields = split_sql_tuple(line)
            rows.append(
                {
                    cols[i]: unquote(fields[i]) if i < len(fields) else None
                    for i in range(len(cols))
                }
            )
    return rows


def as_decimal(value: str | None) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def as_int(value: str | None) -> int:
    try:
        qty = Decimal(str(value or "0"))
        if qty <= 0:
            return 0
        return int(qty)
    except (InvalidOperation, ValueError, TypeError):
        return 0


def as_datetime(value: str | None) -> datetime:
    raw = (value or "").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return datetime.utcnow()


def method_label(raw: str | None) -> str:
    key = (raw or "cash").strip().lower()
    return METHOD_LABELS.get(key, raw or "Cash")


def pack_payment_notes(notes: str | None, payload: dict) -> str:
    clean = PAYMENT_META_RE.sub("", notes or "").strip()
    block = "<!--againerp:payment-->" + json.dumps(payload, separators=(",", ":")) + "<!--/againerp:payment-->"
    return f"{clean}\n\n{block}".strip() if clean else block


def load_contact_map() -> dict[str, dict[str, str]]:
    if not CONTACT_MAP_PATH.exists():
        return {}
    payload = json.loads(CONTACT_MAP_PATH.read_text())
    return {str(k): dict(v) for k, v in (payload.get("map") or {}).items()}


def default_warehouse_id(db: Session) -> str:
    row = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == COMPANY_ID,
            InventoryWarehouse.is_default.is_(True),
        )
        .first()
    )
    if row:
        return row.id
    fallback = db.query(InventoryWarehouse).filter(InventoryWarehouse.company_id == COMPANY_ID).first()
    if not fallback:
        raise SystemExit("No warehouse found")
    return fallback.id


def resolve_customer_id(
    contact_id: str,
    *,
    contact_map: dict[str, dict[str, str]],
    customers: set[str],
    walk_in_id: str | None,
) -> str | None:
    mapped = contact_map.get(contact_id) or {}
    mapped_id = mapped.get("customer_id")
    if mapped_id and mapped_id in customers:
        return mapped_id
    candidate = f"mhz-c-{contact_id}"
    if candidate in customers:
        return candidate
    if walk_in_id and (mapped.get("note") == "mapped-to-existing-walk-in" or contact_id == "2"):
        return walk_in_id
    return None


def resolve_supplier_id(
    contact_id: str,
    *,
    contact_map: dict[str, dict[str, str]],
    suppliers: set[str],
) -> str | None:
    mapped = contact_map.get(contact_id) or {}
    mapped_id = mapped.get("supplier_id")
    if mapped_id and mapped_id in suppliers:
        return mapped_id
    candidate = f"mhz-s-{contact_id}"
    if candidate in suppliers:
        return candidate
    return None


def historical_account(db: Session) -> FinancePaymentAccount:
    svc = FinanceService(db)
    svc.ensure_payment_accounts(COMPANY_ID)
    row = (
        db.query(FinancePaymentAccount)
        .filter(
            FinancePaymentAccount.company_id == COMPANY_ID,
            FinancePaymentAccount.name == HISTORICAL_ACCOUNT_NAME,
        )
        .first()
    )
    if row:
        return row
    cash = (
        db.query(FinancePaymentAccount)
        .filter(FinancePaymentAccount.company_id == COMPANY_ID, FinancePaymentAccount.kind == "cash")
        .first()
    )
    if not cash:
        raise SystemExit("No cash payment account to clone GL from")
    row = FinancePaymentAccount(
        id="mhz-payacct-hist",
        company_id=COMPANY_ID,
        name=HISTORICAL_ACCOUNT_NAME,
        kind="cash",
        gl_account_id=cash.gl_account_id,
        opening_balance=Decimal("0"),
        is_active=True,
        is_default=False,
    )
    db.add(row)
    db.flush()
    return row


def ensure_return_session(db: Session, warehouse_id: str) -> PosSession:
    session = db.get(PosSession, SESSION_ID)
    if session:
        return session
    session = PosSession(
        id=SESSION_ID,
        company_id=COMPANY_ID,
        warehouse_id=warehouse_id,
        register_name="Moharaz historical",
        cashier_name="Moharaz import",
        status="closed",
        notes="Historical Moharaz sell returns — stock not re-posted.",
        opened_at=datetime(2022, 9, 1, 10, 0, 0),
        closed_at=datetime(2026, 8, 31, 23, 59, 0),
    )
    db.add(session)
    db.flush()
    return session


def payment_status(paid: Decimal, due: Decimal) -> str:
    if paid <= 0:
        return "unpaid"
    if due > 0:
        return "partial"
    return "paid"


def import_returns_and_payments(dump_path: Path) -> dict[str, int]:
    dump_text = dump_path.read_text(encoding="utf-8", errors="replace")
    txns = [
        row
        for row in parse_table(dump_text, "transactions")
        if row.get("business_id") == BUSINESS_ID
    ]
    txn_by_id = {row.get("id") or "": row for row in txns}
    sell_returns = [row for row in txns if row.get("type") == "sell_return"]
    openings = [row for row in txns if row.get("type") == "opening_balance"]
    sell_lines_by_txn: dict[str, list[dict[str, str | None]]] = defaultdict(list)
    for line in parse_table(dump_text, "transaction_sell_lines"):
        sell_lines_by_txn[line.get("transaction_id") or ""].append(line)
    payments = [
        row
        for row in parse_table(dump_text, "transaction_payments")
        if row.get("business_id") == BUSINESS_ID
    ]
    pays_by_txn: dict[str, list[dict[str, str | None]]] = defaultdict(list)
    advances: list[dict[str, str | None]] = []
    for pay in payments:
        txn_id = pay.get("transaction_id")
        if txn_id:
            pays_by_txn[txn_id].append(pay)
        elif pay.get("is_advance") == "1" or not txn_id:
            advances.append(pay)

    contact_map = load_contact_map()
    db = SessionLocal()
    stats = {
        "returns_created": 0,
        "returns_skipped": 0,
        "sales_packed": 0,
        "receivables": 0,
        "payables": 0,
        "finance_payments": 0,
        "advances": 0,
        "openings": 0,
        "skipped_payments": 0,
    }
    mapping: dict[str, dict] = {"returns": {}, "payments": {}}
    try:
        warehouse_id = default_warehouse_id(db)
        account = historical_account(db)
        ensure_return_session(db, warehouse_id)
        customers = {row[0] for row in db.query(CommerceCustomer.id).all()}
        suppliers = {row[0] for row in db.query(CommerceSupplier.id).all()}
        walk_in = (
            db.query(CommerceCustomer)
            .filter(CommerceCustomer.customer_code == DEFAULT_WALK_IN_CUSTOMER_CODE)
            .first()
        )
        walk_in_id = walk_in.id if walk_in else None
        existing_pay_ids = {
            row[0]
            for row in db.query(FinancePayment.id).filter(FinancePayment.id.like("mhz-pay-%")).all()
        }
        taken_pay_numbers = {
            row[0]
            for row in db.query(FinancePayment.payment_number)
            .filter(FinancePayment.company_id == COMPANY_ID)
            .all()
        }

        def next_pay_number(source_id: str) -> str:
            number = f"MHZPAY-{source_id}"[:32]
            if number not in taken_pay_numbers:
                taken_pay_numbers.add(number)
                return number
            alt = f"MHZP{source_id}"[:32]
            taken_pay_numbers.add(alt)
            return alt

        def add_finance_payment(
            *,
            source_pay_id: str,
            amount: Decimal,
            method: str,
            paid_on: datetime,
            direction: str,
            party_type: str | None,
            party_id: str | None,
            source_type: str,
            source_id: str,
            reference: str | None,
            notes: str | None,
        ) -> bool:
            pay_id = f"mhz-pay-{source_pay_id}"
            if pay_id in existing_pay_ids:
                return False
            if amount <= 0:
                return False
            db.add(
                FinancePayment(
                    id=pay_id,
                    company_id=COMPANY_ID,
                    payment_number=next_pay_number(source_pay_id),
                    payment_date=paid_on.date(),
                    amount=amount,
                    payment_method=method_label(method).lower()[:32],
                    payment_account_id=account.id,
                    direction=direction,
                    source_type=source_type[:32],
                    source_id=source_id[:36],
                    party_type=party_type,
                    party_id=party_id,
                    reference=(reference or "")[:64] or None,
                    notes=notes,
                    journal_entry_id=None,
                )
            )
            existing_pay_ids.add(pay_id)
            stats["finance_payments"] += 1
            mapping["payments"][source_pay_id] = {"finance_payment_id": pay_id, "direction": direction}
            return True

        # ── Sell returns ─────────────────────────────────────────────────────
        for rec in sell_returns:
            source_id = rec.get("id") or ""
            return_id = f"mhz-ret-{source_id}"
            if db.get(PosReturn, return_id):
                stats["returns_skipped"] += 1
                continue
            parent_id = rec.get("return_parent_id") or ""
            order = db.get(SalesOrder, f"mhz-so-{parent_id}")
            if not order:
                stats["returns_skipped"] += 1
                continue
            occurred = as_datetime(rec.get("transaction_date") or rec.get("created_at"))
            invoice = (rec.get("invoice_no") or f"CN-{source_id}").strip()
            refund_total = as_decimal(rec.get("final_total"))
            parent_lines = sell_lines_by_txn.get(parent_id) or []
            built: list[tuple[SalesOrderLine, int, Decimal]] = []
            for idx, raw in enumerate(parent_lines, start=1):
                qty = as_int(raw.get("quantity_returned"))
                if qty <= 0:
                    continue
                so_line = db.get(SalesOrderLine, f"mhz-sol-{parent_id}-{idx}")
                if not so_line:
                    continue
                line_refund = as_decimal(raw.get("unit_price_inc_tax")) * qty
                built.append((so_line, qty, line_refund))
            if refund_total <= 0 and built:
                refund_total = sum((amt for _, _, amt in built), Decimal("0"))
            ret = PosReturn(
                id=return_id,
                company_id=COMPANY_ID,
                session_id=SESSION_ID,
                original_sales_order_id=order.id,
                return_number=f"MHZ-{invoice}"[:32],
                status="posted",
                refund_total=refund_total,
                refund_method="cash",
                reason=f"Imported Moharaz credit note {invoice}. Stock not re-posted.",
                created_at=occurred,
            )
            db.add(ret)
            db.flush()
            for idx, (so_line, qty, line_refund) in enumerate(built, start=1):
                db.add(
                    PosReturnLine(
                        id=f"mhz-retl-{source_id}-{idx}",
                        pos_return_id=ret.id,
                        item_id=so_line.item_id,
                        sales_order_line_id=so_line.id,
                        quantity=qty,
                        refund_amount=line_refund,
                    )
                )
            note_bit = f" Sell return {invoice} (MHZ-SO-{parent_id})."
            if note_bit not in (order.notes or ""):
                order.notes = ((order.notes or "") + note_bit).strip()
            stats["returns_created"] += 1
            mapping["returns"][source_id] = {
                "pos_return_id": ret.id,
                "sales_order_id": order.id,
                "invoice": invoice,
            }

        db.flush()

        # ── Sales payments → notes + AR ──────────────────────────────────────
        sales_orders = {
            row.id: row
            for row in db.query(SalesOrder).filter(SalesOrder.id.like("mhz-so-%")).all()
        }
        existing_ar = {
            row.source_id
            for row in db.query(FinanceReceivable.source_id)
            .filter(
                FinanceReceivable.company_id == COMPANY_ID,
                FinanceReceivable.source_type == "sales_order",
            )
            .all()
        }
        packed = 0
        for txn_id, order in sales_orders.items():
            source_id = txn_id.removeprefix("mhz-so-")
            rec = txn_by_id.get(source_id) or {}
            rows = pays_by_txn.get(source_id) or []
            history: list[dict] = []
            paid = Decimal("0")
            refunded = Decimal("0")
            last_method = "cash"
            for pay in sorted(rows, key=lambda r: r.get("paid_on") or ""):
                amount = as_decimal(pay.get("amount"))
                occurred = as_datetime(pay.get("paid_on") or pay.get("created_at"))
                method = pay.get("method") or "cash"
                last_method = method
                is_refund = pay.get("is_return") == "1"
                ref = (pay.get("payment_ref_no") or "").strip()
                if is_refund:
                    refunded += amount
                    if amount > 0:
                        history.append(
                            {
                                "id": f"mhz-pay-{pay.get('id')}",
                                "label": f"Refund · {ref or order.order_number}",
                                "amount": float(amount),
                                "status": "refunded",
                                "at": occurred.isoformat(),
                                "method": method_label(method),
                            }
                        )
                elif amount > 0:
                    paid += amount
                    history.append(
                        {
                            "id": f"mhz-pay-{pay.get('id')}",
                            "label": f"Payment · {ref or order.order_number}",
                            "amount": float(amount),
                            "status": "completed",
                            "at": occurred.isoformat(),
                            "method": method_label(method),
                        }
                    )
                add_finance_payment(
                    source_pay_id=pay.get("id") or source_id,
                    amount=amount,
                    method=method,
                    paid_on=occurred,
                    direction="outbound" if is_refund else "inbound",
                    party_type="customer",
                    party_id=order.customer_id,
                    source_type="manual",
                    source_id=f"mhz-pay-{pay.get('id')}"[:36],
                    reference=ref or order.order_number,
                    notes="Imported Moharaz sell payment. GL not posted.",
                )
            # Credit notes against this sale
            for ret in sell_returns:
                if ret.get("return_parent_id") != source_id:
                    continue
                cn_total = as_decimal(ret.get("final_total"))
                occurred = as_datetime(ret.get("transaction_date"))
                invoice = (ret.get("invoice_no") or "").strip()
                cn_paid = ret.get("payment_status") == "paid"
                if cn_total > 0:
                    refunded += cn_total if cn_paid else Decimal("0")
                    history.append(
                        {
                            "id": f"mhz-ret-{ret.get('id')}",
                            "label": f"Credit note · {invoice or ret.get('id')}",
                            "amount": float(cn_total),
                            "status": "refunded" if cn_paid else "pending",
                            "at": occurred.isoformat(),
                            "method": "Cash",
                        }
                    )
            if not rows:
                # No payment rows — honour Moharaz payment_status
                status_hint = (rec.get("payment_status") or "").lower()
                if status_hint == "paid":
                    paid = as_decimal(rec.get("final_total")) or order.total
                    last_method = "cash"
                    history.append(
                        {
                            "id": f"mhz-implied-{source_id}",
                            "label": f"Paid · {order.order_number}",
                            "amount": float(paid),
                            "status": "completed",
                            "at": as_datetime(rec.get("transaction_date")).isoformat(),
                            "method": "Cash",
                        }
                    )
            net_paid = max(paid - refunded, Decimal("0"))
            due = max((order.total or Decimal("0")) - net_paid, Decimal("0"))
            status = payment_status(net_paid, due)
            order.notes = pack_payment_notes(
                order.notes,
                {
                    "paid": float(net_paid),
                    "due": float(due),
                    "status": status,
                    "method": method_label(last_method),
                    "history": history,
                },
            )
            packed += 1
            if order.id not in existing_ar and (order.invoice_number or order.total):
                amount = order.total or Decimal("0")
                amount_paid = min(net_paid, amount)
                balance = max(amount - amount_paid, Decimal("0"))
                ar_status = "paid" if balance <= 0 and amount > 0 else ("partial" if amount_paid > 0 else "open")
                db.add(
                    FinanceReceivable(
                        id=f"mhz-ar-{source_id}",
                        company_id=COMPANY_ID,
                        customer_id=order.customer_id,
                        source_type="sales_order",
                        source_id=order.id,
                        invoice_number=(order.invoice_number or order.order_number)[:64],
                        amount=amount,
                        amount_paid=amount_paid,
                        balance=balance,
                        tax_amount=order.tax_total or Decimal("0"),
                        due_date=order.order_date,
                        status=ar_status if amount > 0 else "paid",
                        posting_status="pending",
                        posting_error="Historical Moharaz import — GL not posted",
                    )
                )
                existing_ar.add(order.id)
                stats["receivables"] += 1
            if packed % 500 == 0:
                db.commit()
                print(f"… packed {packed} sales payments", flush=True)
        stats["sales_packed"] = packed
        db.flush()

        # ── Purchase payments → AP ───────────────────────────────────────────
        purchase_orders = {
            row.id: row
            for row in db.query(PurchaseOrder).filter(PurchaseOrder.id.like("mhz-po-%")).all()
        }
        existing_ap = {
            row.source_id
            for row in db.query(FinancePayable.source_id)
            .filter(
                FinancePayable.company_id == COMPANY_ID,
                FinancePayable.source_type == "purchase_order",
            )
            .all()
        }
        for order in purchase_orders.values():
            source_id = order.id.removeprefix("mhz-po-")
            rows = pays_by_txn.get(source_id) or []
            paid = Decimal("0")
            for pay in rows:
                amount = as_decimal(pay.get("amount"))
                occurred = as_datetime(pay.get("paid_on") or pay.get("created_at"))
                paid += amount
                add_finance_payment(
                    source_pay_id=pay.get("id") or source_id,
                    amount=amount,
                    method=pay.get("method") or "cash",
                    paid_on=occurred,
                    direction="outbound",
                    party_type="supplier",
                    party_id=order.supplier_id,
                    source_type="manual",
                    source_id=f"mhz-pay-{pay.get('id')}"[:36],
                    reference=(pay.get("payment_ref_no") or order.po_number)[:64],
                    notes="Imported Moharaz purchase payment. GL not posted.",
                )
            if order.id in existing_ap:
                continue
            amount = order.total or Decimal("0")
            rec = txn_by_id.get(source_id) or {}
            if rows:
                amount_paid = min(paid, amount)
            elif (rec.get("payment_status") or "").lower() == "paid":
                amount_paid = amount
            else:
                amount_paid = Decimal("0")
            balance = max(amount - amount_paid, Decimal("0"))
            ap_status = "paid" if balance <= 0 and amount > 0 else ("partial" if amount_paid > 0 else "open")
            db.add(
                FinancePayable(
                    id=f"mhz-ap-{source_id}",
                    company_id=COMPANY_ID,
                    supplier_id=order.supplier_id,
                    source_type="purchase_order",
                    source_id=order.id,
                    reference_number=(order.po_number or source_id)[:64],
                    amount=amount,
                    amount_paid=amount_paid,
                    balance=balance,
                    tax_amount=order.tax_total or Decimal("0"),
                    due_date=order.order_date,
                    status=ap_status if amount > 0 else "paid",
                    posting_status="pending",
                    posting_error="Historical Moharaz import — GL not posted",
                )
            )
            existing_ap.add(order.id)
            stats["payables"] += 1
        db.flush()

        # ── Contact advances (orphan payments) ───────────────────────────────
        for pay in advances:
            amount = as_decimal(pay.get("amount"))
            if amount <= 0:
                stats["skipped_payments"] += 1
                continue
            contact_id = pay.get("payment_for") or ""
            occurred = as_datetime(pay.get("paid_on") or pay.get("created_at"))
            customer_id = resolve_customer_id(
                contact_id, contact_map=contact_map, customers=customers, walk_in_id=walk_in_id
            )
            supplier_id = resolve_supplier_id(
                contact_id, contact_map=contact_map, suppliers=suppliers
            )
            if customer_id:
                customer = db.get(CommerceCustomer, customer_id)
                if customer:
                    txs = load_json(customer.wallet_transactions_json, [])
                    tx_id = f"mhz-pay-{pay.get('id')}"
                    if not any(isinstance(t, dict) and t.get("id") == tx_id for t in txs):
                        txs.append(
                            {
                                "id": tx_id,
                                "at": occurred.isoformat(),
                                "amount": float(amount),
                                "type": "credit",
                                "payment_method": method_label(pay.get("method")),
                                "label": f"Advance · {(pay.get('payment_ref_no') or '').strip() or pay.get('id')}",
                            }
                        )
                        customer.wallet_transactions_json = dump_json(txs)
                        customer.wallet_balance = (customer.wallet_balance or Decimal("0")) + amount
                    stats["advances"] += 1
                add_finance_payment(
                    source_pay_id=pay.get("id") or contact_id,
                    amount=amount,
                    method=pay.get("method") or "cash",
                    paid_on=occurred,
                    direction="inbound",
                    party_type="customer",
                    party_id=customer_id,
                    source_type="manual",
                    source_id=f"mhz-pay-{pay.get('id')}"[:36],
                    reference=(pay.get("payment_ref_no") or "")[:64] or None,
                    notes="Imported Moharaz customer advance. GL not posted.",
                )
            elif supplier_id:
                add_finance_payment(
                    source_pay_id=pay.get("id") or contact_id,
                    amount=amount,
                    method=pay.get("method") or "cash",
                    paid_on=occurred,
                    direction="outbound",
                    party_type="supplier",
                    party_id=supplier_id,
                    source_type="manual",
                    source_id=f"mhz-pay-{pay.get('id')}"[:36],
                    reference=(pay.get("payment_ref_no") or "")[:64] or None,
                    notes="Imported Moharaz supplier advance. GL not posted.",
                )
                stats["advances"] += 1
            else:
                stats["skipped_payments"] += 1

        # ── Opening balances ─────────────────────────────────────────────────
        for rec in openings:
            contact_id = rec.get("contact_id") or ""
            amount = as_decimal(rec.get("final_total"))
            supplier_id = resolve_supplier_id(
                contact_id, contact_map=contact_map, suppliers=suppliers
            )
            customer_id = resolve_customer_id(
                contact_id, contact_map=contact_map, customers=customers, walk_in_id=walk_in_id
            )
            if supplier_id:
                supplier = db.get(CommerceSupplier, supplier_id)
                if supplier:
                    supplier.opening_balance = amount
                    stats["openings"] += 1
            elif customer_id:
                customer = db.get(CommerceCustomer, customer_id)
                if customer:
                    customer.opening_balance = amount
                    stats["openings"] += 1

        db.commit()
        MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
        MAP_PATH.write_text(json.dumps({"business_id": 2, "map": mapping}, indent=2))
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    dump_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DUMP
    if not dump_path.exists():
        raise SystemExit(f"Dump not found: {dump_path}")
    print(f"Importing MOHARAZ returns + payments from {dump_path}", flush=True)
    stats = import_returns_and_payments(dump_path)
    print(json.dumps(stats, indent=2))
    print(f"ID map written to {MAP_PATH}")


if __name__ == "__main__":
    main()
