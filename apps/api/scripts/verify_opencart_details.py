"""Check imported specs, shop filters, images and options against the OpenCart source, product by product.

Reads the same inputs as import_opencart_product_details and compares them with the database:
- specs: every non-empty source value is on the attribute build_schema maps it to, with the same text
  (after spec_value cleaning); merged duplicate attributes keep the first non-empty value
- shop filters: filters are specification attributes (filterable, multi-select). Every source filter value is in
  the spec attribute its filter maps to for the product's profile (schema.filter_attr), and nothing else is;
  a spec that a filter merged into holds the filter values instead of the spec text
- images: the product's media links = main image + additional images, in OpenCart order
- options: one variant per value combination; variant names / options as in the source

Prints totals and the first mismatches of each kind; exit code 1 when anything is off.

Usage (api container):
    python -m scripts.verify_opencart_details /tmp/oc_product_details.jsonl /tmp/oc_attr_schema.json
"""
from __future__ import annotations

import itertools
import json
import sys
from collections import Counter, defaultdict

from sqlalchemy import text

import scripts.init_db  # noqa: F401
from app.database import SessionLocal
from scripts.import_opencart_attributes import build_schema
from scripts.import_opencart_product_details import image_paths, spec_value
from scripts.opencart_common import DEFAULT_IMAGE_SOURCE, clean_text, image_url

ID = "oc-prod-"


def main() -> None:
    details_path, schema_path = sys.argv[1], sys.argv[2]
    rows = [json.loads(line) for line in open(details_path, encoding="utf-8") if line.strip()]
    schema = build_schema(json.load(open(schema_path, encoding="utf-8")), rows)
    db = SessionLocal()

    values: dict[str, dict[str, str]] = defaultdict(dict)
    for pid, aid, val in db.execute(text("SELECT product_id, attribute_id, value FROM catalog_product_attribute_values WHERE product_id LIKE 'oc-prod-%'")):
        values[pid][aid] = val
    media: dict[str, list[str]] = defaultdict(list)
    for pid, src in db.execute(text(
        "SELECT cm.product_id, m.source_url FROM catalog_product_media cm JOIN media m ON m.id = cm.media_id "
        "WHERE cm.product_id LIKE 'oc-prod-%' ORDER BY cm.product_id, cm.sort_order"
    )):
        media[pid].append(src)
    variants: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for pid, name, opts in db.execute(text("SELECT product_id, name, options_json FROM catalog_product_variants WHERE product_id LIKE 'oc-prod-%'")):
        variants[pid].append((name, opts or ""))
    products = {pid for (pid,) in db.execute(text("SELECT id FROM catalog_products WHERE id LIKE 'oc-prod-%'"))}

    stats: Counter = Counter()
    bad: dict[str, list[str]] = defaultdict(list)

    def fail(kind: str, msg: str) -> None:
        stats[f"FAIL {kind}"] += 1
        if len(bad[kind]) < 8:
            bad[kind].append(msg)

    for r in rows:
        pid = f"{ID}{r['product_id']}"
        if pid not in products:
            stats["product missing (skipped)"] += 1
            continue
        got = values.get(pid, {})

        # shop filters → filterable spec attributes
        key = schema.template_for.get(r["product_id"])
        want: dict[str, set[str]] = defaultdict(set)
        for fid in r.get("filter_ids") or []:
            hit = schema.filter_value.get(fid)
            target = schema.filter_attr.get((key, hit[0])) if hit and key else None
            if hit and not target:
                fail("filter unmapped", f"{pid}: filter {hit[0]}={hit[1]} has no spec attribute")
            elif target:
                want[target].add(hit[1])
        for aid, vals in want.items():
            stats["filter values expected"] += len(vals)
            have = {v.strip() for v in (got.get(aid) or "").split(",") if v.strip()}
            if have != vals:
                fail("filter", f"{pid} {aid}: expected {sorted(vals)}, got {sorted(have)}")

        # specs
        expected: dict[str, str] = {}
        for a in sorted(r.get("attributes") or [], key=lambda a: a["attribute_id"]):
            val = spec_value(a.get("text"))
            target = schema.attr_for.get((key, a["attribute_id"])) if key else None
            if val and target and target not in expected:
                expected[target] = val
        for aid, val in expected.items():
            if aid in want:
                stats["spec values replaced by filter values"] += 1
                continue
            stats["spec values expected"] += 1
            filterable = schema.attributes.get(aid, {}).get("filterable")
            if got.get(aid) != val and not (filterable and (got.get(aid) or "").lower() == val.lower()):
                fail("spec", f"{pid} {aid}: expected {val[:40]!r}, got {(got.get(aid) or '')[:40]!r}")
        extra = [a for a in got if a.startswith("oc-tpl-") and a not in expected and a not in want]
        if extra:
            fail("spec extra", f"{pid}: {len(extra)} values not in the source")

        # images (main + additional, OpenCart order)
        exp_img = [image_url(p, DEFAULT_IMAGE_SOURCE) for p in image_paths(r)]
        stats["images expected"] += len(exp_img)
        if media.get(pid, []) != exp_img:
            fail("images", f"{pid}: expected {len(exp_img)} in order, got {len(media.get(pid, []))}")

        # options → variants
        opts = [o for o in r.get("options") or [] if o.get("values")]
        if opts:
            combos = 1
            for o in opts:
                combos *= len(o["values"])
            stats["variants expected"] += combos
            have = variants.get(pid, [])
            if len(have) != combos:
                fail("variants", f"{pid}: expected {combos} variants, got {len(have)}")
            else:
                names = {" / ".join(clean_text(v.get("name")) or str(v["pov_id"]) for v in c)
                         for c in itertools.product(*[o["values"] for o in opts])}
                # the importer orders a name's parts by option sort order — compare the parts, not their order
                parts = lambda n: frozenset(x.strip() for x in n.split(" / "))  # noqa: E731
                if {parts(n) for n, _ in have} != {parts(n[:255]) for n in names}:
                    fail("variant names", f"{pid}: names differ from the source")

    db.close()
    for k, v in sorted(stats.items()):
        print(f"{k:32} {v}")
    for kind, msgs in bad.items():
        print(f"\n{kind}:")
        for m in msgs:
            print("   ", m)
    sys.exit(1 if any(k.startswith("FAIL") for k in stats) else 0)


if __name__ == "__main__":
    main()
