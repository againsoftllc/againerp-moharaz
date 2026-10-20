# Universal source reader — importing from any shop without per-site settings

A product link from any website goes through the same four steps. A new shop needs **no configuration**.

```
1. Source     the page's full HTML
              - the server fetches it; if the shop blocks the server (Cloudflare / bot check, e.g. Ryans) the
                "Send to AgainERP" browser extension reads it in the admin's browser and hands it over
                (/catalog/ai/source-page; product photos: /source-images; category pages as drawn: for the shop's filters)
2. Distil     page_distiller.distill_page(): the whole source written out line by line, structure kept
                # headings · "label | value" table rows · "label: value" rows (dl / div / span / li pairs) · "- " bullets
              menus, footers, scripts, cookie boxes and OTHER products (related / similar / recently viewed) are left out
3. Extract    the AI reads that view (plus the page's declared data: JSON-LD, meta, embedded app state) and returns only what the
              catalog needs: name, brand, model, price, stock, images, specifications, short description, warranty, category
4. Ground     llm_extractor._ground(): whatever the AI returned must be on the page
              - a specification value found nowhere in the source is dropped (never an invented spec)
              - images are only the page's own candidates
```

Then the existing steps follow: the spec rows go onto the product's **specification profile by meaning** (a profile attribute keeps
its own name; "CPU" takes the value of the source's "Processor Model" row — `spec_profile_service.map_values_traced`), the images
are imported (from the browser's copy when the shop blocks the server), the price/offer/stock are read like Price Compare reads them.

## Why this replaced "flat text"

The AI used to read the page as one flattened line cut at 20,000 characters: a spec table became a run of words with labels glued to
values, and on a long page the product block could fall off the end. The distilled view keeps rows and headings, drops page furniture,
and fits the same budget.

## Site-specific code that still exists (a fast path, not a requirement)

`scraper._startech_specs`, `_ryans_specs`, the price patterns in Price Compare: exact parsers for the shops we know. When one of
them finds a complete spec table the AI is not asked for specifications at all (cheaper, exact). On any other shop they find
nothing and the AI reads the distilled view. Adding a shop-specific parser is an optimisation, never needed to support a shop.

## When a new shop gives a poor result

1. Open the product, run the AI fill, look at `warnings` / "confidence notes".
2. If the shop is behind a bot check: install / allow the extension for that domain (popup → Allow).
3. If specs are missing: the page may build them with JavaScript after loading — the extension reads the source as fetched; for
   category pages it reads the page *as drawn*. Report the URL; the fix is in `page_distiller` (one rule for all shops), not a new
   per-site setting.
4. Check the grounding: a spec the AI returned but the page does not contain is dropped on purpose.
