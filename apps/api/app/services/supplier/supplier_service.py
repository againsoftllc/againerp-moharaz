"""Supplier (vendor) directory CRUD.

CommerceSupplier keeps several denormalised JSON columns (contacts, addresses,
contracts, bills, performance, timeline). The admin client reads them as parsed
arrays/objects, so every read goes through `to_read()`.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func, inspect
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinancePayable
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_receipt import PurchaseReceipt
from app.models.supplier_product import SupplierProduct
from app.schemas.supplier.supplier import SupplierCreate, SupplierRead, SupplierUpdate

OPEN_PO_STATUSES = ("draft", "confirmed", "partial_received")


def _load_json(raw: Optional[str], fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback


def list_suppliers(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> Sequence[CommerceSupplier]:
    query = db.query(CommerceSupplier).filter(CommerceSupplier.company_id == company_id)
    if status:
        query = query.filter(CommerceSupplier.status == status)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (CommerceSupplier.name.ilike(like))
            | (CommerceSupplier.vendor_code.ilike(like))
            | (CommerceSupplier.email.ilike(like))
            | (CommerceSupplier.phone.ilike(like))
        )
    return query.order_by(CommerceSupplier.name.asc()).all()


def get_supplier(
    db: Session, supplier_id: str, company_id: Optional[str] = None
) -> CommerceSupplier:
    row = db.get(CommerceSupplier, supplier_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
    return row


def ensure_party(db: Session, supplier: CommerceSupplier) -> str:
    """Every supplier needs a Party so the workspace tabs (contacts, addresses,
    documents, bank accounts) can use the shared party_workspace API."""
    if supplier.party_id:
        return supplier.party_id

    party = Party(
        company_id=supplier.company_id,
        type="organization",
        display_name=supplier.name,
        legal_name=supplier.name,
        status="active",
    )
    db.add(party)
    db.flush()
    db.add(PartyRole(party_id=party.id, role="supplier"))
    supplier.party_id = party.id
    db.commit()
    # Only refresh if `supplier` is already persistent — callers that run this
    # before the supplier row's own first insert (so party_id is set before
    # the NOT NULL column is ever written) pass a transient instance here.
    if inspect(supplier).persistent:
        db.refresh(supplier)
    return party.id


def _po_counts(db: Session, supplier_ids: list[str]) -> dict[str, dict[str, int]]:
    """total and still-open purchase order counts per supplier."""
    if not supplier_ids:
        return {}
    rows = (
        db.query(
            PurchaseOrder.supplier_id,
            PurchaseOrder.status,
            func.count(PurchaseOrder.id),
        )
        .filter(PurchaseOrder.supplier_id.in_(supplier_ids))
        .group_by(PurchaseOrder.supplier_id, PurchaseOrder.status)
        .all()
    )
    out: dict[str, dict[str, int]] = {}
    for supplier_id, status, count in rows:
        bucket = out.setdefault(supplier_id, {"total": 0, "open": 0})
        bucket["total"] += count
        if status in OPEN_PO_STATUSES:
            bucket["open"] += count
    return out


def _stock_feed_flags(db: Session, supplier_ids: list[str]) -> set[str]:
    """Suppliers that have at least one catalog product on file."""
    if not supplier_ids:
        return set()
    rows = (
        db.query(SupplierProduct.supplier_id)
        .filter(SupplierProduct.supplier_id.in_(supplier_ids))
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


def to_read_many(db: Session, rows: Sequence[CommerceSupplier]) -> list[SupplierRead]:
    ids = [r.id for r in rows]
    counts = _po_counts(db, ids)
    feeds = _stock_feed_flags(db, ids)
    from app.services.parties.party_commerce_links import load_links_map

    links_map = load_links_map(db, [r.party_id for r in rows if r.party_id])
    return [
        to_read(r, counts.get(r.id), r.id in feeds, links=links_map.get(r.party_id or ""))
        for r in rows
    ]


def to_read_one(db: Session, row: CommerceSupplier) -> SupplierRead:
    counts = _po_counts(db, [row.id])
    feeds = _stock_feed_flags(db, [row.id])
    from app.services.parties.party_commerce_links import links_for_party

    links = links_for_party(db, row.party_id) if row.party_id else None
    return to_read(row, counts.get(row.id), row.id in feeds, links=links)


def to_read(
    row: CommerceSupplier,
    po_counts: Optional[dict[str, int]] = None,
    has_stock_feed: bool = False,
    links=None,
) -> SupplierRead:
    counts = po_counts or {"total": 0, "open": 0}
    return SupplierRead(
        id=row.id,
        company_id=row.company_id,
        party_id=row.party_id,
        vendor_code=row.vendor_code,
        name=row.name,
        email=row.email,
        phone=row.phone,
        payment_terms=row.payment_terms,
        lead_time_days=row.lead_time_days,
        rating=row.rating,
        open_pos=counts["open"],
        spend_ytd=row.spend_ytd,
        status=row.status,
        country=row.country,
        tax_id=row.tax_id,
        website=row.website,
        currency=row.currency,
        opening_balance=getattr(row, "opening_balance", None) or Decimal("0"),
        credit_limit=getattr(row, "credit_limit", None) or Decimal("0"),
        payment_schedule=getattr(row, "payment_schedule", None),
        min_order_value=row.min_order_value,
        incoterms=row.incoterms,
        buyer_name=row.buyer_name,
        contacts=_load_json(row.contacts_json, []),
        addresses=_load_json(row.addresses_json, []),
        contracts=_load_json(row.contracts_json, []),
        bills=_load_json(row.bills_json, []),
        performance=_load_json(row.performance_json, {}),
        timeline=_load_json(row.timeline_json, []),
        rfq_count=row.rfq_count,
        receipt_count=row.receipt_count,
        has_stock_feed=has_stock_feed,
        total_pos=counts["total"],
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
        roles=list(links.roles) if links else (["supplier"] if row.party_id else []),
        linked_customer_id=links.customer.id if links and links.customer else None,
        linked_customer_name=links.customer.name if links and links.customer else None,
        linked_vendor_id=links.vendor.id if links and links.vendor else None,
        linked_vendor_name=links.vendor.name if links and links.vendor else None,
    )


def total_spend_ytd(rows: Sequence[CommerceSupplier]) -> Decimal:
    return sum((r.spend_ytd or Decimal("0") for r in rows), Decimal("0"))


def _next_vendor_code(db: Session, company_id: str) -> str:
    count = (
        db.query(func.count(CommerceSupplier.id))
        .filter(CommerceSupplier.company_id == company_id)
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 500):
        code = f"VND-{n:04d}"
        exists = (
            db.query(CommerceSupplier.id).filter(CommerceSupplier.vendor_code == code).first()
        )
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a vendor code")


def _contact_value(contact: Any, key: str, default: str = "") -> str:
    if isinstance(contact, dict):
        value = contact.get(key)
    else:
        value = getattr(contact, key, None)
    if value is None:
        return default
    return str(value).strip()


def _normalize_contacts(
    payload_contacts: Optional[list[Any]],
    fallback_name: Optional[str] = None,
    fallback_role: Optional[str] = None,
    fallback_email: str = "",
    fallback_phone: str = "",
) -> list[dict[str, Any]]:
    contacts: list[dict[str, Any]] = []
    if payload_contacts:
        for index, contact in enumerate(payload_contacts):
            name = _contact_value(contact, "name")
            if not name:
                continue
            contacts.append(
                {
                    "id": f"c{index + 1}",
                    "name": name,
                    "role": _contact_value(contact, "role") or "Contact",
                    "email": _contact_value(contact, "email"),
                    "phone": _contact_value(contact, "phone"),
                    "isPrimary": index == 0,
                }
            )
        return contacts
    if fallback_name:
        contacts.append(
            {
                "id": "c1",
                "name": fallback_name,
                "role": fallback_role or "Primary contact",
                "email": fallback_email or "",
                "phone": fallback_phone or "",
                "isPrimary": True,
            }
        )
    return contacts


def _address_records(line: Optional[str], country: str, existing: Optional[list[dict[str, Any]]] = None) -> list[dict[str, str]]:
    address_line = (line or "").strip()
    records = list(existing or [])
    if not address_line:
        return []
    if records:
        records[0] = {
            **records[0],
            "line1": address_line,
            "city": "",
            "country": records[0].get("country") or country,
        }
        return records
    return [
        {
            "id": "a1",
            "label": "Head office",
            "type": "billing",
            "line1": address_line,
            "city": "",
            "country": country,
        }
    ]


def create_supplier(db: Session, payload: SupplierCreate, company_id: str) -> CommerceSupplier:
    name = payload.name.strip()
    code = (payload.vendor_code or "").strip() or _next_vendor_code(db, company_id)

    dup = (
        db.query(CommerceSupplier)
        .filter(CommerceSupplier.vendor_code == code, CommerceSupplier.company_id == company_id)
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Vendor code already exists")

    contacts = _normalize_contacts(
        payload.contacts,
        fallback_name=payload.contact_name,
        fallback_role=payload.contact_role,
        fallback_email=payload.email or "",
        fallback_phone=payload.phone or "",
    )
    addresses = _address_records(payload.address, payload.country)

    row = CommerceSupplier(
        company_id=company_id,
        vendor_code=code,
        name=name,
        email=payload.email or "",
        phone=payload.phone or "",
        payment_terms=payload.payment_terms,
        lead_time_days=payload.lead_time_days,
        status=payload.status,
        country=payload.country,
        tax_id=payload.tax_id,
        website=payload.website,
        currency=payload.currency,
        opening_balance=payload.opening_balance if payload.opening_balance is not None else Decimal("0"),
        credit_limit=payload.credit_limit if payload.credit_limit is not None else Decimal("0"),
        payment_schedule=payload.payment_schedule,
        min_order_value=payload.min_order_value,
        incoterms=payload.incoterms,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        contacts_json=json.dumps(contacts),
        addresses_json=json.dumps(addresses),
    )
    # Party must exist (and party_id be set) BEFORE the first insert — party_id
    # is NOT NULL, so this runs before db.add(row) instead of after.
    ensure_party(db, row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_supplier(
    db: Session, supplier_id: str, payload: SupplierUpdate, *, company_id: str
) -> CommerceSupplier:
    row = get_supplier(db, supplier_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    address = data.pop("address", None)
    contacts = data.pop("contacts", None)

    if data.get("vendor_code"):
        code = data["vendor_code"].strip()
        dup = (
            db.query(CommerceSupplier)
            .filter(
                CommerceSupplier.vendor_code == code,
                CommerceSupplier.id != supplier_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Vendor code already exists")
        data["vendor_code"] = code
    if data.get("name"):
        data["name"] = data["name"].strip()

    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)

    if address is not None:
        existing = _load_json(row.addresses_json, [])
        if not isinstance(existing, list):
            existing = []
        country = data.get("country") or row.country
        row.addresses_json = json.dumps(_address_records(address, country, existing))

    if contacts is not None:
        row.contacts_json = json.dumps(_normalize_contacts(contacts))

    db.commit()
    db.refresh(row)
    return row


def supplier_has_blocking_records(db: Session, supplier_id: str) -> bool:
    if db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == supplier_id).first() is not None:
        return True
    if (
        db.query(PurchaseReceipt.id).filter(PurchaseReceipt.supplier_id == supplier_id).first()
        is not None
    ):
        return True
    if db.query(FinancePayable.id).filter(FinancePayable.supplier_id == supplier_id).first() is not None:
        return True
    return False


def delete_supplier(db: Session, supplier_id: str, *, company_id: str) -> None:
    row = get_supplier(db, supplier_id, company_id=company_id)
    if supplier_has_blocking_records(db, row.id):
        raise HTTPException(
            status_code=409,
            detail="Supplier has related purchase orders or payables and cannot be deleted",
        )
    db.delete(row)
    db.commit()


def bulk_delete_suppliers(
    db: Session, ids: Sequence[str], *, company_id: str
) -> tuple[int, list[str]]:
    deleted = 0
    skipped: list[str] = []
    for supplier_id in ids:
        row = db.get(CommerceSupplier, supplier_id)
        if not row or row.company_id != company_id:
            skipped.append(supplier_id)
            continue
        if supplier_has_blocking_records(db, row.id):
            skipped.append(supplier_id)
            continue
        db.delete(row)
        deleted += 1
    db.commit()
    return deleted, skipped
