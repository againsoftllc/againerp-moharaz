#!/usr/bin/env python3
"""Party Phase 1 — read-only audit of Customer/Supplier/Vendor -> Party links.

Never writes to the database. Safe to run any time, as often as needed.

Usage:
    python3 scripts/audit_party_links.py
    python3 scripts/audit_party_links.py --company-id default
    python3 scripts/audit_party_links.py --show-issues
    python3 scripts/audit_party_links.py --show-duplicates
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict

import scripts.init_db  # noqa: F401 — register mappers for the whole model graph

from app.database import SessionLocal
from app.models.party import Party
from app.models.party_role import PartyRole
from scripts.party_audit_lib import (
    ENTITY_MODEL,
    EntityAuditResult,
    audit_all,
    find_duplicate_candidates,
)

ENTITY_LABELS = {"customer": "CUSTOMERS", "supplier": "SUPPLIERS", "vendor": "VENDORS"}


def print_entity_section(result: EntityAuditResult) -> None:
    label = ENTITY_LABELS[result.entity_type]
    print(label)
    print("-" * len(label))
    print(f"Total: {result.total}")
    print(f"Linked: {result.linked}")
    print(f"Unlinked: {result.unlinked}")
    print(f"Dangling (invalid_party_links / missing Party record): {result.dangling}")
    print(f"Cross-company (CRITICAL_INVALID_LINK): {result.cross_company}")
    print(f"Missing PartyRole: {result.missing_role}")
    print()


def print_company_breakdown(results: dict[str, EntityAuditResult]) -> None:
    companies = set()
    for result in results.values():
        companies.update(result.by_company_unlinked)
    if not companies:
        print("(no unlinked records in any company)")
        return
    for company in sorted(companies):
        print(f"Company {company}")
        for entity_type, result in results.items():
            missing = result.by_company_unlinked.get(company, 0)
            print(f"  {entity_type.capitalize()} missing: {missing}")
        print()


def print_role_consistency(db) -> None:
    """STEP 16 — group parties by which commerce roles they hold."""
    from scripts.party_audit_lib import ENTITY_MODEL as models

    customers = {row.party_id: row for row in db.query(models["customer"]).all() if row.party_id}
    suppliers = {row.party_id: row for row in db.query(models["supplier"]).all() if row.party_id}
    vendors = {row.party_id: row for row in db.query(models["vendor"]).all() if row.party_id}

    all_party_ids = set(customers) | set(suppliers) | set(vendors)
    buckets: dict[str, int] = defaultdict(int)
    for party_id in all_party_ids:
        roles = []
        if party_id in customers:
            roles.append("Customer")
        if party_id in suppliers:
            roles.append("Supplier")
        if party_id in vendors:
            roles.append("Vendor")
        buckets[" + ".join(roles)] += 1

    print("PARTY ROLE CONSISTENCY")
    print("-----------------------")
    for combo in (
        "Customer",
        "Supplier",
        "Vendor",
        "Customer + Supplier",
        "Customer + Vendor",
        "Supplier + Vendor",
        "Customer + Supplier + Vendor",
    ):
        print(f"{combo + '-only' if ' + ' not in combo else combo} parties: {buckets.get(combo, 0)}")
    print(f"Total distinct linked parties: {len(all_party_ids)}")
    print()


def print_sample_multi_role(db, limit: int = 5) -> None:
    customers = {row.party_id: row for row in db.query(ENTITY_MODEL["customer"]).all() if row.party_id}
    suppliers = {row.party_id: row for row in db.query(ENTITY_MODEL["supplier"]).all() if row.party_id}
    vendors = {row.party_id: row for row in db.query(ENTITY_MODEL["vendor"]).all() if row.party_id}
    multi = [pid for pid in customers if pid in suppliers or pid in vendors]
    if not multi:
        print("(no multi-role parties found)")
        return
    parties = {p.id: p for p in db.query(Party).filter(Party.id.in_(multi)).all()}
    for pid in multi[:limit]:
        party = parties.get(pid)
        print(f"Party ID: {pid}")
        print(f"Name: {party.display_name if party else '?'}")
        print("Roles:")
        if pid in customers:
            print(f"  ✓ Customer   Customer ID: {customers[pid].id}")
        if pid in suppliers:
            print(f"  ✓ Supplier   Supplier ID: {suppliers[pid].id}")
        if pid in vendors:
            print(f"  ✓ Vendor     Vendor ID: {vendors[pid].id}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company-id", default=None, help="Limit audit to one company")
    parser.add_argument("--show-issues", action="store_true", help="List every individual issue found")
    parser.add_argument("--show-duplicates", action="store_true", help="Run cross-role duplicate detection")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        results = audit_all(db, company_id=args.company_id)

        print("=" * 60)
        print("AGAINERP PARTY LINK AUDIT (read-only)")
        if args.company_id:
            print(f"Company: {args.company_id}")
        print("=" * 60)
        print()

        for entity_type in ("customer", "supplier", "vendor"):
            print_entity_section(results[entity_type])

        print("COMPANY-WISE UNLINKED BREAKDOWN")
        print("--------------------------------")
        print_company_breakdown(results)

        print_role_consistency(db)
        print("Sample multi-role parties:")
        print_sample_multi_role(db)

        if args.show_issues:
            print("DETAILED ISSUES")
            print("---------------")
            any_issue = False
            for result in results.values():
                for issue in result.issues:
                    any_issue = True
                    print(
                        f"[{issue.entity_type}] id={issue.entity_id} company={issue.company_id} "
                        f"party_id={issue.party_id} :: {issue.reason}"
                    )
            if not any_issue:
                print("(none)")
            print()

        if args.show_duplicates:
            print("DUPLICATE CANDIDATES (cross-role, not auto-merged)")
            print("----------------------------------------------------")
            candidates = find_duplicate_candidates(db, company_id=args.company_id)
            if not candidates:
                print("(none found)")
            for c in candidates:
                print(f"Match confidence: {c.confidence}  ({c.reason})")
                print(f"  {c.a_type.capitalize()}: {c.a_code}  {c.a_name}")
                print(f"  {c.b_type.capitalize()}: {c.b_code}  {c.b_name}")
                print(f"  Company: {c.company_id}")
                print()

        total_dangling = sum(r.dangling for r in results.values())
        total_cross = sum(r.cross_company for r in results.values())
        total_missing_role = sum(r.missing_role for r in results.values())
        print("SUMMARY")
        print("-------")
        print(f"Dangling links: {total_dangling}")
        print(f"Cross-company links (CRITICAL): {total_cross}")
        print(f"Missing PartyRole: {total_missing_role}")

        if total_cross > 0:
            print()
            print("WARNING: cross-company links found — these must be reviewed manually,")
            print("this script does not (and Phase 1 must not) auto-repair them.")
            sys.exit(2)
    finally:
        db.close()


if __name__ == "__main__":
    main()
