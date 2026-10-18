"""Measure the AI's record search (docs/AI/ai.md, step 2): the old ILIKE search against the ranked one, on YOUR data.

It takes real records from the database, writes the sort of thing an admin types for each (the exact name, lower case, the first words
only, the words in another order, a one-letter typo, a mistyped code), and checks whether the right record is the first result (top-1) or
among the first three (top-3). No model is called - this measures the search alone.

    python -m scripts.run_search_eval [--per 60] [--seed 7]
"""
from __future__ import annotations

import argparse
import random
import time
from collections import defaultdict

import scripts.init_db  # noqa: F401
from sqlalchemy import text

from app.database import engine
from app.models.auth_user import AuthUser
from app.database import SessionLocal
from app.services.ai import record_search

# kind, table, label column, other searchable columns
TARGETS = (
    ("customer", "commerce_customers", "name", ("customer_code", "phone", "email")),
    ("item", "items", "name", ("sku", "barcode")),
    ("product", "catalog_products", "name", ("sku", "brand", "category")),
    ("sales_order", "sales_orders", "order_number", ("invoice_number",)),
)
LIMIT = 5


def typo(word: str, rnd: random.Random) -> str:
    if len(word) < 4:
        return word
    i = rnd.randrange(1, len(word) - 2)
    return word[:i] + word[i + 1] + word[i] + word[i + 2:]  # swap two neighbouring letters


def variants(label: str, rnd: random.Random) -> dict[str, str]:
    words = label.split()
    out = {"exact": label, "lower": label.lower()}
    if len(words) >= 3:
        out["first words"] = " ".join(words[: max(2, len(words) // 2)])
        out["reordered"] = " ".join(reversed(words))
    long_words = [i for i, w in enumerate(words) if len(w) >= 5]
    if long_words:
        i = rnd.choice(long_words)
        w2 = list(words)
        w2[i] = typo(words[i], rnd)
        out["typo"] = " ".join(w2)
    return out


def old_search(conn, company_id, table, label, others, q):
    cols = [label, *others]
    where = " or ".join(f'"{c}"::text ilike :q' for c in cols)
    return [r[0] for r in conn.execute(text(f'select id, "{label}" from "{table}" where company_id = :c and ({where}) limit {LIMIT}'), {"q": f"%{q}%", "c": company_id}).all()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    db = SessionLocal()
    company_id = (db.query(AuthUser).first()).company_id
    db.close()
    stats: dict[tuple[str, str], list] = defaultdict(lambda: [0, 0, 0, 0.0, 0.0])  # n, top1, top3, ms
    with engine.connect() as conn:
        trgm = record_search.has_trgm(conn)
        print(f"pg_trgm installed: {trgm}")
        for kind, table, label, others in TARGETS:
            rows = conn.execute(text(f'select id, "{label}" from "{table}" where company_id = :c and length("{label}"::text) >= 6 order by random() limit {args.per * 3}'), {"c": company_id}).all()
            seen, picked = set(), []
            for rid, lab in rows:
                if str(lab).lower() in seen:
                    continue
                seen.add(str(lab).lower())
                picked.append((rid, str(lab)))
                if len(picked) >= args.per:
                    break
            same = {}
            for rid, lab in conn.execute(text(f'select id, "{label}" from "{table}" where company_id = :c'), {"c": company_id}):
                same.setdefault(str(lab).lower(), set()).add(rid)
            for rid, lab in picked:
                good = same.get(lab.lower(), {rid})  # records with the same text are equally right
                for vname, q in variants(lab, rnd).items():
                    for impl in ("old", "new"):
                        t0 = time.perf_counter()
                        if impl == "old":
                            ids = old_search(conn, company_id, table, label, others, q)
                        else:
                            res = record_search.search_target(conn, company_id=company_id, table=table, id_col="id", label_cols=(label,), search_cols=(label, *others), extra_cols=(), q=q, limit=LIMIT, trgm=trgm)
                            ids = [r["id"] for r in res]
                        ms = (time.perf_counter() - t0) * 1000
                        st = stats[(impl, vname)]
                        st[0] += 1
                        st[1] += int(bool(ids[:1]) and ids[0] in good)
                        st[2] += int(any(i in good for i in ids[:3]))
                        st[3] += ms
    print(f"\n{'sentence kind':14} {'old top-1':>10} {'new top-1':>10} {'old top-3':>10} {'new top-3':>10} {'old ms':>8} {'new ms':>8}")
    for vname in ("exact", "lower", "first words", "reordered", "typo"):
        o, n = stats[("old", vname)], stats[("new", vname)]
        if not o[0]:
            continue
        pct = lambda x, t: f"{100 * x // t}%"  # noqa: E731
        print(f"{vname:14} {pct(o[1], o[0]):>10} {pct(n[1], n[0]):>10} {pct(o[2], o[0]):>10} {pct(n[2], n[0]):>10} {o[3] / o[0]:8.1f} {n[3] / n[0]:8.1f}")
    to, tn = [sum(stats[(i, v)][k] for v in ("exact", "lower", "first words", "reordered", "typo")) for i in ("old", "new") for k in (0, 1, 2)], None
    print(f"\nALL  old top-1 {100 * to[1] // to[0]}%  top-3 {100 * to[2] // to[0]}%   |   new top-1 {100 * to[4] // to[3]}%  top-3 {100 * to[5] // to[3]}%   ({to[0]} searches each)")


if __name__ == "__main__":
    main()
