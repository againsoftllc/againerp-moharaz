"""Import OpenCart (Moharaz) product specs, shop filters, images and options
(docs/DATA_MIGRATION.md, steps 5, 6 and 7). Run after the products (step 4) and
the attribute schema (``import_opencart_attributes``).

Input
- JSON lines, one product per line: product_id, image, images[{image, sort_order,
  id}], attributes[{attribute_id, text}], filter_ids[], options[{product_option_id,
  option_id, option_name, option_sort, values[{pov_id, name, sort_order,
  quantity, price, price_prefix, option_image}]}];
- the schema JSON used by ``import_opencart_attributes``.

Per product (``oc-prod-{id}``)
- profile: the OpenCart template that covers most of the product's spec
  attributes (ties → the smaller template); "General" when none matches;
- spec values → that profile's attributes, values outside it → "General";
  duplicates merged by name keep the first non-empty value;
- shop filter values → the "Shop Filters" attributes, several per group
  joined with ", " (how the storefront stores multi-values);
- images: main image + additional images in OpenCart order, downloaded in
  parallel; an image already in the media library (same source URL) is reused;
- options → variants (``oc-var-{pov ids}``), one per value combination; the
  existing default variant becomes the first combination so its stock stays.

Re-runs replace the product's OpenCart spec/filter values, media links and
variants; nothing is duplicated.

Usage (api container):
    python -m scripts.import_opencart_product_details /tmp/oc_product_details.jsonl \\
        /tmp/oc_attr_schema.json --ids-file /tmp/oc_sample_ids.txt
"""
from __future__ import annotations

import argparse
import itertools
import json
import mimetypes
import os
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, InvalidOperation
from urllib.parse import unquote

import httpx
from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.media import Media
from app.routers.catalog_products import _replace_media
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from scripts.import_opencart_attributes import GENERAL, build_schema, profile_id_for
from scripts.opencart_common import (
    COMPANY_ID,
    DEFAULT_IMAGE_SOURCE,
    clean_text,
    image_url,
    slugify,
    store_image_bytes,
)

ID_PREFIX = "oc-prod-"
BATCH = 20
MAX_IMAGE_BYTES = 15_000_000
USER_AGENT = "AgainERP-Importer/1.0 (+https://againerp.com)"
# slim container images have no .webp / .avif in their mime table
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")


def money(value) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return Decimal("0.00")


def fetch(url: str) -> tuple[str, bytes | None, str, str | None]:
    """Download one image → (url, bytes, mime, error)."""
    try:
        with httpx.Client(timeout=30.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get(url)
        if res.status_code != 200:
            return url, None, "", f"HTTP {res.status_code}"
        mime = (res.headers.get("content-type") or "").split(";")[0].strip()
        if not mime.startswith("image/"):
            mime = mimetypes.guess_type(url)[0] or ""
        if not mime.startswith("image/"):
            return url, None, "", f"not an image ({mime or 'unknown'})"
        if len(res.content) > MAX_IMAGE_BYTES:
            return url, None, "", "too large"
        return url, res.content, mime, None
    except httpx.HTTPError as exc:
        return url, None, "", type(exc).__name__


def read_local(image_dir: str, source: str):
    """Like fetch(), but the file comes from a copy of the old shop's image/ folder. The key (and the
    stored media.source_url) stays the live URL, so old /image/ links and re-runs still find it."""
    base = source.rstrip("/") + "/"

    def read(url: str) -> tuple[str, bytes | None, str, str | None]:
        rel = unquote(url[len(base):]) if url.startswith(base) else url
        path = os.path.join(image_dir, *rel.split("/"))
        if not os.path.isfile(path):
            # folders named with a trailing space ("catalog/processor/intel /") lose it when the
            # archive is unpacked on Windows
            path = os.path.join(image_dir, *[seg.rstrip(" .") for seg in rel.split("/")])
        if not os.path.isfile(path):
            return url, None, "", "not in the image folder"
        mime = mimetypes.guess_type(path)[0] or ""
        if not mime.startswith("image/"):
            return url, None, "", f"not an image ({mime or 'unknown'})"
        if os.path.getsize(path) > MAX_IMAGE_BYTES:
            return url, None, "", "too large"
        with open(path, "rb") as fh:
            return url, fh.read(), mime, None

    return read


def spec_value(value: str | None) -> str:
    """OpenCart spec text often carries line breaks ("Wired\r\n\r\n, \r\nBluetooth 5.1")."""
    out = re.sub(r"\s+", " ", clean_text(value))
    out = re.sub(r"\s+([,;])", r"\1", out)
    return out.strip(" ,;")


def image_paths(r: dict) -> list[str]:
    paths: list[str] = []
    main = (r.get("image") or "").strip()
    if main:
        paths.append(main)
    for img in sorted(r.get("images") or [], key=lambda i: (int(i.get("sort_order") or 0), i.get("id") or 0)):
        path = (img.get("image") or "").strip()
        if path and path not in paths:
            paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("details_path")
    parser.add_argument("schema_path")
    parser.add_argument("--ids-file", help="only these OpenCart product ids (one per line)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--id-from", type=int, default=0)
    parser.add_argument("--id-to", type=int, default=0)
    parser.add_argument("--skip-specs", action="store_true", help="specs + shop filters")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--skip-options", action="store_true")
    parser.add_argument("--image-source", default=DEFAULT_IMAGE_SOURCE)
    parser.add_argument("--workers", type=int, default=8, help="parallel image downloads")
    parser.add_argument(
        "--image-dir",
        help="a copy of the old shop's image/ folder (e.g. mounted at /import/image): read files from it instead of downloading",
    )
    args = parser.parse_args()

    with open(args.details_path, encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    with open(args.schema_path, encoding="utf-8") as fh:
        # Built from all products, exactly like import_opencart_attributes → the same ids.
        schema = build_schema(json.load(fh), rows)
    if args.ids_file:
        with open(args.ids_file, encoding="utf-8") as fh:
            wanted = {int(x) for x in fh.read().split() if x.strip()}
        rows = [r for r in rows if r["product_id"] in wanted]
    if args.id_from or args.id_to:
        hi = args.id_to or 10**12
        rows = [r for r in rows if args.id_from <= r["product_id"] <= hi]
    if args.limit:
        rows = rows[: args.limit]

    db = SessionLocal()
    ecommerce = EcommerceItemService(db)
    stats: dict[str, int] = defaultdict(int)
    failures: list[str] = []
    media_by_url: dict[str, str] = {
        url: mid
        for (url, mid) in db.execute(
            text("SELECT source_url, id FROM media WHERE source_url LIKE :p"), {"p": args.image_source.rstrip("/") + "/%"}
        ).all()
    }
    # Variants of the products in this run are rewritten, so only other products' SKUs count.
    run_ids = [f"{ID_PREFIX}{r['product_id']}" for r in rows]
    other_skus = {
        s.lower()
        for (s,) in db.execute(
            text("SELECT sku FROM catalog_product_variants WHERE NOT (product_id = ANY(:ids))"), {"ids": run_ids}
        )
    }

    def ensure_images(batch: list[dict]) -> None:
        """Download every image of the batch not yet in the media library, in parallel."""
        if args.skip_images:
            return
        needed: dict[str, str] = {}  # url → alt
        for r in batch:
            alt = r.get("_name") or ""
            paths = image_paths(r)
            if not args.skip_options:
                for opt in r.get("options") or []:
                    for v in opt.get("values") or []:
                        if (v.get("option_image") or "").strip():
                            paths.append(v["option_image"].strip())
            for path in paths:
                url = image_url(path, args.image_source)
                if url not in media_by_url:
                    needed.setdefault(url, alt)
        if not needed:
            return
        getter = read_local(args.image_dir, args.image_source) if args.image_dir else fetch
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            results = list(pool.map(getter, needed))
        for url, content, mime, error in results:
            if error:
                stats["image_failures"] += 1
                failures.append(f"{url} — {error}")
                continue
            rel = url[len(args.image_source.rstrip("/")) + 1 :]
            media = store_image_bytes(db, rel, content, mime, source_url=url, alt=needed[url], folder="Products")
            media_by_url[url] = media.id
            stats["images_downloaded"] += 1

    try:
        for start in range(0, len(rows), BATCH):
            batch = []
            for r in rows[start : start + BATCH]:
                product = db.get(CatalogProduct, f"{ID_PREFIX}{r['product_id']}")
                if product is None:
                    stats["product_missing"] += 1
                    continue
                r["_product"] = product
                r["_name"] = product.name
                batch.append(r)
            ensure_images(batch)

            for r in batch:
                product: CatalogProduct = r["_product"]

                # --- specs + shop filters -------------------------------------
                if not args.skip_specs:
                    src = [
                        (a["attribute_id"], spec_value(a.get("text")))
                        for a in sorted(r.get("attributes") or [], key=lambda a: a["attribute_id"])
                    ]
                    src = [(aid, val) for aid, val in src if val]
                    key = schema.template_for.get(r["product_id"])
                    values: dict[str, str] = {}
                    for oc_attr_id, val in src:
                        target = schema.attr_for.get((key, oc_attr_id)) if key else None
                        if not target:
                            stats["spec_unknown_attribute"] += 1
                            continue
                        if target not in values:
                            values[target] = val
                    # shop filters live in the profile's filterable multi-select specs. The product's
                    # filter values win (clean, several allowed — stored "a,b" like the admin's
                    # multi-select); a spec text alone is matched to an option when it is one.
                    filter_values: dict[str, list[str]] = defaultdict(list)
                    for fid in r.get("filter_ids") or []:
                        hit = schema.filter_value.get(fid)
                        target = schema.filter_attr.get((key, hit[0])) if hit and key else None
                        if not target:
                            stats["filter_without_profile"] += 1 if hit else 0
                            continue
                        if hit[1] not in filter_values[target]:
                            filter_values[target].append(hit[1])
                    for aid, vals in filter_values.items():
                        order = schema.attributes[aid]["values"]
                        values[aid] = ",".join(sorted(vals, key=lambda v: order.index(v) if v in order else 10**6))
                    for aid, val in list(values.items()):
                        if aid in filter_values or not schema.attributes[aid].get("filterable"):
                            continue
                        option = next((o for o in schema.attributes[aid]["values"] if o.lower() == val.lower()), None)
                        if option:
                            values[aid] = option
                            stats["spec_text_matched_to_option"] += 1
                        else:
                            stats["spec_text_kept_outside_options"] += 1

                    product.attribute_profile_id = profile_id_for(key) if key else product.attribute_profile_id
                    db.query(CatalogProductAttributeValue).filter(
                        CatalogProductAttributeValue.product_id == product.id,
                        CatalogProductAttributeValue.attribute_id.like("oc-%"),
                    ).delete(synchronize_session=False)
                    for aid, val in values.items():
                        db.add(
                            CatalogProductAttributeValue(
                                company_id=COMPANY_ID, product_id=product.id, attribute_id=aid, value=val, sort_order=0
                            )
                        )
                    stats["spec_values"] += len(values)
                    stats["filterable_values"] += sum(1 for aid in values if schema.attributes[aid].get("filterable"))
                    stats["products_with_specs"] += 1 if src else 0
                    stats[f"profile_{'none' if not key else ('general' if key == GENERAL else 'template')}"] += 1

                # --- images ---------------------------------------------------
                if not args.skip_images:
                    media_ids = [
                        media_by_url[u]
                        for u in (image_url(p, args.image_source) for p in image_paths(r))
                        if u in media_by_url
                    ]
                    if media_ids:
                        _replace_media(db, product, media_ids)
                        stats["image_links"] += len(media_ids)
                        stats["products_with_images"] += 1

                # --- options → variants -----------------------------------------
                options = sorted(
                    (o for o in r.get("options") or [] if o.get("values")),
                    key=lambda o: (int(o.get("option_sort") or 0), o["product_option_id"]),
                )
                if options and not args.skip_options:
                    dims = []
                    for o in options:
                        vals = sorted(
                            o["values"], key=lambda v: (int(v.get("sort_order") or 0), clean_text(v.get("name")).lower())
                        )
                        dims.append((clean_text(o.get("option_name")).rstrip(":") or "Option", vals))
                    existing = {
                        v.id: v for v in db.query(CatalogProductVariant).filter(CatalogProductVariant.product_id == product.id)
                    }
                    default = next((v for v in existing.values() if v.is_default), None)
                    keep: set[str] = set()
                    base = Decimal(product.price or 0)
                    for idx, combo in enumerate(itertools.product(*[vals for _, vals in dims])):
                        price = base
                        for v in combo:  # "=" sets the price; "+"/"-" adjust it
                            if v.get("price_prefix") == "=" and money(v.get("price")) > 0:
                                price = money(v.get("price"))
                        for v in combo:
                            if v.get("price_prefix") == "+":
                                price += money(v.get("price"))
                            elif v.get("price_prefix") == "-":
                                price -= money(v.get("price"))
                        names = [clean_text(v.get("name")) or str(v["pov_id"]) for v in combo]
                        vid = "oc-var-" + "-".join(str(v["pov_id"]) for v in combo)
                        row = default if idx == 0 and default is not None else existing.get(vid)
                        if row is None:
                            row = CatalogProductVariant(id=vid[:36], product_id=product.id, company_id=COMPANY_ID)
                            db.add(row)
                        sku = f"{product.sku}-{'-'.join(slugify(n) for n in names)}"[:100].upper()
                        if sku.lower() in other_skus:
                            sku = f"{product.sku}-{vid[7:]}"[:100]
                        other_skus.add(sku.lower())
                        image = next(
                            (
                                media_by_url.get(image_url(v["option_image"], args.image_source))
                                for v in combo
                                if (v.get("option_image") or "").strip()
                            ),
                            None,
                        )
                        row.sku = sku
                        row.name = " / ".join(names)[:255]
                        row.price = max(price, Decimal("0"))
                        row.stock = max(0, min(int(v.get("quantity") or 0) for v in combo))
                        row.status = product.status
                        row.is_default = idx == 0
                        row.sort_order = idx
                        row.image_id = image
                        # The storefront reads the variant's image_url.
                        row.image_url = db.get(Media, image).url if image else None
                        row.options_json = json.dumps(
                            [{"name": dname, "value": n} for (dname, _), n in zip(dims, names)], ensure_ascii=False
                        )
                        keep.add(row.id)
                        stats["variants"] += 1
                    for vid, row in existing.items():
                        if vid not in keep:
                            db.delete(row)
                    product.product_type = "variable"
                    product.variant_attributes_json = json.dumps(
                        [
                            {
                                "id": f"oc-opt-{o['option_id']}",
                                "name": dname,
                                "values": [
                                    {
                                        "value": clean_text(v.get("name")),
                                        **(
                                            {"imageId": media_by_url[image_url(v["option_image"], args.image_source)]}
                                            if (v.get("option_image") or "").strip()
                                            and image_url(v["option_image"], args.image_source) in media_by_url
                                            else {}
                                        ),
                                    }
                                    for v in vals
                                ],
                            }
                            for o, (dname, vals) in zip(options, dims)
                        ],
                        ensure_ascii=False,
                    )
                    stats["products_with_options"] += 1

                db.flush()
                ecommerce.sync_content_from_catalog(product, mirror_publish=True)
                stats["products"] += 1

            db.commit()
            print(f"… {min(start + BATCH, len(rows))}/{len(rows)}", flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(json.dumps(dict(stats), indent=1))
    if failures:
        print(f"Image failures ({len(failures)}):")
        for line in failures[:50]:
            print("  " + line)


if __name__ == "__main__":
    main()
