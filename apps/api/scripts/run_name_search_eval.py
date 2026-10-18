"""Measure Bangla / Banglish name search on YOUR customers (docs/AI/ai.md, step 2.3).

For every group of equivalent spellings in `name_variants.GROUPS` (Md / Mohammad / মোঃ, Rahim / Rohim / রহিম ...) it finds the real customers
whose name contains any spelling, then searches with each spelling and asks: how many of those customers did the search return (recall)?
`old` = a plain `ILIKE %word%` (what the search did before this step), `new` = the ranked search with spelling variants.
No model is called.

    python -m scripts.run_name_search_eval
"""
from __future__ import annotations

import re

import scripts.init_db  # noqa: F401
from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.auth_user import AuthUser
from app.services.ai import name_variants, record_search

LIMIT = 50


def is_bn(s: str) -> bool:
    return bool(name_variants.BN_RANGE.search(s))


def group_ids(conn, company_id: str, members) -> dict[str, str]:
    """id -> name of customers whose name has any spelling of the group."""
    conds, params = [], {"c": company_id}
    for i, m in enumerate(members):
        params[f"m{i}"] = ("%" + m + "%") if is_bn(m) else (r"\y" + re.escape(m) + r"\y")
        conds.append(f"name ilike :m{i}" if is_bn(m) else f"name ~* :m{i}")
    rows = conn.execute(text(f"select id, name from commerce_customers where company_id = :c and ({' or '.join(conds)}) limit 500"), params).all()
    return {r[0]: r[1] for r in rows}


def main() -> None:
    db = SessionLocal()
    company_id = db.query(AuthUser).first().company_id
    db.close()
    rows = []
    with engine.connect() as conn:
        trgm = record_search.has_trgm(conn)
        for g in name_variants.GROUPS:
            ids = group_ids(conn, company_id, g)
            if len(ids) < 2:
                continue
            for m in g[:6]:
                q = m
                old = {r[0] for r in conn.execute(text('select id from commerce_customers where company_id = :c and name ilike :q limit ' + str(LIMIT)), {"c": company_id, "q": f"%{q}%"})}
                new_rows = record_search.search_target(conn, company_id=company_id, table="commerce_customers", id_col="id", label_cols=("name",),
                                                       search_cols=("name",), extra_cols=(), q=q, limit=LIMIT, trgm=trgm)
                new = {r["id"] for r in new_rows}
                denom = min(len(ids), LIMIT)
                rows.append((g[0], q, len(ids), len(old & set(ids)) / denom, len(new & set(ids)) / denom, len(new - old), len(new - set(ids))))
    print(f"{'group':10} {'query':12} {'in data':>8} {'old recall':>11} {'new recall':>11} {'extra finds':>12} {'not in group':>13}")
    for g, q, n, o, nw, extra, wrong in rows:
        print(f"{g:10} {q:12} {n:8d} {o:11.0%} {nw:11.0%} {extra:12d} {wrong:13d}")
    if rows:
        print(f"\nmean recall  old {sum(r[3] for r in rows) / len(rows):.0%}   new {sum(r[4] for r in rows) / len(rows):.0%}   ({len(rows)} searches, {len({r[0] for r in rows})} name groups present in your data)")
        print(f"results outside the group (noise) per search: old {0:.1f}, new {sum(r[6] for r in rows) / len(rows):.1f}")


if __name__ == "__main__":
    main()
