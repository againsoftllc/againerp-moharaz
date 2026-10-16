#!/usr/bin/env python3
"""Import MOHARAZ (business_id=2) contacts into AgainERP customers + suppliers.

Field map (Ultimate POS `contacts` → AgainERP):

  contacts.id                  → stable ids mhz-c-{id} / mhz-s-{id} / mhz-p-{id}
  contacts.contact_id          → customer_code MHZ-{id} / vendor_code MHZ-V-{id}
  contacts.type                → customer | supplier | both (both → one Party, two roles)
  contacts.supplier_business_name + name + first_name → display name
  contacts.mobile              → phone  (junk ** / 0 / empty → "")
  contacts.email               → email
  contacts.city / state        → city / region
  contacts.country             → country (empty → Bangladesh)
  contacts.address_line_1/2    → addresses_json + party_addresses
  contacts.shipping_address    → extra shipping address
  contacts.credit_limit        → credit_limit
  contacts.balance             → opening_balance
  contacts.total_rp            → reward_points
  contacts.tax_number          → supplier.tax_id
  contacts.pay_term_*          → supplier.payment_terms
  contacts.contact_status      → status
  contacts.created_at          → customer_since
  contacts.deleted_at          → skipped

Default Walk-In Customer (is_default=1) is not duplicated; it maps to existing WALK-IN.
Re-run is idempotent (skips ids that already exist).
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.commerce_customer import CommerceCustomer, append_customer_timeline, dump_json
from app.models.commerce_supplier import CommerceSupplier
from app.models.party import Party
from app.services.parties.commerce_workspace_bridge import (
    sync_workspace_from_customer,
    sync_workspace_from_supplier,
)
from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository
from app.services.pos.constants import DEFAULT_WALK_IN_CUSTOMER_CODE

BUSINESS_ID = "2"
COMPANY_ID = "default"
DEFAULT_DUMP = Path("/tmp/erpmoharaz_main.sql")
MAP_PATH = Path("/app/uploads/moharaz_contact_map.json")

JUNK_PHONES = {"", "0", "00", "*", "**", "-", "n/a", "na", "null", "none"}


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


def parse_contacts(dump_path: Path) -> list[dict[str, str | None]]:
    text = dump_path.read_text(encoding="utf-8", errors="replace")
    header = re.search(r"INSERT INTO `contacts` \(([^)]+)\) VALUES", text)
    if not header:
        raise SystemExit("No contacts INSERT found in dump")
    cols = [c.strip().strip("`") for c in header.group(1).split(",")]
    rows: list[dict[str, str | None]] = []
    for match in re.finditer(r"INSERT INTO `contacts` \(([^)]+)\) VALUES\s*", text):
        start = match.end()
        end = text.find(";\n", start)
        blob = text[start:end] if end != -1 else text[start:]
        for line in blob.splitlines():
            line = line.strip().rstrip(",")
            if not line.startswith("("):
                continue
            fields = split_sql_tuple(line)
            rec = {
                cols[i]: unquote(fields[i]) if i < len(fields) else None
                for i in range(len(cols))
            }
            if rec.get("business_id") != BUSINESS_ID:
                continue
            rows.append(rec)
    return rows


def clean_text(value: str | None) -> str:
    return (value or "").strip()


def clean_phone(value: str | None) -> str:
    raw = clean_text(value)
    if raw.lower() in JUNK_PHONES:
        return ""
    return raw


def as_decimal(value: str | None) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def as_int(value: str | None) -> int:
    try:
        return int(Decimal(str(value or "0")))
    except (InvalidOperation, ValueError, TypeError):
        return 0


def as_date(value: str | None) -> date:
    raw = clean_text(value)
    if not raw:
        return date.today()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return date.today()


def display_name(rec: dict[str, str | None]) -> str:
    business = clean_text(rec.get("supplier_business_name"))
    person = clean_text(rec.get("name")) or " ".join(
        part
        for part in (
            clean_text(rec.get("prefix")),
            clean_text(rec.get("first_name")),
            clean_text(rec.get("middle_name")),
            clean_text(rec.get("last_name")),
        )
        if part
    ).strip()
    contact_type = rec.get("type") or "customer"
    if contact_type == "supplier":
        return business or person or f"Supplier {rec.get('contact_id') or rec.get('id')}"
    # Customers: company name when present (Star Tech, DARAZ), else person name.
    return business or person or f"Customer {clean_phone(rec.get('mobile')) or rec.get('contact_id') or rec.get('id')}"


def payment_terms(rec: dict[str, str | None]) -> str:
    number = as_int(rec.get("pay_term_number"))
    kind = (rec.get("pay_term_type") or "days").lower()
    if number <= 0:
        return "Net 30"
    if kind.startswith("month"):
        return f"Net {number * 30}"
    return f"Net {number}"


def is_org_name(name: str, rec: dict[str, str | None]) -> bool:
    if clean_text(rec.get("supplier_business_name")):
        return True
    lowered = name.lower()
    return any(
        marker in lowered
        for marker in ("ltd", "limited", "inc", "corp", "company", "co.", "group", "plc", "global")
    )


def customer_addresses(rec: dict[str, str | None], city: str, region: str, country: str) -> list[dict]:
    addresses: list[dict] = []
    line1 = clean_text(rec.get("address_line_1"))
    line2 = clean_text(rec.get("address_line_2"))
    shipping = clean_text(rec.get("shipping_address"))
    cid = rec.get("id") or "0"
    if line1 or line2:
        addresses.append(
            {
                "id": f"addr_mhz_{cid}_b",
                "label": "Primary",
                "address": " ".join(part for part in (line1, line2) if part),
                "city": city,
                "region": region,
                "country": country,
                "isDefault": True,
            }
        )
    if shipping and shipping != line1:
        addresses.append(
            {
                "id": f"addr_mhz_{cid}_s",
                "label": "Shipping",
                "address": shipping,
                "city": city,
                "region": region,
                "country": country,
                "isDefault": not addresses,
            }
        )
    return addresses


def supplier_addresses(rec: dict[str, str | None], country: str) -> list[dict]:
    line1 = clean_text(rec.get("address_line_1"))
    line2 = clean_text(rec.get("address_line_2"))
    if not line1 and not line2:
        return []
    return [
        {
            "id": "a1",
            "label": "Head office",
            "type": "billing",
            "line1": line1,
            "line2": line2,
            "city": clean_text(rec.get("city")),
            "country": country,
        }
    ]


def source_note(rec: dict[str, str | None], extra: str = "") -> str:
    person = clean_text(rec.get("name"))
    business = clean_text(rec.get("supplier_business_name"))
    bits = [
        f"Imported from Moharaz contact #{rec.get('id')} ({rec.get('contact_id')}).",
    ]
    if business and person and business.lower() != person.lower():
        bits.append(f"Contact person: {person}.")
    landline = clean_phone(rec.get("landline"))
    alt = clean_phone(rec.get("alternate_number"))
    if landline:
        bits.append(f"Landline: {landline}.")
    if alt:
        bits.append(f"Alternate: {alt}.")
    if extra:
        bits.append(extra)
    return " ".join(bits)


def ensure_party(
    db: Session,
    rec: dict[str, str | None],
    *,
    party_id: str,
    roles: tuple[str, ...],
) -> Party:
    name = display_name(rec)
    party = db.get(Party, party_id)
    if party is None:
        party = Party(
            id=party_id,
            company_id=COMPANY_ID,
            type="organization" if is_org_name(name, rec) else "person",
            display_name=name,
            legal_name=name,
            status="active",
        )
        db.add(party)
        db.flush()
    role_repo = SqlAlchemyPartyRoleRepository(db)
    for role in roles:
        role_repo.add_role(party_id, role)
    return party


def create_customer(db: Session, rec: dict[str, str | None], party_id: str) -> CommerceCustomer:
    source_id = rec.get("id") or "0"
    city = clean_text(rec.get("city"))
    region = clean_text(rec.get("state"))
    country = clean_text(rec.get("country")) or "Bangladesh"
    name = display_name(rec)
    row = CommerceCustomer(
        id=f"mhz-c-{source_id}",
        company_id=COMPANY_ID,
        party_id=party_id,
        customer_code=f"MHZ-{source_id}",
        name=name,
        phone=clean_phone(rec.get("mobile")),
        email=clean_text(rec.get("email")),
        group="wholesale" if clean_text(rec.get("supplier_business_name")) else "retail",
        status="active" if (rec.get("contact_status") or "active") == "active" else "inactive",
        city=city,
        region=region,
        country=country,
        customer_since=as_date(rec.get("created_at")),
        tags_json=dump_json(["moharaz", f"mhz:{source_id}"]),
        opening_balance=as_decimal(rec.get("balance")),
        credit_limit=as_decimal(rec.get("credit_limit")),
        reward_points=as_int(rec.get("total_rp")),
        notes=source_note(rec),
        addresses_json=dump_json(customer_addresses(rec, city, region, country)),
    )
    append_customer_timeline(
        row,
        "Imported from Moharaz",
        actor="System",
        event_type="registered",
        description=f"MOHARAZ contact #{source_id}",
        role="system",
    )
    db.add(row)
    db.flush()
    sync_workspace_from_customer(db, row)
    return row


def create_supplier(db: Session, rec: dict[str, str | None], party_id: str) -> CommerceSupplier:
    source_id = rec.get("id") or "0"
    country = clean_text(rec.get("country")) or "Bangladesh"
    name = display_name(rec)
    person = clean_text(rec.get("name"))
    row = CommerceSupplier(
        id=f"mhz-s-{source_id}",
        company_id=COMPANY_ID,
        party_id=party_id,
        vendor_code=f"MHZ-V-{source_id}",
        name=name,
        email=clean_text(rec.get("email")),
        phone=clean_phone(rec.get("mobile")),
        payment_terms=payment_terms(rec),
        status="active" if (rec.get("contact_status") or "active") == "active" else "blocked",
        country=country,
        tax_id=clean_text(rec.get("tax_number")) or None,
        currency="BDT",
        opening_balance=as_decimal(rec.get("balance")),
        buyer_name=person or None,
        notes=source_note(rec),
        contacts_json=json.dumps(
            [
                {
                    "id": "c1",
                    "name": person or name,
                    "role": "Primary contact",
                    "email": clean_text(rec.get("email")),
                    "phone": clean_phone(rec.get("mobile")),
                    "isPrimary": True,
                }
            ]
            if person or clean_phone(rec.get("mobile"))
            else []
        ),
        addresses_json=json.dumps(supplier_addresses(rec, country)),
        timeline_json=json.dumps(
            [
                {
                    "id": f"tl_mhz_{source_id}",
                    "type": "imported",
                    "title": "Imported from Moharaz",
                    "actor": "System",
                    "at": datetime.utcnow().isoformat() + "Z",
                }
            ]
        ),
    )
    db.add(row)
    db.flush()
    sync_workspace_from_supplier(db, row)
    return row


def is_default_walk_in(rec: dict[str, str | None]) -> bool:
    name = (rec.get("name") or "").strip().lower()
    return rec.get("is_default") == "1" and name.replace(" ", "") in {"walk-incustomer", "walkincustomer"}


def import_contacts(dump_path: Path) -> dict[str, int]:
    rows = parse_contacts(dump_path)
    db = SessionLocal()
    stats = {
        "source_rows": len(rows),
        "customers_created": 0,
        "suppliers_created": 0,
        "skipped_deleted": 0,
        "skipped_existing": 0,
        "skipped_walk_in": 0,
        "both": 0,
    }
    mapping: dict[str, dict[str, str]] = {}
    try:
        walk_in = (
            db.query(CommerceCustomer)
            .filter(CommerceCustomer.customer_code == DEFAULT_WALK_IN_CUSTOMER_CODE)
            .first()
        )
        existing_customers = {
            row.id for row in db.query(CommerceCustomer.id).all()
        }
        existing_suppliers = {
            row.id for row in db.query(CommerceSupplier.id).all()
        }

        for index, rec in enumerate(rows, start=1):
            source_id = rec.get("id") or ""
            if rec.get("deleted_at"):
                stats["skipped_deleted"] += 1
                continue
            if is_default_walk_in(rec):
                stats["skipped_walk_in"] += 1
                if walk_in:
                    mapping[source_id] = {
                        "type": "customer",
                        "customer_id": walk_in.id,
                        "customer_code": walk_in.customer_code,
                        "note": "mapped-to-existing-walk-in",
                    }
                continue

            contact_type = rec.get("type") or "customer"
            want_customer = contact_type in {"customer", "both"}
            want_supplier = contact_type in {"supplier", "both"}
            customer_id = f"mhz-c-{source_id}"
            supplier_id = f"mhz-s-{source_id}"
            party_id = f"mhz-p-{source_id}"

            already_c = customer_id in existing_customers
            already_s = supplier_id in existing_suppliers
            if (want_customer and already_c) and (not want_supplier or already_s):
                stats["skipped_existing"] += 1
                continue
            if want_supplier and already_s and not want_customer:
                stats["skipped_existing"] += 1
                continue

            roles = tuple(
                role
                for role, flag in (("customer", want_customer), ("supplier", want_supplier))
                if flag
            )
            ensure_party(db, rec, party_id=party_id, roles=roles)
            entry: dict[str, str] = {"type": contact_type, "party_id": party_id}

            if want_customer and not already_c:
                customer = create_customer(db, rec, party_id)
                existing_customers.add(customer.id)
                stats["customers_created"] += 1
                entry["customer_id"] = customer.id
                entry["customer_code"] = customer.customer_code
            elif want_customer:
                entry["customer_id"] = customer_id
                entry["customer_code"] = f"MHZ-{source_id}"

            if want_supplier and not already_s:
                supplier = create_supplier(db, rec, party_id)
                existing_suppliers.add(supplier.id)
                stats["suppliers_created"] += 1
                entry["supplier_id"] = supplier.id
                entry["vendor_code"] = supplier.vendor_code
            elif want_supplier:
                entry["supplier_id"] = supplier_id
                entry["vendor_code"] = f"MHZ-V-{source_id}"

            if contact_type == "both":
                stats["both"] += 1
            mapping[source_id] = entry

            if index % 100 == 0:
                db.commit()
                print(f"… {index}/{len(rows)} contacts processed", flush=True)

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
    print(f"Importing MOHARAZ contacts from {dump_path}", flush=True)
    stats = import_contacts(dump_path)
    print(json.dumps(stats, indent=2))
    print(f"ID map written to {MAP_PATH}")


if __name__ == "__main__":
    main()
