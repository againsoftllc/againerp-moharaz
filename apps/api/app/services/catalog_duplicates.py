"""Duplicate check for catalog products (the Unlisted list's "Duplicate" column).

For each product asked about, other products of the company (published, unlisted, any status) are compared:

* **confirmed** (red): the same source link, the same name once spaces / punctuation / case are ignored, or the same model AND brand;
* **possible** (yellow): a very similar name (trigram similarity >= 0.6), or the same model with a different / missing brand;
* **unique** (green): nothing found.

The comparison uses the trigram index on `catalog_products.name` (scripts/ensure_search_indexes.py), so asking about a page of rows is quick
even with tens of thousands of products. Without pg_trgm only the exact rules (source link / name / model) are used.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
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
    SELECT q.id, q.name, q.sku, q.status, q.model, q.brand, q.source_url, q.thumbnail, similarity(q.name, :name) AS sim
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
    SELECT q.id, q.name, q.sku, q.status, q.model, q.brand, q.source_url, q.thumbnail, 0.0 AS sim
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
                matches.append({"id": q["id"], "name": q["name"], "sku": q["sku"], "status": q["status"], "thumbnail": q["thumbnail"], "reason": reason, "level": level})
        matches.sort(key=lambda m: (m["level"] != "confirmed",))  # confirmed first, similarity order kept inside each group
        top = matches[:MAX_MATCHES]
        out[p["id"]] = {"level": top[0]["level"] if top else "unique", "matches": top}
    for pid in ids:
        out.setdefault(pid, {"level": "unique", "matches": []})
    return out


# --- saved results ---------------------------------------------------------------------------------------------------
# A scan is kept in `catalog_product_duplicate_checks` so the list does not rescan on every visit and a person's
# "verified" decision sticks. A row is scanned again when the product was changed after the scan (or on request);
# a verification survives a rescan only while the matching products are the same ones (otherwise it needs a new look).

_table_ready = False

_CREATE_TABLE = text(
    """
    CREATE TABLE IF NOT EXISTS catalog_product_duplicate_checks (
        product_id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        level VARCHAR(16) NOT NULL,
        matches TEXT NOT NULL DEFAULT '[]',
        signature TEXT NOT NULL DEFAULT '',
        checked_at TIMESTAMP NOT NULL DEFAULT now(),
        verified_signature TEXT,
        verified_by_id VARCHAR(36),
        verified_by_name VARCHAR(255),
        verified_at TIMESTAMP
    )
    """
)


def _ensure_table(db: Session) -> None:
    global _table_ready
    if _table_ready:
        return
    db.execute(_CREATE_TABLE)
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_catalog_dup_checks_company ON catalog_product_duplicate_checks (company_id)"))
    db.commit()
    _table_ready = True


def _signature(matches: list[dict[str, Any]]) -> str:
    return ",".join(sorted(m["id"] for m in matches))


def _view(row: dict[str, Any]) -> dict[str, Any]:
    matches = json.loads(row["matches"] or "[]")
    verified = bool(row["verified_at"]) and row["verified_signature"] == row["signature"]
    return {
        "level": row["level"],
        "matches": matches,
        "checkedAt": row["checked_at"].isoformat() if row["checked_at"] else None,
        "verified": verified,
        "verifiedBy": row["verified_by_name"] if verified else None,
        "verifiedAt": row["verified_at"].isoformat() if verified and row["verified_at"] else None,
    }


def _load(db: Session, company_id: str, ids: list[str]) -> dict[str, dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT c.*, p.updated_at AS product_updated_at
            FROM catalog_product_duplicate_checks c
            JOIN catalog_products p ON p.id = c.product_id
            WHERE c.company_id = :c AND c.product_id = ANY(:ids)
            """
        ),
        {"c": company_id, "ids": ids},
    ).mappings().all()
    return {r["product_id"]: dict(r) for r in rows}


def _save(db: Session, company_id: str, scanned: dict[str, dict[str, Any]], saved: dict[str, dict[str, Any]]) -> None:
    for pid, res in scanned.items():
        sig = _signature(res["matches"])
        old = saved.get(pid)
        keep = bool(old) and old["verified_at"] is not None and old["verified_signature"] == sig
        db.execute(
            text(
                """
                INSERT INTO catalog_product_duplicate_checks
                    (product_id, company_id, level, matches, signature, checked_at, verified_signature, verified_by_id, verified_by_name, verified_at)
                VALUES (:pid, :c, :level, :matches, :sig, now(), :vsig, :vby, :vname, :vat)
                ON CONFLICT (product_id) DO UPDATE SET
                    level = EXCLUDED.level, matches = EXCLUDED.matches, signature = EXCLUDED.signature, checked_at = now(),
                    verified_signature = EXCLUDED.verified_signature, verified_by_id = EXCLUDED.verified_by_id,
                    verified_by_name = EXCLUDED.verified_by_name, verified_at = EXCLUDED.verified_at
                """
            ),
            {
                "pid": pid,
                "c": company_id,
                "level": res["level"],
                "matches": json.dumps(res["matches"]),
                "sig": sig,
                "vsig": old["verified_signature"] if keep else None,
                "vby": old["verified_by_id"] if keep else None,
                "vname": old["verified_by_name"] if keep else None,
                "vat": old["verified_at"] if keep else None,
            },
        )
    db.commit()


def scan_and_save(db: Session, company_id: str, product_ids: list[str], refresh: bool = False) -> dict[str, dict[str, Any]]:
    """Saved result for each product; products never scanned (or changed since, or `refresh`) are scanned now and saved."""
    ids = list(dict.fromkeys(product_ids))[:MAX_IDS]
    if not ids:
        return {}
    _ensure_table(db)
    saved = _load(db, company_id, ids)
    todo = [
        pid
        for pid in ids
        if refresh
        or pid not in saved
        or (saved[pid]["product_updated_at"] is not None and saved[pid]["product_updated_at"] > saved[pid]["checked_at"])
    ]
    if todo:
        _save(db, company_id, find_duplicates(db, company_id, todo), saved)
        saved = _load(db, company_id, ids)
    return {pid: _view(saved[pid]) for pid in ids if pid in saved}


def set_verified(db: Session, company_id: str, product_id: str, verified: bool, user_id: str, user_name: str) -> dict[str, Any] | None:
    """Mark a scan as looked at by a person (the dot turns blue), or take the mark away."""
    result = scan_and_save(db, company_id, [product_id]).get(product_id)
    if result is None:
        return None
    if verified:
        db.execute(
            text(
                """
                UPDATE catalog_product_duplicate_checks
                SET verified_signature = signature, verified_by_id = :uid, verified_by_name = :uname, verified_at = :at
                WHERE product_id = :pid AND company_id = :c
                """
            ),
            {"uid": user_id, "uname": user_name, "at": datetime.now(timezone.utc).replace(tzinfo=None), "pid": product_id, "c": company_id},
        )
    else:
        db.execute(
            text(
                """
                UPDATE catalog_product_duplicate_checks
                SET verified_signature = NULL, verified_by_id = NULL, verified_by_name = NULL, verified_at = NULL
                WHERE product_id = :pid AND company_id = :c
                """
            ),
            {"pid": product_id, "c": company_id},
        )
    db.commit()
    return scan_and_save(db, company_id, [product_id])[product_id]
