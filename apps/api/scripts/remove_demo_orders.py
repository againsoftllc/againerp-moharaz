"""Remove the seeded demo orders and demo customers before the real Moharaz data goes in
(docs/DATA_MIGRATION.md, step 13).

Demo = everything that did not come from the previous shop (ids without the "oc-" prefix), except the
system Walk-in Customer used by the POS:
- sales orders that are not the mirror of an imported order (lines, history, activities … cascade)
- webshop (commerce) orders (lines, addresses, events, shipments cascade) and their payments
- demo customers with their quotations, RMA tickets, receivables (+ the journal entries posted for those),
  payments, and the party behind each customer when nothing else uses it

Runs as one transaction. Without --apply it only prints what it would remove.
Usage (api container):
    python -m scripts.remove_demo_orders            # dry run
    python -m scripts.remove_demo_orders --apply
"""
from __future__ import annotations

import argparse

from sqlalchemy import bindparam, text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal

KEEP_CUSTOMERS = ["cust_walk_in"]


def q(sql: str, **lists: list):
    """text() with expanding IN-lists (:keep always, plus any given)."""
    stmt = text(sql)
    lists = {"keep": KEEP_CUSTOMERS, **lists}
    params = [bindparam(k, value=v, expanding=True) for k, v in lists.items() if f":{k}" in sql]
    return stmt.bindparams(*params) if params else stmt

# (label, SQL) in delete order; :keep is the customers to keep. Each statement selects/deletes its own set.
STEPS: list[tuple[str, str]] = [
    ("demo sales orders",
     "FROM sales_orders WHERE coalesce(notes, '') NOT LIKE '%commerce_order_id=oc-order-%'"),
    ("payments of demo webshop orders / demo customers",
     "FROM finance_payments WHERE (source_type = 'commerce_order' AND source_id NOT LIKE 'oc-%')"
     " OR party_id IN (SELECT party_id FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep)"),
    ("journal entries of demo receivables",
     "FROM finance_journal_entries WHERE source_id IN (SELECT source_id FROM finance_receivables"
     " WHERE customer_id IN (SELECT id FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep))"),
    ("receivables of demo customers",
     "FROM finance_receivables WHERE customer_id IN"
     " (SELECT id FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep)"),
    ("demo webshop orders",
     "FROM commerce_orders WHERE id NOT LIKE 'oc-%'"),
    ("quotations of demo customers",
     "FROM sales_quotations WHERE customer_id IN (SELECT id FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep)"),
    ("RMA tickets of demo customers",
     "FROM rma_tickets WHERE customer_id IN (SELECT id FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep)"),
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="delete (default: dry run)")
    args = ap.parse_args()
    db = SessionLocal()
    try:
        for label, where in STEPS:
            n = db.execute(q(f"SELECT count(*) {where}")).scalar()
            if args.apply and n:
                db.execute(q(f"DELETE {where}"))
            print(f"{'removed' if args.apply else 'would remove'} {n:>4}  {label}")

        demo = db.execute(q("SELECT id, party_id, name FROM commerce_customers WHERE id NOT LIKE 'oc-%' AND id NOT IN :keep")).fetchall()
        for cid, party_id, name in demo:
            print(f"{'removed' if args.apply else 'would remove'}       customer {cid} ({name})")
        if args.apply and demo:
            ids = [r[0] for r in demo]
            parties = [r[1] for r in demo if r[1]]
            db.execute(q("DELETE FROM commerce_customers WHERE id IN :ids", ids=ids))
            if parties:
                # a party also used as a supplier / vendor stays
                gone = db.execute(q(
                    "DELETE FROM parties WHERE id IN :p"
                    " AND id NOT IN (SELECT party_id FROM commerce_customers WHERE party_id IS NOT NULL)"
                    " AND id NOT IN (SELECT party_id FROM commerce_suppliers WHERE party_id IS NOT NULL)"
                    " AND id NOT IN (SELECT party_id FROM vendors WHERE party_id IS NOT NULL)"
                    , p=parties)).rowcount
                print(f"removed {gone:>4}  parties of demo customers")
        if args.apply:
            db.commit()
            print("committed")
        else:
            db.rollback()
            print("dry run — nothing changed (add --apply)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
