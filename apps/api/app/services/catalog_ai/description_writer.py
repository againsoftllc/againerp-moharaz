"""Product description writer — rule A10 of docs/AI/product-upload.md.

When the company has a `catalog.product.description` preset the import does not copy the source text: the page's facts
are given to the model, which writes an original description, and the result is CHECKED here against the hard
requirements — at least 300 words, the focus keyphrase in the first paragraph, at least 2 <h2> and 3 <h3> headings —
and rewritten (up to MAX_ATTEMPTS times, with the failed checks named) until it passes. The best attempt is kept when
none passes. Never raises: with no model / on an error the caller keeps the extracted text.
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.schemas.catalog_ai_import import ProductDraft
from app.services.ai import preset_service
from app.services.catalog_ai.llm_extractor import generate_structured

MIN_WORDS = 300
MIN_H2 = 2
MIN_H3 = 3
MAX_ATTEMPTS = 3

_SCHEMA = {
    "type": "object",
    "properties": {"description": {"type": "string", "description": "The description as HTML (p, h2, h3, ul, li, strong only)"}},
    "required": ["description"],
}
_TAG = re.compile(r"<[^>]+>")


def keyphrase_for(draft: ProductDraft) -> str:
    phrase = " ".join(w for w in [draft.brand_name, draft.model] if w).strip()
    if not phrase or (draft.brand_name and phrase.lower() == draft.brand_name.lower()):
        phrase = draft.name
    return " ".join(phrase.split()[:5])


def plain(html_text: str) -> str:
    return re.sub(r"\s+", " ", _TAG.sub(" ", html_text or "")).strip()


def failures(html_text: str, keyphrase: str) -> list[str]:
    """Which hard requirements the description misses (empty list = passes)."""
    out: list[str] = []
    words = len(plain(html_text).split())
    if words < MIN_WORDS:
        out.append(f"it has {words} words — at least {MIN_WORDS} are required")
    h2 = len(re.findall(r"<h2\b", html_text, re.I))
    h3 = len(re.findall(r"<h3\b", html_text, re.I))
    if h2 < MIN_H2:
        out.append(f"it has {h2} <h2> headings — at least {MIN_H2} are required")
    if h3 < MIN_H3:
        out.append(f"it has {h3} <h3> headings — at least {MIN_H3} are required")
    first = re.search(r"<p\b[^>]*>(.*?)</p>", html_text, re.I | re.S)
    if not first or keyphrase.lower() not in plain(first.group(1)).lower():
        out.append(f"the first paragraph must contain the focus keyphrase '{keyphrase}' exactly")
    return out


def _facts(draft: ProductDraft, source_text: str) -> str:
    specs = "\n".join(f"- {i.label}: {i.value}" for g in draft.specifications for i in g.items)
    lines = [
        ("Product name", draft.name), ("Brand", draft.brand_name), ("Model", draft.model),
        ("Category", draft.category_name), ("Warranty", draft.warranty), ("Origin", draft.origin),
    ]
    head = "\n".join(f"{k}: {v}" for k, v in lines if v)
    return (
        f"{head}\n\nSpecifications:\n{specs or '(none)'}\n\nKey points from the page:\n{draft.short_description or '(none)'}"
        f"\n\nSource description (facts only — do not copy its sentences):\n{source_text[:3500] or '(none)'}"
    )


def write_description(
    db: Session, company_id: Optional[str], draft: ProductDraft, *, source_text: str
) -> Optional[str]:
    rules = preset_service.active_rules(db, company_id, ["general", "catalog", "catalog.product.description"])
    if "catalog.product.description" not in rules:
        return None
    keyphrase = keyphrase_for(draft)
    base = (
        "Write the product description for this product of ours.\n\n"
        f"{_facts(draft, source_text)}\n\n"
        + preset_service.field_rules_block(rules, {"catalog.product.description": "description"})
        + "\n\nHard requirements (checked automatically; the text is rejected and rewritten if any fails):\n"
        f"- at least {MIN_WORDS} words of visible text;\n"
        f"- the first paragraph (<p>) contains the focus keyphrase \"{keyphrase}\" exactly as written;\n"
        f"- at least {MIN_H2} <h2> and {MIN_H3} <h3> headings;\n"
        "- HTML only: <p>, <h2>, <h3>, <ul>, <li>, <strong>; the first element is the intro <p>;\n"
        "- original wording, only facts given above, no other store's name, no prices."
    )
    best: Optional[tuple[int, str]] = None
    problems: list[str] = []
    for attempt in range(MAX_ATTEMPTS):
        prompt = base if not problems else base + "\n\nYour previous attempt was rejected because: " + "; ".join(problems) + ". Fix all of it."
        try:
            data = generate_structured(prompt, _SCHEMA, db=db, company_id=company_id,
                                       system="You write unique, SEO-friendly product descriptions as clean HTML.")
        except HTTPException:
            break
        text = str(data.get("description") or "").strip()
        if not text:
            continue
        problems = failures(text, keyphrase)
        if best is None or len(problems) < best[0]:
            best = (len(problems), text)
        if not problems:
            break
    return best[1] if best else None
