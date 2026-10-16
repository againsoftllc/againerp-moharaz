"""Backfill Party Workspace profile data from commerce customers and suppliers."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer, load_json
from app.models.commerce_supplier import CommerceSupplier
from app.models.party_contact import PartyContact
from app.services.parties.commerce_party_bridge import ensure_party_for_customer, ensure_party_for_supplier
from app.services.parties.party_workspace_service import PartyWorkspaceService


def _has_contacts(db: Session, party_id: str) -> bool:
    return (
        db.query(PartyContact.id)
        .filter(PartyContact.party_id == party_id)
        .first()
        is not None
    )


def sync_workspace_from_customer(db: Session, customer: CommerceCustomer) -> str:
    party_id = ensure_party_for_customer(db, customer)
    if _has_contacts(db, party_id):
        return party_id

    ws = PartyWorkspaceService(db, party_id, company_id=customer.company_id)
    if customer.phone:
        ws.add_contact(
            contact_kind="phone",
            value=customer.phone,
            label="primary",
            is_primary=True,
        )
    if customer.email:
        ws.add_contact(
            contact_kind="email",
            value=customer.email,
            label="primary",
            is_primary=True,
        )

    addresses = load_json(customer.addresses_json, [])
    for idx, addr in enumerate(addresses):
        if not isinstance(addr, dict):
            continue
        ws.add_address(
            address_type="shipping" if addr.get("isDefault") else "billing",
            label=addr.get("label", ""),
            line1=addr.get("address", ""),
            city=addr.get("city", customer.city),
            region=addr.get("region", customer.region),
            country=addr.get("country", customer.country),
            is_primary=bool(addr.get("isDefault")),
            sort_order=idx,
        )

    if not addresses and customer.city:
        ws.add_address(
            address_type="billing",
            label="Primary",
            city=customer.city,
            region=customer.region,
            country=customer.country,
            is_primary=True,
        )

    if customer.notes:
        ws.add_note(body=customer.notes, note_type="internal", title="Commerce import")

    db.flush()
    return party_id


def sync_workspace_from_supplier(db: Session, supplier: CommerceSupplier) -> str:
    from app.models.commerce_supplier import load_json as supplier_load_json

    party_id = ensure_party_for_supplier(db, supplier)
    if _has_contacts(db, party_id):
        return party_id

    ws = PartyWorkspaceService(db, party_id, company_id=supplier.company_id)
    if supplier.phone:
        ws.add_contact(
            contact_kind="phone",
            value=supplier.phone,
            label="primary",
            is_primary=True,
        )
    if supplier.email:
        ws.add_contact(
            contact_kind="email",
            value=supplier.email,
            label="primary",
            is_primary=True,
        )
    if supplier.website:
        ws.add_contact(
            contact_kind="social",
            value=supplier.website,
            label="website",
        )

    addresses = supplier_load_json(supplier.addresses_json, [])
    for idx, addr in enumerate(addresses):
        if not isinstance(addr, dict):
            continue
        ws.add_address(
            address_type=addr.get("type", "office"),
            label=addr.get("label", ""),
            line1=addr.get("address", addr.get("line1", "")),
            line2=addr.get("line2"),
            city=addr.get("city", ""),
            region=addr.get("region", ""),
            postal_code=addr.get("postalCode", addr.get("postal_code", "")),
            country=addr.get("country", supplier.country),
            is_primary=bool(addr.get("isPrimary", addr.get("is_primary"))),
            sort_order=idx,
        )

    if supplier.tax_id:
        ws.add_document(
            document_type="bin",
            document_number=supplier.tax_id,
            notes="Imported from commerce supplier",
        )

    if supplier.notes:
        ws.add_note(body=supplier.notes, note_type="internal", title="Commerce import")

    db.flush()
    return party_id


def backfill_party_workspace_from_commerce(db: Session) -> int:
    count = 0
    for customer in db.query(CommerceCustomer).order_by(CommerceCustomer.created_at).all():
        if not customer.party_id:
            continue
        if _has_contacts(db, customer.party_id):
            continue
        sync_workspace_from_customer(db, customer)
        count += 1

    for supplier in db.query(CommerceSupplier).order_by(CommerceSupplier.created_at).all():
        if not supplier.party_id:
            continue
        if _has_contacts(db, supplier.party_id):
            continue
        sync_workspace_from_supplier(db, supplier)
        count += 1

    if count:
        db.commit()
    return count
