#!/usr/bin/env python3
"""Import MOHARAZ (business_id=2) sells as AgainERP sales orders.

Does NOT post stock movements — on-hand qty already came from the product snapshot.

  transactions type=sell         → sales_orders
  transaction_sell_lines         → sales_order_lines
  contacts.id                    → commerce_customers mhz-c-{id}
  default Walk-In (contact 2)    → existing WALK-IN (cust_walk_in)
  products.id                    → items mhz-prod-{id}

Quotations (is_quotation=1) are skipped. Draft sells stay draft; final sells
are completed + delivered without creating delivery notes or stock moves.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal
from app.models.commerce_customer import CommerceCustomer
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.sales import SalesOrder, SalesOrderLine, SalesOrderStatusHistory
from app.services.pos.constants import DEFAULT_WALK_IN_CUSTOMER_CODE

BUSINESS_ID = "2"
COMPANY_ID = "default"
DEFAULT_DUMP = Path("/tmp/erpmoharaz_main.sql")
MAP_PATH = Path("/app/uploads/moharaz_sales_map.json")
CONTACT_MAP_PATH = Path("/app/uploads/moharaz_contact_map.json")


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
    fallback = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.company_id == COMPANY_ID)
        .first()
    )
    if not fallback:
        raise SystemExit("No warehouse found")
    return fallback.id


def load_walk_in_customer_id(db: Session) -> str | None:
    if CONTACT_MAP_PATH.exists():
        payload = json.loads(CONTACT_MAP_PATH.read_text())
        mapping = payload.get("map") or {}
        for rec in mapping.values():
            if rec.get("note") == "mapped-to-existing-walk-in" and rec.get("customer_id"):
                return rec["customer_id"]
    walk_in = (
        db.query(CommerceCustomer)
        .filter(CommerceCustomer.customer_code == DEFAULT_WALK_IN_CUSTOMER_CODE)
        .first()
    )
    return walk_in.id if walk_in else None


def resolve_customer_id(
    contact_id: str,
    *,
    walk_in_id: str | None,
    customers: set[str],
    contact_map: dict[str, dict[str, str]],
) -> str | None:
    mapped = contact_map.get(contact_id) or {}
    mapped_id = mapped.get("customer_id")
    if mapped_id and mapped_id in customers:
        return mapped_id
    candidate = f"mhz-c-{contact_id}"
    if candidate in customers:
        return candidate
    if walk_in_id and mapped.get("note") == "mapped-to-existing-walk-in":
        return walk_in_id
    return None


def refresh_customer_sales_stats(db: Session) -> int:
    result = db.execute(
        text(
            """
            UPDATE commerce_customers AS c
            SET
                total_orders = COALESCE(s.cnt, 0),
                total_spend = COALESCE(s.spend, 0),
                avg_order_value = CASE
                    WHEN COALESCE(s.cnt, 0) > 0 THEN ROUND(s.spend / s.cnt, 2)
                    ELSE 0
                END,
                last_order_date = s.last_dt
            FROM (
                SELECT
                    customer_id,
                    COUNT(*) AS cnt,
                    SUM(total) AS spend,
                    MAX(order_date) AS last_dt
                FROM sales_orders
                WHERE deleted_at IS NULL
                  AND status NOT IN ('cancelled', 'draft')
                GROUP BY customer_id
            ) AS s
            WHERE c.id = s.customer_id
            """
        )
    )
    return result.rowcount or 0


def import_sales(dump_path: Path) -> dict[str, int]:
    dump_text = dump_path.read_text(encoding="utf-8", errors="replace")
    sells = [
        row
        for row in parse_table(dump_text, "transactions")
        if row.get("business_id") == BUSINESS_ID and row.get("type") == "sell"
    ]
    lines_by_txn: dict[str, list[dict[str, str | None]]] = defaultdict(list)
    for line in parse_table(dump_text, "transaction_sell_lines"):
        lines_by_txn[line.get("transaction_id") or ""].append(line)

    contact_map: dict[str, dict[str, str]] = {}
    if CONTACT_MAP_PATH.exists():
        payload = json.loads(CONTACT_MAP_PATH.read_text())
        raw_map = payload.get("map") or {}
        contact_map = {str(k): dict(v) for k, v in raw_map.items()}

    db = SessionLocal()
    stats = {
        "source": len(sells),
        "created": 0,
        "created_draft": 0,
        "skipped_existing": 0,
        "skipped_quotation": 0,
        "skipped_customer": 0,
        "skipped_no_lines": 0,
        "skipped_lines": 0,
        "customers_refreshed": 0,
    }
    mapping: dict[str, dict[str, str]] = {}
    try:
        warehouse_id = default_warehouse_id(db)
        walk_in_id = load_walk_in_customer_id(db)
        existing_orders = {
            row[0] for row in db.query(SalesOrder.id).filter(SalesOrder.id.like("mhz-so-%")).all()
        }
        taken_numbers = {
            row[0] for row in db.query(SalesOrder.order_number).filter(SalesOrder.company_id == COMPANY_ID).all()
        }
        customers = {row[0] for row in db.query(CommerceCustomer.id).all()}
        items_by_product: dict[str, Item] = {}
        for item in db.query(Item).filter(Item.id.like("mhz-prod-%")).all():
            product_id = item.id.removeprefix("mhz-prod-")
            items_by_product[product_id] = item

        for rec in sells:
            source_id = rec.get("id") or ""
            if rec.get("is_quotation") == "1":
                stats["skipped_quotation"] += 1
                continue

            order_id = f"mhz-so-{source_id}"
            if order_id in existing_orders:
                stats["skipped_existing"] += 1
                continue

            customer_id = resolve_customer_id(
                rec.get("contact_id") or "",
                walk_in_id=walk_in_id,
                customers=customers,
                contact_map=contact_map,
            )
            if not customer_id:
                stats["skipped_customer"] += 1
                continue

            raw_lines = lines_by_txn.get(source_id) or []
            built: list[tuple[Item, int, Decimal, Decimal, Decimal]] = []
            for raw in raw_lines:
                qty = as_int(raw.get("quantity"))
                if qty <= 0:
                    stats["skipped_lines"] += 1
                    continue
                item = items_by_product.get(raw.get("product_id") or "")
                if not item:
                    stats["skipped_lines"] += 1
                    continue
                price = as_decimal(raw.get("unit_price_inc_tax") or raw.get("unit_price"))
                discount = as_decimal(raw.get("line_discount_amount"))
                tax = as_decimal(raw.get("item_tax"))
                built.append((item, qty, price, discount, tax))
            if not built:
                stats["skipped_no_lines"] += 1
                continue

            order_number = f"MHZ-SO-{source_id}"
            if order_number in taken_numbers:
                order_number = f"MHZ-S{source_id}"[:32]
            taken_numbers.add(order_number)

            occurred = as_datetime(rec.get("transaction_date") or rec.get("created_at"))
            is_draft = rec.get("status") == "draft"
            status = "draft" if is_draft else "completed"
            delivery_status = "pending" if is_draft else "delivered"
            invoice = (rec.get("invoice_no") or "").strip()
            ref = (rec.get("ref_no") or "").strip()
            notes = "Imported from Moharaz sale #{0}.".format(source_id)
            if invoice:
                notes += f" Invoice: {invoice}."
            if ref:
                notes += f" Ref: {ref}."
            pay = rec.get("payment_status") or ""
            if pay:
                notes += f" Payment: {pay}."

            order = SalesOrder(
                id=order_id,
                company_id=COMPANY_ID,
                order_number=order_number[:32],
                customer_id=customer_id,
                warehouse_id=warehouse_id,
                status=status,
                delivery_status=delivery_status,
                order_date=occurred.date(),
                expected_date=occurred.date(),
                notes=notes,
                invoice_number=invoice[:64] if invoice else None,
                invoiced_at=None if is_draft else occurred,
                confirmed_at=None if is_draft else occurred,
                completed_at=None if is_draft else occurred,
                created_by=None,
            )
            db.add(order)
            db.flush()

            subtotal = Decimal("0")
            tax_total = Decimal("0")
            discount_total = Decimal("0")
            for idx, (item, qty, price, discount, tax) in enumerate(built, start=1):
                line_subtotal = (price * qty).quantize(Decimal("0.01"))
                subtotal += line_subtotal
                tax_total += tax
                discount_total += discount
                db.add(
                    SalesOrderLine(
                        id=f"mhz-sol-{source_id}-{idx}",
                        sales_order_id=order.id,
                        item_id=item.id,
                        line_number=idx,
                        sort_order=idx,
                        sku=item.sku,
                        name=item.name,
                        quantity_ordered=qty,
                        quantity_delivered=0 if is_draft else qty,
                        unit_price=price,
                        tax_rate=Decimal("0"),
                        tax_amount=tax,
                        discount_amount=discount,
                        line_total=line_subtotal,
                    )
                )
            header_tax = as_decimal(rec.get("tax_amount"))
            header_discount = as_decimal(rec.get("discount_amount"))
            header_total = as_decimal(rec.get("final_total"))
            order.subtotal = subtotal
            order.tax_total = header_tax if header_tax > 0 else tax_total
            order.discount_total = header_discount if header_discount > 0 else discount_total
            order.total = header_total if header_total > 0 else (subtotal - order.discount_total + order.tax_total)

            db.add(
                SalesOrderStatusHistory(
                    sales_order_id=order.id,
                    from_status=None,
                    to_status=status,
                    notes="Historical sale — stock not re-posted"
                    if not is_draft
                    else "Imported as draft from Moharaz",
                )
            )

            stats["created"] += 1
            if is_draft:
                stats["created_draft"] += 1
            existing_orders.add(order.id)
            mapping[source_id] = {
                "sales_order_id": order.id,
                "order_number": order.order_number,
                "customer_id": customer_id,
                "status": status,
            }
            if stats["created"] % 200 == 0:
                db.commit()
                print(f"… {stats['created']}/{len(sells)} sales", flush=True)

        db.flush()
        stats["customers_refreshed"] = refresh_customer_sales_stats(db)
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
    print(f"Importing MOHARAZ sales from {dump_path}", flush=True)
    stats = import_sales(dump_path)
    print(json.dumps(stats, indent=2))
    print(f"ID map written to {MAP_PATH}")


if __name__ == "__main__":
    main()
