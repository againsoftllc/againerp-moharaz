"""Duplicate check for catalog products (the Unlisted list's "Duplicate" column).

For each product asked about, other products of the company (published, unlisted, any status) are compared:

* **confirmed** (red): the same source link, the same name once spaces / punctuation / case are ignored, or the same model AND brand;
* **possible** (yellow): a very similar name (trigram similarity >= 0.6), or the same model with a different / missing brand;
* **unique** (green): nothing found.

The comparison uses the trigram index on `catalog_products.name` (scripts/ensure_search_indexes.py), so asking about a page of rows is quick
even with tens of thousands of products. Without pg_trgm only the exact rules (source link / name / model) are used.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

POSSIBLE_SIMILARITY = 0.6
STRONG_SIMILARITY = 0.8
MAX_MATCHES = 3
MAX_IDS = 200


def _norm(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


_SQL_TRGM = text(
    """
    SELECT q.id, q.name, q.sku, q.status, q.model, q.brand, q.source_url, similarity(q.name, :name) AS sim
    FROM catalog_products q
    WHERE q.company_id = :company_id AND q.id <> :id
      AND (
        q.name % :name
        OR (:source_url <> '' AND q.source_url = :source_url)
        OR (:model <> '' AND lower(q.model) = lower(:model))
      )
    ORDER BY sim DESC
    LIMIT 25
    """
)
_SQL_EXACT = text(
    """
    SELECT q.id, q.name, q.sku, q.status, q.model, q.brand, q.source_url, 0.0 AS sim
    FROM catalog_products q
    WHERE q.company_id = :company_id AND q.id <> :id
      AND (
        (:source_url <> '' AND q.source_url = :source_url)
        OR (:model <> '' AND lower(q.model) = lower(:model))
        OR lower(q.name) = lower(:name)
      )
    LIMIT 25
    """
)


def _classify(p: dict[str, Any], q: dict[str, Any]) -> tuple[str, str] | None:
    """(level, reason) of one other product against `p`, or None when it is not a match."""
    if p["source_url"] and q["source_url"] and p["source_url"] == q["source_url"]:
        return "confirmed", "Same source link"
    if _norm(p["name"]) and _norm(p["name"]) == _norm(q["name"]):
        return "confirmed", "Same name"
    same_model = bool(_norm(p["model"])) and _norm(p["model"]) == _norm(q["model"])
    if same_model and _norm(p["brand"]) and _norm(p["brand"]) == _norm(q["brand"]):
        return "confirmed", "Same brand and model"
    sim = float(q["sim"] or 0)
    if sim >= STRONG_SIMILARITY:
        return "possible", f"Very similar name ({round(sim * 100)}%)"
    if same_model:
        return "possible", "Same model"
    if sim >= POSSIBLE_SIMILARITY:
        return "possible", f"Similar name ({round(sim * 100)}%)"
    return None


def find_duplicates(db: Session, company_id: str, product_ids: list[str]) -> dict[str, dict[str, Any]]:
    """`{product_id: {"level": "confirmed" | "possible" | "unique", "matches": [{id, name, sku, status, reason, level}]}}`."""
    ids = list(dict.fromkeys(product_ids))[:MAX_IDS]
    if not ids:
        return {}
    rows = db.execute(
        text("SELECT id, name, sku, status, model, brand, source_url FROM catalog_products WHERE company_id = :c AND id = ANY(:ids)"),
        {"c": company_id, "ids": ids},
    ).mappings().all()
    use_trgm = True
    out: dict[str, dict[str, Any]] = {}
    for p in rows:
        params = {
            "id": p["id"],
            "company_id": company_id,
            "name": p["name"] or "",
            "model": (p["model"] or "").strip(),
            "source_url": (p["source_url"] or "").strip(),
        }
        try:
            candidates = db.execute(_SQL_TRGM if use_trgm else _SQL_EXACT, params).mappings().all()
        except Exception:  # noqa: BLE001 - no pg_trgm: exact rules only
            db.rollback()
            use_trgm = False
            candidates = db.execute(_SQL_EXACT, params).mappings().all()
        matches: list[dict[str, Any]] = []
        for q in candidates:
            verdict = _classify(dict(p), dict(q))
            if verdict:
                level, reason = verdict
                matches.append({"id": q["id"], "name": q["name"], "sku": q["sku"], "status": q["status"], "reason": reason, "level": level})
        matches.sort(key=lambda m: (m["level"] != "confirmed",))  # confirmed first, similarity order kept inside each group
        top = matches[:MAX_MATCHES]
        out[p["id"]] = {"level": top[0]["level"] if top else "unique", "matches": top}
    for pid in ids:
        out.setdefault(pid, {"level": "unique", "matches": []})
    return out
