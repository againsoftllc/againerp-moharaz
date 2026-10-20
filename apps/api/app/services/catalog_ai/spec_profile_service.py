"""Specifications from source data → the product's specification profile.

A URL import scrapes the page's spec table into `ProductDraft.specifications` (label/value
pairs in groups). This module puts those values into the structured specification system
(catalog_attribute_profiles → groups → attributes, values in catalog_product_attribute_values)
instead of leaving them only as free-form custom specs:

* `find_profile` picks the existing profile for the product (profile name / category labels
  vs. the product's categories). No match → None — never a random fallback profile.
* `map_values` maps source label/value pairs onto the profile's attributes: exact label
  matches first, then one structured LLM call for the rest. Values come only from the source.
* `propose_profile` / `create_profile` build a new profile from the source spec groups. Creating
  a profile changes the catalog structure for everyone, so callers only do it after the user
  approved a preview (see the add_product_specs chat tool).

Profiles are not company-scoped in catalog_attribute_profiles.py (the admin UI lists them all),
so lookups here are not either; new rows still record the company.
"""

from __future__ import annotations

import json
import re
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.schemas.attribute_profile import (
    AttributeProfileBulkSaveRequest,
    BulkAttributeGroupItem,
    BulkAttributeItem,
    dump_json_list,
    parse_json_list,
    slugify_code,
)

SourceSpecs = list[dict]  # [{"group": str, "items": [{"label": str, "value": str}]}]

MAX_GROUPS = 20
MAX_ATTRS_PER_GROUP = 40


def _norm(text: Optional[str]) -> str:
    """Comparison key: lowercase alphanumerics, trailing plural 's' dropped ('Monitors' ≈ 'Monitor')."""
    key = re.sub(r"[^a-z0-9]+", "", (text or "").lower())
    return key[:-1] if len(key) > 3 and key.endswith("s") else key


# ------------------------------------------------------------------------------ source specs


def specs_from_draft(draft) -> SourceSpecs:
    return [
        {"group": g.group, "items": [{"label": i.label, "value": i.value} for i in g.items]}
        for g in (draft.specifications or [])
    ]


def specs_from_product(product: CatalogProduct) -> SourceSpecs:
    """The source specs an import stored in custom_specs_json (importer_service._specs_to_custom_json)."""
    try:
        data = json.loads(product.custom_specs_json or "{}")
    except (TypeError, ValueError):
        return []
    groups = {g.get("id"): {"group": g.get("name") or "General", "items": []} for g in data.get("customGroups") or []}
    for attr in data.get("customAttrs") or []:
        group = groups.setdefault(attr.get("groupId"), {"group": "General", "items": []})
        if (attr.get("name") or "").strip() and str(attr.get("value") or "").strip():
            group["items"].append({"label": attr["name"].strip(), "value": str(attr["value"]).strip()})
    return [g for g in groups.values() if g["items"]]


# Spec-table filler that means "no information" — never a value (a real "No" is kept: it
# answers yes/no fields like Touch Screen).
_PLACEHOLDERS = {
    "n/a", "na", "n.a", "n.a.", "-", "--", "---", "—", "null", "unknown", "not available",
    "not applicable", "not specified", "not mentioned", "tbd", "tba",
}


def is_placeholder(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in _PLACEHOLDERS


def _clean_specs(specs: SourceSpecs) -> SourceSpecs:
    out = []
    for g in specs:
        items = [
            {"label": str(i.get("label") or "").strip(), "value": str(i.get("value") or "").strip()}
            for i in g.get("items") or []
        ]
        items = [i for i in items if i["label"] and i["value"] and not is_placeholder(i["value"])]
        if items:
            out.append({"group": str(g.get("group") or "General").strip() or "General", "items": items})
    return out


def spec_item_count(specs: SourceSpecs) -> int:
    return sum(len(g["items"]) for g in _clean_specs(specs))


# --------------------------------------------------------------------------------- profiles


def _category_names(db: Session, product: Optional[CatalogProduct], extra: Iterable[str] = ()) -> list[str]:
    """The product's category names plus their parents (most specific first)."""
    names: list[str] = [n.split(">")[-1].strip() for n in extra if n and n.strip()]
    ids: list[str] = []
    if product is not None:
        if product.category_id:
            ids.append(product.category_id)
        try:
            from app.routers.catalog_products import _category_ids_for_product

            ids += [cid for cid in _category_ids_for_product(db, product) if cid not in ids]
        except Exception:  # noqa: BLE001 — primary category alone is still enough to match
            db.rollback()
        if product.category:
            names.append(product.category)
    seen: set[str] = set()
    for cid in ids:
        node = db.get(CatalogCategory, cid)
        while node is not None and node.id not in seen:
            seen.add(node.id)
            names.append(node.name)
            node = db.get(CatalogCategory, node.parent_id) if node.parent_id else None
    out: list[str] = []
    for n in names:
        if n and n not in out:
            out.append(n)
    return out


def find_profile(
    db: Session,
    *,
    product: Optional[CatalogProduct] = None,
    category_names: Iterable[str] = (),
) -> Optional[CatalogAttributeProfile]:
    """Active profile whose name or category labels match one of the product's categories
    (a more specific category wins). None when nothing matches."""
    cats = [_norm(c) for c in _category_names(db, product, category_names)]
    cats = [c for c in cats if c]
    if not cats:
        return None
    best: tuple[int, Optional[CatalogAttributeProfile]] = (0, None)
    for profile in db.query(CatalogAttributeProfile).filter(CatalogAttributeProfile.is_active.is_(True)).all():
        keys = {_norm(profile.name), *(_norm(label) for label in parse_json_list(profile.category_labels))}
        keys.discard("")
        for rank, cat in enumerate(cats):
            if cat in keys:
                score = 1000 - rank
                if score > best[0]:
                    best = (score, profile)
                break
    return best[1]


def profile_fields(db: Session, profile_id: str) -> list[dict]:
    groups = {
        g.id: g
        for g in db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id == profile_id, CatalogAttributeGroup.is_active.is_(True))
        .all()
    }
    if not groups:
        return []
    attrs = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.group_id.in_(list(groups)), CatalogAttribute.is_active.is_(True))
        .all()
    )
    attrs.sort(key=lambda a: (groups[a.group_id].sort_order, a.sort_order))
    return [
        {
            "id": a.id,
            "name": a.name,
            "group": groups[a.group_id].name,
            "unit": a.unit,
            "options": parse_json_list(a.predefined_values),
            "filterable": bool(a.is_filterable),
            "field_type": a.field_type,
        }
        for a in attrs
    ]


# ---------------------------------------------------------------------------------- mapping

_MAP_SCHEMA = {
    "type": "object",
    "properties": {
        "values": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field_id": {"type": "string"},
                    "value": {"type": "string"},
                    "source_label": {"type": "string"},
                },
                "required": ["field_id", "value", "source_label"],
            },
        }
    },
    "required": ["values"],
}


# Shops name the same spec differently: Star Tech "Processor Model", Ryans "Processor", Techland "CPU". The profile's attribute
# keeps ITS name and takes the value from whichever source row means the same - a row is never turned into a second attribute.
_CONCEPT_PHRASES = [
    (r"operating\s+system|\bos\b", " os "),
    (r"hard\s*(?:disk|drive)|\bhdd\b|\bssd\b|solid\s+state", " storage "),
    (r"video\s+card|graphics?\s+card|graphic\s+card|\bgraphics?\b|\bvga\b|\bgpu\b", " gpu "),
    (r"\bprocessors?\b|\bcpu\b|\bchip\b", " cpu "),
    (r"\bram\b|\bmemory\b", " ram "),
    (r"\bscreen\b|\bdisplay\b|\bmonitor\b|\bpanel\b", " display "),
    (r"\bcolou?rs?\b", " color "),
    (r"\bbrand\b|\bmanufacturer\b|\bmake\b", " brand "),
    (r"\bwireless\b|\bwi-?fi\b|\bwlan\b", " wifi "),
    (r"\bethernet\b|\blan\b", " lan "),
]
_CONCEPT_STOP = {"model", "type", "name", "series", "detail", "info", "information", "spec", "specification", "feature", "number", "no", "of", "the", "and"}


def concept_key(label: str) -> Optional[frozenset]:
    """The meaning of a spec label as a set of canonical words: 'Processor Model' = 'CPU' = {cpu}; 'Memory Slots' = 'RAM Slot'.
    None when nothing is left (e.g. 'Model')."""
    text = (label or "").lower()
    for pattern, word in _CONCEPT_PHRASES:
        text = re.sub(pattern, word, text)
    words = {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.findall(r"[a-z0-9]+", text)}
    words = {w for w in words if len(w) > 1 and w not in _CONCEPT_STOP}
    return frozenset(words) if words else None


def _exact_hits(specs: SourceSpecs, fields: list[dict]) -> dict[str, tuple[str, str]]:
    """{attribute_id: (source label, value)}: the source row with the attribute's name (same group first), then - for an
    attribute still open - the ONE source row that means the same thing under another name."""
    by_group: dict[tuple[str, str], tuple[str, str]] = {}
    by_label: dict[str, tuple[str, str]] = {}
    by_concept: dict[frozenset, list[tuple[str, str]]] = {}
    for g in _clean_specs(specs):
        for i in g["items"]:
            row = (i["label"], i["value"])
            by_group.setdefault((_norm(g["group"]), _norm(i["label"])), row)
            by_label.setdefault(_norm(i["label"]), row)
            key = concept_key(i["label"])
            if key:
                rows = by_concept.setdefault(key, [])
                if all(_norm(r[0]) != _norm(i["label"]) for r in rows):
                    rows.append(row)
    hits: dict[str, tuple[str, str]] = {}
    for f in fields:
        hit = by_group.get((_norm(f["group"]), _norm(f["name"]))) or by_label.get(_norm(f["name"]))
        if hit:
            hits[f["id"]] = hit
    taken = {_norm(row[0]) for row in hits.values()}
    for f in fields:
        if f["id"] in hits:
            continue
        key = concept_key(f["name"])
        rows = [r for r in by_concept.get(key, []) if _norm(r[0]) not in taken] if key else []
        if len(rows) == 1:  # two rows with the same meaning (HDD / SSD) are ambiguous: left to the model
            hits[f["id"]] = rows[0]
            taken.add(_norm(rows[0][0]))
    return hits


def exact_values(specs: SourceSpecs, fields: list[dict]) -> dict[str, str]:
    """{attribute_id: value} where a source label matches a field name or means the same thing (same group first)."""
    return {fid: row[1] for fid, row in _exact_hits(specs, fields).items()}


def _canon_text(text: str) -> str:
    """Lowercase with unit spellings unified, for option matching: 14 inch / 14-inch / 14″ → 14",
    14.0 → 14."""
    t = (text or "").lower()
    t = re.sub(r"[\u201c\u201d\u2033]|''", '"', t)
    t = re.sub(r"(\d)\s*-?\s*(?:inches|inch|in)\b", r'\1"', t)
    t = re.sub(r"(\d+)\.0+(?!\d)", r"\1", t)
    return t


def _option_pattern(option: str) -> Optional[re.Pattern]:
    tokens = re.findall(r"\d+(?:\.\d+)?|[a-z]+|[^\sa-z0-9]", _canon_text(option))
    if not tokens:
        return None
    body = r"\s*-?\s*".join(re.escape(t) for t in tokens)
    return re.compile(rf"(?<![a-z0-9.]){body}(?![a-z0-9])")


def _fit_option(field: dict, value: str) -> Optional[str]:
    """The field's own option for `value`: the same text (case/spacing/plural-insensitive), else
    the option the value falls under — 'AMD Ryzen 7 8840HS' → 'AMD', '16GB LPDDR5X' → '16 GB',
    '14" WUXGA Touch' → '14"'. Whole words/numbers only, so '128GB' never matches '8 GB'. When
    several options appear, the one mentioned first (then the longest) wins. None = no fit."""
    if value in field["options"]:
        return value
    exact = next((o for o in field["options"] if _norm(o) == _norm(value)), None)
    if exact is not None:
        return exact
    haystack = _canon_text(value)
    best: Optional[tuple[int, int, str]] = None
    for option in field["options"]:
        pattern = _option_pattern(option)
        match = pattern.search(haystack) if pattern else None
        if match:
            rank = (match.start(), -len(option), option)
            if best is None or rank < best:
                best = rank
    return best[2] if best else None


_LABEL_STOPWORDS = {"the", "of", "and", "type", "max", "maximum", "total", "number", "no", "x"}


def _label_words(label: str) -> set[str]:
    words = {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.findall(r"[a-z0-9]+", (label or "").lower())}
    return {w for w in words if w not in _LABEL_STOPWORDS and len(w) > 1}


def _has_option_unit(field: dict, value: str) -> bool:
    """The value carries a number in the same unit as the field's numeric options."""
    haystack = _canon_text(value)
    for option in field["options"]:
        m = re.fullmatch(r"\s*\d+(?:\.\d+)?\s*([a-z\"]+)\s*", _canon_text(option))
        if m and re.search(rf"(?<![\d.])\d+(?:\.\d+)?\s*-?\s*{re.escape(m.group(1))}(?![a-z0-9])", haystack):
            return True
    return False


def _suggest_option(field: dict, value: str) -> str:
    """A new option for `value` written in the style of the field's existing options, so the
    storefront filter stays clean: options '8 GB', '16 GB' + source '24GB LPDDR5X' → '24 GB';
    '60Hz', '144Hz' + '165 Hz refresh' → '165Hz'. Otherwise the value up to its first comma or
    bracket."""
    unit_style: dict[str, tuple[str, str]] = {}
    for option in field["options"]:
        m = re.fullmatch(r"\s*\d+(?:\.\d+)?(\s*)([A-Za-z\"]+)\s*", option)
        if m:
            unit_style.setdefault(_canon_text(m.group(2)), (m.group(1), m.group(2)))
    if unit_style:
        haystack = _canon_text(value)
        for unit, (space, spelled) in unit_style.items():
            m = re.search(rf"(?<![\d.])(\d+(?:\.\d+)?)\s*-?\s*{re.escape(unit)}(?![a-z0-9])", haystack)
            if m:
                return f"{m.group(1)}{space}{spelled}"
    return re.split(r"[,(;\n]", value, maxsplit=1)[0].strip()[:100] or value[:100]


MAX_MODEL_FIELDS = 150
MAX_MODEL_ROWS = 200


def map_values_traced(
    db: Session, company_id: Optional[str], specs: SourceSpecs, fields: list[dict]
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """(values, off_options, source_of). `values`: {field_id: value} the source answers - for a field with allowed
    values, only one of those. `off_options`: {field_id: source value} for fields whose allowed values don't include what
    the source says (adding an option changes the profile for everyone, so callers only suggest it). `source_of`:
    {field_id: normalised label of the source row it came from}, so the caller can keep the rows that were NOT used.
    Every open attribute is answered by the row that means the same ("CPU" <- "Processor Model"); an attribute keeps
    its own name and the source's name is never added as another one."""
    specs = _clean_specs(specs)
    if not specs or not fields:
        return {}, {}, {}
    fields = [{**f, "options": list(f.get("options") or [])} for f in fields]
    by_id = {f["id"]: f for f in fields}
    values: dict[str, str] = {}
    off: dict[str, str] = {}
    source_of: dict[str, str] = {}

    def put(fid: str, val: str, label: Optional[str] = None) -> None:
        field = by_id[fid]
        val = val.strip()[:2000]
        if not val or is_placeholder(val):
            return
        if field["options"]:
            fit = _fit_option(field, val)
            if fit is None:
                off[fid] = _suggest_option(field, val)
                if label:
                    source_of[fid] = _norm(label)
                return
            val = fit
        values[fid] = val
        off.pop(fid, None)
        if label:
            source_of[fid] = _norm(label)

    for fid, (label, val) in _exact_hits(specs, fields).items():
        put(fid, val, label)
    # Dropdown/filter fields still open: a source row whose label shares a meaningful word with
    # the field ("Panel Size" <-> "Display Size") and whose value fits an option or carries the
    # options' unit (17 Inch for a field of 24"/27"...) - deterministic, before any LLM call.
    for f in fields:
        if f["id"] in values or not f["options"]:
            continue
        words = _label_words(f["name"])
        for g in specs:
            for i in g["items"]:
                if not words & _label_words(i["label"]):
                    continue
                if _fit_option(f, i["value"]) is not None or _has_option_unit(f, i["value"]):
                    put(f["id"], i["value"], i["label"])
                    break
            if f["id"] in values or f["id"] in off:
                break
    # The model answers every attribute still open, from the source rows nothing has used yet - so a profile attribute
    # "Processor" gets the value of a source row called "CPU" (the shops all name things differently) instead of the row
    # staying behind as a second, differently named spec. Only the open fields and unused rows are sent (small prompt).
    used = set(source_of.values())
    missing = [f for f in fields if f["id"] not in values and f["id"] not in off][:MAX_MODEL_FIELDS]
    rows = [(g["group"], i) for g in specs for i in g["items"] if _norm(i["label"]) not in used][:MAX_MODEL_ROWS]
    if not missing or not rows:
        return values, off, source_of

    from app.services.catalog_ai.llm_extractor import generate_structured

    field_lines = "\n".join(
        f"- id={f['id']} | {f['group']} > {f['name']}"
        + (" [STOREFRONT FILTER]" if f.get("filterable") else "")
        + (f" (unit: {f['unit']})" if f.get("unit") else "")
        + (f" | allowed values: {', '.join(f['options'])}" if f["options"] else "")
        for f in missing
    )
    source_lines = "\n".join(f"[{group}] {i['label']}: {i['value']}" for group, i in rows)
    prompt = (
        "Fill these product specification fields from the product's source spec table.\n\n"
        f"Fields to fill:\n{field_lines}\n\n"
        f"Source specifications (from the product page):\n{source_lines}\n\n"
        "Rules: match by MEANING, not by exact wording - shops name the same thing differently ('Processor', 'CPU', "
        "'Processor Model' and 'Processor Type' are one thing; so are 'Memory' / 'RAM', 'Display' / 'Screen' / 'Monitor', "
        "'Graphics' / 'GPU' / 'Graphics Card', 'Storage' / 'SSD' / 'Hard Disk'). Put the source row's value in the field "
        "that means the same, and give that row's label in source_label exactly as written in the source. The field "
        "keeps its own name - never rename it. Use ONLY information in the source specifications - never guess or add "
        "facts. Copy the value as written (you may drop the label or reformat units to match the field). When a field "
        "lists allowed values, use exactly one of them if one means the same thing; if none does, give the value as the "
        "source writes it (e.g. '17 Inch') - never answer 'N/A', '-' or 'none' for a field the source has a value for, "
        "and leave the field out when it really has none. Fields marked [STOREFRONT FILTER] are how shoppers filter the "
        "catalog - never skip one the source has any information for: pick the allowed value the product "
        "falls under (e.g. processor 'AMD Ryzen 7 8840HS' -> 'AMD', RAM '16GB LPDDR5X' -> '16 GB', a brand or "
        "type named inside a longer value), and look across ALL source rows (a display size may sit under "
        "'Display', RAM under 'Memory'). One source row feeds one field. Leave out any field the source does not answer. "
        "Use the field ids exactly as given."
    )
    try:
        data = generate_structured(
            prompt, _MAP_SCHEMA, db=db, company_id=company_id,
            system="You map product specification data into structured fields.",
        )
    except HTTPException:
        return values, off, source_of
    wanted = {f["id"] for f in missing}
    available = {_norm(i["label"]): i for _g, i in rows}
    by_value = {_norm(i["value"]): i for _g, i in rows}
    claimed: set[str] = set()
    for row in data.get("values") or []:
        fid = str((row or {}).get("field_id") or "")
        value = str((row or {}).get("value") or "")
        if fid not in wanted:
            continue
        # the row it came from: the label the model named, else the row whose value it copied
        src = available.get(_norm(str((row or {}).get("source_label") or ""))) or by_value.get(_norm(value))
        label = src["label"] if src else None
        if label and _norm(label) in claimed:
            continue  # a source row feeds one field
        put(fid, value, label)
        if label and (fid in values or fid in off):
            claimed.add(_norm(label))
    return values, off, source_of


def map_values_detailed(
    db: Session, company_id: Optional[str], specs: SourceSpecs, fields: list[dict]
) -> tuple[dict[str, str], dict[str, str]]:
    """(values, off_options) - see map_values_traced."""
    values, off, _source = map_values_traced(db, company_id, specs, fields)
    return values, off


def map_values(
    db: Session, company_id: Optional[str], specs: SourceSpecs, fields: list[dict]
) -> dict[str, str]:
    """{attribute_id: value} for the profile fields the source specs answer."""
    return map_values_detailed(db, company_id, specs, fields)[0]


def filter_report(fields: list[dict], values: dict[str, str], off: dict[str, str]) -> dict:
    """Storefront-filter coverage for one product: which filterable fields got an option, which
    need a new option (the source's value isn't one of them), and which the source says nothing
    about. Field labels are "Group > Name"."""
    label = {f["id"]: f"{f['group']} > {f['name']}" for f in fields}
    filterable = [f for f in fields if f.get("filterable")]
    return {
        "set": {label[f["id"]]: values[f["id"]] for f in filterable if f["id"] in values},
        "need_new_option": {label[f["id"]]: off[f["id"]] for f in filterable if f["id"] in off},
        "no_data_on_page": [label[f["id"]] for f in filterable if f["id"] not in values and f["id"] not in off],
    }


def add_options(db: Session, new_options: dict[str, str]) -> int:
    """Add each {attribute_id: value} to that attribute's allowed values and refresh the
    profile's storefront filters. Changes the profile for every product — callers only do this
    after the user approved it in a preview. Caller commits. Returns options added."""
    from app.routers.catalog_attribute_profiles import _sync_catalog_filters_for_profile

    added, profiles = 0, set()
    for attr_id, value in new_options.items():
        attr = db.get(CatalogAttribute, attr_id)
        value = (value or "").strip()[:255]
        if attr is None or not value:
            continue
        options = parse_json_list(attr.predefined_values)
        if any(_norm(o) == _norm(value) for o in options):
            continue
        attr.predefined_values = json.dumps([*options, value])
        attr.field_type = "dropdown"
        group = db.get(CatalogAttributeGroup, attr.group_id)
        if group is not None:
            profiles.add(group.profile_id)
        added += 1
    db.flush()
    for profile_id in profiles:
        _sync_catalog_filters_for_profile(db, profile_id)
    db.flush()
    return added


def current_values(db: Session, product_id: str) -> dict[str, str]:
    """{attribute_id: value} the product already has (non-empty)."""
    return {
        v.attribute_id: v.value
        for v in db.query(CatalogProductAttributeValue).filter(
            CatalogProductAttributeValue.product_id == product_id, CatalogProductAttributeValue.value != ""
        )
    }


def filter_gaps(db: Session, product: CatalogProduct) -> list[str]:
    """Filterable fields of the product's profile that still have no value."""
    if not product.attribute_profile_id:
        return []
    have = {
        v.attribute_id
        for v in db.query(CatalogProductAttributeValue).filter(
            CatalogProductAttributeValue.product_id == product.id, CatalogProductAttributeValue.value != ""
        )
    }
    return [
        f"{f['group']} > {f['name']}"
        for f in profile_fields(db, product.attribute_profile_id)
        if f.get("filterable") and f["id"] not in have
    ]


def fill_product(
    db: Session, product: CatalogProduct, profile: CatalogAttributeProfile, values: dict[str, str], *, overwrite: bool = False
) -> int:
    """Link the product to the profile and write the values. Existing values are kept unless
    `overwrite`. Returns how many values were written. Caller commits."""
    product.attribute_profile_id = profile.id
    existing = {
        v.attribute_id: v
        for v in db.query(CatalogProductAttributeValue).filter(CatalogProductAttributeValue.product_id == product.id).all()
    }
    written = 0
    for idx, (attr_id, value) in enumerate(values.items()):
        row = existing.get(attr_id)
        if row is not None:
            if row.value.strip() and not overwrite:
                continue
            row.value = value
        else:
            db.add(
                CatalogProductAttributeValue(
                    company_id=product.company_id or "default",
                    product_id=product.id,
                    attribute_id=attr_id,
                    value=value,
                    sort_order=idx,
                )
            )
        written += 1
    db.flush()
    return written


def filled_count(db: Session, product_id: str) -> int:
    return (
        db.query(CatalogProductAttributeValue)
        .filter(CatalogProductAttributeValue.product_id == product_id, CatalogProductAttributeValue.value != "")
        .count()
    )


# ------------------------------------------------------------------------------ new profile


def propose_profile(name: str, specs: SourceSpecs) -> dict:
    """A new profile's structure from the source spec groups — group/field names only."""
    groups: list[dict] = []
    for g in _clean_specs(specs)[:MAX_GROUPS]:
        seen: set[str] = set()
        attrs: list[str] = []
        for i in g["items"]:
            code = slugify_code(i["label"])
            if code in seen:
                continue
            seen.add(code)
            attrs.append(i["label"][:255])
            if len(attrs) >= MAX_ATTRS_PER_GROUP:
                break
        existing = next((x for x in groups if slugify_code(x["name"]) == slugify_code(g["group"])), None)
        if existing:
            existing["attributes"] += [a for a in attrs if slugify_code(a) not in {slugify_code(b) for b in existing["attributes"]}]
        else:
            groups.append({"name": g["group"][:255], "attributes": attrs})
    if len(groups) == 1 and slugify_code(groups[0]["name"]) != "specifications":
        groups[0]["name"] = "Specifications"  # one lone group is named after the product subtitle on some shops
    return {"name": name.strip()[:255] or "General", "groups": groups}


KEY_FEATURE_GROUP = "Others"  # the group of the source filters no attribute names; "Key Feature" before 2026-10-18 (that name is
#                                the storefront's key-feature list, which these filters are not part of)
_LEGACY_KEY_FEATURE_GROUP = "Key Feature"


def _filter_matches_label(title: str, label: str) -> bool:
    return bool(_label_words(title) & _label_words(label))


def unmatched_filters(fields: list[dict], source_filters: list[dict]) -> list[dict]:
    """The source shop's filters (>= 2 options) that NO attribute of the profile names - each becomes an attribute of the
    "Key Feature" group (multi-select, filterable, the shop's options as its predefined values)."""
    out: list[dict] = []
    for f in source_filters or []:
        title, options = str(f.get("title") or "").strip(), [str(o) for o in f.get("options") or []]
        if len(options) < 2 or not title:
            continue
        if any(_filter_matches_label(title, fld["name"]) for fld in fields):
            continue
        out.append({"title": title[:255], "options": options})
    return out


def attach_source_filters(proposal: dict, specs: SourceSpecs, source_filters: list[dict]) -> dict:
    """Make the proposal's attributes filterable from the SOURCE shop's own filters (its category page): a source filter
    ("Wi-Fi Standard": Wi-Fi 6 / Wi-Fi 5 ...) belongs to the attribute whose label shares a meaningful word with it. The
    attribute gets the filter's options (as the shop writes them) as its predefined values. A filter that no source row
    names (e.g. "Key Feature": Curved / HDR / ...) becomes an attribute of the "Key Feature" group - multi-select, since a
    product can have several of them. Returns the proposal with `filters` {attribute label: [options]} and `multi`
    (the attribute labels that are multi-select)."""
    labels = [a for g in proposal.get("groups", []) for a in g["attributes"]]
    taken: set[str] = set()
    filters: dict[str, list[str]] = {}
    extra: list[tuple[str, list[str]]] = []
    for f in source_filters or []:
        title, options = str(f.get("title") or ""), [str(o) for o in f.get("options") or []]
        if len(options) < 2:
            continue
        best: Optional[str] = None
        for label in labels:
            if label not in taken and _filter_matches_label(title, label):
                best = label
                break
        if best:
            taken.add(best)
            filters[best] = options
        elif title and title not in labels:
            extra.append((title[:255], options))
    groups = [dict(g) for g in proposal.get("groups", [])]
    multi: list[str] = []
    if extra:
        groups.append({"name": KEY_FEATURE_GROUP, "attributes": [t_ for t_, _ in extra]})
        filters.update({t_: o_ for t_, o_ in extra})
        multi = [t_ for t_, _ in extra]
    return {**proposal, "groups": groups, "filters": filters, "multi": multi}


def extend_profile_with_filters(db: Session, profile: CatalogAttributeProfile, unmatched: list[dict]) -> int:
    """Add the unmatched source filters to an EXISTING profile as attributes of its "Key Feature" group (the group is
    created when missing). Saved through the admin editor's own structure save, which updates in place - every product's
    saved values stay. Returns how many attributes were added. Caller commits."""
    from app.routers.catalog_attribute_profiles import _replace_profile_structure

    if not unmatched:
        return 0
    groups = (
        db.query(CatalogAttributeGroup)
        .filter(CatalogAttributeGroup.profile_id == profile.id, CatalogAttributeGroup.is_active.is_(True))
        .order_by(CatalogAttributeGroup.sort_order)
        .all()
    )
    items: list[BulkAttributeGroupItem] = []
    key_item: Optional[BulkAttributeGroupItem] = None
    for g in groups:
        attrs = (
            db.query(CatalogAttribute)
            .filter(CatalogAttribute.group_id == g.id, CatalogAttribute.is_active.is_(True))
            .order_by(CatalogAttribute.sort_order)
            .all()
        )
        item = BulkAttributeGroupItem(
            id=g.id,
            name=g.name,
            attributes=[
                BulkAttributeItem(
                    id=a.id, name=a.name, field_type=a.field_type, filterable=bool(a.is_filterable),
                    filter_display_type=a.filter_display_type, storefront_filter_visible=bool(a.storefront_filter_visible),
                    predefined_values=parse_json_list(a.predefined_values),
                )
                for a in attrs
            ],
        )
        items.append(item)
        if slugify_code(g.name) in (slugify_code(KEY_FEATURE_GROUP), slugify_code(_LEGACY_KEY_FEATURE_GROUP)):
            key_item = item
    if key_item is None:
        key_item = BulkAttributeGroupItem(name=KEY_FEATURE_GROUP, attributes=[])
        items.append(key_item)
    have = {slugify_code(a.name) for it in items for a in it.attributes}
    added = 0
    for f in unmatched:
        if slugify_code(f["title"]) in have:
            continue
        key_item.attributes.append(
            BulkAttributeItem(name=f["title"], field_type="multi_select", filterable=True, predefined_values=list(f["options"]))
        )
        have.add(slugify_code(f["title"]))
        added += 1
    if added:
        _replace_profile_structure(db, profile.id, AttributeProfileBulkSaveRequest(profile_name=profile.name, groups=items))
        db.flush()
    return added


def fill_multi_select(db: Session, product: CatalogProduct, profile: CatalogAttributeProfile, specs: SourceSpecs, extra_text: str = "") -> int:
    """The profile's multi-select filter attributes (Key Feature ...): the product gets EVERY option the source says about
    it - option text found in its spec rows / title, whole words only (stored comma-separated, like the admin editor)."""
    fields = [f for f in profile_fields(db, profile.id) if f.get("field_type") == "multi_select" and f["options"]]
    if not fields:
        return 0
    blob = _canon_text(" ; ".join([extra_text,*[f"{i['label']} {i['value']}" for g in _clean_specs(specs) for i in g["items"]]]))
    values: dict[str, str] = {}
    for f in fields:
        hits = []
        for option in f["options"]:
            pat = _option_pattern(option)
            if pat is not None and pat.search(blob):
                hits.append(option)
        if hits:
            values[f["id"]] = ",".join(hits)
    return fill_product(db, product, profile, values, overwrite=False) if values else 0


def create_profile(db: Session, *, company_id: str, proposal: dict, category_labels: list[str]) -> CatalogAttributeProfile:
    """Create the proposed profile the same way the admin bulk-create endpoint does. Caller commits."""
    from app.routers.catalog_attribute_profiles import (
        _next_sort_order,
        _replace_profile_structure,
        _unique_profile_code,
    )

    payload = AttributeProfileBulkSaveRequest(
        profile_name=proposal["name"],
        groups=[
            BulkAttributeGroupItem(
                name=g["name"],
                attributes=[
                    BulkAttributeItem(
                        name=a,
                        field_type="multi_select" if a in (proposal.get("multi") or []) else None,
                        filterable=a in (proposal.get("filters") or {}),
                        predefined_values=list((proposal.get("filters") or {}).get(a, [])),
                    )
                    for a in g["attributes"]
                ],
            )
            for g in proposal["groups"]
        ],
    )
    row = CatalogAttributeProfile(
        company_id=company_id,
        name=payload.profile_name,
        code=_unique_profile_code(db, slugify_code(payload.profile_name)),
        sort_order=_next_sort_order(db),
        is_active=True,
        category_labels=dump_json_list([c for c in category_labels if c][:10]),
        description="Created by Aladin from a product's source specifications.",
    )
    db.add(row)
    db.flush()
    _replace_profile_structure(db, row.id, payload)
    db.flush()
    return row


FIT_MIN = 0.5  # a profile is used only when at least half of the source rows are attributes it already has


def profile_fit(db: Session, profile: CatalogAttributeProfile, specs: SourceSpecs) -> float:
    """Share of the source rows (by label) that the profile has an attribute for."""
    cleaned = _clean_specs(specs)
    total = sum(len(g["items"]) for g in cleaned)
    if not total:
        return 0.0
    return len(exact_values(cleaned, profile_fields(db, profile.id))) / total


def find_profile_by_specs(db: Session, specs: SourceSpecs) -> Optional[CatalogAttributeProfile]:
    """The active profile that best fits the source table (>= 3 label hits and >= FIT_MIN of the rows), else None."""
    best: tuple[float, Optional[CatalogAttributeProfile]] = (0.0, None)
    for profile in db.query(CatalogAttributeProfile).filter(CatalogAttributeProfile.is_active.is_(True)).all():
        fit = profile_fit(db, profile, specs)
        hits = round(fit * sum(len(g["items"]) for g in _clean_specs(specs)))
        if hits >= 3 and fit >= FIT_MIN and fit > best[0]:
            best = (fit, profile)
    return best[1]


def _leftover_custom_json(db: Session, profile_id: str, specs: SourceSpecs, used: Optional[set[str]] = None) -> Optional[str]:
    """The source rows the profile has NO attribute for, as this product's custom specs - same groups, source order.
    `used`: normalised labels of rows a profile attribute already took under its own name (CPU <- Processor Model)."""
    names = {_norm(f["name"]) for f in profile_fields(db, profile_id)} | (used or set())
    groups, attrs = [], []
    prev: Optional[str] = ""  # "" = the first group of the source
    for gi, g in enumerate(_clean_specs(specs)):
        rest = [i for i in g["items"] if _norm(i["label"]) not in names]
        before, prev = prev, g["group"]
        if not rest:
            continue
        groups.append({"id": f"ai-{gi}", "name": g["group"], "after": before})  # `after`: the source group just before this one
        attrs += [{"id": f"ai-attr-{gi}-{ii}", "groupId": f"ai-{gi}", "name": i["label"], "value": i["value"]} for ii, i in enumerate(rest)]
    return json.dumps({"customGroups": groups, "customAttrs": attrs}) if attrs else None


def apply_from_source(
    db: Session,
    company_id: Optional[str],
    product: CatalogProduct,
    specs: SourceSpecs,
    *,
    replace: bool = False,
    create_profile_if_missing: bool = False,
    source_filters: Optional[list[dict]] = None,
    extend_profile: bool = False,
    profile_choice: Optional[str] = None,
) -> Optional[dict]:
    """Import-time hook (rule A11). The specifications follow the SOURCE table: every row, in the source's order.
    A specification profile is used only when it really fits (the product's category profile, else the best match;
    >= FIT_MIN of the rows are its attributes) - then its common attributes are filled, filterable ones get their
    predefined option (added when missing), and the rows it has no attribute for stay as this product's custom specs.
    No fitting profile -> no profile: all rows stay as custom specs in source order. `replace` (re-filling a draft)
    first clears the product's earlier AI-made values/profile. Never raises."""
    if not spec_item_count(specs):
        return None
    try:
        if replace:
            db.query(CatalogProductAttributeValue).filter(CatalogProductAttributeValue.product_id == product.id).delete()
            product.attribute_profile_id = None
        # The profile is the product TYPE's: chosen by the product's category. A table-based guess is only for a product
        # with no category at all (it picked wrong profiles - a router filled into "Earbuds").
        if profile_choice == "none":  # the admin chose "no profile": every source row stays a custom spec of this product
            product.attribute_profile_id = None
            db.commit()
            return None
        if profile_choice == "new":
            create_profile_if_missing = True
        profile = find_profile(db, product=product)
        if profile_choice and profile_choice not in ("new", "none"):  # the admin picked a profile in the review
            profile = db.get(CatalogAttributeProfile, profile_choice) or profile
        has_category = bool(_category_names(db, product))
        if profile is None and not has_category:
            profile = find_profile_by_specs(db, specs)
        created = False
        if profile is None and create_profile_if_missing and has_category:
            names = _category_names(db, product)
            proposal = attach_source_filters(propose_profile(names[0], specs), specs, source_filters or [])
            profile = create_profile(db, company_id=company_id or "default", proposal=proposal, category_labels=names[:3])
            created = True
        if profile is None:
            db.commit()
            return None
        fields = profile_fields(db, profile.id)
        key_added = 0
        if extend_profile and not created and source_filters:
            # the source shop's filters no attribute of the profile names -> its "Key Feature" group (approved by the user)
            key_added = extend_profile_with_filters(db, profile, unmatched_filters(fields, source_filters))
            if key_added:
                fields = profile_fields(db, profile.id)
        # the profile is the product TYPE's (its category): every attribute is answered by the source row that means the same,
        # whatever that shop calls it - the attribute keeps its name, the value goes in, no second attribute is made
        values, off, source_of = map_values_traced(db, company_id, specs, fields)
        filterable_off = {fid: v for fid, v in off.items() if next((f for f in fields if f["id"] == fid), {}).get("filterable")}
        added = add_options(db, filterable_off) if filterable_off else 0
        for fid, v in filterable_off.items():
            values[fid] = v
        fill_product(db, product, profile, values, overwrite=replace)
        multi = fill_multi_select(db, product, profile, specs, extra_text=product.name or "")
        product.custom_specs_json = _leftover_custom_json(db, profile.id, specs, {source_of[fid] for fid in values if fid in source_of})
        db.commit()
        return {"profile": profile.name, "filled": len(values) + multi, "fields": len(fields), "options_added": added, "created": created, "key_feature_added": key_added}
    except Exception:  # noqa: BLE001
        db.rollback()
        return None
