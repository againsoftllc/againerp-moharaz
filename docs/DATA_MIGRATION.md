# Data Migration Playbook — external catalog → AgainERP

A living document. Part A is the reusable method for any project. Part B is the
**Moharaz (OpenCart → againerp-moharaz)** migration: the source/target
structure merge, the step plan and its progress.

> **Keep this file current.** Whenever a step runs, a decision is made, or a
> mapping changes, update the step's status and add a line to the
> [Changelog](#changelog). For a new project, copy Part A, then add a new Part
> for that project modeled on Part B.

---

## Part A — Reusable method (any project)

### A1. Principles

1. **Never import into the only copy.** Back up the target DB first
   (`pg_dump -Fc`), and run every step on local Docker before live.
2. **Re-runnable steps.** Every importer upserts by a **deterministic id** built
   from the source id (`<prefix>-prod-{id}`, `<prefix>-cat-{id}` …). Re-running a
   step updates rows instead of duplicating them. Never delete-and-reinsert
   products: sales/purchase lines reference `items.id` with `RESTRICT`.
3. **Go through the service layer, not raw SQL, for products.** One product
   touches `items`, `catalog_products`, `ecommerce_items`, variants, category
   links, media and stock. The services keep these in sync (see A4).
4. **Match by stable keys, never by numeric id across systems** (slug, code,
   SKU, name).
5. **Keep the source id on every row** (deterministic id, plus a
   `provider_entity_mappings` row or a tag) so later steps and later
   re-imports can find it.
6. **Verify every step** with counts and spot checks before starting the next.

### A2. Standard step order

| # | Step | Depends on |
|---|------|-----------|
| 0 | Backup target, load source into a staging DB, profile the source | — |
| 1 | Brands | 0 |
| 2 | Categories (tree) | 0 |
| 3 | Attribute schema (profiles → groups → attributes → filters) | 2 |
| 4 | Products core (item, product, ecommerce item, default variant, category links, price, stock status) | 1, 2, 3 |
| 5 | Product specs (attribute values) | 3, 4 |
| 6 | Media (images, videos) | 4 |
| 7 | Options → variants | 4, 6 |
| 8 | Pricing extras (sale/special price), opening stock | 4, 7 |
| 9 | Reviews | 4 |
| 10 | SEO: slugs, `seo_url_records` sync, 301 redirects from old URLs | 1, 2, 4 |
| 11 | Module wiring (e.g. Smart PC Builder slots → categories/attributes) | 2, 3, 5 |
| 12 | Verification, then the same run on live | all |
| 13 | Storefront modules seeded from the imported catalog (builder slots, bundles, ready builds, banners) | 2, 4, 5 |
| 14 | Content clean-up at render time (copied HTML, headings, one h1) — A12 | 4 |
| 15 | SEO audit: one h1 per page, broken-link audit, fix list — A13 | all |

### A3. AgainERP target structure (catalog)

Tenant column on every table: `company_id`, default tenant = the literal `"default"`.
PKs are `String(36)`; any string works, so deterministic ids are fine.

| Table | Role | Key rules |
|---|---|---|
| `items` | Identity source of truth | `id` = `catalog_products.id`; UQ(company_id, sku) |
| `catalog_products` | Merchandising row | **slug and sku are globally unique**; `status` draft/published/archived; `visibility` public/private; `stock_status` string; `brand`/`category` *name* copies are used for live counts; `dropship_meta_json` must be NULL for own stock |
| `catalog_product_variants` | ≥1 per product (stock keys on variant) | **sku globally unique**; `options_json` `[{"name","value"}]` |
| `ecommerce_items` | Storefront listing (storefront reads only this) | UQ(item_id), UQ(company_id, slug); `special_price`, `compare_at_price` |
| `ecommerce_item_categories` | Multi-category links | `is_primary` |
| `catalog_categories` | Tree | `path` = `/{rootId}/{childId}/` (**ids**), `depth`; **slug globally unique**; **always set `channel`** |
| `catalog_brands` | Brands | **slug globally unique**; set `channel` |
| `catalog_attribute_profiles` → `catalog_attribute_groups` → `catalog_attributes` | Spec template per product type | profile `code` globally unique; groups belong to a profile; keep attribute `code`s distinct (storefront filters look up by code) |
| `catalog_product_attribute_values` | Spec values | UQ(product_id, attribute_id); keyed by `catalog_products.id` |
| `catalog_filters` | Facet registry | auto-synced from profiles (`_sync_catalog_filters_for_profile`) |
| `media`, `catalog_product_media`, `ecommerce_item_media` | Images | first image = primary + thumbnail |
| `catalog_product_reviews` | Reviews | `review_number` via `allocate_number(db, company_id, "catalog.review")`; `title` NOT NULL; storefront counts `status='approved'` |
| `seo_url_records` | Derived | rebuild with `sync_seo_url_records()`, do not hand-insert |
| `seo_redirects` | Old URL → new URL (301) | |
| `inventory_*` | Stock | write stock only via `StockMovementService.apply_movement(MOVEMENT_OPENING_STOCK)` |

Not available on the target (decide per project): related-products table,
dated specials / quantity discounts (only one `special_price`), per-language
content.

### A4. Product write path (call in this order, in-process, one `SessionLocal()`)

1. `import scripts.init_db` (registers all models)
2. Build `CatalogProduct(...)` (slug via `_free_slug`, unique sku)
3. `ItemIdentityService.persist_and_mirror` → creates `items` (same id)
4. `InventoryItemService.ensure_for_catalog_product`
5. `EcommerceItemService.sync_content_from_catalog(row, mirror_publish=True)`
6. `EcommerceItemService.replace_categories`
7. `catalog_item_bridge.ensure_default_variant` (or `_replace_variants`)
8. Media: `save_media_bytes` / `import_catalog_images` → `_replace_media`
9. Specs: `_replace_product_specs` (or `CatalogProductAttributeValue` rows)
10. Opening stock: `StockMovementService.apply_movement(...)`
11. Re-run `sync_content_from_catalog` after media/specs/variants

Reference implementations: `apps/api/scripts/import_moharaz_products.py`
(MySQL dump parser, deterministic ids, batching; it does **not** do images/specs
and its `clear_catalog_products()` deletes everything, so do not reuse that part),
and `app/services/catalog_ai/importer_service.py::create_product_from_draft`
(full per-product flow incl. images, variants, specs, SEO).

### A5. Known target hazards

- **Channel flip on boot (fixed in againerp-moharaz on 2026-10-07):**
  `ensure_catalog_category_columns()` / `ensure_catalog_brand_columns()`
  (`scripts/init_db.py`) used to set **all** categories/brands to
  `channel='dropshipping'` whenever none had that channel — so an all-`catalog`
  tree flipped on the next restart. They now skip when any row is tagged
  `catalog` or `dropshipping`. **Port this fix to any other AgainERP repo before
  importing an own-stock catalog.**
- Start the API once on the target DB before importing, so boot-time
  `ensure_*_columns` migrations have run.
- Global uniqueness of slugs/SKUs (see A3): pre-check, de-duplicate with
  `-2`, `-3` suffixes.
- Storefront URLs are flat `/{slug}` for products, categories and brands alike —
  a product and a category with the same slug collide in `seo_url_records`.
- Live counts use the `category`/`brand` **name** columns — set them.
- **API DB pool (5 + 10 overflow):** a product page makes many API calls at once, so a few concurrent
  page renders (crawlers, a link checker, traffic spikes) fill the pool and requests wait 30 s → 500. Never
  audit by rendering pages in parallel; before go-live consider a larger pool (`pool_size`/`max_overflow`) and
  caching on the storefront.

### A6. Generic source-cleaning rules

- Decode HTML entities (`&lt;h2&gt;` → `<h2>`) in names, descriptions,
  attribute names/values. HTML fields: decode **once** (gives real HTML). Plain
  text fields (names, meta): decode twice (handles `&amp;amp;`) and trim.
- Trim whitespace and invisible characters (`U+200E` etc.) in names and codes.
- `0000-00-00` dates → NULL.
- Skip placeholder rows (negative ids, "New product") and orphans.
- Generate SKUs when the source SKU is empty, duplicated or descriptive text.
- `sort_order` must be ≥ 0 in AgainERP (`CategoryRead` rejects negatives with a
  500 on the whole list). Re-number siblings 0..n in **the source storefront's
  order** instead of clamping. OpenCart orders by `sort_order, LCASE(name)`.

### A9. Storefront menu (OpenCart `top` flag)

- OpenCart's header menu shows a **root** category only when `top = 1`; its
  subcategories always show under it. `top` on a non-root category has no effect.
- AgainERP's storefront SHOP menu is the system **Catalog** menu
  (`website_menus.id = 'menu-catalog'`, `source='auto'`, slot `catalog.shop`). It
  auto-syncs from the category tree and keeps a per-item `hidden` flag + order
  that admins edit under Website → Menus.
- Import sets `catalog_categories.show_in_top_menu = top`, then (`--sync-menu`)
  resets the Catalog menu items and marks each root `hidden = not top`.
- **Fixed 2026-10-07 in againerp-moharaz:** `website_menu_service.category_tree_as_menu_preview`
  and `website_homepage_service` called `list_categories()` without a channel, so
  they read the `dropshipping` tree and the menu was empty for an own-stock
  (`catalog`) store. Both now pass `channel="catalog"`. **Port to other repos**
  (autology has the same menu bug).
- Same for brands: `StorefrontCatalogService.list_brands()` was hard-wired to
  `dropshipping`. It now takes `channel` (default unchanged), the public
  `GET /api/v1/storefront/brands` accepts `?channel=catalog` (like
  `/storefront/categories`), and the brand menu + homepage brand strip use
  `catalog`. **The storefront app must call both nav endpoints with
  `?channel=catalog` for an own-stock store.**

### A10. Shared importer helpers, id mapping, images

- `apps/api/scripts/opencart_common.py`: `clean_text`, `clean_html`, `slugify`,
  `load_slug_file`, `import_image`, `record_mapping`. Every importer uses these.
- **Id map:** every imported row is written to `provider_entity_mappings`
  (`provider='opencart-moharaz'`, `entity_type` = `category` / `brand` / …,
  `provider_entity_id` = OpenCart id, `erp_entity_id` = ERP id). Later steps
  resolve OpenCart ids through it — required where several source ids merge
  into one ERP row (duplicate brands).
- **Images:** the dump holds only relative paths (`catalog/...`, `YYYY/MM/...`).
  `import_image` fetches `<image-source>/<path>`. Default source is the live site
  (`https://www.moharaz.com/image/`). To import from files instead, copy the
  old server's `image/` folder somewhere, mount it into the api container and
  pass `--image-source /that/folder` — the same paths are then read from disk,
  nothing else changes. `Media.source_url` keeps the original location;
  re-runs skip rows that already have an image.

### A7. Slug (URL) rules — storefront URLs are flat `/{slug}`

1. Reserve every **live** SEO keyword for the entity that owns it, before
   generating anything (otherwise a keyword-less promo category named
   "Motherboard" steals `/motherboard` from the real one).
2. Build a "foreign" list = all other entities' keywords + brand names; a
   *generated* slug must avoid it. A live keyword is kept even if a brand has the
   same **name** — the brand then gets a different slug in the brand step.
3. Cleaning a keyword (`montech keyboard` → `montech-keyboard`) is fine, unless
   cleaning makes it equal to another entity's keyword (`g-printer-` →
   `g-printer` = brand) — then generate instead.
4. Generated fallback order: `{name}` → `{name}-{parent name}` (OpenCart's own
   brand-subcategory style) → `{name}-{source id}`.
5. Re-runs: park own rows on `tmp-{id}` slugs, flush, then assign — avoids
   unique violations when two rows swap slugs.

### A8. Staging the source dump

```powershell
docker run -d --name <project>-oc-staging -e MARIADB_ROOT_PASSWORD=staging -e MARIADB_DATABASE=oc `
  -v <project>_oc_staging:/var/lib/mysql mariadb:10.6
docker cp <dump>.sql <project>-oc-staging:/tmp/dump.sql
docker exec <project>-oc-staging sh -c "mariadb -uroot -pstaging --default-character-set=utf8mb4 oc < /tmp/dump.sql && rm /tmp/dump.sql"
```

Extract per entity with `JSON_ARRAYAGG(JSON_OBJECT(...))` — **set
`group_concat_max_len` first** (`SET SESSION group_concat_max_len = 1073741824;`),
otherwise the JSON is silently truncated at 1 MB. Run SQL through Bash
heredocs (`docker exec -i … mariadb … <<'SQL'`); PowerShell mangles the
backtick-quoted OpenCart column `key`.

---

### A11. Tidying imported specification profiles & shop filters

Imported catalogs carry every spec name any product ever used, so a profile ends up with hundreds
of fields (most empty on any one product), one spec under many names, and shop filters that are
spelled many ways, missing on many products, or belong to another product type. Run this **after**
specs are imported (A2 step 5) and before go-live. Tool: `apps/api/scripts/tidy_spec_profile.py`
(engine `spec_tidy_engine.py`, rules `spec_tidy_rules.py`).

1. **Inventory.** Per profile: products, fields, which filters carry values and how many products
   have each. Dry run: `python -m scripts.tidy_spec_profile --all` prints the plan per profile.
2. **Common fields only.** Field names that differ only in spelling or plural are one field
   ("USB Port(s)" = "USB Ports"; typos like "Intrernal" fixed). A field stays in the profile when at
   least 10 % of the profile's products (and 2) use it; several sources on one product are merged
   into one value, one line each ("HDMI: …"). For the most important types the layout is written
   by hand (motherboard: Processor / Memory / Expansion & Storage / … / Warranty).
3. **Everything else stays on its product.** Specs no common field covers go to the product's
   `custom_specs_json` (group "More Specifications"): the admin shows them as "this product only",
   the product page lists them after the profile's groups. Nothing is lost; old filters that no new
   filter replaces become specs the same way.
4. **Filters per product type.** Each type gets its own filter list (`spec_tidy_rules.py`): options
   in display order, and where each product's value is read, in order — its old filter value
   (`EX`), its name (`NAME`), spec fields by name (`SPEC`) — or a small function where reading
   needs knowledge (socket from chipset, "8GB x 2" → 16GB, highest DPI, bands for wattage /
   screen size / speed). Option spellings are one per value; a filter of another type is dropped.
   Types without rules keep their own filters when they are real choice lists (≤ 20 short options,
   ≥ 10 % of products), spellings merged.
5. **One filter code per meaning, shared by types:** `capacity` (RAM / SSD / HDD), `socket`
   (motherboard / CPU / cooler), `features`, `color`, `connectivity`, `form_factor`… The shop shows a
   filter only when ≥ 10 % of the listed products carry it and it has ≥ 2 options, in the order of
   the product type the listing shows most of.
6. **Readable URLs.** Each filter is its own query parameter with slug values
   (`?ram-type=ddr5&capacity=32gb`, `?features=wi-fi,m-2`); the API matches values by slug; old
   `?spec=code:value` links still work; tracking parameters (`utm_*`, `fbclid`, `gclid`…) are never
   filters. Filtered views: canonical = the plain listing, `robots: noindex, follow`.
7. **Verify** with `--show CODE` (sample products with the value found) and `--missing CODE`
   (products a filter found nothing for); fix rules, re-run. Re-running is safe — a tidied profile
   stays as it is and product-only specs are kept, not duplicated.
8. **Backup first** (`pg_dump -Fc -t catalog_attribute_profiles -t catalog_attribute_groups -t
   catalog_attributes -t catalog_product_attribute_values -t catalog_filters -t catalog_products`).

### A12. Cleaning imported descriptions (copied HTML) — at render time

Shop owners paste product/category text from manufacturer and competitor sites, so the imported
HTML carries **those sites' styling**: inline `style` (one imported field: 34 declarations on one
`<h2>`), `class`, editor ids (`data-mce-*`), fixed `width`/`border`/`cellpadding`, `<font>`/`<span>`
wrappers, even `<meta>`/`<title>`/`<style>` blocks. On the new shop that shows as squeezed tables,
huge bold "headings" and broken spacing. **Clean when rendering, never in the database** — the text
stays exactly as the owner wrote it, admin edits keep working, and the rule improves later.

Storefront helper: `moharaz-web/frontend/src/lib/cleanHtml.ts` (used for product overview, category
description; blog bodies get the h1 rule only). Rules, in order:

1. Remove whole blocks: comments, `<style> <script> <title> <head> <noscript>`; drop `<meta> <link>
   <col> <colgroup> <html> <body>` tags.
2. Allow-list tags (p, br, h2–h6, lists, b/strong/em…, a, img, figure, video/iframe, table parts,
   div); `section`/`article` → `div`; anything else (`span`, `font`, `center`, `o:p`) is unwrapped —
   tag gone, text kept.
3. Allow-list attributes: `a[href]`, `img[src alt]`, `td/th[colspan rowspan]`, `iframe[src]`; no
   `javascript:`/`data:` URLs. External links get `target="_blank" rel="noopener"`; images
   `loading="lazy"`.
4. **One `<h1>` per page:** a description's `<h1>` becomes `<h2>` (the page title is the h1).
5. **Paragraphs posing as headings:** a heading over 25 words, or over 15 words with more than one
   sentence, becomes `<p>` (they were shrunk to body size with inline styles). Copied markup often
   closes a heading with another level (`<h2>…</h3>`) — match any heading close.
6. **Spacing the copied CSS gave:** `Desktop<a>RAM</a>is` → a space where a letter/digit touches a link
   (whitespace only — never punctuation or words).
7. Drop empty blocks (`<p>&nbsp;</p>`), collapse 3+ `<br>`.
8. Wrap each `<table>` in `<div class="pd-ov-tbl">` (scrolls inside the page on phones). CSS: one
   table look for all; header row = `thead`/`th` **or a first row of `<strong>` cells**; 2-column spec
   tables get a fixed name column; tables with 3+ columns span both text columns
   (`column-span:all`), cells never break inside words (`overflow-wrap:normal`, min cell width);
   grid parents need `min-width:0` or a wide table widens the whole page.

**Verify on all rows** (not samples): compare the visible text before/after (strip tags, collapse
whitespace) — must be identical except where a tag split a word (`<span>A</span>ULA`, which the
browser already showed as "AULA"); count leftover `style=`/`class=`/`data-` (must be 0).
Check on every row, not on samples.

### A13. Page headings & broken links — the SEO audit before go-live

**One `<h1>` per page.** Audit the rendered DOM (client components included) of every page type —
home, category, product (incl. ones whose description has its own h1), brand, brand list, blog list,
blog post, bundles, PC builder, cart, checkout, compare, account/login/register, info pages, 404 — and
also their **empty states** (an empty cart/compare page had no h1). Fix: description h1 → h2 (A12),
blog body h1 → h2, empty states render their message as the h1.

**Broken links (read only):** `apps/api/scripts/audit_links.py`.

1. Scan the columns visitors see — product/category/brand/blog descriptions, menus, homepage, page
   builder, pages, collections, spec values, SEO images, **approved** reviews. Leave out provenance
   (`media.source_url`), spam/pending reviews, order notes, import staging.
2. Extract `href`/`src`, JSON `href/url/image` fields and bare URLs; classify: this shop's page /
   image (relative, or the shop's own host — also the **old** shop's absolute URLs) vs other sites.
3. Check this shop's links **on the storefront** (so slugs, legacy redirects and image redirects are
   exercised exactly as a visitor sees them), other sites directly; follow redirects by hand.
4. Verdicts: `ok`, `redirect` (works, but point the link at the final URL), `broken`, `unsure`
   (403/429 bot blocks, timeouts, TLS — check in a browser). Retry timeouts slowly once; they are
   mostly the checker's connection.
5. The CSV names table / column / row id / slug for every use.
6. **Fix** with `apps/api/scripts/fix_content_links.py` — resolves every link **in-process** the way the
   storefront answers it (no page rendering: 2,800 dev-server renders exhausted the API's DB pool). HTML content
   only; JSON (menus, homepage, page builder) is reported for the admin. Per link:
   - works only through a redirect / absolute URL to the own domain / old nested path → rewrite to the final page,
     **relative** (`/x`) so it survives the domain switch;
   - old category path whose page is gone → nearest parent category that exists;
   - typos (`http://product-slug`, `http://hTtPs://www.shop/…`) → repaired, not removed;
   - broken (own 404, other site 404/410 or domain gone) → `<a>` unwrapped (text stays), `<img>` removed;
   - 403 / 429 / timeouts → left alone (bot blocks, network).
   **"Own site" = the exact shop hosts only** (bare, `www.`, old `new.`), never `*.domain`: the R2 media bucket
   usually lives on a subdomain (`media.<shop-domain>`), and a wildcard match makes the fixer delete every
   R2 image as a "broken own image".
   Decode the href first (`&amp;` → `&`), then sample-check the plan against the real storefront before
   `--apply`; backup the content tables; a second dry run must be 0.
7. **Never hard-code the shop's domain.** Own links in content are stored relative (`/x`) — they work on the
   old domain, a staging domain and the final one. Watch for two hidden forms the first pass can miss: **nested
   links** (`<a href="/"><a href="https://shop/">` — match the innermost `<a>`) and the editor's hidden copy
   `data-mce-href="https://shop/…"` (TinyMCE writes it back as the real link on the next save). As a guard,
   the storefront's render-time cleaner (A12) also turns any own-domain `href`/`src` into a relative one.
8. **Old category-path URLs** (`/parent/child/page`): add a catch-all storefront route that 301s to the last
   segment when it resolves (product / category / brand / old keyword / brand-in-category), else 404 — they live
   in content, Google's index and backlinks.

```bash
python -m scripts.audit_links --base http://host.docker.internal:3000 --out /tmp/links.csv           # local
python -m scripts.audit_links --base https://www.example.com --external --out /tmp/links-live.csv   # live
python -m scripts.fix_content_links --external            # dry run + CSV (/tmp/content_links.csv)
python -m scripts.fix_content_links --external --apply
```

### A14. Content images still on the old server — move them before go-live

Descriptions keep the old shop's image URLs (`https://old-shop/image/catalog/…`, relative `/image/catalog/…`,
resized `/image/cache/…-660x418.jpg`). They work while the old server runs and **all break at the switch**.
Product photos were imported (A10), but images **inside** description HTML were not. Tool:
`apps/api/scripts/localize_content_images.py` (dry run by default).

1. Scan every content column (product/category/brand/blog descriptions, short descriptions, pages, homepage,
   page builder, spec values) for old-shop image references — absolute (any scheme, with or without `www`)
   or relative into the old `/image/` folder; links to old *pages* are left alone (they 301, A2 step 10).
2. Reuse what the media library already has: match `Media.source_url` (a `cache/…-WxH` copy matches its
   original, same rule as the image redirect).
3. Download the rest from the old shop **while it is still online** and store them like an import
   (`store_image_bytes` → `save_media_bytes`: R2 when the Cloudflare plugin is on, else `/uploads`),
   `source_url` = the old URL (so the image redirect also finds them), folder "Content images".
4. Rewrite every use to the new URL (longest reference first); the admin copy
   (`catalog_products.description`) and the storefront copy (`ecommerce_items.full_description`) together.
5. Images the old shop no longer has are reported and left as they are (fix by hand).
6. Re-run: a second dry run must find 0. Then check a page: no `old-shop/image` in its HTML.

```bash
python -m scripts.localize_content_images --check     # dry run + asks the old shop which exist
python -m scripts.localize_content_images --apply
```

On live, run it **after** the Cloudflare plugin is set up, so the copies land on R2, and before the domain moves.


## Part B — Moharaz: OpenCart → againerp-moharaz

| | |
|---|---|
| Source | `moharaz_main.sql` (repo root, **git-ignored**, never commit — contains customer data and `ac_user` credentials) — phpMyAdmin dump 2026-10-16, MariaDB 11.4, DB `moharaz_main`, prefix `ac_`, AgainCart/OpenCart 3 (`ac_url_alias`, `ac_attribute_profile`, `ac_filter_profile`) |
| Staging | container `againerp-moharaz-oc-staging` (volume `againerp_moharaz_oc_staging`, db `oc`, no published port) — see A8 |
| Target (local) | `againerp-moharaz-postgres` (`localhost:5500`, db `againerp`), API `againerp-moharaz-api` (`:8070`), admin `:3270`; started with `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.moharaz.yml up -d` (the third file is local-only, in `.git/info/exclude`) |
| Id prefix | `oc-` (`oc-prod-{id}`, `oc-cat-{id}`, `oc-brand-{id}`, `oc-attr-…`, `oc-var-…`, `oc-review-{id}`, `oc-order-{id}`, `oc-blog-{id}`); SKU fallback `MZ-{product_id}`; provider `opencart-moharaz` |
| Language / store | `language_id=1` (English), `store_id=0`; currency BDT |
| Images | **not in the dump.** Brand / category / blog images were fetched from `https://www.moharaz.com/image/`; product images are imported from a local copy of the old `image/` folder (`D:/db-dumps/moharaz-image` → `/import/image` in the api container, `--image-source /import/image`) |

### B1. Source profile

| Area | Rows |
|---|---|
| Products | `ac_product` 12,206 (12,014 enabled, 297 with price 0, 64 without category, 122 without brand) |
| Categories / brands | 1,781 (25 roots, 12 shown in the top menu) / 408 (2 same-name pairs) |
| Specs | `ac_product_attribute` 7,623 on 919 products; `ac_attribute_profile` 35 |
| Options | `ac_product_option_value` 119 (44 products) |
| Reviews | `ac_review` 1,218 (1,143 approved, 75 pending) |
| Customers / orders | `ac_customer` 709 / `ac_order` 2,202 (1,593 placed, `order_status_id > 0`) |
| Blog | 2 articles, 1 category (no comments) |
| Stock statuses | 5 Out Of Stock · 6 **Upcoming** · 7 In Stock · 8 Pre-Order (id 10 on one product has no row) |

Differences from the earlier OpenCart source this playbook was written for: SEO keywords live in `ac_url_alias`
(no `ac_seo_url`), product types are `ac_attribute_profile` linked only through `ac_product.attribute_profile_id`
(the schema's `template_attributes` is derived from the attributes products of a profile use), shop filters come
from `ac_filter_group` / `ac_filter`, the short description is `ac_product_description.short_description`,
and the blog is `ac_blog_article*`.

### B2. Step log (local, 2026-10-16)

| # | Step | Result |
|---|------|--------|
| 0 | Staging + backup (`D:/db-dumps/moharaz-local-before-oc-import-20261016.dump`) | ✅ |
| 2 | Categories (`import_opencart_categories --reset --sync-menu`) | ✅ 1,780 (category 260 has no description row and no products: skipped), all `channel='catalog'` |
| 1 | Brands (`import_opencart_brands --reset`) | ✅ 406 (2 merged) |
| 4 | Products core (`import_opencart_products --reset`) | ✅ 12,206; opening stock 8,968; 570 "Upcoming" → `coming_soon` |
| 3 | Attribute schema (`import_opencart_attributes --reset`) | ✅ 36 profiles, 292 groups, 980 attributes, 74 filter codes |
| 5, 7 | Specs and options (`import_opencart_product_details --skip-images`) | ✅ 7,576 spec values, 122 variants |
| 6 | Images (`import_opencart_product_details --skip-specs --skip-options --image-dir /import/image --image-source https://www.moharaz.com/image/`) | ✅ 25,382 images stored, 25,689 links; 12,189 of 12,206 products have a photo (17 have none in the source, 2 files are missing from the zip). The old `image/catalog` folder came as `catalog.zip` (46,499 files); 43 paths are invalid on Windows (trailing-space folders, >255 characters) — the importer finds the trailing-space ones itself. `--image-dir` is the folder, `--image-source` stays the old shop's URL (it becomes `media.source_url`); passing the folder as `--image-source` makes every file "UnsupportedProtocol". Review thumbnails were then back-filled from `ecommerce_items.thumbnail_url` |
| 9 | Reviews (`import_opencart_reviews`) | ✅ 1,218 |
| 10 | SEO redirects (`import_opencart_redirects --replace-demo`) | ✅ 14,289 |
| 13 | Customers + orders (`import_opencart_customers_orders`) | ✅ 1,863 customers, 1,593 orders, 1,582 sales-order mirrors |
| 14 | Blog (`import_opencart_blog --replace-demo`) | ✅ 2 posts |
| 11, 14b | PC Builder wiring, spec-profile tidy | not applicable / not done — Moharaz sells gadgets and accessories; only 919 products have specs |

Gotchas met on this source:
- `docker cp`/`docker exec` paths in Git Bash: set `MSYS_NO_PATHCONV=1`, and give `docker cp` the Windows form of the source path.
- Stock-status ids are per shop: Moharaz 6 = Upcoming, not "2-3 Days" (`STOCK_STATUS` in `import_opencart_products.py`).
- `ac_review.date_modified` can be `0000-00-00 00:00:00` (handled).
- The redirect importer's `INFO` map is per shop (information ids and the pages they map to).

### B3. Verification (2026-10-16)

Prices: 12,206 of 12,206 equal the source. Stock quantity sum 900,805 = source. Published 12,014 = enabled 12,014.
Category tree: 25 roots / 12 in the top menu, same as the source. No duplicate slugs, no category/product slug clash,
no orphan listing, no HTML entities left in names. The storefront API serves the catalogue, reviews, blog and
the old-URL redirects.

### B4. After the import: fixes found while checking (2026-10-17)

| # | What | Why / how |
|---|------|-----------|
| 1 | **Stock status follows quantity** | The shop's theme shows "In Stock" whenever `quantity > 0`, even when `stock_status_id` says Out Of Stock / Upcoming (124 products; e.g. all processors: status 5, quantity 100). `import_opencart_products` now maps `out_of_stock` / `coming_soon` + `quantity > 0` → `in_stock`. Moharaz status ids: 5 Out Of Stock, 6 **Upcoming**, 7 In Stock, 8 Pre-Order |
| 2 | **Category SEO text** (`scripts/build_category_seo_text.py`) | The old category pages end with a generated text: `ac_category_description.seo_content` is a template (`{caption}`, `{min_price}`, `{product_count}`, `{manufacturers}`, `{top_2_best_selling_product}`, `{table_products}` …) filled by the theme. The playbook import only carried `description`. The script fills the template from the imported catalogue into `catalog_categories.description` (after the marker `<!--oc-seo-->`, so re-runs replace only the generated part; a sentence whose data is missing is dropped). Input: `SELECT JSON_OBJECT('category_id',category_id,'blurb',blurb,'seo_content',seo_content) FROM ac_category_description WHERE language_id=1`. 1,235 of 1,778 categories got a text. To carry the result to another database use `--sql file.sql` and run the UPDATEs there |
| 3 | **Category price list (storefront)** | The storefront's "latest {category} price list in BD" table lists products *on offer* (compare-at price) — 11,914 on Ultratech, 5 on Moharaz, so it was empty and hidden. `app/[slug]/page.tsx` now falls back to the category's first priced products |
| 4 | **Own-domain links become relative** | Product / category descriptions linked `https://www.moharaz.com/...` (1,143 products, 98 categories). Rewritten to `/...` (`href`/`src` only, text mentions stay), so content follows whatever domain serves the shop; `/image/catalog/...` resolves through the storefront image redirect. `media.source_url` keeps the absolute URL on purpose (provenance + redirect lookup) |
| 5 | **Host-agnostic code** | Storefront `lib/site.ts`: `SITE_URL` = `NEXT_PUBLIC_SITE_URL`, else Vercel's production domain, else the deployment URL, else localhost — no domain in code. `cleanHtml` strips the deployment's own host (+ `NEXT_PUBLIC_OWN_HOSTS`). API `/storefront/redirects/image` matches `media.source_url` by the `/image/<path>` tail, not by host |

**Gotchas of the link rewrite (lost data once, repaired the same day):**
- In Python, a replacement written as `"\1"` is the control character U+0001, not the capture group — the `href="` part was replaced by an invisible `\x01`. Write the SQL in a quoted heredoc (`<<'EOF'`) or a raw string. Always run on a copy first and compare a sample.
- In PostgreSQL regular expressions `\b` is a *backspace*; the word boundary is `\y`.
- The repair keyed on the stray `chr(1)`: `(<a\y[^<>]*?)<chr(1)>` → `\1href="`, `(<img\y[^<>]*?)<chr(1)>` → `\1src="`.

### B5. Live deployment (2026-10-17)

| Piece | Where |
|-------|-------|
| Postgres + API | Railway project `againerp-moharaz` (workspace "againsoftllc-dev's Projects"): Postgres plugin + service `api` from GitHub `againsoftllc/againerp-moharaz` (root `railway.toml` → `Dockerfile.api`, `RAILWAY_DOCKERFILE_PATH=Dockerfile.api`), variables `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `CORS_ORIGINS`, `APP_ENV=production`, `APP_DEBUG=false`, `API_RELOAD=false` |
| Storefront | Vercel team `againsoft-llc`, project `moharaz-web`, root `frontend`, env `API_PROXY_TARGET` (Railway API), `NEXT_PUBLIC_ADMIN_ORIGIN` |
| ERP admin | Vercel project `againerp-moharaz`, root `apps/web`, env `API_PROXY_TARGET` |

- **Database:** `pg_dump --clean --if-exists --no-owner --no-privileges` of the local DB (`--exclude-table-data` for the seeded demo tables: coupons, collections, product Q&A, SEO meta / audit, website pages), gzip, piped through `railway ssh --service Postgres -- 'gunzip | psql -v ON_ERROR_STOP=1 --single-transaction'` (the live DB has no public URL). Later SQL fixes go the same way (`cat fix.sql | railway ssh --service Postgres -- 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`). Run `railway` commands from the repo folder that is linked to the project.
- **Media:** the files live in the R2 bucket `moharaz-media` (`media/<name>`, `scripts/move_media_to_r2.py --upload --apply`, 25,756 files, checked file by file). The Railway container has no `/uploads`, so `R2FallbackStaticFiles` (`app/services/r2_static.py`) serves a missing `/uploads/media/<name>` from R2 with the Cloudflare plugin's S3 keys — the bucket stays private and the database links stay `/uploads/media/...`. Moving to a public bucket / custom domain later = `move_media_to_r2.py --rewrite`.
- **Vercel CLI:** deploy from the repo root with the project linked there (the project's Root Directory is set); an ignore file keeps `image-import/` and dumps out of the upload (`--archive=tgz` would pack them). `vercel link` writes a `.env.local` with a token — delete it.
- The old shop's domain keeps serving the OpenCart site until DNS moves; the live address is the `*.vercel.app` one.
