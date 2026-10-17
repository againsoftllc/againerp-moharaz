"""Save the product-upload rules (docs/AI/product-upload.md, Part A) as the company's AI presets.

The AI product import (chat tool import_product_from_url, the import dialog and the Product Draft ✨ column) reads
these presets (AI → Settings → Presets) and writes the product fields to them. Re-running replaces the text of
these targets (each save keeps a version, so the admin can roll back); targets not listed here are left alone.

Rules that need code rather than words (approval for new categories / brands / warranties, internal links, all-image
import with SEO file names, compare-at price, stock status, write-once slug …) are Part B of the doc and are NOT here.

Usage (api container):
    python -m scripts.seed_product_upload_presets            # dry run: lists what would be saved
    python -m scripts.seed_product_upload_presets --apply
"""
from __future__ import annotations

import argparse

import scripts.init_db  # noqa: F401 - registers every model
from app.database import SessionLocal
from app.services.ai import preset_service

COMPANY_ID = "default"

PRESETS: dict[str, tuple[str, str]] = {
    "catalog": (
        "Product content — company-wide",
        "Our company is Moharaz, a computer, mobile and gadget shop in Bangladesh. Write everything in English for "
        "Bangladeshi shoppers. Never mention another store, website or seller (Star Tech, Ryans, Techland, Daraz …) "
        "and never copy marketing slogans from the source. Use only facts that are on the source page — never invent "
        "specifications, prices, warranty terms or features. When a fact is missing, leave the field out.",
    ),
    "catalog.product.name": (
        "Product name",
        "Keep the source product title as it is. Remove store names and SEO suffixes such as 'Price in Bangladesh', "
        "'Price in BD', '| Star Tech', '- Ryans'. If the title is not SEO friendly (ALL CAPS, junk characters, repeated "
        "words, a long marketing sentence), rewrite it to one common standard: <Brand> <Model> <Key spec> <Product "
        "type>, normal capitalisation, maximum 80 characters, e.g. 'Toshiba DT01ACA200 2TB 7200RPM SATA 3.5\" Hard "
        "Disk'. Never add a store name.",
    ),
    "catalog.product.short_description": (
        "Short description",
        "Exactly 4 bullet points, one per line, each one a key selling spec or benefit of THIS product (capacity, "
        "speed, interface, size, compatibility, warranty …), under 70 characters each. No seller name, no price, no "
        "full stops needed, no numbering or bullet characters (one point per line only).",
    ),
    "catalog.product.description": (
        "Description",
        "Do NOT copy the source description — rewrite it as original, unique, SEO-friendly content in English, at least "
        "300 words, using only the facts on the source page (and plain, true product-type context such as what the "
        "product is and who it suits; no invented claims). Structure it as HTML: an intro paragraph that contains the "
        "product's focus keyphrase (brand + model, exactly as a shopper would search it) in the first sentence or two; "
        "then at least 2 <h2> headings and at least 3 <h3> headings, each followed by one or two paragraphs (for "
        "example: overview, key features, performance / specifications explained, who should buy it, what is in the "
        "box / compatibility). Natural tone, short paragraphs, no keyword stuffing, no prices, no seller names, no "
        "'best price' phrases. Do not put a heading before the intro paragraph.",
    ),
    "catalog.product.category": (
        "Category selection",
        "Choose the most specific category from OUR list and also every parent of it (parent > sub > 2nd sub). Prefer an "
        "existing category; only suggest a new name when none of ours fits the product. Never choose 'Uncategorized'; "
        "do not choose a generic parent such as 'Accessories' when a more specific child exists.",
    ),
    "catalog.product.tags": (
        "Tags",
        "6-8 lowercase tags: the brand, the product type, the model, and the key specs a shopper searches for. No store "
        "names, no 'price' or 'best' words.",
    ),
    "catalog.product.warranty": (
        "Warranty",
        "Detect the warranty from the source (spec row, text or title) and normalise it to '<N> Year(s) Official "
        "Warranty' (or '<N> Month(s) Warranty' / 'No Warranty' when that is what the source says). If our warranty "
        "list has an option with the same meaning, use that option's exact wording. If the source does not state a "
        "warranty, leave it empty — never guess.",
    ),
    "catalog.product.seo": (
        "SEO (focus keyphrase, meta title, meta description)",
        "Focus keyphrase: brand + model as shoppers search it, 2-5 words, lowercase (e.g. 'toshiba dt01aca200'). "
        "Meta title: '<Product name> Price in BD' (or 'Price in Bangladesh' when it still fits), maximum 60 characters "
        "in total — shorten the product name rather than the price phrase; no store name. Meta description: 150-155 "
        "characters, written to rank and to be clicked: the product name with its 2-3 key specs, who it suits, the "
        "words 'price in Bangladesh' once, and a short call to action; no prices, no store names.",
    ),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    db = SessionLocal()
    try:
        for target, (title, text) in PRESETS.items():
            current = preset_service.get_preset(db, COMPANY_ID, target)
            state = "update" if current else "create"
            print(f"{state:6} {target:38} {len(text):4} chars")
            if args.apply:
                preset_service.upsert_preset(db, company_id=COMPANY_ID, target=target, instruction=text, title=title)
        if args.apply:
            db.commit()
            print("saved")
    finally:
        db.close()


if __name__ == "__main__":
    main()
