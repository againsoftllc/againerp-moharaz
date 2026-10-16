"""Import the OpenCart (Moharaz) attribute schema and shop filters (docs/DATA_MIGRATION.md, step 3).

Input: JSON from the staging OpenCart DB with ``templates``,
``template_groups``, ``template_attributes``, ``groups``, ``attributes``,
``filter_groups``, ``filters``.

Writes
- one attribute profile per OpenCart product-type template (``oc-tpl-{id}``)
  with that template's groups and attributes. OpenCart groups/attributes are
  global, AgainERP's belong to a profile, so each is copied into every profile
  that uses it;
  Each template is extended with every attribute its products actually use
  (product → template = the template covering most of its attributes), so all
  of a product's specs live in its own profile and stay editable in the admin;
- a fallback profile "General" (``oc-tpl-general``) for products whose specs
  match no template;
- shop filters (OpenCart ``ac_filter*``) as **specifications**: in every profile whose
  products use a filter group, a filterable **multi-select** attribute — the profile's
  same-named spec when it has one (spec and filter are then one value), else a new spec
  in the profile's main group. Same-named filter groups merge, typos are fixed, "Brands"
  is skipped (brands are a built-in storefront filter). A filter keeps one code across
  profiles (``?spec=socket:AMD AM5`` on any category); one ``catalog_filters`` row per
  code orders the storefront facets like the live site.

Attribute names are normalized (entities, invisible chars, spaces, typos) and
duplicates by normalized name inside one profile group are merged; the first
source attribute id wins. ``build_schema`` is shared with the product-details
importer, which resolves OpenCart ids through it.

Usage (api container):
    python -m scripts.import_opencart_attributes /tmp/oc_attr_schema.json /tmp/oc_product_details.jsonl --reset
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_filter import CatalogFilter
from scripts.opencart_common import COMPANY_ID, clean_text, record_mapping, slugify

GENERAL = "general"

ATTRIBUTE_RENAMES = {"warrantty": "Warranty"}
# Shop filter group names as typed on the live site → shopper-facing name.
FILTER_RENAMES = {
    "wattege": "Wattage",
    "fromfactor": "Form Factor",
    "swithch type": "Switch Type",
    "sidepannel": "Side Panel",
    "specialfeature": "Special Feature",
    "readspeed": "Read Speed",
    "writespeed": "Write Speed",
    "powersupply": "Power Supply",
}
SKIP_FILTER_GROUPS = {"brands"}


def norm_name(value: str | None, renames: dict[str, str]) -> str:
    name = re.sub(r"\s+", " ", clean_text(value))
    return renames.get(name.lower(), name)


def filter_value(value: str | None) -> str:
    # The storefront splits stored filter values on commas.
    return re.sub(r"\s*,\s*", " / ", clean_text(value))


def renumber(rows: list[dict], name_key: str = "name") -> dict:
    """OpenCart order (sort_order, name) → 0..n (AgainERP sort orders are >= 0)."""
    ordered = sorted(rows, key=lambda r: (int(r.get("sort_order") or 0), (r.get(name_key) or "").lower(), r["id"]))
    return {r["id"]: i for i, r in enumerate(ordered)}


@dataclass
class Schema:
    profiles: dict[str, dict] = field(default_factory=dict)  # profile id → {name, code, sort}
    groups: dict[str, dict] = field(default_factory=dict)  # group id → {profile_id, name, code, sort}
    attributes: dict[str, dict] = field(default_factory=dict)  # attr id → {group_id, name, code, sort, ...}
    # (template key, OpenCart attribute_id) → ERP attribute id; template key is the OC template id or GENERAL
    attr_for: dict[tuple[str, int], str] = field(default_factory=dict)
    template_for: dict[int, str] = field(default_factory=dict)  # OC product_id → template key
    # shop filters: OC filter_id → (filter key, value); key = merged filter group name, lower case
    filter_value: dict[int, tuple[str, str]] = field(default_factory=dict)
    # filter key → {name, code, order, values (OpenCart order), group_ids}
    filters: dict[str, dict] = field(default_factory=dict)
    # (template key, filter key) → the profile's filterable multi-select attribute
    filter_attr: dict[tuple[str, str], str] = field(default_factory=dict)


def profile_id_for(template_key: str) -> str:
    return f"oc-tpl-{template_key}"


def type_key(value: str | None) -> str:
    """Name → comparison key, plural-insensitive ("Keyboards" = "Keyboard", "Switches" = "Switch")."""
    words = re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).split()
    out = []
    for w in words:
        if w.endswith("es") and len(w) > 4 and not w.endswith("ses"):
            w = w[:-2]
        elif w.endswith("s") and len(w) > 3:
            w = w[:-1]
        out.append(w)
    return " ".join(out)


def product_spec_attr_ids(product: dict) -> set[int]:
    return {a["attribute_id"] for a in product.get("attributes") or [] if clean_text(a.get("text"))}


def pick_template(
    product: dict,
    used: set[int],
    templates: dict[str, set[int]],
    template_by_name: dict[str, str],
    categories: dict[int, dict],
) -> str | None:
    """Product → OpenCart template (product type).

    1. The product's categories and their parents, matched to template names
       ("PC Components > Motherboard > Asus" → Motherboard); several matches
       (keyboard + mouse combos) → the one covering most of its specs.
    2. Only root-level categories ("Accessories"): the template covering at
       least half of its spec attributes.
    3. Otherwise "General". No specs and no shop filters → no profile.
    """
    if not used and not product.get("filter_ids"):
        return None
    candidates: set[str] = set()
    for cid in product.get("category_ids") or []:
        seen: set[int] = set()
        while cid and cid in categories and cid not in seen:
            seen.add(cid)
            key = template_by_name.get(type_key(categories[cid]["name"]))
            if key:
                candidates.add(key)
            cid = categories[cid]["parent_id"]
    pool = candidates or {k for k in templates if k != GENERAL}
    if not pool:
        return GENERAL
    best = max(pool, key=lambda k: (len(used & templates[k]), -len(templates[k]), -int(k)))
    if not candidates and (not used or len(used & templates[best]) * 2 < len(used)):
        return GENERAL
    return best


def build_schema(data: dict, products: list[dict]) -> Schema:
    """``products`` = the product-details rows (with ``category_ids``).

    OpenCart templates list far fewer attributes than their products actually
    use, so each template profile is extended with every attribute its products
    have — otherwise those specs would sit outside the product's profile, and
    the admin spec editor (which shows and saves only the profile's
    attributes) could not edit them."""
    s = Schema()
    groups_src = {g["id"]: g for g in data["groups"] or []}
    attrs_src = {a["id"]: a for a in data["attributes"] or []}
    group_order = renumber(list(groups_src.values()))
    categories = {c["id"]: c for c in data.get("categories") or []}

    template_attrs: dict[str, set[int]] = defaultdict(set)
    for row in data["template_attributes"] or []:
        if row["attribute_id"] in attrs_src:  # 26 rows point at deleted attributes
            template_attrs[str(row["template_id"])].add(row["attribute_id"])
    for t in data["templates"] or []:
        template_attrs.setdefault(str(t["id"]), set())
    template_by_name = {type_key(t["name"]): str(t["id"]) for t in data["templates"] or []}
    # shop filter groups → merged by name; values in OpenCart order
    fgroups = [g for g in data["filter_groups"] or [] if norm_name(g["name"], FILTER_RENAMES).lower() not in SKIP_FILTER_GROUPS]
    group_key: dict[int, str] = {}
    codes: set[str] = set()
    for g in sorted(fgroups, key=lambda g: (int(g["sort_order"] or 0), g["id"])):
        name = norm_name(g["name"], FILTER_RENAMES) or f"Filter {g['id']}"
        k = name.lower()
        group_key[g["id"]] = k
        if k not in s.filters:
            # the storefront looks a filter up by code (?spec=socket:…) — one code per filter, every profile
            code = slugify(name).replace("-", "_")[:90] or f"filter_{g['id']}"
            if code in codes:
                code = f"{code}_{g['id']}"
            codes.add(code)
            s.filters[k] = {"name": name[:255], "code": code, "order": len(s.filters), "values": [], "group_ids": []}
        s.filters[k]["group_ids"].append(g["id"])
    for f in sorted(data["filters"] or [], key=lambda f: (int(f["sort_order"] or 0), clean_text(f["name"]).lower(), f["id"])):
        k = group_key.get(f["group_id"])
        value = filter_value(f["name"])
        if not k or not value:
            continue
        s.filter_value[f["id"]] = (k, value)
        if value not in s.filters[k]["values"]:
            s.filters[k]["values"].append(value)

    # Product → template is decided on the original templates, then templates grow.
    original = {k: set(v) for k, v in template_attrs.items()}
    filters_used: dict[str, set[str]] = defaultdict(set)
    template_attrs[GENERAL] = set()
    for product in products:
        used = product_spec_attr_ids(product) & set(attrs_src)
        key = pick_template(product, used, original, template_by_name, categories)
        if key:
            s.template_for[product["product_id"]] = key
            template_attrs[key] |= used
            filters_used[key] |= {s.filter_value[f][0] for f in product.get("filter_ids") or [] if f in s.filter_value}

    templates = sorted(data["templates"] or [], key=lambda t: (int(t["sort_order"] or 0), clean_text(t["name"]).lower()))
    used_codes: set[str] = set()
    plan = [(str(t["id"]), norm_name(t["name"], {}), i) for i, t in enumerate(templates)]
    plan.append((GENERAL, "General", len(plan)))
    for key, name, sort in plan:
        pid = profile_id_for(key)
        code = f"oc-{slugify(name) or key}"
        if code in used_codes:
            code = f"{code}-{key}"
        used_codes.add(code)
        s.profiles[pid] = {"name": name, "code": code, "sort": sort}

        attr_codes: set[str] = set()
        merged: dict[tuple[int, str], str] = {}  # (OC group id, normalized name) → ERP attr id
        for oc_attr_id in sorted(template_attrs.get(key, ())):
            src = attrs_src[oc_attr_id]
            oc_group_id = src["group_id"]
            if oc_group_id not in groups_src:
                continue
            gid = f"{pid}-g{oc_group_id}"
            if gid not in s.groups:
                gname = norm_name(groups_src[oc_group_id]["name"], {}) or f"Group {oc_group_id}"
                s.groups[gid] = {
                    "profile_id": pid,
                    "name": gname,
                    "code": slugify(gname).replace("-", "_") or f"group_{oc_group_id}",
                    "sort": group_order[oc_group_id],
                }
            aname = norm_name(src["name"], ATTRIBUTE_RENAMES) or f"Attribute {oc_attr_id}"
            mkey = (oc_group_id, aname.lower())
            if mkey in merged:
                s.attr_for[(key, oc_attr_id)] = merged[mkey]
                continue
            aid = f"{pid}-a{oc_attr_id}"
            base = f"{code}_{slugify(aname).replace('-', '_')}"[:90]
            acode = base if base not in attr_codes else f"{base}_{oc_attr_id}"
            attr_codes.add(acode)
            s.attributes[aid] = {
                "group_id": gid,
                "name": aname[:255],
                "code": acode,
                "sort": (int(src.get("sort_order") or 0), aname.lower()),
                "field": "text",
                "filterable": False,
                "visible": True,
                "values": [],
            }
            merged[mkey] = aid
            s.attr_for[(key, oc_attr_id)] = aid

        # shop filters as specifications of this profile (filterable multi-select)
        own = {a["name"].lower(): aid for aid, a in s.attributes.items() if s.groups[a["group_id"]]["profile_id"] == pid}
        for fk in sorted(filters_used.get(key, ()), key=lambda k: s.filters[k]["order"]):
            f = s.filters[fk]
            aid = own.get(fk)
            if aid is None:
                # no same-named spec: a new one in the profile's main group
                groups = sorted((g for g, v in s.groups.items() if v["profile_id"] == pid), key=lambda g: s.groups[g]["sort"])
                gid = next((g for g in groups if s.groups[g]["name"].lower() == "general information"), groups[0] if groups else None)
                if gid is None:
                    gid = f"{pid}-gspec"
                    s.groups[gid] = {"profile_id": pid, "name": "Specifications", "code": "specifications", "sort": 0}
                aid = f"{pid}-f{f['group_ids'][0]}"
                s.attributes[aid] = {"group_id": gid, "name": f["name"], "sort": (10**6 + f["order"], ""), "values": []}
            s.attributes[aid].update(
                code=f["code"], field="multi_select", filterable=True, visible=True, values=list(f["values"]),
            )
            s.filter_attr[(key, fk)] = aid

    return s


def reset_old_schema(db) -> int:
    """Remove attribute profiles that did not come from OpenCart (demo/seed data)."""
    old = [r[0] for r in db.execute(text("SELECT id FROM catalog_attribute_profiles WHERE id NOT LIKE 'oc-%'"))]
    if not old:
        return 0
    db.execute(text("UPDATE catalog_products SET attribute_profile_id = NULL WHERE attribute_profile_id = ANY(:ids)"), {"ids": old})
    db.execute(text("DELETE FROM catalog_attribute_profiles WHERE id = ANY(:ids)"), {"ids": old})
    # Filter rows point at attributes without a foreign key.
    db.execute(
        text(
            "DELETE FROM catalog_filters WHERE source = 'attribute' AND attribute_id IS NOT NULL "
            "AND attribute_id NOT IN (SELECT id FROM catalog_attributes)"
        )
    )
    db.commit()
    return len(old)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("schema_path")
    parser.add_argument("details_path", help="product-details JSON lines (all products); extends templates with real usage")
    parser.add_argument("--reset", action="store_true", help="remove non-OpenCart attribute profiles first")
    args = parser.parse_args()

    with open(args.schema_path, encoding="utf-8") as fh:
        data = json.load(fh)
    with open(args.details_path, encoding="utf-8") as fh:
        products = [json.loads(line) for line in fh if line.strip()]
    schema = build_schema(data, products)

    db = SessionLocal()
    stats: dict[str, int] = defaultdict(int)
    try:
        if args.reset:
            stats["old_profiles_removed"] = reset_old_schema(db)

        # Codes are unique: park our own rows first so re-runs can swap codes freely.
        db.execute(text("UPDATE catalog_attribute_profiles SET code = 'tmp-' || id WHERE id LIKE 'oc-%'"))
        db.flush()

        for pid, p in schema.profiles.items():
            row = db.get(CatalogAttributeProfile, pid)
            if row is None:
                row = CatalogAttributeProfile(id=pid, company_id=COMPANY_ID)
                db.add(row)
                stats["profiles_inserted"] += 1
            row.name = p["name"]
            row.code = p["code"]
            row.sort_order = p["sort"]
            row.is_active = True
        db.flush()

        for gid, g in schema.groups.items():
            row = db.get(CatalogAttributeGroup, gid)
            if row is None:
                row = CatalogAttributeGroup(id=gid)
                db.add(row)
                stats["groups_inserted"] += 1
            row.profile_id = g["profile_id"]
            row.name = g["name"][:255]
            row.code = g["code"][:100]
            row.sort_order = g["sort"]
            row.is_active = True
        db.flush()

        # Attribute sort: per group, OpenCart (sort_order, name) → 0..n.
        per_group: dict[str, list[str]] = defaultdict(list)
        for aid, a in schema.attributes.items():
            per_group[a["group_id"]].append(aid)
        for gid, aids in per_group.items():
            for i, aid in enumerate(sorted(aids, key=lambda x: schema.attributes[x]["sort"])):
                a = schema.attributes[aid]
                row = db.get(CatalogAttribute, aid)
                if row is None:
                    row = CatalogAttribute(id=aid)
                    db.add(row)
                    stats["attributes_inserted"] += 1
                row.group_id = gid
                row.name = a["name"]
                row.code = a["code"]
                row.field_type = a.get("field", "text")
                row.sort_order = i
                row.is_filterable = a["filterable"]
                row.is_visible = a["visible"]
                row.is_comparable = a["visible"]
                row.is_active = True
                row.storefront_filter_visible = a["filterable"]
                row.filter_display_type = "multi_select"
                row.predefined_values = json.dumps(a["values"], ensure_ascii=False)
        db.flush()

        # Rows from an earlier run that the schema no longer has (their values cascade;
        # re-run the product-details import afterwards).
        stale_attrs = [
            r[0]
            for r in db.execute(text("SELECT id FROM catalog_attributes WHERE id LIKE 'oc-%'"))
            if r[0] not in schema.attributes
        ]
        if stale_attrs:
            db.execute(text("DELETE FROM catalog_filters WHERE attribute_id = ANY(:ids)"), {"ids": stale_attrs})
            db.execute(text("DELETE FROM catalog_attributes WHERE id = ANY(:ids)"), {"ids": stale_attrs})
        stale_groups = [
            r[0]
            for r in db.execute(text("SELECT id FROM catalog_attribute_groups WHERE id LIKE 'oc-%'"))
            if r[0] not in schema.groups
        ]
        if stale_groups:
            db.execute(text("DELETE FROM catalog_attribute_groups WHERE id = ANY(:ids)"), {"ids": stale_groups})
        stale_profiles = [
            r[0]
            for r in db.execute(text("SELECT id FROM catalog_attribute_profiles WHERE id LIKE 'oc-%'"))
            if r[0] not in schema.profiles
        ]
        if stale_profiles:  # e.g. the former separate "Shop Filters" profile
            db.execute(text("UPDATE catalog_products SET attribute_profile_id = NULL WHERE attribute_profile_id = ANY(:ids)"), {"ids": stale_profiles})
            db.execute(text("DELETE FROM catalog_attribute_profiles WHERE id = ANY(:ids)"), {"ids": stale_profiles})
        stats["stale_profiles_removed"] = len(stale_profiles)
        stats["stale_attributes_removed"] = len(stale_attrs)
        stats["stale_groups_removed"] = len(stale_groups)
        db.flush()

        # One mapping row per OpenCart attribute → its first profile copy (the
        # importers resolve copies through build_schema, not through this table).
        mapped: set[int] = set()
        for (_key, oc_attr_id), aid in schema.attr_for.items():
            if oc_attr_id not in mapped:
                mapped.add(oc_attr_id)
                record_mapping(db, "attribute", oc_attr_id, aid, name=schema.attributes[aid]["name"])
        for f in schema.filters.values():
            for gid in f["group_ids"]:
                record_mapping(db, "filter_group", gid, f["code"], name=f["name"])

        # one Catalog → Filters row per filter code (the storefront facet; its order = the live site's)
        db.execute(text(
            "DELETE FROM catalog_filters WHERE source = 'attribute' AND attribute_id IS NOT NULL "
            "AND attribute_id NOT IN (SELECT id FROM catalog_attributes)"))
        first_attr = {}
        for (_key, fk), aid in sorted(schema.filter_attr.items()):
            first_attr.setdefault(fk, aid)
        for fk, f in schema.filters.items():
            if fk not in first_attr:
                continue
            row = db.query(CatalogFilter).filter(CatalogFilter.param_key == f["code"]).first()
            if row is None:
                row = CatalogFilter(company_id=COMPANY_ID, param_key=f["code"], source="attribute", is_system=False)
                db.add(row)
            row.name = f["name"]
            row.attribute_id = first_attr[fk]
            row.attribute_name = f["name"]
            row.display_type = "multi_select"
            row.sort_order = f["order"]
            row.is_active = True
            row.storefront_visible = True
            row.category_scope = "All categories"
            row.value_count = len(f["values"])
            row.url_example = f"?{f['code']}="
        db.commit()

        stats["profiles"] = len(schema.profiles)
        stats["groups"] = len(schema.groups)
        stats["attributes"] = len(schema.attributes)
        stats["filterable_multi_select_attributes"] = sum(1 for a in schema.attributes.values() if a.get("filterable"))
        # attribute ids end in "-a{oc attribute}" (a spec) or "-f{oc filter group}" (a filter with no same-named spec)
        stats["filters_merged_into_a_spec"] = sum(1 for aid in schema.filter_attr.values() if aid.rsplit("-", 1)[-1].startswith("a"))
        stats["filters_as_new_spec"] = sum(1 for aid in schema.filter_attr.values() if aid.rsplit("-", 1)[-1].startswith("f"))
        stats["filter_codes"] = len(schema.filters)
        stats["filter_values"] = len(schema.filter_value)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(json.dumps(dict(stats), indent=1))


if __name__ == "__main__":
    main()
