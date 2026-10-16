"""Bring what changed on the previous (OpenCart) shop since the last import into the ERP — the cutover delta.

The full importers rewrite every field they own, which would undo what was done to the imported data since
(spec tidy, step 14; link and image fixes, steps 18–19). This applies only the changes:

Existing products (`--new` vs `--old` products JSON lines, the step-4 extract of the new and the previous dump):
  * price / special price: against what the last import recorded (provider mapping `oc_price` / `oc_special`),
    so an offer that ended since is caught too → price, compare-at price, default variant price
  * stock status (`stock_status_id`) → stock status and visibility, as the importer maps them
  * name, description, short description, meta title / description, focus keyphrase, tags, model — only the
    fields whose source text changed between the two dumps
  * category links, when they changed

New products are imported first by `import_opencart_products --id-from N`; this then gives each one
(`--details`, the step-5 extract for those ids):
  * a spec profile — the one most products of its primary category use
  * its OpenCart specs: into that profile's field of the same name, the rest as the product's own specs
    ("More Specifications"), the shape spec tidy leaves every product in

Dry run by default; `--apply` writes. Re-running is safe (a second run finds nothing to do).

Usage (api container):
    python -m scripts.sync_opencart_delta --new /tmp/oc_products_new.jsonl --old /tmp/oc_products_old.jsonl \\
        --details /tmp/oc_details_new.jsonl --new-from 14789 [--apply]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import uuid
from collections import Counter, defaultdict

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.provider_entity_mapping import ProviderEntityMapping
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.catalog_item_bridge import ensure_default_variant
from scripts.import_opencart_products import ID_PREFIX, STOCK_STATUS, money, split_keywords
from scripts.opencart_common import COMPANY_ID, PROVIDER, clean_html, clean_text

TEXT_FIELDS = ("name", "description", "short_description", "meta_title", "meta_description", "focus_keyword",
               "tag", "meta_keyword", "model")


def load(path: str) -> dict[int, dict]:
    with open(path, encoding="utf-8") as fh:
        return {r["product_id"]: r for r in (json.loads(line) for line in fh if line.strip())}


def price_pair(r: dict):
    regular = money(r.get("price"))
    special = money(r.get("special")) if r.get("special") is not None else None
    price, compare_at = regular, None
    if special and special > 0:
        price = special
        if special < regular:
            compare_at = regular
    return regular, special, price, compare_at


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", required=True)
    ap.add_argument("--old", required=True)
    ap.add_argument("--details")
    ap.add_argument("--new-from", type=int, default=0, help="first OpenCart product_id of the new products")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    new, old = load(args.new), load(args.old)
    details = load(args.details) if args.details else {}
    db = SessionLocal()
    ecommerce = EcommerceItemService(db)
    stats: Counter = Counter()
    samples: dict[str, list[str]] = defaultdict(list)

    def note(kind: str, msg: str) -> None:
        stats[kind] += 1
        if len(samples[kind]) < 6:
            samples[kind].append(msg)

    maps = {
        m.provider_entity_id: m
        for m in db.query(ProviderEntityMapping).filter_by(provider=PROVIDER, entity_type="product").all()
    }

    # ---------------- existing products -------------------------------------------------------------------
    for pid, r in new.items():
        if args.new_from and pid >= args.new_from:
            continue
        product = db.get(CatalogProduct, f"{ID_PREFIX}{pid}")
        if product is None:
            continue
        o = old.get(pid) or {}
        m = maps.get(str(pid))
        meta = json.loads(m.metadata_json or "{}") if m and m.metadata_json else {}
        changed_any = False

        regular, special, price, compare_at = price_pair(r)
        rec_special = meta.get("oc_special")
        if str(regular) != str(meta.get("oc_price")) or (str(special) if special else None) != rec_special:
            note("price", f"{pid} {product.name[:40]}: {product.price} → {price}" + (f" (was {compare_at})" if compare_at else ""))
            product.price, product.compare_at_price, product.last_selling_price = price, compare_at, price
            variant = ensure_default_variant(db, product)
            variant.price = price
            meta["oc_price"], meta["oc_special"] = str(regular), (str(special) if special else None)
            changed_any = True

        status, visibility, label = STOCK_STATUS.get(
            int(r.get("stock_status_id") or 0),
            ("in_stock" if int(r.get("quantity") or 0) > 0 else "out_of_stock", "public", "(none)"),
        )
        # against what the last import / sync recorded, so a re-run finds nothing
        if label != meta.get("oc_stock_status") or int(r.get("quantity") or 0) != int(meta.get("oc_quantity") or 0):
            if product.stock_status != status or product.visibility != visibility:
                note("stock", f"{pid} {product.name[:40]}: {product.stock_status} → {status}")
                product.stock_status, product.visibility = status, visibility
                changed_any = True
            else:
                stats["stock_quantity_only"] += 1
            meta["oc_stock_status"], meta["oc_quantity"] = label, int(r.get("quantity") or 0)

        # a text field changed at the source since the previous dump and not applied yet (the applied source text's
        # hash is kept, so a re-run doesn't undo later fixes to it — links, images)
        applied = meta.setdefault("oc_text_sha1", {})
        sha = lambda v: hashlib.sha1((v or "").encode("utf-8")).hexdigest()  # noqa: E731
        txt = [f for f in TEXT_FIELDS if (r.get(f) or "") != (o.get(f) or "") and applied.get(f) != sha(r.get(f))]
        for f in txt:
            applied[f] = sha(r.get(f))
        if txt:
            note("text", f"{pid} {product.name[:40]}: {', '.join(txt)}")
            if "name" in txt:
                product.name = (clean_text(r.get("name")) or product.name)[:255]
            if "description" in txt:
                product.description = clean_html(r.get("description"))
            if "short_description" in txt:
                product.short_description = clean_html(r.get("short_description"))
            if "meta_title" in txt:
                product.seo_title = clean_text(r.get("meta_title"))[:255] or None
            if "meta_description" in txt:
                product.seo_description = clean_text(r.get("meta_description")) or None
            if "focus_keyword" in txt:
                product.focus_keyphrase = clean_text(r.get("focus_keyword"))[:200] or None
            if "tag" in txt or "meta_keyword" in txt:
                product.tags_json = json.dumps(split_keywords(r.get("tag"), r.get("meta_keyword")), ensure_ascii=False)
            if "model" in txt:
                product.model = clean_text(r.get("model"))[:200] or None
            changed_any = True

        if (r.get("category_ids") or "") != (o.get("category_ids") or ""):
            cats = [f"oc-cat-{c}" for c in (r.get("category_ids") or "").split(",") if c]
            have = {c for (c,) in db.execute(text("SELECT id FROM catalog_categories WHERE id = ANY(:i)"), {"i": cats})}
            cats = [c for c in cats if c in have]
            if cats:
                note("categories", f"{pid} {product.name[:40]}: {len(cats)} categories")
                primary = product.category_id if product.category_id in cats else cats[0]
                ecommerce.replace_categories(product.item_id, [primary] + [c for c in cats if c != primary],
                                             primary_category_id=primary, company_id=COMPANY_ID)
                changed_any = True

        if changed_any:
            db.flush()
            ecommerce.sync_content_from_catalog(product, mirror_publish=True)
        if m is not None and meta:
            m.metadata_json = json.dumps(meta, ensure_ascii=False)

    # ---------------- new products: profile + specs ---------------------------------------------------------
    if details:
        # profile used by most products of each primary category
        by_cat: dict[str, Counter] = defaultdict(Counter)
        for cat, prof in db.execute(text(
            "SELECT category_id, attribute_profile_id FROM catalog_products "
            "WHERE attribute_profile_id IS NOT NULL AND category_id IS NOT NULL"
        )):
            by_cat[cat][prof] += 1
        fields_by_profile: dict[str, dict[str, str]] = defaultdict(dict)
        for aid, name, prof in db.execute(text(
            "SELECT a.id, a.name, g.profile_id FROM catalog_attributes a "
            "JOIN catalog_attribute_groups g ON g.id = a.group_id WHERE a.is_active IS NOT FALSE"
        )):
            fields_by_profile[prof].setdefault(norm(name), aid)

        for pid, d in details.items():
            if args.new_from and pid < args.new_from:
                continue
            product = db.get(CatalogProduct, f"{ID_PREFIX}{pid}")
            if product is None:
                note("new_missing", f"{pid}: not imported yet (run import_opencart_products --id-from first)")
                continue
            profile = None
            for cat in [product.category_id] + [f"oc-cat-{c}" for c in (d.get("category_ids") or [])]:
                if cat and by_cat.get(cat):
                    profile = by_cat[cat].most_common(1)[0][0]
                    break
            fields = fields_by_profile.get(profile, {})
            values: dict[str, str] = {}
            own: list[dict] = []
            for a in d.get("attributes") or []:
                val = clean_text(a.get("text"))
                name = clean_text(a.get("name"))
                if not val or not name:
                    continue
                aid = fields.get(norm(name))
                if aid and aid not in values:
                    values[aid] = val
                else:
                    own.append({"id": f"own-{uuid.uuid4().hex[:12]}", "groupId": "more-specs", "name": name[:255], "value": val})
            note("new_specs", f"{pid} {product.name[:40]}: profile {profile}, {len(values)} profile specs, {len(own)} own")
            if profile:
                product.attribute_profile_id = profile
            db.query(CatalogProductAttributeValue).filter_by(product_id=product.id).delete(synchronize_session=False)
            for aid, val in values.items():
                db.add(CatalogProductAttributeValue(company_id=COMPANY_ID, product_id=product.id, attribute_id=aid, value=val, sort_order=0))
            raw = json.loads(product.custom_specs_json) if product.custom_specs_json else {}
            if not isinstance(raw, dict):
                raw = {}
            raw["customGroups"] = [{"id": "more-specs", "name": "More Specifications"}] if own else []
            raw["customAttrs"] = own
            product.custom_specs_json = json.dumps(raw, ensure_ascii=False)
            db.flush()
            ecommerce.sync_content_from_catalog(product, mirror_publish=True)

    print(("APPLIED" if args.apply else "DRY RUN") + " — " + ", ".join(f"{k} {v}" for k, v in sorted(stats.items())))
    for kind, lines in samples.items():
        print(f"  {kind}:")
        for line in lines:
            print("    " + line)
    if args.apply:
        db.commit()
    else:
        db.rollback()


if __name__ == "__main__":
    main()
