#!/usr/bin/env python3
"""Party Phase 1+2 — automated test coverage.

DB-backed script test, matching this repo's existing convention (see
scripts/test_ai_os_rbac.py) rather than a pytest-fixture setup — this repo
has no isolated test database, so every test here creates its own clearly-
tagged throwaway fixture data under company_id="test-party-phase1-*" and
deletes it all in a `finally` block, pass or fail, so it's safe to re-run
against a real dev database.

Updated for Phase 2 (party_id is now NOT NULL + FK on commerce_customers /
commerce_suppliers / vendors): fixture rows are constructed with an explicit
id, then linked via ensure_party_for_* BEFORE the first insert — the same
ordering Phase 2 required in the real create endpoints
(commerce_customers.py, supplier_service.py, vendor_admin.py). Tests 7-8
(originally "backfill dry-run" / "backfill repeatability" against an
unlinked row) are updated to prove the new, stronger guarantee instead: the
database itself now refuses to create an unlinked row at all, so the old
"create unlinked, backfill later" scenario is structurally impossible
rather than merely discouraged.

Run:
    docker exec againerp-api python3 scripts/test_party_backfill.py
"""

from __future__ import annotations

import sys
import uuid
from datetime import date

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.vendor.vendor import Vendor
from app.services.parties.commerce_party_bridge import (
    ensure_party_for_customer,
    ensure_party_for_supplier,
    ensure_party_for_vendor,
)
from app.services.parties.party_commerce_links import enable_commerce_role
from sqlalchemy.exc import IntegrityError

COMPANY_A = "test-party-phase1-a"
COMPANY_B = "test-party-phase1-b"

PASS = []
FAIL = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASS.append(name)
        print(f"  PASS — {name}")
    else:
        FAIL.append(name)
        print(f"  FAIL — {name}" + (f" :: {detail}" if detail else ""))


def build_customer(*, company_id=COMPANY_A, name="Test Customer", phone="", email="") -> CommerceCustomer:
    """Unpersisted — caller must link (ensure_party_for_customer) before add()+flush()."""
    return CommerceCustomer(
        id=str(uuid.uuid4()),
        company_id=company_id,
        customer_code=f"TEST-CUST-{uuid.uuid4().hex[:10]}",
        name=name,
        phone=phone,
        email=email,
        customer_since=date.today(),
    )


def build_supplier(*, company_id=COMPANY_A, name="Test Supplier", phone="", email="") -> CommerceSupplier:
    return CommerceSupplier(
        id=str(uuid.uuid4()),
        company_id=company_id,
        vendor_code=f"TEST-SUPP-{uuid.uuid4().hex[:10]}",
        name=name,
        phone=phone,
        email=email,
    )


def build_vendor(*, company_id=COMPANY_A, name="Test Vendor", phone="", email="") -> Vendor:
    return Vendor(
        id=str(uuid.uuid4()),
        company_id=company_id,
        vendor_code=f"TEST-VEND-{uuid.uuid4().hex[:10]}",
        company_name=name,
        display_name=name,
        phone=phone,
        email=email,
        status="active",
    )


def make_customer(db, **kwargs) -> CommerceCustomer:
    """Build, link, and persist — the fixed real-world create ordering."""
    row = build_customer(**kwargs)
    ensure_party_for_customer(db, row)
    db.add(row)
    db.flush()
    return row


def make_supplier(db, **kwargs) -> CommerceSupplier:
    row = build_supplier(**kwargs)
    ensure_party_for_supplier(db, row)
    db.add(row)
    db.flush()
    return row


def make_vendor(db, **kwargs) -> Vendor:
    row = build_vendor(**kwargs)
    ensure_party_for_vendor(db, row)
    db.add(row)
    db.flush()
    return row


def cleanup(db) -> None:
    db.rollback()
    for company_id in (COMPANY_A, COMPANY_B):
        cust_ids = [r.id for r in db.query(CommerceCustomer.id).filter(CommerceCustomer.company_id == company_id)]
        supp_ids = [r.id for r in db.query(CommerceSupplier.id).filter(CommerceSupplier.company_id == company_id)]
        vend_ids = [r.id for r in db.query(Vendor.id).filter(Vendor.company_id == company_id)]
        party_ids = [r.id for r in db.query(Party.id).filter(Party.company_id == company_id)]

        db.query(CommerceCustomer).filter(CommerceCustomer.id.in_(cust_ids)).delete(synchronize_session=False)
        db.query(CommerceSupplier).filter(CommerceSupplier.id.in_(supp_ids)).delete(synchronize_session=False)
        db.query(Vendor).filter(Vendor.id.in_(vend_ids)).delete(synchronize_session=False)
        db.query(PartyRole).filter(PartyRole.party_id.in_(party_ids)).delete(synchronize_session=False)
        db.query(Party).filter(Party.id.in_(party_ids)).delete(synchronize_session=False)
    db.commit()


def test_customer_party_creation(db) -> None:
    print("1. Customer Party creation")
    customer = make_customer(db, name="Rahim Ahmed Test")

    party = db.get(Party, customer.party_id)
    check("Party exists after ensure_party_for_customer", party is not None)
    check("customer.party_id populated", bool(customer.party_id))
    has_role = (
        db.query(PartyRole).filter(PartyRole.party_id == customer.party_id, PartyRole.role == "customer").first()
        is not None
    )
    check("CUSTOMER PartyRole exists", has_role)


def test_supplier_party_creation(db) -> None:
    print("2. Supplier Party creation")
    supplier = make_supplier(db, name="Test Supplier Co")

    party = db.get(Party, supplier.party_id)
    check("Party exists after ensure_party_for_supplier", party is not None)
    has_role = (
        db.query(PartyRole).filter(PartyRole.party_id == supplier.party_id, PartyRole.role == "supplier").first()
        is not None
    )
    check("SUPPLIER PartyRole exists", has_role)


def test_vendor_party_creation(db) -> None:
    print("3. Vendor Party creation")
    vendor = make_vendor(db, name="Test B2B Vendor")

    party = db.get(Party, vendor.party_id)
    check("Party exists after ensure_party_for_vendor", party is not None)
    has_role = (
        db.query(PartyRole).filter(PartyRole.party_id == vendor.party_id, PartyRole.role == "vendor").first()
        is not None
    )
    check("VENDOR PartyRole exists", has_role)


def test_multi_role_customer_supplier(db) -> None:
    print("4. Multi-role: Customer + Supplier -> same Party")
    customer = make_customer(db, name="Dual Role Test")
    party_id = customer.party_id

    # Real production path: link a NEW supplier role onto the same existing Party.
    links = enable_commerce_role(db, party_id, "supplier", company_id=COMPANY_A)
    db.flush()

    check("links report includes both roles", set(links.roles) >= {"customer", "supplier"}, str(links.roles))
    check("supplier.party_id == customer.party_id", links.supplier is not None)

    if links.supplier:
        supplier_row = db.get(CommerceSupplier, links.supplier.id)
        check("Supplier.party_id == Customer.party_id", supplier_row.party_id == party_id)

    # STEP 12 extension: add Vendor role too, same Party.
    links2 = enable_commerce_role(db, party_id, "vendor", company_id=COMPANY_A)
    db.flush()
    check(
        "all three roles (customer/supplier/vendor) linked where system permits",
        set(links2.roles) >= {"customer", "supplier", "vendor"},
        str(links2.roles),
    )


def test_idempotency(db) -> None:
    print("5. Idempotency — ensure_party_for_customer run twice")
    customer = make_customer(db, name="Idempotent Test")
    party_id_1 = customer.party_id

    party_id_2 = ensure_party_for_customer(db, customer)
    db.flush()

    check("same party_id both times", party_id_1 == party_id_2)
    party_count = db.query(Party).filter(Party.id == party_id_1).count()
    role_count = (
        db.query(PartyRole)
        .filter(PartyRole.party_id == party_id_1, PartyRole.role == "customer")
        .count()
    )
    check("exactly 1 Party row", party_count == 1, f"found {party_count}")
    check("exactly 1 CUSTOMER role row (not 2)", role_count == 1, f"found {role_count}")


def test_tenant_isolation(db) -> None:
    print("6. Tenant isolation")
    customer_a = make_customer(db, company_id=COMPANY_A, name="Company A Customer")
    party_a_id = customer_a.party_id

    raised = False
    try:
        enable_commerce_role(db, party_a_id, "supplier", company_id=COMPANY_B)
    except Exception:
        raised = True
    check("cannot link a company-B request to a company-A Party", raised)


def test_not_null_prevents_unlinked_rows(db) -> None:
    """Phase 2: this supersedes the old 'backfill dry-run never persists an
    unlinked row' test — that scenario (an unlinked row existing at all) is
    now structurally impossible, not just discouraged. This proves it."""
    print("7. Phase 2 guarantee — DB refuses to create an unlinked row at all")
    row = build_customer(name="Unlinked Attempt Test")  # party_id left unset on purpose
    db.add(row)
    raised = False
    try:
        db.flush()
    except IntegrityError:
        raised = True
    finally:
        db.rollback()
    check("DB rejects an INSERT with party_id still NULL (NOT NULL constraint)", raised)


def test_backfill_repeatability(db) -> None:
    print("8. Repeatability — calling ensure_party_for_customer again on an already-linked row")
    customer = make_customer(db, name="Repeat Test")
    party_id = customer.party_id

    ensure_party_for_customer(db, customer)  # called again, same already-persisted row
    db.flush()

    check("party_id unchanged on second call", customer.party_id == party_id)
    party_count = db.query(Party).filter(Party.id == party_id).count()
    check("still exactly 1 Party after calling ensure_party a second time", party_count == 1, f"found {party_count}")


def test_role_uniqueness_constraint(db) -> None:
    print("9. PartyRole DB-level uniqueness constraint")
    customer = make_customer(db, name="Role Unique Test")
    party_id = customer.party_id

    dup = PartyRole(id=str(uuid.uuid4()), party_id=party_id, role="customer")
    db.add(dup)
    raised = False
    try:
        db.flush()
    except IntegrityError:
        raised = True
    finally:
        db.rollback()
    check("DB rejects a duplicate (party_id, role) PartyRole row", raised)


def main() -> None:
    db = SessionLocal()
    tests = [
        test_customer_party_creation,
        test_supplier_party_creation,
        test_vendor_party_creation,
        test_multi_role_customer_supplier,
        test_idempotency,
        test_tenant_isolation,
        test_not_null_prevents_unlinked_rows,
        test_backfill_repeatability,
        test_role_uniqueness_constraint,
    ]
    try:
        for test_fn in tests:
            try:
                test_fn(db)
                db.commit()
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                FAIL.append(f"{test_fn.__name__} (raised)")
                print(f"  FAIL — {test_fn.__name__} raised: {exc!r}")
    finally:
        cleanup(db)
        db.close()

    print()
    print("=" * 50)
    print(f"PARTY PHASE 1+2 TESTS: {len(PASS)} passed, {len(FAIL)} failed")
    print("=" * 50)
    if FAIL:
        for name in FAIL:
            print(f"  FAILED: {name}")
        sys.exit(1)


if __name__ == "__main__":
    main()
