"""Engine of scripts/tidy_spec_profile.py: tidies one specification profile (see that script for the why).

Per product of the profile:
  * standard spec fields: the profile's synonyms merged ("USB", "USB (s)", "USB Ports" → USB). The fields come
    from the profile's rules, or — without rules — from the imported field names themselves: names that only
    differ in spelling are one field, and a field is kept when enough of the profile's products use it
  * the other specs stay on the product alone (custom_specs_json → "More Specifications", "this product only")
  * shop filters: each product's value derived from its old filter value, its name and its specs into one
    clean option list (rules), or — without rules — the profile's own filters with their spellings merged
  * the profile's other fields go, filters that belong to other product types included
"""
from __future__ import annotations

import html
import json
import math
import re
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence, Union

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_filter import CatalogFilter
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.services.catalog_filter_sync import sync_attribute_filters

MORE_GROUP = {"id": "more-specs", "name": "More Specifications"}
KEY_GROUP = "Key Specifications"


# ── text ─────────────────────────────────────────────────────────────────────

def clean(raw: str | None) -> str:
    """Imported HTML-ish text → plain lines."""
    s = html.unescape(raw or "")
    s = re.sub(r"<\s*br\s*/?\s*>|</p>|</li>|</div>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    lines = [re.sub(r"[ \t ]+", " ", ln).strip(" -•\t") for ln in s.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def compact(s: str) -> str:
    """Spelling-blind key: "8 GB" = "8gb", "Tempered-Glass" = "tempered glass"."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


NEGATIVE = re.compile(r"^\s*(no|none|n/?a|not\b|without|nil|0|-|×|✗)", re.I)

TYPOS = {"intrernal": "internal", "mamory": "memory", "tempared": "tempered", "platinam": "platinum",
         "conectivity": "connectivity", "warrenty": "warranty", "dimention": "dimension", "colour": "color"}


def cluster_key(name: str) -> str:
    """Field names that only differ in spelling share a key: "USB Port(s)" = "USB Ports" = "usb port"."""
    words = [TYPOS.get(w, w) for w in norm_name(name).split()]
    if words and words[-1] == "s":
        words = words[:-1]
    words = [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]
    return " ".join(words)


# ── a product as the rules see it ────────────────────────────────────────────

@dataclass
class Product:
    name: str
    by_field: dict[str, list[tuple[str, str]]]  # normalised field name → [(field name, cleaned value)]
    filters: dict[str, list[str]] = field(default_factory=dict)  # old filter code → its values

    def text(self, *patterns: str, positive: bool = False) -> str:
        """Values of the fields whose normalised name matches any pattern (positive: not "No", "None"…)."""
        out = []
        for key, items in self.by_field.items():
            if any(re.search(p, key) for p in patterns):
                out.extend(v for _, v in items if not (positive and NEGATIVE.match(v)))
        return "\n".join(out)

    def all_text(self) -> str:
        return "\n".join(v for items in self.by_field.values() for _, v in items)


# ── rules ────────────────────────────────────────────────────────────────────

@dataclass
class TextField:
    """A standard spec field and the imported field names that feed it (regexes on the normalised name)."""
    name: str
    names: list[str]


Derive = Callable[[Product], list[str]]


@dataclass
class Filter:
    """A shop filter: its attribute code (the URL parameter), label, options in display order (None: the values
    found, ordered by sort_key) and how a product's values are found."""
    code: str
    name: str
    options: Optional[list[str]]
    derive: Derive
    sources: list[str] = field(default_factory=list)  # imported field names only used to derive it
    sort_key: Optional[Callable[[str], object]] = None


@dataclass
class Rules:
    filters: Optional[list[Filter]] = None  # None: the profile's own filters, spellings merged
    groups: Optional[list[tuple[str, list[TextField]]]] = None  # None: fields shared by min_share of the products
    min_share: float = 0.10


# ── the small vocabulary filters are written in ──────────────────────────────

Option = Union[str, tuple]  # "Label" (matched as a word) or ("Label", r"regex", …)


def _compile(options: Sequence[Option]) -> list[tuple[str, re.Pattern]]:
    out = []
    for o in options:
        if isinstance(o, tuple):
            label, *rx = o
        else:
            label, rx = o, [r"(?<![a-z0-9])" + re.escape(o.lower()) + r"(?![a-z0-9])"]
        out.append((label, re.compile("|".join(f"(?:{r})" for r in rx), re.I)))
    return out


def labels(options: Sequence[Option]) -> list[str]:
    return [o[0] if isinstance(o, tuple) else o for o in options]


Source = Callable[[Product], Union[str, list[str]]]
NAME: Source = lambda p: p.name  # noqa: E731
ALL: Source = lambda p: p.all_text()  # noqa: E731


def EX(code: str) -> Source:
    """The product's old filter value(s) of that code."""
    return lambda p: p.filters.get(code, [])


def SPEC(*fields: str, positive: bool = True) -> Source:
    """Spec fields whose normalised name matches (values like "No" / "None" skipped)."""
    return lambda p: p.text(*fields, positive=positive)


def _texts(src: Source, p: Product) -> list[str]:
    got = src(p)
    return [t for t in (got if isinstance(got, list) else [got]) if t]


def pick(options: Sequence[Option], *sources: Source, multi: bool = False, check: Sequence[str] = (),
         when: Optional[Callable[[Product], bool]] = None) -> Derive:
    """Options found in the sources. One value: the first source with a match decides, its options tried in
    `check` order first. Several values (multi): every option any source mentions."""
    compiled = _compile(options)
    order = [c for c in compiled if c[0] in check] + [c for c in compiled if c[0] not in check]

    def derive(p: Product) -> list[str]:
        if when and not when(p):
            return []
        found: list[str] = []
        for src in sources:
            for text in _texts(src, p):
                hits = [lab for lab, rx in order if rx.search(text)]
                if hits and not multi:
                    return [hits[0]]
                found += [h for h in hits if h not in found]
        return [lab for lab, _ in compiled if lab in found]

    return derive


NUM = r"(\d+(?:[.,]\d+)?)"


def number(*sources: Source, rx: str, to_label: Callable[[float, re.Match], Optional[str]],
           when: Optional[Callable[[Product], bool]] = None) -> Derive:
    """The first number `rx` finds in the sources (its group 1, "1,200" → 1200), as an option."""
    pattern = re.compile(rx, re.I)

    def derive(p: Product) -> list[str]:
        if when and not when(p):
            return []
        for src in sources:
            for text in _texts(src, p):
                for m in pattern.finditer(text):
                    try:
                        n = float(m.group(1).replace(",", ""))
                    except (TypeError, ValueError):
                        continue
                    label = to_label(n, m)
                    if label:
                        return [label]
        return []

    return derive


def buckets(*bands: tuple[float, str], above: Optional[str] = None) -> Callable[[float, re.Match], Optional[str]]:
    """n → the first band whose upper bound it doesn't pass ((500, "Up to 500W"), (799, "500-799W") …)."""
    def to_label(n: float, _m=None) -> Optional[str]:
        for upper, label in bands:
            if n <= upper:
                return label
        return above
    return to_label


def exact(table: dict[float, str]) -> Callable[[float, re.Match], Optional[str]]:
    """n → its label when it is one of the known values."""
    return lambda n, _m=None: table.get(n)


def first(*derivers: Derive) -> Derive:
    def derive(p: Product) -> list[str]:
        for d in derivers:
            got = d(p)
            if got:
                return got
        return []
    return derive


def union(order: Sequence[str], *derivers: Derive) -> Derive:
    def derive(p: Product) -> list[str]:
        got = {v for d in derivers for v in d(p)}
        return [o for o in order if o in got] + sorted(got - set(order))
    return derive


def F(code: str, name: str, options: Optional[Sequence[Option]], derive: Derive, sources: Sequence[str] = (),
      sort_key=None) -> Filter:
    return Filter(code, name, labels(options) if options is not None else None, derive, list(sources), sort_key)


def num_key(v: str):
    """Sort "1TB" after "512GB", "16 Cores" after "8 Cores"."""
    m = re.search(r"(\d+(?:\.\d+)?)", v)
    n = float(m.group(1)) if m else 0
    if re.search(r"\d\s*TB", v, re.I):
        n *= 1000
    return (n, v)


# ── engine ───────────────────────────────────────────────────────────────────

def run(db, profile_code: str, rules: Rules, apply: bool, missing: Optional[str] = None, quiet: bool = False,
        show: Optional[str] = None) -> dict:
    profile = db.query(CatalogAttributeProfile).filter(CatalogAttributeProfile.code == profile_code).one()
    groups = db.query(CatalogAttributeGroup).filter(CatalogAttributeGroup.profile_id == profile.id).all()
    group_by_id = {g.id: g for g in groups}
    attrs = db.query(CatalogAttribute).filter(CatalogAttribute.group_id.in_([g.id for g in groups])).all() if groups else []
    attr_by_id = {a.id: a for a in attrs}
    products = db.query(CatalogProduct).filter(CatalogProduct.attribute_profile_id == profile.id).all()
    n = len(products)
    values = (
        db.query(CatalogProductAttributeValue)
        .filter(CatalogProductAttributeValue.product_id.in_([p.id for p in products]),
                CatalogProductAttributeValue.attribute_id.in_(list(attr_by_id)))
        .all()
    ) if products and attrs else []
    by_product: dict[str, list[tuple[CatalogAttribute, str]]] = defaultdict(list)
    coverage: Counter = Counter()
    for v in values:
        cleaned = clean(v.value)
        if cleaned:
            by_product[v.product_id].append((attr_by_id[v.attribute_id], cleaned))
    for pid, items in by_product.items():
        for a in {a.id for a, _ in items}:
            coverage[a] += 1

    # filters: the rules', or the profile's own (spellings merged)
    filters = rules.filters if rules.filters is not None else _auto_filters(attrs, by_product, coverage, n)
    filter_codes = {f.code for f in filters}

    # text fields: the rules', or the imported names shared by enough products
    def routed_to_filter(a: CatalogAttribute) -> Optional[Filter]:
        key = norm_name(a.name)
        return next((f for f in filters if any(re.search(p, key) for p in f.sources)), None)

    # an old filter no new filter replaces stays a spec (or the product's own) in automatic layouts, so nothing it
    # said is lost; with a hand-written layout old filters are only hints for the new ones
    def old_filter_only(a: CatalogAttribute) -> bool:
        return a.is_filterable and (a.code in filter_codes or rules.groups is not None)

    text_candidates = [a for a in attrs if not old_filter_only(a) and not routed_to_filter(a)]
    if rules.groups is not None:
        layout = rules.groups
    else:
        layout = _auto_layout(text_candidates, group_by_id, by_product, n, rules.min_share)
    text_fields = [(gname, tf) for gname, tfs in layout for tf in tfs]

    def route(a: CatalogAttribute):
        if old_filter_only(a):
            return ("drop", None)  # an old filter: a hint for the new ones
        f = routed_to_filter(a)
        if f:
            return ("filter", f)
        key = norm_name(a.name)
        ck = cluster_key(a.name)
        for _, tf in text_fields:
            if key == norm_name(tf.name) or ck == cluster_key(tf.name) or any(re.search(p, key) for p in tf.names):
                return ("text", tf)
        return ("own", None)

    routes = {a.id: route(a) for a in attrs}

    plan: dict[str, dict] = {}
    report: Counter = Counter()
    own_names: Counter = Counter()
    shown = 0
    for prod in products:
        fields: dict[str, list[tuple[str, str]]] = defaultdict(list)
        old_filters: dict[str, list[str]] = defaultdict(list)
        texts: dict[str, list[tuple[str, str]]] = defaultdict(list)
        own: list[tuple[str, str]] = []
        for a, val in by_product.get(prod.id, []):
            fields[norm_name(a.name)].append((a.name, val))
            if a.is_filterable:
                old_filters[a.code] += [p.strip() for p in val.split(",") if p.strip()]
            kind, target = routes[a.id]
            if kind == "text":
                texts[target.name].append((a.name, val))
            elif kind == "own":
                own.append((a.name, val))
                own_names[a.name] += 1
        view = Product(name=prod.name or "", by_field=fields, filters=old_filters)
        merged = {}
        for tf_name, items in texts.items():
            seen, lines = set(), []
            for src, val in items:
                if val.lower() not in seen:
                    seen.add(val.lower())
                    lines.append((src, val))
            merged[tf_name] = lines[0][1] if len(lines) == 1 else "\n".join(
                val if val.lower().startswith(src.lower()) else f"{src}: {val}" for src, val in lines)
        derived = {f.code: f.derive(view) for f in filters}
        for f in filters:
            report[f"filter:{f.code}"] += bool(derived[f.code])
        if show and show in derived and shown < 15 and hash(prod.id) % 7 == 0:
            shown += 1
            print(f"  {show} = {derived[show]}  ← {view.name[:80]} | old: {view.filters.get(show, [])}")
        if missing and missing in derived and not derived[missing] and shown < 15:
            shown += 1
            print(f"  no {missing}: {view.name[:70]} | {view.all_text()[:240]!r}")
        report["own_values"] += len(own)
        report["products_with_own"] += bool(own)
        plan[prod.id] = {"texts": merged, "filters": derived, "own": own}

    # the options each filter offers
    options: dict[str, list[str]] = {}
    for f in filters:
        if f.options is not None:
            options[f.code] = list(f.options)
        else:
            found = {v for pl in plan.values() for v in pl["filters"][f.code]}
            options[f.code] = sorted(found, key=f.sort_key or num_key)

    summary = {"profile": profile_code, "name": profile.name, "products": n, "fields_before": len(attrs),
               "filters": {f.name: report[f"filter:{f.code}"] for f in filters},
               "spec_fields": len(text_fields), "own_values": report["own_values"]}
    if not quiet:
        print(f"{profile.name} ({profile_code}): {n} products, {len(attrs)} fields in {len(groups)} groups")
        print(f"  → {len(filters)} filters + {len(text_fields)} spec fields in {len(layout) + 1} groups")
        for f in filters:
            dist = Counter(v for pl in plan.values() for v in pl["filters"][f.code])
            print(f"  filter {f.name} [{f.code}]: {report[f'filter:{f.code}']}/{n}  {dict(dist.most_common(10))}")
        print(f"  spec fields: {', '.join(tf.name for _, tf in text_fields)}")
        print(f"  product-only: {report['own_values']} values on {report['products_with_own']} products "
              f"(top: {', '.join(nm for nm, _ in own_names.most_common(8))})")
    if not apply:
        return summary

    # 1. groups: key specifications first, then the layout's, reused by name
    group_ids: dict[str, str] = {}
    for i, gname in enumerate(([KEY_GROUP] if filters else []) + [g for g, _ in layout]):
        g = next((g for g in groups if g.name == gname), None)
        if g is None:
            g = CatalogAttributeGroup(profile_id=profile.id, name=gname, code=slug(gname) or f"group_{i}", sort_order=i,
                                      is_active=True)
            db.add(g)
            db.flush()
        g.sort_order, g.is_active = i, True
        group_ids[gname] = g.id

    # 2. one filter attribute per code (the profile's existing one when there is), visible as a spec too
    kept: dict[str, CatalogAttribute] = {}
    for i, f in enumerate(filters):
        a = next((a for a in attrs if a.code == f.code and a.is_filterable), None)
        if a is None:
            a = CatalogAttribute(group_id=group_ids[KEY_GROUP], code=f.code, name=f.name)
            db.add(a)
        a.group_id, a.name, a.sort_order = group_ids[KEY_GROUP], f.name, i
        a.field_type = "multi_select"
        a.is_filterable = a.is_visible = a.is_active = a.is_comparable = True
        a.storefront_filter_visible = True
        a.filter_display_type = "multi_select"
        a.predefined_values = json.dumps(options[f.code], ensure_ascii=False)
        db.flush()
        kept[f"filter:{f.code}"] = a

    # 3. one attribute per standard spec field
    used_codes: set[str] = set()
    for gname, tf in text_fields:
        code = f"{profile_code}_{slug(tf.name)}"[:100]
        while code in used_codes:
            code = code[:96] + f"_{len(used_codes)}"
        used_codes.add(code)
        a = next((a for a in attrs if a.code == code and not a.is_filterable), None)
        if a is None:
            a = CatalogAttribute(group_id=group_ids[gname], code=code, name=tf.name)
            db.add(a)
        a.group_id, a.name = group_ids[gname], tf.name
        a.sort_order = [t.name for g2, t in text_fields if g2 == gname].index(tf.name)
        a.field_type = "text"
        a.is_filterable = False
        a.is_visible = a.is_active = True
        a.predefined_values = "[]"
        db.flush()
        kept[f"text:{tf.name}"] = a
    kept_ids = {a.id for a in kept.values()}

    # 4. each product: its values replaced by the merged / derived ones, the rest kept on the product
    db.query(CatalogProductAttributeValue).filter(
        CatalogProductAttributeValue.product_id.in_([p.id for p in products]),
        CatalogProductAttributeValue.attribute_id.in_(list(attr_by_id) + list(kept_ids)),
    ).delete(synchronize_session=False)
    for prod in products:
        pl = plan[prod.id]
        for f in filters:
            if pl["filters"][f.code]:
                db.add(CatalogProductAttributeValue(product_id=prod.id, attribute_id=kept[f"filter:{f.code}"].id,
                                                    value=",".join(pl["filters"][f.code])))
        for _, tf in text_fields:
            if pl["texts"].get(tf.name):
                db.add(CatalogProductAttributeValue(product_id=prod.id, attribute_id=kept[f"text:{tf.name}"].id,
                                                    value=pl["texts"][tf.name]))
        if pl["own"]:
            _keep_on_product(prod, pl["own"])

    # 5. the profile's other fields and groups go; the shop's filter rows follow the attributes
    touched = {a.code for a in attrs} | filter_codes
    for a in attrs:
        if a.id not in kept_ids:
            db.delete(a)
    db.flush()
    for g in groups:
        if g.id not in group_ids.values():
            db.delete(g)
    db.flush()
    remaining = db.query(CatalogAttribute).filter(CatalogAttribute.code.in_(touched)).all()
    if remaining:
        sync_attribute_filters(db, remaining)
    gone = touched - {a.code for a in remaining}
    for row in db.query(CatalogFilter).filter(CatalogFilter.param_key.in_(gone), CatalogFilter.source == "attribute"):
        row.is_active = row.storefront_visible = False
    for f in filters:  # the filter's shop label (one per code, shared by the product types using it)
        row = db.query(CatalogFilter).filter(CatalogFilter.param_key == f.code).first()
        if row is not None and row.source == "attribute":
            row.name = f.name
    db.commit()
    if not quiet:
        print("  applied")
    return summary


def _keep_on_product(prod: CatalogProduct, own: list[tuple[str, str]]) -> None:
    """Specs no standard field covers → the product's own "More Specifications" (kept with any already there)."""
    try:
        specs = json.loads(prod.custom_specs_json) if prod.custom_specs_json else {}
    except json.JSONDecodeError:
        specs = {}
    if not isinstance(specs, dict):
        specs = {}
    groups_json = [g for g in specs.get("customGroups") or [] if isinstance(g, dict)]
    attrs_json = [a for a in specs.get("customAttrs") or [] if isinstance(a, dict)]
    if not any(g.get("id") == MORE_GROUP["id"] for g in groups_json):
        groups_json.append(dict(MORE_GROUP))
    seen = {(str(a.get("name", "")).lower(), str(a.get("value", "")).lower()) for a in attrs_json}
    for name, val in own:
        if (name.lower(), val.lower()) in seen:
            continue
        seen.add((name.lower(), val.lower()))
        attrs_json.append({"id": f"own-{uuid.uuid4().hex[:12]}", "groupId": MORE_GROUP["id"], "name": name, "value": val})
    specs["customGroups"], specs["customAttrs"] = groups_json, attrs_json
    prod.custom_specs_json = json.dumps(specs, ensure_ascii=False)


def _auto_layout(candidates: list[CatalogAttribute], group_by_id: dict, by_product: dict, n: int,
                 min_share: float) -> list[tuple[str, list[TextField]]]:
    """Fields for a profile without rules: imported names merged by spelling, kept when at least min_share of the
    products (and 2) use them; each in the group most of its names were in."""
    ids = {a.id for a in candidates}
    users: dict[str, set] = defaultdict(set)
    names: dict[str, Counter] = defaultdict(Counter)
    groups: dict[str, Counter] = defaultdict(Counter)
    for pid, items in by_product.items():
        for a, _ in items:
            if a.id in ids:
                ck = cluster_key(a.name)
                users[ck].add(pid)
                names[ck][a.name] += 1
                groups[ck][group_by_id[a.group_id].name if a.group_id in group_by_id else "Specifications"] += 1
    need = max(2, math.ceil(min_share * n))
    common = sorted((ck for ck in users if len(users[ck]) >= need), key=lambda ck: -len(users[ck]))
    group_order = [g.name for g in sorted(group_by_id.values(), key=lambda g: g.sort_order)]
    layout: dict[str, list[TextField]] = defaultdict(list)
    used_names: set[str] = set()
    for ck in common:
        label = names[ck].most_common(1)[0][0].strip()
        if label.isupper() and len(label) > 4:
            label = label.title()
        if norm_name(label) in used_names:
            continue
        used_names.add(norm_name(label))
        gname = groups[ck].most_common(1)[0][0]
        if gname == KEY_GROUP:
            gname = "Specifications"
        layout[gname].append(TextField(label, []))
    ordered = sorted(layout.items(), key=lambda kv: (
        kv[0].lower().startswith("warrant"),
        group_order.index(kv[0]) if kv[0] in group_order else len(group_order)))
    return [(g, tfs) for g, tfs in ordered]


def _auto_filters(attrs: list[CatalogAttribute], by_product: dict, coverage: Counter, n: int) -> list[Filter]:
    """Filters for a profile without rules: its own filters that enough products use (5%, 3), each option spelled
    one way (the filter's own spelling first), missing values found in the product name."""
    need = max(3, math.ceil(0.10 * n))
    out: list[Filter] = []
    for a in sorted((a for a in attrs if a.is_filterable and coverage[a.id] >= need), key=lambda a: -coverage[a.id]):
        if any(f.code == a.code for f in out):
            continue
        counts: Counter = Counter()
        spelled: dict[str, str] = {}
        for opt in json.loads(a.predefined_values or "[]") if (a.predefined_values or "").startswith("[") else []:
            if isinstance(opt, str) and opt.strip():
                spelled.setdefault(compact(opt), opt.strip())
        for items in by_product.values():
            for at, val in items:
                if at.id == a.id:
                    for part in {p.strip() for p in val.split(",") if p.strip()}:
                        counts[compact(part)] += 1
                        spelled.setdefault(compact(part), part)
        opts = [spelled[k] for k, c in counts.most_common() if c >= 2]
        # a filter is a short list of short choices that covers most products having a value ("Up to 1000 DPI"),
        # not free text ("30 ppm/ 60 ipm (Color mode, 200 & 300 dpi, A4)")
        with_value = sum(1 for items in by_product.values() if any(at.id == a.id for at, _ in items))
        covered = sum(c for k, c in counts.items() if spelled[k] in opts)
        if (len(opts) < 2 or len(opts) > 20 or any(len(o) > 30 or o.count("(") != o.count(")") for o in opts)
                or covered < 0.7 * with_value):
            continue
        order = sorted(opts, key=num_key) if all(re.search(r"\d", o) for o in opts) else opts
        keyed = {compact(o): o for o in order}
        named = [(o, re.compile(r"(?<![a-z0-9])" + re.escape(o.lower()) + r"(?![a-z0-9])", re.I))
                 for o in order if re.search(r"[a-z]", o, re.I) and len(o) >= 3]

        def derive(p: Product, code=a.code, keyed=keyed, named=named, order=order) -> list[str]:
            got = [keyed[compact(v)] for v in p.filters.get(code, []) if compact(v) in keyed]
            if not got:
                got = [o for o, rx in named if rx.search(p.name)]
            return [o for o in order if o in set(got)]

        out.append(Filter(a.code, a.name, order, derive))
    return out
