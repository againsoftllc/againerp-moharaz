"""Category SEO text (OpenCart ``seo_content`` template) -> catalog_categories.description.

The old shop's category pages end with a generated text: a template with placeholders ({caption}, {min_price},
{top_2_best_selling_product} ...) that its theme fills from the category's products. The playbook import only
carried ``description``, so those pages lost that text. This fills the same template from the imported catalogue.

Input: JSON lines, one per category: category_id, blurb, seo_content (HTML, entity-encoded as in the dump).
Usage (api container):
    python -m scripts.build_category_seo_text /tmp/oc_category_seo.jsonl            # dry run: prints 2 examples
    python -m scripts.build_category_seo_text /tmp/oc_category_seo.jsonl --apply
    python -m scripts.build_category_seo_text /tmp/oc_category_seo.jsonl --sql /tmp/category_seo.sql
        # writes UPDATE statements, to carry the result to another database

The category's own description (when it has real text) stays; the generated text follows it after the marker
<!--oc-seo-->, so re-running replaces only the generated part. Products of the category and its subcategories count;
only published listings. A sentence whose data does not exist (no discounts, no subcategories, no specs) is dropped.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter, defaultdict
from datetime import date

from sqlalchemy import text

import scripts.init_db  # noqa: F401 - registers every model
from app.database import SessionLocal

MARK = "<!--oc-seo-->"
STORE = "Moharaz"


def money(v) -> str:
    return f"{int(round(float(v))):,}"


def link(name: str, slug: str) -> str:
    return f'<a href="/{html.escape(slug)}">{html.escape(name)}</a>'


def plain_len(markup: str | None) -> int:
    return len(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>|&nbsp;", " ", markup or ""))).strip())


def human(items: list[str]) -> str:
    return ", ".join(items[:-2] + [" and ".join(items[-2:])]) if len(items) > 2 else " and ".join(items)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sql", help="write the UPDATE statements to this file")
    args = ap.parse_args()
    rows = [json.loads(line) for line in open(args.path, encoding="utf-8") if line.strip()]

    db = SessionLocal()
    cats = {r[0]: r for r in db.execute(text(
        "SELECT id, parent_id, name, slug, description, caption FROM catalog_categories WHERE id LIKE 'oc-cat-%'"))}
    kids: dict[str, list[str]] = defaultdict(list)
    for cid, c in cats.items():
        if c.parent_id:
            kids[c.parent_id].append(cid)
    prod = {r[0]: r for r in db.execute(text(
        "SELECT p.id, p.name, p.slug, p.price, p.stock_status, p.brand_id, e.special_price, e.compare_at_price "
        "FROM catalog_products p JOIN ecommerce_items e ON e.catalog_product_id = p.id "
        "WHERE e.publish_status = 'published' AND p.id LIKE 'oc-prod-%'"))}
    direct: dict[str, set[str]] = defaultdict(set)
    for pid, cid in db.execute(text("SELECT item_id, category_id FROM ecommerce_item_categories")):
        if pid in prod:
            direct[cid].add(pid)
    brands = {r[0]: (r[1], r[2]) for r in db.execute(text("SELECT id, name, slug FROM catalog_brands"))}
    rating = {r[0]: (float(r[1]), int(r[2])) for r in db.execute(text(
        "SELECT product_id, avg(rating), count(*) FROM catalog_product_reviews WHERE status = 'approved' GROUP BY 1"))}
    sold = {r[0]: int(r[1]) for r in db.execute(text(
        "SELECT i.product_id, sum(i.quantity) FROM commerce_order_items i JOIN commerce_orders o ON o.id = i.order_id "
        "WHERE o.status NOT IN ('cancelled', 'refunded') GROUP BY 1"))}
    attr_names = {r[0]: r[1] for r in db.execute(text("SELECT id, name FROM catalog_attributes WHERE is_visible"))}
    attr_of: dict[str, Counter] = defaultdict(Counter)
    for pid, aid in db.execute(text(
            "SELECT product_id, attribute_id FROM catalog_product_attribute_values WHERE coalesce(trim(value), '') <> ''")):
        if aid in attr_names:
            attr_of[pid][attr_names[aid]] += 1

    cache: dict[str, set[str]] = {}

    def products_under(cid: str) -> set[str]:
        if cid in cache:
            return cache[cid]
        out = set(direct.get(cid, set()))
        for k in kids.get(cid, []):
            out |= products_under(k)
        cache[cid] = out
        return out

    today = date.today()
    updates: list[tuple[str, str, str]] = []
    examples = []
    for r in rows:
        cid = f"oc-cat-{r['category_id']}"
        c = cats.get(cid)
        tpl = html.unescape(r.get("seo_content") or "").strip()
        if not c or not tpl:
            continue
        caption = (r.get("blurb") or "").strip() or c.name
        base = c.description.split(MARK)[0].strip() if c.description else ""
        if plain_len(base) < 30:  # "<p><br></p>", "&nbsp;" ...
            base = ""
        ps = [prod[i] for i in products_under(cid)]
        priced = [p for p in ps if p.price and float(p.price) > 0]
        if not priced:  # nothing to describe
            updates.append((cid, base, caption))
            continue
        instock = [p for p in priced if p.stock_status == "in_stock"]
        special = [p for p in priced if p.compare_at_price and float(p.compare_at_price) > float(p.price)]
        bcount = Counter(p.brand_id for p in ps if p.brand_id in brands)
        manufacturers = human([link(brands[b][0], brands[b][1]) for b, _ in bcount.most_common(5)]) or html.escape(c.name)

        def priced_link(p) -> str:
            return f"{link(p.name, p.slug)} price in bd is {money(p.price)}৳"

        pool = sorted(instock or priced, key=lambda p: float(p.price))
        by_price = sorted(priced, key=lambda p: float(p.price))
        rated = sorted(priced, key=lambda p: (-rating.get(p.id, (0, 0))[0], -rating.get(p.id, (0, 0))[1], -float(p.price)))[:2]
        best = sorted(priced, key=lambda p: (-sold.get(p.id, 0), -rating.get(p.id, (0, 0))[1], -float(p.price)))[:2]
        discounts = sorted(special, key=lambda p: -(float(p.compare_at_price) - float(p.price)))
        subs = sorted((cats[k] for k in kids.get(cid, [])), key=lambda x: -len(products_under(x.id)))[:4]
        feats: Counter = Counter()
        for p in ps:
            feats.update(attr_of.get(p.id, {}))
        feat_names = [n for n, _ in feats.most_common(4)]
        parent = cats.get(c.parent_id) if c.parent_id else None

        out = tpl
        if not discounts:
            out = re.sub(r"<h4[^>]*>[^<]*\{top_discount_product\}[^<]*</h4>\s*<div>\s*\{table_products\}\s*</div>", "", out)
        if not subs:
            out = re.sub(r"Our \{caption\} collection also features \{top_subcategories\}, offering various options for every need\.\s*", "", out)
        if not feat_names:
            out = re.sub(r"\s*Check out the top features like \{attributes_list\}, making it easier to pick the best one\.", "", out)
        table = ""
        if discounts:
            table = ("<table><thead><tr><th>Product</th><th>Price</th><th>Regular price</th></tr></thead><tbody>"
                     + "".join(f"<tr><td>{link(p.name, p.slug)}</td><td>{money(p.price)}৳</td><td>{money(p.compare_at_price)}৳</td></tr>"
                               for p in discounts[:5])
                     + "</tbody></table>")
        vals = {
            "caption": html.escape(caption), "product_category_name": html.escape(c.name),
            "min_price": money(by_price[0].price), "max_price": money(by_price[-1].price),
            "product_count": str(len(ps)), "total_in_stock_products": str(len(instock)),
            "total_special_price_products": str(len(special)), "manufacturers": manufacturers,
            "top_2_high_rating_products": human([priced_link(p) for p in rated]),
            "top_2_best_selling_product": human([priced_link(p) for p in best]),
            "top2_low_price_product": human([priced_link(p) for p in pool[:2]]),
            "top2_high_price_product": human([priced_link(p) for p in pool[-2:][::-1]]),
            "top_discount_product": link(discounts[0].name, discounts[0].slug) if discounts else "",
            "table_products": table,
            "top_subcategories": human([link(s.name, s.slug) for s in subs]),
            "attributes_list": human([html.escape(n) for n in feat_names]),
            "date": f"{today.day} {today.strftime('%B %Y')}", "year": str(today.year),
            "parent_category_name": html.escape(parent.name if parent else c.name), "store": STORE,
        }
        out = re.sub(r"\{([a-z0-9_]+)\}", lambda m: vals.get(m.group(1), m.group(0)), out)
        updates.append((cid, (base + "\n" if base else "") + MARK + "\n" + out, caption))
        if len(examples) < 2 and len(ps) > 20:
            examples.append((c.name, out))

    for name, out in examples:
        print(f"--- {name}\n{out[:1800]}\n")
    print(f"categories with generated text: {sum(1 for u in updates if MARK in u[1])} of {len(updates)}")
    if args.sql:
        with open(args.sql, "w", encoding="utf-8") as fh:
            for cid, desc, cap in updates:
                fh.write(f"UPDATE catalog_categories SET description = $D${desc}$D$, "
                         f"caption = coalesce(nullif(caption, ''), $D${cap}$D$), updated_at = now() WHERE id = '{cid}';\n")
        print("wrote", args.sql)
    if args.apply:
        for cid, desc, cap in updates:
            db.execute(text("UPDATE catalog_categories SET description = :d, caption = coalesce(nullif(caption, ''), :c), "
                            "updated_at = now() WHERE id = :i"), {"d": desc, "c": cap, "i": cid})
        db.commit()
        print("applied")
    db.close()


if __name__ == "__main__":
    main()
