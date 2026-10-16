"""Connect customer, supplier, and vendor records to one Universal Party."""

from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.vendor.vendor import Vendor
from app.schemas.party import PartyCommerceLinkRef, PartyCommerceLinksRead
from app.services.parties.commerce_party_bridge import (
    ensure_party_for_customer,
    ensure_party_for_supplier,
    ensure_party_for_vendor,
)
from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository

COMMERCE_ROLES = frozenset({"customer", "supplier", "vendor"})


def _digits(value: Optional[str]) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def _email_key(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def empty_links(party_id: str) -> PartyCommerceLinksRead:
    return PartyCommerceLinksRead(party_id=party_id, roles=[])


def links_for_party(db: Session, party_id: str) -> PartyCommerceLinksRead:
    return load_links_map(db, [party_id]).get(party_id, empty_links(party_id))


def load_links_map(db: Session, party_ids: Iterable[str]) -> dict[str, PartyCommerceLinksRead]:
    ids = [pid for pid in dict.fromkeys(party_ids) if pid]
    if not ids:
        return {}

    roles_by_party: dict[str, list[str]] = {pid: [] for pid in ids}
    for party_id, role in (
        db.query(PartyRole.party_id, PartyRole.role)
        .filter(PartyRole.party_id.in_(ids), PartyRole.role.in_(COMMERCE_ROLES))
        .all()
    ):
        roles_by_party.setdefault(party_id, []).append(role)

    customers = {
        row.party_id: row
        for row in db.query(CommerceCustomer).filter(CommerceCustomer.party_id.in_(ids)).all()
        if row.party_id
    }
    suppliers = {
        row.party_id: row
        for row in db.query(CommerceSupplier).filter(CommerceSupplier.party_id.in_(ids)).all()
        if row.party_id
    }
    vendors = {
        row.party_id: row
        for row in db.query(Vendor).filter(Vendor.party_id.in_(ids)).all()
        if row.party_id
    }

    out: dict[str, PartyCommerceLinksRead] = {}
    for party_id in ids:
        customer = customers.get(party_id)
        supplier = suppliers.get(party_id)
        vendor = vendors.get(party_id)
        roles = sorted(set(roles_by_party.get(party_id, [])))
        if customer and "customer" not in roles:
            roles.append("customer")
        if supplier and "supplier" not in roles:
            roles.append("supplier")
        if vendor and "vendor" not in roles:
            roles.append("vendor")
        out[party_id] = PartyCommerceLinksRead(
            party_id=party_id,
            roles=sorted(set(roles)),
            customer=PartyCommerceLinkRef(id=customer.id, name=customer.name, code=customer.customer_code)
            if customer
            else None,
            supplier=PartyCommerceLinkRef(id=supplier.id, name=supplier.name, code=supplier.vendor_code)
            if supplier
            else None,
            vendor=PartyCommerceLinkRef(
                id=vendor.id,
                name=vendor.display_name or vendor.company_name,
                code=vendor.vendor_code,
            )
            if vendor
            else None,
        )
    return out


def enable_commerce_role(
    db: Session,
    party_id: str,
    role: str,
    *,
    company_id: str,
    existing_id: Optional[str] = None,
) -> PartyCommerceLinksRead:
    if role not in COMMERCE_ROLES:
        raise HTTPException(status_code=400, detail="Role must be customer, supplier, or vendor")
    party = db.get(Party, party_id)
    if not party or party.company_id != company_id:
        raise HTTPException(status_code=404, detail="Party not found")

    links = links_for_party(db, party_id)
    current = getattr(links, role)
    if current and not existing_id:
        return links
    if current and existing_id and current.id == existing_id:
        return links

    if role == "customer":
        _enable_customer(db, party, existing_id=existing_id)
    elif role == "supplier":
        _enable_supplier(db, party, existing_id=existing_id)
    else:
        _enable_vendor(db, party, existing_id=existing_id)

    SqlAlchemyPartyRoleRepository(db).add_role(party.id, role)
    db.flush()
    return links_for_party(db, party_id)


def _identity(db: Session, party: Party) -> dict[str, str]:
    supplier = db.query(CommerceSupplier).filter(CommerceSupplier.party_id == party.id).first()
    customer = db.query(CommerceCustomer).filter(CommerceCustomer.party_id == party.id).first()
    vendor = db.query(Vendor).filter(Vendor.party_id == party.id).first()
    name = (
        (supplier.name if supplier else None)
        or (customer.name if customer else None)
        or (vendor.company_name if vendor else None)
        or party.display_name
        or "Partner"
    )
    return {
        "name": name,
        "email": (supplier.email if supplier else "")
        or (customer.email if customer else "")
        or (vendor.email if vendor else "")
        or "",
        "phone": (supplier.phone if supplier else "")
        or (customer.phone if customer else "")
        or (vendor.phone if vendor else "")
        or "",
        "country": (supplier.country if supplier else "")
        or (customer.country if customer else "")
        or (vendor.country if vendor else "")
        or "Bangladesh",
        "website": (supplier.website if supplier else "")
        or (vendor.website if vendor else "")
        or "",
        "notes": (supplier.notes if supplier else None)
        or (customer.notes if customer else None)
        or (vendor.notes if vendor else None)
        or "",
    }


def _retarget(db: Session, row, party: Party, role: str) -> None:
    old_party_id = row.party_id
    row.party_id = party.id
    if old_party_id and old_party_id != party.id:
        still_used = False
        if role == "customer":
            still_used = (
                db.query(CommerceCustomer.id).filter(CommerceCustomer.party_id == old_party_id).first()
                is not None
            )
        elif role == "supplier":
            still_used = (
                db.query(CommerceSupplier.id).filter(CommerceSupplier.party_id == old_party_id).first()
                is not None
            )
        else:
            still_used = db.query(Vendor.id).filter(Vendor.party_id == old_party_id).first() is not None
        if not still_used:
            SqlAlchemyPartyRoleRepository(db).remove_role(old_party_id, role)


def _enable_customer(db: Session, party: Party, *, existing_id: Optional[str]) -> CommerceCustomer:
    if existing_id:
        row = db.get(CommerceCustomer, existing_id)
        if not row or row.company_id != party.company_id:
            raise HTTPException(status_code=404, detail="Customer not found")
        _retarget(db, row, party, "customer")
        return row

    existing = db.query(CommerceCustomer).filter(CommerceCustomer.party_id == party.id).first()
    if existing:
        return existing

    ident = _identity(db, party)
    match = _match_customer(db, party.company_id, ident["phone"], ident["email"])
    if match:
        _retarget(db, match, party, "customer")
        return match

    row = CommerceCustomer(
        company_id=party.company_id,
        party_id=party.id,
        customer_code=_next_customer_code(db),
        name=ident["name"],
        phone=ident["phone"],
        email=ident["email"],
        country=ident["country"] or "Bangladesh",
        customer_since=date.today(),
        notes=ident["notes"] or None,
        group="wholesale" if ident["name"] else "retail",
    )
    db.add(row)
    db.flush()
    ensure_party_for_customer(db, row)
    row.party_id = party.id
    return row


def _enable_supplier(db: Session, party: Party, *, existing_id: Optional[str]) -> CommerceSupplier:
    if existing_id:
        row = db.get(CommerceSupplier, existing_id)
        if not row or row.company_id != party.company_id:
            raise HTTPException(status_code=404, detail="Supplier not found")
        _retarget(db, row, party, "supplier")
        return row

    existing = db.query(CommerceSupplier).filter(CommerceSupplier.party_id == party.id).first()
    if existing:
        return existing

    ident = _identity(db, party)
    match = _match_supplier(db, party.company_id, ident["phone"], ident["email"], ident["name"])
    if match:
        _retarget(db, match, party, "supplier")
        return match

    row = CommerceSupplier(
        company_id=party.company_id,
        party_id=party.id,
        vendor_code=_next_supplier_code(db, party.company_id),
        name=ident["name"],
        email=ident["email"],
        phone=ident["phone"],
        country=ident["country"] or "Bangladesh",
        website=ident["website"] or None,
        notes=ident["notes"] or None,
        status="active",
    )
    db.add(row)
    db.flush()
    ensure_party_for_supplier(db, row)
    row.party_id = party.id
    return row


def _enable_vendor(db: Session, party: Party, *, existing_id: Optional[str]) -> Vendor:
    if existing_id:
        row = db.get(Vendor, existing_id)
        if not row or row.company_id != party.company_id:
            raise HTTPException(status_code=404, detail="Vendor not found")
        _retarget(db, row, party, "vendor")
        return row

    existing = db.query(Vendor).filter(Vendor.party_id == party.id).first()
    if existing:
        return existing

    ident = _identity(db, party)
    match = _match_vendor(db, party.company_id, ident["phone"], ident["email"])
    if match:
        _retarget(db, match, party, "vendor")
        return match

    row = Vendor(
        company_id=party.company_id,
        party_id=party.id,
        vendor_code=_next_b2b_vendor_code(db),
        company_name=ident["name"],
        legal_name=ident["name"],
        display_name=ident["name"],
        phone=ident["phone"],
        email=ident["email"],
        website=ident["website"] or "",
        country=ident["country"] or "Bangladesh",
        status="active",
        notes=ident["notes"] or None,
    )
    db.add(row)
    db.flush()
    ensure_party_for_vendor(db, row)
    row.party_id = party.id
    return row


def _match_customer(db: Session, company_id: str, phone: str, email: str) -> Optional[CommerceCustomer]:
    digits = _digits(phone)
    email_key = _email_key(email)
    if not digits and not email_key:
        return None
    rows = db.query(CommerceCustomer).filter(CommerceCustomer.company_id == company_id).all()
    for row in rows:
        if digits and _digits(row.phone) == digits:
            return row
        if email_key and _email_key(row.email) == email_key:
            return row
    return None


def _match_supplier(
    db: Session, company_id: str, phone: str, email: str, name: str
) -> Optional[CommerceSupplier]:
    digits = _digits(phone)
    email_key = _email_key(email)
    if not digits and not email_key:
        return None
    rows = db.query(CommerceSupplier).filter(CommerceSupplier.company_id == company_id).all()
    for row in rows:
        if digits and _digits(row.phone) == digits:
            return row
        if email_key and _email_key(row.email) == email_key:
            return row
    return None


def _match_vendor(db: Session, company_id: str, phone: str, email: str) -> Optional[Vendor]:
    digits = _digits(phone)
    email_key = _email_key(email)
    if not digits and not email_key:
        return None
    rows = db.query(Vendor).filter(Vendor.company_id == company_id).all()
    for row in rows:
        if digits and _digits(row.phone) == digits:
            return row
        if email_key and _email_key(row.email) == email_key:
            return row
    return None


def _next_customer_code(db: Session) -> str:
    codes = {c for (c,) in db.query(CommerceCustomer.customer_code).all() if c}
    n = len(codes) + 1
    while True:
        code = f"CUST-{n:05d}"
        if code not in codes:
            return code
        n += 1


def _next_supplier_code(db: Session, company_id: str) -> str:
    count = (
        db.query(func.count(CommerceSupplier.id)).filter(CommerceSupplier.company_id == company_id).scalar() or 0
    )
    for n in range(count + 1, count + 500):
        code = f"VND-{n:04d}"
        exists = db.query(CommerceSupplier.id).filter(CommerceSupplier.vendor_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a supplier code")


def _next_b2b_vendor_code(db: Session) -> str:
    count = db.query(func.count(Vendor.id)).scalar() or 0
    n = count + 1
    while True:
        code = f"VEN-{n:05d}"
        exists = db.query(Vendor.id).filter(Vendor.vendor_code == code).first()
        if not exists:
            return code
        n += 1
