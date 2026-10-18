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
        f"\n\nSource description (facts only — do not copy its sentences):\n{source_text[:2500] or '(none)'}"
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
        f"- at least {MIN_WORDS} words of visible text, aiming for {MIN_WORDS + 50}-{MIN_WORDS + 250} - do not pad or repeat yourself;\n"
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


# ------------------------------------------------------------------------------------------ short description (A9)
SHORT_POINTS = 4
SHORT_MAX_CHARS = 80
_NOT_A_FEATURE = re.compile(r"^\s*(mpn|model(\s+(name|number|no\.?))?|sku|part\s*(number|no\.?)|upc|ean|barcode|product\s*code)\b", re.I)
_LABEL_VALUE = re.compile(r"^[A-Za-z][A-Za-z0-9 ./&()'-]{1,28}:\s+\S")
_SHORT_SCHEMA = {
    "type": "object",
    "properties": {"bullets": {"type": "array", "items": {"type": "string"}, "description": "Exactly 4 key features, each written as 'Label: value' (e.g. 'RAM: 16GB DDR5')"}},
    "required": ["bullets"],
}


# ---- specification values (ai.md / product-upload.md A11): re-worded, the main value verified unchanged ----
SPEC_REWRITE_MIN_CHARS = 40   # shorter values (numbers, units, yes / no, one option) are never touched
SPEC_REWRITE_MAX_ITEMS = 40
_NUM = re.compile(r"\d+(?:[.,]\d+)*")
_WORD_WITH_DIGIT = re.compile(r"[A-Za-z]*\d[A-Za-z0-9.+/-]*")
_SPEC_SCHEMA = {
    "type": "object",
    "properties": {
        "values": {
            "type": "array",
            "items": {"type": "object", "properties": {"i": {"type": "integer"}, "value": {"type": "string"}}, "required": ["i", "value"]},
        }
    },
    "required": ["values"],
}


def _numbers(text: str) -> list[str]:
    return sorted(n.replace(",", "") for n in _NUM.findall(text or ""))


def _tokens(text: str) -> set[str]:
    return {t.lower().strip(".,;:") for t in _WORD_WITH_DIGIT.findall(text or "")}


def spec_value_ok(old: str, new: str) -> bool:
    """The re-worded value keeps the main value: the same numbers, the same figure-bearing names (USB 3.2, HDMI 2.1, i7-13700H ...),
    about the same length. Anything else -> the original stays."""
    new = (new or "").strip()
    if not new or "<" in new or len(new) > max(60, int(len(old) * 1.4)) or len(new) < int(len(old) * 0.4):
        return False
    return _numbers(old) == _numbers(new) and _tokens(old) <= _tokens(new)


def rewrite_spec_values(db: Session, company_id: Optional[str], draft: ProductDraft) -> ProductDraft:
    """Long descriptive specification values re-worded by the model (consistent wording / formatting, not a word-for-word copy of the
    source shop) - the main value must stay exactly right, so each rewrite is checked (`spec_value_ok`) and a failing one keeps the
    original. Needs the `catalog.product.spec_values` preset; the draft is returned unchanged without it or on any failure."""
    rules = preset_service.active_rules(db, company_id, ["general", "catalog", "catalog.product.spec_values"])
    if "catalog.product.spec_values" not in rules:
        return draft
    todo: list[tuple[int, int, str, str]] = []  # (group index, item index, label, value)
    for gi, g in enumerate(draft.specifications):
        for ii, it in enumerate(g.items):
            if len(it.value or "") >= SPEC_REWRITE_MIN_CHARS and ";" not in it.value and "warrant" not in it.label.lower():  # "A; B; C" = option lists (filters)
                todo.append((gi, ii, it.label, it.value))
    todo = todo[:SPEC_REWRITE_MAX_ITEMS]
    if not todo:
        return draft
    prompt = (
        "Rewrite these specification values of a product, following the company rule below. Return every value with its number `i`.\n\n"
        + preset_service.field_rules_block(rules, {"catalog.product.spec_values": "specification values"})
        + "\n\nHard requirements (checked automatically; a value that fails is dropped and the original kept):\n"
        "- keep every number, unit, version, port / standard / model name and brand exactly as given - nothing added, nothing dropped;\n"
        "- plain text, no HTML, about the same length, no seller name.\n\nValues:\n"
        + "\n".join(f"{n}. [{label}] {value}" for n, (_g, _i, label, value) in enumerate(todo))
    )
    try:
        data = generate_structured(prompt, _SPEC_SCHEMA, db=db, company_id=company_id, system="You reword product specification values without changing any fact.")
    except HTTPException:
        return draft
    groups = [g.model_copy(update={"items": list(g.items)}) for g in draft.specifications]
    for row in data.get("values") or []:
        try:
            n = int(row["i"])
            gi, ii, _label, old = todo[n]
        except (KeyError, ValueError, IndexError, TypeError):
            continue
        new = re.sub(r"\s+", " ", str(row.get("value") or "")).strip()
        if new and new != old and spec_value_ok(old, new):
            groups[gi].items[ii] = groups[gi].items[ii].model_copy(update={"value": new})
    return draft.model_copy(update={"specifications": groups})


def short_failures(lines: list[str]) -> list[str]:
    out: list[str] = []
    if len(lines) != SHORT_POINTS:
        out.append(f"it has {len(lines)} points - exactly {SHORT_POINTS} are required")
    for ln in lines:
        if _NOT_A_FEATURE.match(ln):
            out.append(f"'{ln}' is a model / part number - never a bullet")
        elif not _LABEL_VALUE.match(ln):
            out.append(f"'{ln}' is not in 'Label: value' form - write it like 'RAM: 16GB DDR5'")
        elif len(ln) > SHORT_MAX_CHARS:
            out.append(f"'{ln[:30]}...' is longer than {SHORT_MAX_CHARS} characters")
    return out


def write_short_description(
    db: Session, company_id: Optional[str], draft: ProductDraft, *, source_points: list[str]
) -> Optional[list[str]]:
    """Rule A9: exactly 4 bullet points, the key features, each as 'Label: value' ('RAM: 16GB') like the storefront's key-feature
    list - never a model / MPN / part number. Checked and rewritten like the
    description. Needs the `catalog.product.short_description` preset; None on any failure (the caller keeps its text)."""
    rules = preset_service.active_rules(db, company_id, ["general", "catalog", "catalog.product.short_description"])
    if "catalog.product.short_description" not in rules:
        return None
    base = (
        "Write the short description (key features) of this product of ours.\n\n"
        f"{_facts(draft, '')}\n\nThe source page's own highlight lines (facts only - do NOT copy them):\n"
        + ("\n".join(f"- {p}" for p in source_points) or "(none)")
        + "\n\n"
        + preset_service.field_rules_block(rules, {"catalog.product.short_description": "short description"})
        + "\n\nHard requirements (checked automatically; rejected and rewritten if any fails):\n"
        f"- exactly {SHORT_POINTS} bullet points;\n"
        "- each one a key feature a shopper decides on (processor, memory / storage, display, standout feature, "
        "connectivity, battery ...), written as 'Label: value' with a short label, e.g. 'Processor: Intel Core Ultra 5', "
        "'RAM: 16GB DDR5', 'Display: 14\" WUXGA touch, 400 nits', 'Battery: up to 60 days';\n"
        "- every line has the form 'Label: value' (one colon); NEVER a model number, MPN, SKU or part number;\n"
        f"- under {SHORT_MAX_CHARS} characters each; no seller name, no price; only facts given above."
    )
    best: Optional[tuple[int, list[str]]] = None
    problems: list[str] = []
    for _ in range(MAX_ATTEMPTS):
        prompt = base if not problems else base + "\n\nYour previous attempt was rejected because: " + "; ".join(problems) + ". Fix all of it."
        try:
            data = generate_structured(prompt, _SHORT_SCHEMA, db=db, company_id=company_id,
                                       system="You write concise, benefit-led product key-feature bullets.")
        except HTTPException:
            break
        # drop a bullet marker or list number ("- ", "• ", "1. ") - never the figures that start a feature ("16GB", '14" ...')
        lines = [re.sub(r"^\s*(?:[-•*·]+\s*|\d+[.)]\s+)", "", str(b)).strip() for b in (data.get("bullets") or [])]
        lines = [ln for ln in lines if ln]
        problems = short_failures(lines)
        if best is None or len(problems) < best[0]:
            best = (len(problems), lines)
        if not problems:
            break
    return best[1] if best and best[1] else None
