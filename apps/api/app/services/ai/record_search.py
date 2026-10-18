"""Finding the right record from what an admin typed (docs/AI/ai.md, steps 2.1 / 2.2).

The old `search_records` ran `ILIKE '%whole sentence%'` per table and returned the first rows it met: no ranking, "Vivobook 15" did not match
"15 Vivobook", one wrong letter found nothing, and a short query ("Ryans") returned whatever order Postgres liked. This module:

* splits the query into words and requires EVERY word to be found (in any searchable column), in any order;
* ranks what it finds: exact code / number > exact name > name starts with the query > all words as whole words > name contains it > words
  found elsewhere (phone, e-mail ...), with a small similarity bonus and a preference for the shorter (closer) name;
* when nothing matches, retries with trigram similarity (pg_trgm) so "Rayns" still finds "Ryans" - only if the extension is installed
  (`scripts/ensure_search_indexes.py` installs it and the GIN indexes that keep `ILIKE '%x%'` fast on big tables);
* tells the caller when several records are about equally good, so the AI can ask "which one?" instead of picking one.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Optional, Sequence

from sqlalchemy import text

from app.services.ai import name_variants

FETCH = 40           # rows read per table before ranking
MAX_TOKENS = 6
BS = chr(92)         # backslash, the LIKE escape character
_WORD_SPLIT = re.compile(r"[\s,;/()]+")


def tokens_of(q: str) -> list[str]:
    toks = [t for t in _WORD_SPLIT.split((q or "").strip().lower()) if t]
    return toks[:MAX_TOKENS]


def _like(token: str) -> str:
    return "%" + token.replace(BS, BS * 2).replace("%", BS + "%").replace("_", BS + "_") + "%"


def has_trgm(conn) -> bool:
    try:
        return conn.execute(text("select 1 from pg_extension where extname = 'pg_trgm'")).first() is not None
    except Exception:  # noqa: BLE001
        return False


def _norm(v: Any) -> str:
    return " ".join(str(v or "").lower().split())


def _word_match(token: str, label: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(token) + r"(?![a-z0-9])", label) is not None


def score(rec: dict, q: str, toks: Sequence[Sequence[str]], label_col: str, search_cols: Sequence[str]) -> tuple[float, str]:
    """(score 0-100, why) for one found row. `toks` = per query word, all its spellings (name_variants)."""
    qn = _norm(q)
    label = _norm(rec.get(label_col))
    for c in search_cols:
        if c != label_col and _norm(rec.get(c)) == qn:
            return 100.0, "exact code / number"
    ratio = SequenceMatcher(None, label, qn).ratio() * 10
    if label == qn:
        return 95.0 + ratio / 10, "exact name"
    if label.startswith(qn):
        return 80.0 + ratio, "name starts with it"
    if toks and all(any(_word_match(v, label) for v in vs) for vs in toks):
        spelled = not all(_word_match(vs[0], label) for vs in toks)
        return (66.0 if spelled else 70.0) + ratio, "every word is in the name" + (" (another spelling)" if spelled else "")
    if qn in label:
        return 60.0 + ratio, "name contains it"
    if toks and all(any(v in label for v in vs) for vs in toks):
        return 55.0 + ratio, "words inside the name"
    return 45.0 + ratio, "found in another field (code, phone, e-mail ...)"


def search_target(
    conn,
    *,
    company_id: Optional[str],
    table: str,
    id_col: str,
    label_cols: Sequence[str],
    search_cols: Sequence[str],
    extra_cols: Sequence[str],
    q: str,
    limit: int,
    trgm: bool,
) -> list[dict]:
    """Ranked rows of one table for the query ([] when nothing). Each row has `score` and `match`."""
    toks = tokens_of(q)
    if not toks:
        return []
    spellings = [name_variants.variants(t) or (t,) for t in toks]
    label = label_cols[0]
    cols = list(dict.fromkeys([id_col, *label_cols, *extra_cols, *search_cols]))
    select = ", ".join(f'"{c}"' for c in cols)
    params: dict[str, Any] = {"c": company_id, "q": q.strip()}
    conds = []
    for i, vs in enumerate(spellings):
        parts = []
        for j, v in enumerate(vs):
            params[f"t{i}_{j}"] = _like(v)
            parts += [f'"{c}"::text ilike :t{i}_{j} escape \'{BS}\'' for c in search_cols]
        conds.append("(" + " or ".join(parts) + ")")
    stmt = f'select {select} from "{table}" where company_id = :c and {" and ".join(conds)} order by length("{label}"::text), "{label}" limit {FETCH}'
    rows = conn.execute(text(stmt), params).all()
    found = [dict(zip(cols, r)) for r in rows]
    similar = False
    if not found and trgm:
        # a typo: nothing contains the words, so look for the closest names (pg_trgm)
        # a number / code that does not exist must not turn into "the nearest number": digits in the query need a much closer match
        params["min_sim"] = 0.7 if any(ch.isdigit() for ch in q) else 0.45
        if name_variants.BN_RANGE.search(q):  # Bangla letters have no trigrams in Latin names: compare the spelled-out Latin form
            params["q"] = " ".join(name_variants.bn_to_latin(t, "a") if name_variants.BN_RANGE.search(t) else t for t in toks)
        stmt2 = (
            f'select {select} from "{table}" where company_id = :c and "{label}"::text % :q and similarity("{label}"::text, :q) >= :min_sim '
            f'order by similarity("{label}"::text, :q) desc limit {max(limit, 5)}'
        )
        try:
            found = [dict(zip(cols, r)) for r in conn.execute(text(stmt2), params).all()]
            similar = True
        except Exception:  # noqa: BLE001
            found = []
    out = []
    for rec in found:
        s, why = score(rec, q, spellings, label, search_cols)
        if similar:
            s, why = min(s, 40.0), "similar spelling (typo?)"
        out.append({**rec, "score": round(s, 1), "match": why})
    out.sort(key=lambda r: -r["score"])
    return out[: max(limit, 1)]


def ambiguity(results: list[dict], label_key: str = "_label") -> list[dict]:
    """Per type: when two or more records are about equally good (within 10 points of the best, best below an exact hit), list them."""
    by_type: dict[str, list[dict]] = {}
    for r in results:
        by_type.setdefault(r["type"], []).append(r)
    out = []
    for kind, rows in by_type.items():
        top = rows[0]["score"]
        close = [r for r in rows if top - r["score"] <= 10]
        if len(close) >= 2 and top < 100:
            out.append({"type": kind, "candidates": [{"id": r.get("id"), "label": r.get(label_key), "match": r["match"]} for r in close[:6]]})
    return out
