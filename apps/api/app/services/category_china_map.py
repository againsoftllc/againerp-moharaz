"""Map Elim / China browse products onto local CatalogCategory rows (SkyBuy-style)."""

from __future__ import annotations

import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.catalog_category import CatalogCategory

_TOKEN_RE = re.compile(r"[a-z0-9]+")
# Common gender/generic tokens — weak alone; need a distinctive product token too.
_WEAK_TOKENS = frozenset(
    {
        "women",
        "woman",
        "womens",
        "men",
        "man",
        "mens",
        "baby",
        "for",
        "and",
        "the",
        "with",
        "items",
        "products",
        "clothing",
    }
)


def _stem(token: str) -> str:
    t = token.lower()
    # Simple plural: hoodies→hoodie, bags→bag (skip ss / short words).
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    return t


def _tokens(text: str) -> set[str]:
    return {_stem(t) for t in _TOKEN_RE.findall((text or "").lower()) if len(t) > 1}


def _elim_category_label(raw: Any) -> Optional[str]:
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    if isinstance(raw, dict):
        for key in ("name", "name_en", "title", "category_name"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return None


def _overlap_score(title_tokens: set[str], kw_tokens: set[str]) -> float:
    if not kw_tokens or not title_tokens:
        return 0.0
    strong_hits = 0.0
    weak_hits = 0.0
    for kw in kw_tokens:
        # Exact stemmed match only (avoids "shirt" matching inside "sweatshirt").
        if kw not in title_tokens:
            continue
        if kw in _WEAK_TOKENS:
            weak_hits += 0.35
        else:
            strong_hits += 1.0
    if strong_hits <= 0:
        return 0.0
    coverage = (strong_hits + weak_hits) / len(kw_tokens)
    return strong_hits * 3.0 + weak_hits + coverage * 2.0


def resolve_china_category(
    db: Session,
    *,
    title: Optional[str] = None,
    elim_category_name: Any = None,
    preferred_category_id: Optional[str] = None,
) -> Optional[CatalogCategory]:
    """
    Pick a local category for a China product.

    Priority:
    1. preferred_category_id (user opened from that category page)
    2. Exact / contains match on Elim category_name vs local name
    3. Best score of title tokens vs categories that have china_search_keyword
    """
    if preferred_category_id:
        preferred = db.get(CatalogCategory, preferred_category_id)
        if preferred and preferred.is_active:
            return preferred

    rows = (
        db.query(CatalogCategory)
        .filter(CatalogCategory.is_active.is_(True))
        .order_by(CatalogCategory.depth.desc(), CatalogCategory.sort_order.asc())
        .all()
    )
    if not rows:
        return None

    elim_label = _elim_category_label(elim_category_name)
    if elim_label:
        elim_l = elim_label.lower()
        for row in rows:
            name_l = (row.name or "").lower()
            if name_l == elim_l or name_l in elim_l or elim_l in name_l:
                return row

    title_tokens = _tokens(title or "")
    if not title_tokens:
        return None

    best: Optional[CatalogCategory] = None
    best_score = 0.0
    for row in rows:
        keyword = (row.china_search_keyword or "").strip()
        if not keyword:
            continue
        kw_tokens = _tokens(keyword)
        if not kw_tokens:
            continue
        score = _overlap_score(title_tokens, kw_tokens)
        if score <= 0:
            continue
        # Prefer deeper (more specific) categories and longer keywords on ties.
        score += row.depth * 0.4 + min(len(keyword), 40) * 0.01
        if score > best_score:
            best_score = score
            best = row

    return best if best_score >= 2.0 else None


def apply_category_to_product(product: Any, category: Optional[CatalogCategory]) -> None:
    """Set catalog product category_id + denormalized name."""
    if not category:
        return
    product.category_id = category.id
    product.category = category.name
