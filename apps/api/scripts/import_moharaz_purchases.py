#!/usr/bin/env python3
"""Import MOHARAZ (business_id=2) purchases as AgainERP POs + posted GRNs.

Does NOT post stock movements — on-hand qty already came from the product snapshot.

  transactions type=purchase     → purchase_orders (status completed)
  purchase_lines                 → purchase_order_lines + purchase_receipt_lines
  contacts.id                    → commerce_suppliers mhz-s-{id}
  products.id                    → items mhz-prod-{id}
  variation_location warehouse   → default warehouse (Dhaka HQ)

Historical GRNs are marked posted so they show in Receipts without doubling stock.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.orm import Session

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal
from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatusHistory
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine

BUSINESS_ID = "2"
COMPANY_ID = "default"
DEFAULT_DUMP = Path("/tmp/erpmoharaz_main.sql")
MAP_PATH = Path("/app/uploads/moharaz_purchase_map.json")


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


def import_purchases(dump_path: Path) -> dict[str, int]:
    dump_text = dump_path.read_text(encoding="utf-8", errors="replace")
    purchases = [
        row
        for row in parse_table(dump_text, "transactions")
        if row.get("business_id") == BUSINESS_ID and row.get("type") == "purchase"
    ]
    lines_by_txn: dict[str, list[dict[str, str | None]]] = defaultdict(list)
    for line in parse_table(dump_text, "purchase_lines"):
        lines_by_txn[line.get("transaction_id") or ""].append(line)

    db = SessionLocal()
    stats = {
        "source": len(purchases),
        "created": 0,
        "receipts": 0,
        "skipped_existing": 0,
        "skipped_supplier": 0,
        "skipped_no_lines": 0,
        "skipped_lines": 0,
    }
    mapping: dict[str, dict[str, str]] = {}
    try:
        warehouse_id = default_warehouse_id(db)
        existing_pos = {
            row[0] for row in db.query(PurchaseOrder.id).filter(PurchaseOrder.id.like("mhz-po-%")).all()
        }
        taken_numbers = {
            row[0] for row in db.query(PurchaseOrder.po_number).filter(PurchaseOrder.company_id == COMPANY_ID).all()
        }

        for rec in purchases:
            source_id = rec.get("id") or ""
            order_id = f"mhz-po-{source_id}"
            if order_id in existing_pos:
                stats["skipped_existing"] += 1
                continue

            supplier_id = f"mhz-s-{rec.get('contact_id')}"
            supplier = db.get(CommerceSupplier, supplier_id)
            if not supplier:
                stats["skipped_supplier"] += 1
                continue

            raw_lines = lines_by_txn.get(source_id) or []
            built: list[tuple[Item, int, Decimal]] = []
            for raw in raw_lines:
                qty = as_int(raw.get("quantity"))
                if qty <= 0:
                    stats["skipped_lines"] += 1
                    continue
                item = db.get(Item, f"mhz-prod-{raw.get('product_id')}")
                if not item:
                    stats["skipped_lines"] += 1
                    continue
                cost = as_decimal(raw.get("purchase_price") or raw.get("pp_without_discount"))
                built.append((item, qty, cost))
            if not built:
                stats["skipped_no_lines"] += 1
                continue

            po_number = f"MHZ-PO-{source_id}"
            if po_number in taken_numbers:
                po_number = f"MHZ-P{source_id}"[:32]
            taken_numbers.add(po_number)

            occurred = as_datetime(rec.get("transaction_date") or rec.get("created_at"))
            ref = (rec.get("ref_no") or "").strip()
            invoice = (rec.get("invoice_no") or "").strip()
            notes = "Imported from Moharaz purchase #{0}.".format(source_id)
            if ref:
                notes += f" Ref: {ref}."
            if invoice:
                notes += f" Invoice: {invoice}."
            pay = rec.get("payment_status") or ""
            if pay:
                notes += f" Payment: {pay}."

            order = PurchaseOrder(
                id=order_id,
                company_id=COMPANY_ID,
                po_number=po_number[:32],
                supplier_id=supplier.id,
                warehouse_id=warehouse_id,
                status="completed",
                order_date=occurred.date(),
                expected_date=occurred.date(),
                buyer_name=supplier.buyer_name,
                notes=notes,
                confirmed_at=occurred,
                created_by=None,
            )
            db.add(order)
            db.flush()

            subtotal = Decimal("0")
            tax_total = Decimal("0")
            po_lines: list[PurchaseOrderLine] = []
            for idx, (item, qty, cost) in enumerate(built, start=1):
                line_subtotal = (cost * qty).quantize(Decimal("0.01"))
                subtotal += line_subtotal
                line = PurchaseOrderLine(
                    id=f"mhz-pol-{source_id}-{idx}",
                    purchase_order_id=order.id,
                    item_id=item.id,
                    supplier_id=supplier.id,
                    line_number=idx,
                    sort_order=idx,
                    sku=item.sku,
                    name=item.name,
                    quantity_ordered=qty,
                    quantity_received=qty,
                    unit_cost=cost,
                    tax_rate=Decimal("0"),
                    tax_amount=Decimal("0"),
                    discount_amount=Decimal("0"),
                    line_total=line_subtotal,
                )
                db.add(line)
                po_lines.append(line)
            order.subtotal = subtotal
            order.tax_total = tax_total
            order.discount_total = Decimal("0")
            header_total = as_decimal(rec.get("final_total"))
            order.total = header_total if header_total > 0 else subtotal

            db.add(
                PurchaseOrderStatusHistory(
                    purchase_order_id=order.id,
                    from_status=None,
                    to_status="draft",
                    notes="Imported from Moharaz",
                )
            )
            db.add(
                PurchaseOrderStatusHistory(
                    purchase_order_id=order.id,
                    from_status="draft",
                    to_status="confirmed",
                    notes="Imported as confirmed",
                )
            )
            db.add(
                PurchaseOrderStatusHistory(
                    purchase_order_id=order.id,
                    from_status="confirmed",
                    to_status="completed",
                    notes="Historical receipt — stock not re-posted",
                )
            )
            db.flush()

            receipt = PurchaseReceipt(
                id=f"mhz-grn-{source_id}",
                company_id=COMPANY_ID,
                receipt_number=f"MHZ-GRN-{source_id}"[:32],
                purchase_order_id=order.id,
                supplier_id=supplier.id,
                warehouse_id=warehouse_id,
                status="posted",
                receive_type="full",
                receipt_date=occurred.date(),
                received_by="Moharaz import",
                notes=notes,
                posted_at=occurred,
            )
            db.add(receipt)
            db.flush()
            for idx, po_line in enumerate(po_lines, start=1):
                db.add(
                    PurchaseReceiptLine(
                        id=f"mhz-grnl-{source_id}-{idx}",
                        purchase_receipt_id=receipt.id,
                        purchase_order_line_id=po_line.id,
                        item_id=po_line.item_id,
                        quantity_received=po_line.quantity_received,
                    )
                )

            stats["created"] += 1
            stats["receipts"] += 1
            existing_pos.add(order.id)
            mapping[source_id] = {
                "purchase_order_id": order.id,
                "po_number": order.po_number,
                "receipt_id": receipt.id,
                "supplier_id": supplier.id,
            }
            if stats["created"] % 50 == 0:
                db.commit()
                print(f"… {stats['created']}/{len(purchases)} purchases", flush=True)

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
    print(f"Importing MOHARAZ purchases from {dump_path}", flush=True)
    stats = import_purchases(dump_path)
    print(json.dumps(stats, indent=2))
    print(f"ID map written to {MAP_PATH}")


if __name__ == "__main__":
    main()
