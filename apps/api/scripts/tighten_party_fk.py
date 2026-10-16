#!/usr/bin/env python3
"""Party Phase 2 — tighten party_id to NOT NULL + FK on commerce_customers,
commerce_suppliers, vendors.

Prerequisite: Phase 1 backfill must show 0 unlinked and 0 dangling records
for all three tables (this script refuses to run otherwise). Verify with:

    python3 scripts/audit_party_links.py

Idempotent — safe to re-run; each statement is skipped if already applied.
"""

from __future__ import annotations

import sys

import scripts.init_db  # noqa: F401 — register mappers

from app.database import SessionLocal, engine
from scripts.party_audit_lib import audit_all
from sqlalchemy import text

TABLES = {
    "customer": "commerce_customers",
    "supplier": "commerce_suppliers",
    "vendor": "vendors",
}


def preflight() -> bool:
    db = SessionLocal()
    try:
        results = audit_all(db)
        ok = True
        for entity_type, result in results.items():
            if result.unlinked > 0:
                print(f"BLOCKED: {entity_type} has {result.unlinked} unlinked (party_id IS NULL) record(s).")
                ok = False
            if result.dangling > 0:
                print(f"BLOCKED: {entity_type} has {result.dangling} dangling party_id reference(s).")
                ok = False
            if result.cross_company > 0:
                print(f"BLOCKED: {entity_type} has {result.cross_company} cross-company link(s).")
                ok = False
        return ok
    finally:
        db.close()


def apply_constraint(table: str) -> None:
    with engine.connect() as conn:
        try:
            conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN party_id SET NOT NULL"))
            conn.commit()
            print(f"  {table}: SET NOT NULL on party_id")
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            print(f"  {table}: SET NOT NULL skipped ({exc})")

        try:
            conn.execute(
                text(
                    f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_party_id "
                    f"FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE RESTRICT"
                )
            )
            conn.commit()
            print(f"  {table}: added FK constraint fk_{table}_party_id -> parties.id")
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            print(f"  {table}: FK constraint skipped ({exc})")


def main() -> None:
    print("Pre-flight check (re-uses the Phase 1 audit logic)...")
    if not preflight():
        print("\nRefusing to proceed — resolve the issues above (run backfill_party_links.py) first.")
        sys.exit(1)
    print("Pre-flight OK: 0 unlinked, 0 dangling, 0 cross-company across all three tables.\n")

    for entity_type, table in TABLES.items():
        print(f"{entity_type} ({table}):")
        apply_constraint(table)

    print("\nDone. Re-run audit_party_links.py to confirm state is unchanged (this script only")
    print("tightens constraints — it does not modify any row).")


if __name__ == "__main__":
    main()
