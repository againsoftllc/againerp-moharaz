#!/usr/bin/env python3
"""Party Phase 1 — safe backfill of missing Customer/Supplier/Vendor -> Party links.

Reuses the EXISTING, already-idempotent ensure_party_for_customer/supplier/vendor
(app/services/parties/commerce_party_bridge.py) — this script does not duplicate
Party-creation logic, it only decides *which* rows to run it over and reports
the result.

Only ever touches: commerce_customers.party_id / commerce_suppliers.party_id /
vendors.party_id, and the parties / party_roles tables. Never touches
SalesOrder, PurchaseOrder, CRM, RMA, Service, POS, or any Finance table.

--dry-run (the default — safe): runs the real ensure_party_* logic inside a
transaction so the report is a genuine preview (not a guess), then ALWAYS
rolls back at the end. No row is ever persisted in dry-run mode, regardless
of what happens during processing.

--execute: required to actually commit. Commits every --batch-size rows.

Usage:
    python3 scripts/backfill_party_links.py --dry-run
    python3 scripts/backfill_party_links.py --dry-run --company-id default
    python3 scripts/backfill_party_links.py --execute --company-id default
    python3 scripts/backfill_party_links.py --execute --entity customer --entity supplier
    python3 scripts/backfill_party_links.py --execute --batch-size 200 --limit 1000
"""

from __future__ import annotations

import argparse
import sys

import scripts.init_db  # noqa: F401 — register mappers for the whole model graph

from app.database import SessionLocal
from app.services.parties.commerce_party_bridge import (
    ensure_party_for_customer,
    ensure_party_for_supplier,
    ensure_party_for_vendor,
)
from scripts.party_audit_lib import ENTITY_MODEL, audit_all

ENSURE_FN = {
    "customer": ensure_party_for_customer,
    "supplier": ensure_party_for_supplier,
    "vendor": ensure_party_for_vendor,
}


def backfill_entity(db, entity_type: str, *, company_id, batch_size, limit, execute) -> dict:
    model = ENTITY_MODEL[entity_type]
    ensure_fn = ENSURE_FN[entity_type]

    query = db.query(model).filter(model.party_id.is_(None))
    if company_id:
        query = query.filter(model.company_id == company_id)
    if limit:
        query = query.limit(limit)
    rows = query.all()

    report = {"before_missing": len(rows), "backfilled": 0, "failed": 0, "failures": []}

    processed = 0
    for row in rows:
        try:
            with db.begin_nested():
                ensure_fn(db, row)
            report["backfilled"] += 1
        except Exception as exc:  # noqa: BLE001 — must never abort the whole batch on one bad row
            report["failed"] += 1
            report["failures"].append(
                {
                    "entity_type": entity_type,
                    "entity_id": row.id,
                    "company_id": row.company_id,
                    "reason": str(exc),
                }
            )
        processed += 1
        if execute and processed % batch_size == 0:
            db.commit()

    if execute:
        db.commit()

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Preview only (this is also the default)")
    parser.add_argument("--execute", action="store_true", help="Actually persist changes")
    parser.add_argument("--company-id", default=None, help="Limit to one company")
    parser.add_argument(
        "--entity",
        action="append",
        choices=("customer", "supplier", "vendor"),
        help="Repeatable. Default: all three.",
    )
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--limit", type=int, default=None, help="Cap rows processed per entity (testing)")
    args = parser.parse_args()

    execute = bool(args.execute)
    if args.dry_run and execute:
        print("ERROR: --dry-run and --execute are mutually exclusive.", file=sys.stderr)
        sys.exit(1)

    entities = args.entity or list(ENTITY_MODEL.keys())

    db = SessionLocal()
    try:
        before = audit_all(db, company_id=args.company_id)

        reports: dict[str, dict] = {}
        for entity_type in entities:
            reports[entity_type] = backfill_entity(
                db,
                entity_type,
                company_id=args.company_id,
                batch_size=args.batch_size,
                limit=args.limit,
                execute=execute,
            )

        # Preview state reflects everything flushed so far, whether or not we
        # keep it — this makes dry-run a real preview, not a guess.
        after = audit_all(db, company_id=args.company_id)

        if execute:
            db.commit()
        else:
            db.rollback()

        mode = "EXECUTED" if execute else "DRY-RUN (rolled back — nothing persisted)"
        print("=" * 60)
        print(f"PARTY BACKFILL — {mode}")
        if args.company_id:
            print(f"Company: {args.company_id}")
        print("=" * 60)
        print()

        any_failures = False
        for entity_type in entities:
            r = reports[entity_type]
            print(entity_type.upper() + "S" if not entity_type.endswith("s") else entity_type.upper())
            print("-" * 10)
            print(f"Before missing: {r['before_missing']}")
            print(f"Backfilled: {r['backfilled']}")
            print(f"Already linked: {before[entity_type].linked}")
            print(f"Failed: {r['failed']}")
            if r["failures"]:
                any_failures = True
                for f in r["failures"]:
                    print(
                        f"  FAILED entity_type={f['entity_type']} entity_id={f['entity_id']} "
                        f"company_id={f['company_id']} reason={f['reason']}"
                    )
            print()

        print("POST-RUN STATE" + (" (preview, not persisted)" if not execute else ""))
        print("---------------")
        for entity_type in entities:
            b, a = before[entity_type], after[entity_type]
            print(f"{entity_type}: unlinked {b.unlinked} -> {a.unlinked}")
        print()

        remaining_unlinked = sum(after[e].unlinked for e in entities)
        if remaining_unlinked == 0:
            print("Target reached: 0 unlinked records remaining (for the entities/company selected).")
        else:
            print(
                f"{remaining_unlinked} record(s) still unlinked — not treated as a hard failure "
                "in Phase 1; re-run or review the failures above."
            )

        if any_failures:
            sys.exit(2)
    finally:
        db.close()


if __name__ == "__main__":
    main()
