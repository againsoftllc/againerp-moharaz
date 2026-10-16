"""Customers and their order history from the previous Moharaz shop (docs/DATA_MIGRATION.md, decision D9).

Writes, for the record only (no stock, reservation, receivable, payment, journal or sales-order rows):
- commerce_customers (+ their party, role "customer") for every OpenCart account (oc-cust-{customer_id}),
  with the account's address book in addresses_json
- one customer per guest buyer (oc-guest-{hash}): a guest order joins the account with the same email,
  else the same phone, else the guest customer already made for that email/phone, else a new one
- storefront_customer_identities (email and BD phone) so the customer signs in by OTP and sees the history;
  OpenCart passwords cannot be carried over (the shop signs in by OTP / PIN)
- commerce_orders (oc-order-{order_id}, order number = the OpenCart order id) with lines, billing/shipping
  address snapshots and the status history as commerce_order_events; never-confirmed checkouts
  (order_status_id 0) are not in the input
- customer stats (orders, spend, last order) recomputed from the imported orders
- a sales_orders mirror per order, as a storefront checkout makes one (SalesService.sync_from_storefront_order):
  the admin's order screens (Sales, Website → Orders) list sales orders, not commerce orders. Lines whose
  product was not imported are left out of the mirror (its totals stay the order's); orders with no customer
  or no imported product get none. Status, delivery status and dates follow the OpenCart order. Writes no
  stock, serial, receivable or journal rows.

Ids are deterministic, so re-runs update customers and rewrite the imported orders.

Input: ac_customer / ac_order as JSON lines (DATA_MIGRATION.md step 12).
Usage (api container):
    python -m scripts.import_opencart_customers_orders /tmp/oc_customers.jsonl /tmp/oc_orders.jsonl
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_address import CommerceOrderAddress
from app.models.commerce_order_event import CommerceOrderEvent
from app.models.commerce_order_item import CommerceOrderItem
from app.models.sales import SalesOrderStatusHistory
from app.services.sales.sales_service import SalesService
from app.models.storefront_customer_auth import StorefrontCustomerIdentity
from app.services.ecommerce.storefront_customer_auth_service import CustomerAuthError, normalize_identifier
from app.services.parties.commerce_party_bridge import ensure_party_for_customer
from scripts.opencart_common import COMPANY_ID, clean_text

ACTOR = "OpenCart import"
BATCH = 500
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# OpenCart order_status_id → (status, shipment_status); payment status is worked out per order
STATUS = {
    1: ("pending", "unfulfilled"),       # Pending
    2: ("confirmed", "unfulfilled"),     # Processing
    3: ("shipped", "shipped"),           # Shipped
    5: ("completed", "delivered"),       # Complete
    7: ("cancelled", "unfulfilled"),     # Canceled
    8: ("cancelled", "unfulfilled"),     # Denied
    9: ("confirmed", "unfulfilled"),     # Canceled Reversal
    10: ("cancelled", "unfulfilled"),    # Failed
    11: ("refunded", "unfulfilled"),     # Refunded
    12: ("refunded", "unfulfilled"),     # Reversed
    13: ("refunded", "unfulfilled"),     # Chargeback
    14: ("cancelled", "unfulfilled"),    # Expired
    15: ("confirmed", "unfulfilled"),    # Processed
    16: ("cancelled", "unfulfilled"),    # Voided
}
STATUS_NAME = {1: "Pending", 2: "Processing", 3: "Shipped", 5: "Complete", 7: "Canceled", 8: "Denied",
               9: "Canceled Reversal", 10: "Failed", 11: "Refunded", 12: "Reversed", 13: "Chargeback",
               14: "Expired", 15: "Processed", 16: "Voided"}
# statuses an online payment only reaches once paid
PAID_ONLINE = {2, 3, 5, 9, 15}
PAYMENT_METHOD = {"cod": "COD", "sslcommerce": "SSLCommerz", "free_checkout": "Free checkout"}


def parse_dt(value: str | None) -> datetime | None:
    if not value or value.startswith("0000"):
        return None
    return datetime.fromisoformat(str(value).replace("T", " ")[:19])


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def email_of(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    return value if EMAIL_RE.match(value) else ""


def phone_of(raw: str | None) -> str:
    """BD mobile as 01XXXXXXXXX (the storefront login form), or "" when it is not one."""
    try:
        n = normalize_identifier(raw or "")
    except CustomerAuthError:
        return ""
    return n.identifier if n.identifier_type == "phone" else ""


def joined(*parts: str | None) -> str:
    return ", ".join(p for p in (clean_text(x) for x in parts) if p)


def full_name(first: str | None, last: str | None) -> str:
    return " ".join(p for p in (clean_text(first), clean_text(last)) if p)


def guest_id(key: str) -> str:
    return "oc-guest-" + hashlib.sha1(key.encode()).hexdigest()[:16]


def load_jsonl(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


# ---------- customers ----------

def account_addresses(c: dict) -> list[dict]:
    out = []
    for a in c.get("addresses") or []:
        line1 = joined(a.get("address_1"))
        out.append({
            "id": f"oc-addr-{a['address_id']}",
            "label": clean_text(a.get("company")) or "Address",
            "name": full_name(a.get("firstname"), a.get("lastname")),
            "line1": line1,
            "line2": clean_text(a.get("address_2")),
            "address": joined(a.get("address_1"), a.get("address_2")),
            "city": clean_text(a.get("city")),
            "region": clean_text(a.get("zone")),
            "postal_code": clean_text(a.get("postcode")),
            "country": clean_text(a.get("country")) or "Bangladesh",
            "is_default": a["address_id"] == c.get("address_id"),
        })
    if out and not any(a["is_default"] for a in out):
        out[0]["is_default"] = True
    return out


def order_address(o: dict) -> dict:
    """the order's shipping address (billing when there is none) as an address-book entry"""
    p = "shipping_" if clean_text(o.get("shipping_address_1")) else "payment_"
    return {
        "id": f"oc-order-addr-{o['order_id']}",
        "label": "Address",
        "name": full_name(o.get(p + "firstname"), o.get(p + "lastname")),
        "line1": clean_text(o.get(p + "address_1")),
        "line2": clean_text(o.get(p + "address_2")),
        "address": joined(o.get(p + "address_1"), o.get(p + "address_2")),
        "city": clean_text(o.get(p + "city")),
        "region": clean_text(o.get(p + "zone")),
        "postal_code": clean_text(o.get(p + "postcode")),
        "country": clean_text(o.get(p + "country")) or "Bangladesh",
        "is_default": True,
    }


def upsert_customer(db, existing: dict[str, CommerceCustomer], *, cid: str, code: str, name: str, email: str,
                    phone: str, since: date, addresses: list[dict], tags: list[str], created: datetime | None,
                    stats: Counter) -> None:
    default = next((a for a in addresses if a.get("is_default")), {})
    row = existing.get(cid)
    if row is None:
        row = CommerceCustomer(id=cid, company_id=COMPANY_ID, customer_code=code, name=name, customer_since=since)
        row.timeline_json = json.dumps([{"at": (created or datetime.now()).isoformat(), "type": "imported",
                                         "message": "Imported from the previous Moharaz shop (OpenCart)"}])
        if created:
            row.created_at = created
        stats["customers created"] += 1
    else:
        stats["customers updated"] += 1
    row.name = name[:255]
    row.email = email
    row.phone = phone
    row.customer_since = since
    row.status = "active"
    row.city = (default.get("city") or "")[:100]
    row.region = (default.get("region") or "")[:100]
    row.country = (default.get("country") or "Bangladesh")[:100]
    row.addresses_json = json.dumps(addresses, ensure_ascii=False)
    row.tags_json = json.dumps(tags)
    if cid not in existing:
        ensure_party_for_customer(db, row)  # sets party_id; must precede the insert (party_id NOT NULL)
        db.add(row)
        existing[cid] = row


def add_identities(db, used: set[str], cid: str, email: str, phone: str, stats: Counter) -> None:
    for ident, kind in ((email, "email"), (phone, "phone")):
        if not ident:
            continue
        if ident in used:
            stats[f"{kind} login skipped (already used by another customer)"] += 1
            continue
        used.add(ident)
        db.add(StorefrontCustomerIdentity(customer_id=cid, identifier=ident, identifier_type=kind,
                                          display_identifier=ident, is_active=True))
        stats[f"{kind} logins"] += 1


# ---------- orders ----------

def payment_status(o: dict, status: str) -> str:
    sid = o["order_status_id"]
    if status == "refunded":
        return "refunded"
    if sid == 5:
        return "paid"
    code = (o.get("payment_code") or "").lower()
    if code not in ("cod", "") and sid in PAID_ONLINE:
        return "paid"
    return "unpaid"


def build_order(o: dict, customer_id: str | None, products: dict[str, dict]) -> tuple[CommerceOrder, list]:
    oid = f"oc-order-{o['order_id']}"
    sid = o["order_status_id"]
    status, shipment = STATUS.get(sid, ("pending", "unfulfilled"))
    pay = payment_status(o, status)
    totals = {t["code"]: money(t["value"]) for t in o.get("totals") or []}
    subtotal = totals.get("sub_total", money(sum(Decimal(str(p["total"])) for p in o.get("products") or [])))
    shipping = totals.get("shipping", Decimal("0.00"))
    grand = totals.get("total", money(o.get("total")))
    discount = max(Decimal("0.00"), subtotal + shipping - grand)
    placed = parse_dt(o["date_added"]) or datetime.now()
    history = sorted(o.get("history") or [], key=lambda h: h["date_added"] or "")
    first_at = lambda ids: next((parse_dt(h["date_added"]) for h in history if h["order_status_id"] in ids), None)  # noqa: E731
    shipped_at = first_at({3, 5}) if status in ("shipped", "completed") else None
    delivered_at = first_at({5}) if status == "completed" else None

    code = (o.get("payment_code") or "").strip()
    method = PAYMENT_METHOD.get(code.lower()) or clean_text(o.get("payment_method")) or code or "COD"
    notes = [f"Shipping: {clean_text(o['shipping_method'])}"] if clean_text(o.get("shipping_method")) else []
    if clean_text(o.get("comment")):
        notes.append(clean_text(o["comment"]))
    notes.append(f"OpenCart order #{o['order_id']} · status {STATUS_NAME.get(sid, sid)}")

    bill = (full_name(o.get("payment_firstname"), o.get("payment_lastname")), joined(o.get("payment_address_1"), o.get("payment_address_2")))
    ship = (full_name(o.get("shipping_firstname"), o.get("shipping_lastname")), joined(o.get("shipping_address_1"), o.get("shipping_address_2")))
    order = CommerceOrder(
        id=oid, company_id=COMPANY_ID, order_number=str(o["order_id"]), order_date=placed,
        status=status, payment_status=pay, shipment_status=shipment, source="Web Store (OpenCart)",
        tags_json=json.dumps(["opencart"]), customer_id=customer_id,
        customer_name=(full_name(o.get("firstname"), o.get("lastname")) or bill[0] or ship[0] or "Guest")[:255],
        customer_phone=(phone_of(o.get("telephone")) or clean_text(o.get("telephone")))[:50],
        customer_email=(clean_text(o.get("email")) or "")[:255],
        billing_address=bill[1][:500] or None, billing_city=clean_text(o.get("payment_city"))[:100] or None,
        billing_region=clean_text(o.get("payment_zone"))[:100] or None, billing_country=clean_text(o.get("payment_country"))[:100] or None,
        shipping_address=(ship[1] or bill[1])[:500] or None,
        shipping_city=(clean_text(o.get("shipping_city")) or clean_text(o.get("payment_city")))[:100] or None,
        shipping_region=(clean_text(o.get("shipping_zone")) or clean_text(o.get("payment_zone")))[:100] or None,
        shipping_country=(clean_text(o.get("shipping_country")) or clean_text(o.get("payment_country")))[:100] or None,
        payment_method=method[:50],
        paid_amount=grand if pay == "paid" else Decimal("0.00"),
        refund_amount=grand if pay == "refunded" else Decimal("0.00"),
        due_amount=grand if pay == "unpaid" and status not in ("cancelled", "refunded") else Decimal("0.00"),
        shipping_cost=shipping, shipping_amount=shipping, subtotal=subtotal, discount_amount=discount,
        grand_total=grand, shipped_at=shipped_at, delivered_at=delivered_at, notes="\n".join(notes),
        created_at=placed, updated_at=parse_dt(o.get("date_modified")) or placed,
    )

    children: list = []
    for i, p in enumerate(o.get("products") or []):
        pid = f"oc-prod-{p['product_id']}"
        known = products.get(pid)
        options = ", ".join(f"{clean_text(x['name'])}: {clean_text(x['value'])}" for x in p.get("options") or [])
        qty = int(p["quantity"] or 0)
        children.append(CommerceOrderItem(
            id=f"oc-oline-{p['order_product_id']}", order_id=oid, product_id=pid,
            item_id=pid if known else None,
            sku=((known or {}).get("sku") or clean_text(p.get("model")) or f"OC-{p['product_id']}")[:100],
            name=(clean_text(p["name"]) or "Product")[:255], image_url=(known or {}).get("image"),
            variant_label=options[:255] or None, quantity=qty,
            quantity_shipped=qty if shipment in ("shipped", "delivered") else 0,
            unit_price=money(p["price"]), tax_amount=money(Decimal(str(p["tax"] or 0)) * qty),
            line_total=money(p["total"]), sort_order=i, created_at=placed,
        ))
    for kind, pre in (("billing", "payment_"), ("shipping", "shipping_")):
        line1 = joined(o.get(pre + "address_1"), o.get(pre + "address_2"))
        if not line1 and kind == "shipping":
            continue
        children.append(CommerceOrderAddress(
            id=f"oc-oaddr-{kind[0]}-{o['order_id']}", order_id=oid, address_type=kind,
            first_name=clean_text(o.get(pre + "firstname"))[:100], last_name=clean_text(o.get(pre + "lastname"))[:100],
            email=order.customer_email, phone=order.customer_phone, line1=line1[:500],
            city=clean_text(o.get(pre + "city"))[:100], region=clean_text(o.get(pre + "zone"))[:100],
            postal_code=clean_text(o.get(pre + "postcode"))[:20],
            country=(clean_text(o.get(pre + "country")) or "Bangladesh")[:100], created_at=placed,
        ))
    children.append(CommerceOrderEvent(
        id=f"oc-oevt-{o['order_id']}-0", order_id=oid, event_type="order_created", to_status="pending",
        to_payment_status="unpaid", to_shipment_status="unfulfilled", actor=ACTOR,
        message="Order placed on the previous shop", payload_json="{}", created_at=placed,
    ))
    prev = "pending"
    for n, h in enumerate(history, start=1):
        to, to_ship = STATUS.get(h["order_status_id"], (prev, None))
        children.append(CommerceOrderEvent(
            id=f"oc-oevt-{o['order_id']}-{n}", order_id=oid, event_type="status_transition",
            from_status=prev, to_status=to, to_shipment_status=to_ship, actor=ACTOR,
            message=clean_text(h.get("comment")) or f"Status: {STATUS_NAME.get(h['order_status_id'], h['order_status_id'])}",
            payload_json=json.dumps({"opencart_status_id": h["order_status_id"], "notify": bool(h.get("notify"))}),
            created_at=parse_dt(h["date_added"]) or placed,
        ))
        prev = to
    return order, children


# commerce order status → (sales order status, delivery status). OpenCart "Pending" was never confirmed by
# the shop, so it stays a draft; Shipped is still in progress until Complete.
SALES_STATUS = {
    "pending": ("draft", "pending"),
    "confirmed": ("processing", "pending"),
    "shipped": ("processing", "partial"),
    "completed": ("completed", "delivered"),
    "cancelled": ("cancelled", "pending"),
    "refunded": ("cancelled", "pending"),
}


def mirror_sales_orders(db, stats: Counter) -> None:
    """One sales order per imported commerce order (re-runs find the existing one by its marker)."""
    warehouse = db.execute(text(
        "SELECT id FROM inventory_warehouses ORDER BY is_default DESC, id LIMIT 1")).scalar()
    svc = SalesService(db, COMPANY_ID)
    orders = (db.query(CommerceOrder).filter(CommerceOrder.id.like("oc-order-%"))
              .order_by(CommerceOrder.order_date).all())
    lines: dict[str, list] = {}
    for row in db.query(CommerceOrderItem).filter(CommerceOrderItem.order_id.like("oc-order-%")):
        lines.setdefault(row.order_id, []).append(row)
    for i, order in enumerate(orders, start=1):
        so = svc.sync_from_storefront_order(order, lines.get(order.id, []), warehouse_id=warehouse)
        if so is None:
            stats["sales orders skipped (no customer or no imported product)"] += 1
            continue
        status, delivery = SALES_STATUS.get(order.status, ("confirmed", "pending"))
        placed = order.order_date
        so.status, so.delivery_status = status, delivery
        # the order's own totals (the sync treats a free order's 0 as missing and re-adds the lines)
        so.subtotal, so.discount_total = order.subtotal, order.discount_amount
        so.tax_total, so.total = order.tax_amount, order.grand_total
        so.created_at = placed
        so.confirmed_at = placed if status != "draft" else None
        so.completed_at = (order.delivered_at or order.updated_at) if status == "completed" else None
        so.cancelled_at = order.updated_at if status == "cancelled" else None
        if order.status == "refunded" and "Refunded on the previous shop" not in (so.notes or ""):
            so.notes = (so.notes or "") + "\nRefunded on the previous shop"
        # the sync wrote "confirmed, now"; the history is the OpenCart order's
        db.query(SalesOrderStatusHistory).filter(SalesOrderStatusHistory.sales_order_id == so.id).delete(
            synchronize_session=False)
        db.add(SalesOrderStatusHistory(sales_order_id=so.id, from_status=None, to_status=status, created_at=placed,
                                       notes=f"Imported from the previous shop (OpenCart order #{order.order_number})"))
        stats["sales orders"] += 1
        stats[f"sales orders {status}"] += 1
        if i % BATCH == 0:
            db.commit()
            print(f"sales orders {i}/{len(orders)}", flush=True)
    db.commit()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("customers")
    ap.add_argument("orders")
    args = ap.parse_args()
    accounts = load_jsonl(args.customers)
    orders = sorted(load_jsonl(args.orders), key=lambda o: o["order_id"])
    stats: Counter = Counter()

    db = SessionLocal()
    try:
        existing = {c.id: c for c in db.query(CommerceCustomer).filter(CommerceCustomer.id.like("oc-%"))}
        db.execute(text("DELETE FROM storefront_customer_identities WHERE customer_id LIKE 'oc-%'"))
        used = {r[0] for r in db.execute(text("SELECT identifier FROM storefront_customer_identities"))}
        products = {r[0]: {"sku": r[1], "image": r[2]} for r in db.execute(text(
            "SELECT id, sku, thumbnail FROM catalog_products WHERE id LIKE 'oc-prod-%'"))}

        # accounts; the first account (lowest id) owns an email / phone that several share
        by_email: dict[str, str] = {}
        by_phone: dict[str, str] = {}
        logins: dict[str, tuple[str, str]] = {}
        for i, c in enumerate(accounts, start=1):
            cid = f"oc-cust-{c['customer_id']}"
            email, phone = email_of(c.get("email")), phone_of(c.get("telephone"))
            created = parse_dt(c.get("date_added"))
            upsert_customer(
                db, existing, cid=cid, code=f"OC-{c['customer_id']}",
                name=full_name(c.get("firstname"), c.get("lastname")) or email or phone or "Customer",
                email=email or clean_text(c.get("email")), phone=phone or clean_text(c.get("telephone")),
                since=(created or datetime.now()).date(), addresses=account_addresses(c),
                tags=["opencart"] + (["newsletter"] if c.get("newsletter") else []), created=created, stats=stats,
            )
            by_email.setdefault(email, cid) if email else None
            by_phone.setdefault(phone, cid) if phone else None
            logins[cid] = (email, phone)
            if i % BATCH == 0:
                db.flush()

        # guests: join an account, else one guest customer per email / phone
        owner: dict[int, str | None] = {}
        guests: dict[str, dict] = {}
        guest_by: dict[str, str] = {}
        for o in orders:
            if o["customer_id"]:
                owner[o["order_id"]] = f"oc-cust-{o['customer_id']}"
                continue
            email, phone = email_of(o.get("email")), phone_of(o.get("telephone"))
            cid = (by_email.get(email) if email else None) or (by_phone.get(phone) if phone else None)
            if cid:
                stats["guest orders joined to an account"] += 1
            else:
                cid = (guest_by.get(email) if email else None) or (guest_by.get(phone) if phone else None)
                if not cid and (email or phone):
                    cid = guest_id(email or phone)
                    guests[cid] = {"first": o, "email": email, "phone": phone}
                if cid:
                    g = guests[cid]
                    g["last"] = o
                    g["email"] = g["email"] or email
                    g["phone"] = g["phone"] or phone
                    for k in (email, phone):
                        if k:
                            guest_by.setdefault(k, cid)
                    stats["guest orders on a guest customer"] += 1
                else:
                    stats["guest orders without email or phone"] += 1
            owner[o["order_id"]] = cid

        for n, (cid, g) in enumerate(guests.items(), start=1):
            first, last = g["first"], g.get("last", g["first"])
            placed = parse_dt(first["date_added"])
            upsert_customer(
                db, existing, cid=cid, code="OCG-" + cid.removeprefix("oc-guest-")[:12],
                name=full_name(last.get("firstname"), last.get("lastname")) or g["email"] or g["phone"],
                email=g["email"], phone=g["phone"], since=(placed or datetime.now()).date(),
                addresses=[order_address(last)], tags=["opencart", "guest"], created=placed, stats=stats,
            )
            logins[cid] = (g["email"], g["phone"])
            if n % BATCH == 0:
                db.flush()
        db.flush()
        for cid, (email, phone) in logins.items():
            add_identities(db, used, cid, email, phone, stats)
        db.commit()
        print("customers done", json.dumps(stats), flush=True)

        # orders: rewrite the imported ones (children cascade)
        db.execute(text("DELETE FROM commerce_orders WHERE id LIKE 'oc-order-%'"))
        db.commit()
        for i, o in enumerate(orders, start=1):
            order, children = build_order(o, owner.get(o["order_id"]), products)
            db.add(order)
            db.add_all(children)
            stats["orders"] += 1
            stats[f"orders {order.status}"] += 1
            stats["order lines"] += sum(isinstance(c, CommerceOrderItem) for c in children)
            stats["order lines without a product"] += sum(isinstance(c, CommerceOrderItem) and c.item_id is None for c in children)
            if i % BATCH == 0:
                db.commit()
        db.commit()

        # stats from the imported orders (cancelled / refunded do not count as spend)
        db.execute(text("""
            UPDATE commerce_customers AS c SET
              total_orders = COALESCE(s.cnt, 0), total_spend = COALESCE(s.spend, 0),
              avg_order_value = CASE WHEN COALESCE(s.cnt, 0) > 0 THEN ROUND(s.spend / s.cnt, 2) ELSE 0 END,
              last_order_date = s.last_dt
            FROM (SELECT customer_id, COUNT(*) cnt, SUM(grand_total) spend, MAX(order_date)::date last_dt
                  FROM commerce_orders
                  WHERE id LIKE 'oc-order-%' AND status NOT IN ('cancelled', 'refunded')
                  GROUP BY customer_id) s
            WHERE c.id = s.customer_id
        """))
        db.commit()
        mirror_sales_orders(db, stats)
    finally:
        db.close()
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
