"""Commerce customer/supplier ↔ Universal Party compatibility bridge."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.services.parties.constants import (
    COMMERCE_CUSTOMER_STATUS_TO_PARTY_STATUS,
    COMMERCE_SUPPLIER_STATUS_TO_PARTY_STATUS,
)
from app.services.parties.interfaces import PartyCreateInput
from app.services.parties.party_repository import SqlAlchemyPartyRepository


def _infer_party_type(name: str) -> str:
    org_markers = ("ltd", "limited", "inc", "corp", "company", "co.", "group", "plc")
    lowered = name.lower()
    if any(marker in lowered for marker in org_markers):
        return "organization"
    return "person"


def ensure_party_for_customer(db: Session, customer: CommerceCustomer) -> str:
    """
    Ensure a Universal Party exists for the commerce customer.
    Uses customer.id as party.id for stable 1:1 mapping during migration.
    Returns party_id.
    """
    repo = SqlAlchemyPartyRepository(db)

    if customer.party_id:
        existing = repo.get_by_id(customer.party_id)
        if existing:
            sync_party_from_customer(db, customer)
            return customer.party_id

    party_id = customer.id
    existing_by_id = repo.get_by_id(party_id)
    if existing_by_id:
        customer.party_id = party_id
        sync_party_from_customer(db, customer)
        db.flush()
        return party_id

    repo.create(
        PartyCreateInput(
            id=party_id,
            company_id=customer.company_id,
            type=_infer_party_type(customer.name),
            display_name=customer.name,
            legal_name=customer.name,
            status=COMMERCE_CUSTOMER_STATUS_TO_PARTY_STATUS.get(customer.status, "active"),
            roles=("customer",),
        ),
    )
    customer.party_id = party_id
    db.flush()
    return party_id


def ensure_party_for_supplier(db: Session, supplier: CommerceSupplier) -> str:
    """
    Ensure a Universal Party exists for the commerce supplier.
    Uses supplier.id as party.id for stable 1:1 mapping during migration.
    Returns party_id.
    """
    repo = SqlAlchemyPartyRepository(db)

    if supplier.party_id:
        existing = repo.get_by_id(supplier.party_id)
        if existing:
            sync_party_from_supplier(db, supplier)
            return supplier.party_id

    party_id = supplier.id
    existing_by_id = repo.get_by_id(party_id)
    if existing_by_id:
        supplier.party_id = party_id
        sync_party_from_supplier(db, supplier)
        db.flush()
        return party_id

    repo.create(
        PartyCreateInput(
            id=party_id,
            company_id=supplier.company_id,
            type=_infer_party_type(supplier.name),
            display_name=supplier.name,
            legal_name=supplier.name,
            status=COMMERCE_SUPPLIER_STATUS_TO_PARTY_STATUS.get(supplier.status, "active"),
            roles=("supplier",),
        ),
    )
    supplier.party_id = party_id
    db.flush()
    return party_id


def sync_party_from_customer(db: Session, customer: CommerceCustomer) -> None:
    if not customer.party_id:
        return
    repo = SqlAlchemyPartyRepository(db)
    from app.services.parties.interfaces import PartyUpdateInput

    repo.update(
        customer.party_id,
        PartyUpdateInput(
            display_name=customer.name,
            legal_name=customer.name,
            status=COMMERCE_CUSTOMER_STATUS_TO_PARTY_STATUS.get(customer.status, "active"),
        ),
    )
    from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository

    SqlAlchemyPartyRoleRepository(db).add_role(customer.party_id, "customer")


def sync_party_from_supplier(db: Session, supplier: CommerceSupplier) -> None:
    if not supplier.party_id:
        return
    repo = SqlAlchemyPartyRepository(db)
    from app.services.parties.interfaces import PartyUpdateInput

    repo.update(
        supplier.party_id,
        PartyUpdateInput(
            display_name=supplier.name,
            legal_name=supplier.name,
            status=COMMERCE_SUPPLIER_STATUS_TO_PARTY_STATUS.get(supplier.status, "active"),
        ),
    )
    from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository

    SqlAlchemyPartyRoleRepository(db).add_role(supplier.party_id, "supplier")


def get_party_id_for_customer(db: Session, customer_id: str) -> Optional[str]:
    customer = db.get(CommerceCustomer, customer_id)
    if not customer:
        return None
    return ensure_party_for_customer(db, customer)


def get_party_id_for_supplier(db: Session, supplier_id: str) -> Optional[str]:
    supplier = db.get(CommerceSupplier, supplier_id)
    if not supplier:
        return None
    return ensure_party_for_supplier(db, supplier)


def ensure_party_for_vendor(db: Session, vendor) -> str:
    """Ensure a Universal Party exists for a B2B vendor (dealer/reseller)."""
    from app.models.vendor.vendor import Vendor
    from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository

    if not isinstance(vendor, Vendor):
        raise TypeError("vendor must be a Vendor")

    repo = SqlAlchemyPartyRepository(db)
    if vendor.party_id:
        existing = repo.get_by_id(vendor.party_id)
        if existing:
            SqlAlchemyPartyRoleRepository(db).add_role(vendor.party_id, "vendor")
            return vendor.party_id

    party_id = vendor.id
    existing_by_id = repo.get_by_id(party_id)
    if existing_by_id:
        vendor.party_id = party_id
        SqlAlchemyPartyRoleRepository(db).add_role(party_id, "vendor")
        db.flush()
        return party_id

    name = vendor.display_name or vendor.company_name or vendor.legal_name or "Vendor"
    repo.create(
        PartyCreateInput(
            id=party_id,
            company_id=vendor.company_id,
            type=_infer_party_type(name),
            display_name=name,
            legal_name=vendor.legal_name or name,
            status="active" if vendor.status in ("active", "approved") else "inactive",
            roles=("vendor",),
        ),
    )
    vendor.party_id = party_id
    db.flush()
    return party_id
