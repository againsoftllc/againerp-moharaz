# AI product upload — the rules, and how the import runs today

**How to read this file**

| Part | What it is |
|------|------------|
| **A — The rules** | The standard every AI product upload must follow (your rules, field by field). This is the target. |
| **B — Gap list** | For each rule: does the code already do it, or what still has to be built. |
| **C — How the import runs today** | A record of what the code does now (2026-10-17): prompt, post-processing, defaults, chat tools. |

Legend in the *Today* column: ✅ already done · 🟡 partly · ⬜ not done yet.
Nothing is changed in the code by editing this file — tell us what to change and it goes into Part D (change requests).

---

# Part A — The rules

One principle runs through everything: **the AI never invents facts** (specs, prices, warranty), and **anything that
creates a new shared record — a category, a brand, a warranty option, a specification profile / filter option —
needs the admin's approval first**. Everything else is filled automatically.

## A1. Images

| Rule | Today |
|------|-------|
| Always fetch the **original** image — never the small / cached copy the page links (`…/cache/…-500x500.webp`, `…-1200x630.png`). The size marker is stripped and the original is tried first; the page's own URL is the fallback | ✅ (`_original_candidates`) — verified on startech.com.bd: `…/image/cache/catalog/…/v50x-01-1200x630.webp` → `…/image/catalog/…/v50x-01.webp` |
| A product with **several images** gets **all** of them, in the **source order** (first = main image / thumbnail) | ✅ up to **20** images (was 8); duplicates of the same photo collapsed to the largest rendition |
| Every image is stored as a **500 × 500 px square**: scaled to *fit* (never stretched or cropped), centred on a white background, transparent PNGs flattened on white, saved as **WebP quality 92** (GIF / SVG kept as they are) | ✅ (`to_square`; Pillow) — verified: 3 source images → three 500×500 WebP files of 9–24 KB |
| **SEO-friendly file names** from the product's slug and the image's position: `akaso-v50x-action-camera-1.webp`, `-2.webp`, `-3.webp` (a 4-character suffix is added only if that name already exists) | ✅ |
| **Alt text and title** from the product name: first image `Akaso V50X Action Camera`, the others `… - view 2`, `… - view 3`; no seller name | ✅ |
| Images are stored in the **media library on R2** and **auto-selected** onto the product (no manual picking) | ✅ |
| **One standard look for every product (margin / padding)**: the flat background around the product is trimmed, then the product is scaled to fit **inside a 420 × 420 box**, leaving at least **40 px (8 %) of empty space on all four sides** of the 500 × 500 canvas. Small images are enlarged (at most 3×) and big ones reduced, so every product shows at about the same size and none touches the edge. A source with a flat non-white background (grey studio sweep) keeps that colour for the margin | ✅ (`to_square`, `MARGIN_PX = 40`) — verified: an object touching the edges gets 40 px each side; a tall product 40 px top / bottom |
| **No AI tokens for images**: trimming, margin, resize, WebP and the 100 KB limit are plain image processing in the server (Pillow). The AI is used once per product to read the page (and once to write the description) — never to touch an image; the only AI image edit is the approved exceptional one below | ✅ |
| **Max 100 KB per image**: a larger result is **optimised** (WebP quality lowered step by step from 92 down to 40) until it fits | ✅ (`to_square`, `MAX_BYTES`) |
| **No duplicates, replace instead**: each position is one slot, `<slug>-<n>.webp`. Clicking ✨ again leaves an image that is already in its slot **untouched** (nothing downloaded, stored or paid for); a *different* source picture **replaces** that slot's file and media row in place — the library never fills with copies | ✅ verified: run 1 → 3 files, run 2 → 3 reused / 0 new, run 3 (slot 1 changed) → 3 rows, slot 1 replaced |
| **No automatic image editing / AI image generation** (it costs tokens and changes the photo). Only the *exceptional* image — **low resolution** (shorter side under 300 px) or **unusual proportions** (wider than 2.5 : 1) — is reported to the admin ("check these images"); improving it (AI edit) happens **only after the admin approves** | 🟡 warning ✅; the approved AI-edit step reuses the chat's image tools — not wired to a button yet |
| Images inside the source *description* are also uploaded to our server and used in our rewritten description | ⬜ |
| YouTube video from the source is added to the product | ⬜ |

> Interpretation to confirm: "500x500px" is read as the **stored size** of every product image (a square canvas). If the
> original should also be kept next to it, or a different size / format is wanted, say so in Part D.

## A2. Product name

| Rule | Today |
|------|-------|
| Keep the **source product title as it is** | ✅ (unless a name preset rewrites it) |
| If the title is **not SEO friendly** (all caps, junk, store name, "Price in BD…" suffix, too long), rewrite it to a **common standard**: `<Brand> <Model> <Key spec> <Product type>` — max 80 characters, no seller name | ✅ preset `catalog.product.name` saved (live, 2026-10-17): strips "Price in Bangladesh \| Star Tech", rewrites to `<Brand> <Model> <Key spec> <Product type>` when not SEO friendly |

## A3. Slug / URL

| Rule | Today |
|------|-------|
| The AI creates the slug from the product title: lowercase, hyphens, SEO friendly, unique | ✅ `slugify(name)`, made unique |
| The slug is created **once** — **editing the product never changes it** | 🟡 not verified on edit; the editor must not regenerate it |
| Changing a slug is **manual only**; when it is changed the **old URL → new URL goes into the SEO Redirects list** automatically (301) | ⬜ to verify / build |

## A4. Category

| Rule | Today |
|------|-------|
| Select the **whole chain**: parent category, sub category, 2nd sub category (whatever exists) | ✅ matched category **plus all its parents** |
| If the right category **exists** → select it | ✅ |
| If it does **not** exist → propose a **new category**; create it **only after admin approval** | 🟡 today it is **created automatically** (`create_category_if_missing`) |
| At approval time show the **suggested category** and also **other options** (existing categories) so the admin can pick a different one or **type a custom category** when the suggestion does not match | ⬜ |
| Creating a category creates the **whole path** (parent > sub > 2nd sub) — each missing level asked for approval | ⬜ |
| A new category must follow the **category rules** (naming, slug, caption/SEO text, channel `catalog`, active) and be fully filled in | ⬜ |
| Never use "Uncategorized" | 🟡 only with a preset |

## A5. Brand

| Rule | Today |
|------|-------|
| Match against our brands (case-insensitive); select it | ✅ |
| Not found → propose a new brand; **create only after admin approval**, following the **brand rules** (name, slug, active, logo later) | 🟡 created automatically today |

## A6. Warranty

| Rule | Today |
|------|-------|
| **Detect the warranty from the source** (spec row, text, title) | ✅ |
| **Select it from our warranty list** when it matches (e.g. "1 Year Official Warranty") | ✅ preset `catalog.product.warranty`: normalised to `<N> Year(s) Official Warranty`, our wording reused when it matches; empty when not stated (stored as text) |
| No match → propose a **new warranty option**; **add only after admin approval** | ⬜ |

## A7. Origin

Auto-select the country of origin when it is stated or detectable; **otherwise leave it empty** (never guess). — ✅

## A8. Status, visibility, tags, prices, stock

| Field | Rule | Today |
|-------|------|-------|
| Status | **draft** | ✅ |
| Web (visibility on website) | **disabled** (private) | 🟡 AI import leaves visibility default (public) — the draft is not on the site because status is draft; set **private** explicitly |
| Tags | AI adds them (up to 8, lowercase, brand + product type + key specs, no store names) | ✅ |
| Price | the **source price** | ✅ |
| Compare-at price | add when the source shows an old / regular price | ⬜ not read today |
| Last selling price | **blank** | 🟡 left unset on a new product — verify it stays empty |
| Stock status | the **source's** status (in stock / out of stock / pre-order / up coming) | ⬜ today always `in_stock` |
| Manage stock | **not selected** | ✅ `track_quantity = false` |

## A9. Short description

**Exactly 4 bullet points**, one under the other, each a key selling spec, written for us (no seller name). — 🟡 preset
`catalog.product.short_description` saved; on the Toshiba test it gave 4 lines but they were plain spec lines — check the wording.

## A10. Description

| Rule | Today |
|------|-------|
| **Never a copy-paste** — rewrite the source description so the content is **unique** | ✅ **done (2026-10-17):** with the description preset a second model pass *writes* the text (`description_writer.py`) |
| **Minimum 300 words** | ✅ checked and rewritten until it passes (test: 368 words) |
| The **focus keyphrase appears in the first paragraph** | ✅ checked (keyphrase = brand + model) |
| Structure: **2 × H2 and 3 × H3 headings** (minimum) | ✅ checked (test: 5 × H2, 3 × H3) |
| **At least 2 internal links** (to our brand / category / related product pages) | ⬜ |
| SEO friendly, natural, no seller name, no invented facts (use only the source's facts) | 🟡 seller name scrub ✅ |
| Images from the source description are uploaded to our server and placed in the text | ⬜ |
| **YouTube video** from the source is added to the product | ⬜ |

## A11. Specifications and filters

| Rule | Today |
|------|-------|
| **The profile is the product type's, chosen by its CATEGORY** (Router → the Router profile). A table-based guess is used only for a product with no category | ✅ |
| Fill the **common attributes** (those the profile has) | ✅ exact label match; the model only decides filter / dropdown fields |
| Attributes that are **not** in the profile are kept **only for this product** as **custom attributes**, in source order, nothing dropped | ✅ |
| **No profile for the category yet** → create it **from the source table**: its attributes = exactly the source's attributes (source groups and order), nothing else; creating it needs the admin's approval (shown in the drawer's Accept / Deny with the new brand / category) | ✅ |
| **Filters come from the source shop**: the filters on the source's category page (Wi-Fi Standard, Number of Bands, …) become filterable attributes of the new profile, options written as the shop writes them; a filter that names the same thing as a source attribute is put on that attribute, the others become attributes in a "Filters" group filled from the page. Multi-value "Additional Features" filters are skipped | ✅ (Star Tech `.filter-group`) |
| When a needed filter option does not exist yet, **add the predefined value** in the style of the existing options | ✅ import adds it for filterable attributes |
| A profile that barely matches the source (< 50 % of the rows) is used with exact label matches only - no guessing | ✅ |
| Attribute data can be **modified** later but **not restructured** (the filter system depends on them) | ✅ |

## A12. Product type and variants

Single product → **simple**. Product with real selectable options (colour, size, storage…) → **variable**: create the
variants, upload each variant's image and select it, fill every option the page offers. — 🟡 variants are created with
their images; check prices / SKUs per variant.

## A13. SEO fields

| Field | Rule | Today |
|-------|------|-------|
| Focus keyphrase | auto, brand + model as shoppers search it (2–5 words, lowercase) | ✅ |
| Meta title | auto, SEO friendly, **include "Price in BD" or "Price in Bangladesh"**, max ~60 chars | ✅ preset `catalog.product.seo` saved (the default rule is overridden) |
| Meta description | auto, SEO friendly, written to rank (key specs, benefit, call to action, 150–155 chars) | ✅ |

### SEO checklist (the product's SEO score — every item must pass)

The admin's SEO panel scores each product out of 100. The import writes the fields so that **all of these pass**; after the model has written them the code checks each one and corrects it when it does not hold (`seo_writer.enforce_checklist`).

| Group | Check | Pts | Rule the AI follows |
|-------|-------|-----|---------------------|
| Keyphrase | Focus keyphrase is set | 5 | brand + model, 2–5 words, lowercase |
| Keyphrase | **Keyphrase in meta title** | 8 | the meta title **starts with** the keyphrase |
| Keyphrase | Keyphrase in meta description | 7 | the meta description contains it |
| Keyphrase | **Keyphrase in URL slug** | 5 | the keyphrase is chosen so its hyphenated form is inside the slug (the slug comes from the product name and is not changed) |
| Keyphrase | Keyphrase in product description | 5 | already in the first paragraph; added there if missing |
| Meta | Meta title is set / length | 5 + 10 | **30–60 characters**, ends with “Price in BD” |
| Meta | Meta description is set / length | 5 + 10 | **120–160 characters** (aim 150–155), key specs + call to action |
| Content | Product description is set | 10 | ≥ 300 words (A10) |
| Content | Short description is set | 5 | 4 bullets (A9) |
| Content | Product has images | 10 | all source images (A1) |
| Technical | URL slug is set / readable | 5 + 5 | lowercase, hyphens (A3) |
| Technical | Product category is assigned | — | the source's category (A4) |

## A14. What needs the admin's approval (summary)

| Needs approval | Everything else |
|----------------|-----------------|
| New **category** (every missing level of parent > sub > 2nd sub) — with the suggested one **and other options / a custom one** | name, slug, description, short description, tags |
| New **brand** | price, compare-at price, stock status |
| New **warranty** option | images, YouTube video |
| New **specification profile** | custom attributes, filter selection |
| New **filter option** (predefined value) added to a shared attribute | SEO fields |
| Changing a slug later (manual, with redirect) | |

---

# Part B — Gap list (what has to be built to meet Part A)

Ordered by how much of the rules it unlocks. Items 1–2 are pure configuration and need no code.

| # | Work | Rules covered | Type |
|---|------|---------------|------|
| 1 | ✅ **done** — **Turn on the AI key** (`ANTHROPIC_API_KEY` or Aladin key in AI → Settings) | everything | config |
| 2 | ✅ **done (live, 8 presets, `scripts/seed_product_upload_presets.py`)** — **Save the rules as admin presets** (AI → Settings → Presets: `catalog`, `catalog.product.name`, `.short_description`, `.description`, `.category`, `.tags`, `.warranty`, `.seo`) | A2, A8 (tags), A9, A10 (rewrite, 300 words, headings, links), A13 | config (text in Part A is the source) |
| 3 | **Approval flow** for new category (with suggestions + custom), brand, warranty; whole-path category creation | A4, A5, A6, A14 | code (chat tool + draft-fill API return "needs approval" instead of auto-creating) |
| 4 | **Images**: ✅ originals, all images, 500×500 WebP, SEO names / alt (done 2026-10-17) · ⬜ description images, YouTube | A1, A10 | code (`catalog_media_import`, `importer_service`) |
| 5 | **Compare-at price, stock status, visibility private, last selling price empty** | A8 | code (`ProductDraft`, extractor schema, create) |
| 6 | ✅ **done (links still missing)** — **Description generator** with checks: ≥300 words, keyphrase in paragraph 1, 2×H2 + 3×H3, ≥2 internal links; re-write until it passes | A10 | code (post-check after the model) |
| 7 | **Short description = exactly 4 bullets** | A9 | code / preset |
| 8 | **Specs & filters**: keep source order, never drop a row, auto-select filters, propose new predefined options for approval | A11 | code (`spec_profile_service`) |
| 9 | **Slug is write-once; manual change creates an SEO redirect** | A3 | code (edit endpoint + `seo_redirects`) — verify first |
| 10 | ✅ **done via preset** — **Meta title with "Price in BD"** | A13 | preset / `DEFAULT_SEO_RULE` |

---

# Part C — How the import runs today (as of 2026-10-17)

> A record of what the code does **right now**. Nothing in Part C is a proposal.

## 1. What it does

Give the system the address of a product page on another website; it reads the page, lets an AI model pull out the
product's data, and **creates a draft product** in our catalogue (or fills an existing draft).

Three entry points use the same code:

| # | Entry point | Where | Notes |
|---|-------------|-------|-------|
| 1 | **AI chat** (Aladin) — tool `import_product_from_url` | AI chat in the admin | Always **preview first, then confirm**. Creates a new draft |
| 2 | **Import dialog** — `POST /api/v1/catalog/ai/import-from-url/extract` then `/create` | Website → Products → AI import | Extract is read-only; create saves the reviewed draft |
| 3 | **Product Draft → AI column** — `POST /api/v1/catalog/ai/products/{id}/fill-from-source` | Website → Catalog → Product Draft (the ✨ icon) | Fills the **existing** draft from its own `source_url` (keeps id, SKU, slug, status, Price Compare links) |

**The Source column (Website → Price Compare and Product Draft).** The first column of the Price Compare grid is **Source**:
the page the product was copied from (`catalog_products.source_url`). It looks and works like a competitor column —
tick box, price, stock dot, 🔄 sync, 🔗 link — but it belongs to the product: editing the link there edits the product's
source URL, and the AI import (✨ column, chat, import dialog) collects its data from exactly this link. Sync reads the
page's price and stock status (a known shop — Star Tech, Ryans, Techland — with its own price pattern, any other site
with the generic reader). After a ✨ import the Source cell is refreshed automatically. Code: `price_update_service.py`
(`SOURCE_ID = "source"`).

Code: `app/services/catalog_ai/importer_service.py` (extract + create), `llm_extractor.py` (the model call),
`scraper.py` (page fetch), `seo_writer.py` (SEO fields), `spec_profile_service.py` (specifications),
`app/services/ai/tools/catalog_import_tools.py` (chat tools), `app/routers/catalog_ai.py` (HTTP).

---

## 2. Switch-on requirement (important)

The extraction needs an AI key. Without one every import answers **501 "AI catalog import is not configured"**.

| Order | Key | Set in |
|-------|-----|--------|
| 1 | `ANTHROPIC_API_KEY` (Claude, forced tool call; model = `AI_CATALOG_IMPORT_MODEL`) | Railway service variable |
| 2 | the company's **Aladin (OpenAI) key** (JSON-schema structured output) | Admin → AI → Settings |

**Moharaz today:** neither is set (local or live) — so no AI import runs until one is added.

---

## 3. The run, step by step

1. **Fetch the page** (`scraper.fetch_page`): title, meta description, visible text (truncated), JSON-LD and the store's
   own app data ("structured"), candidate image URLs, the highlights list, the spec table parsed straight from the HTML,
   the site name (`og:site_name`).
2. **Ask the model** to fill the `extract_product` tool (section 4), with *our* brands, categories and warranty options
   in the prompt so it picks existing ones.
3. **Post-process** (section 5) — deterministic fixes that win over the model.
4. **Match** brand and categories against ours; collect **warnings**.
5. **Create** the product as a draft (section 6), import images, apply specifications, write SEO (sections 7–8).

---

## 4. The extraction instruction (what the model is told)

Prompt (summary of `_build_prompt`): *"Extract product data from this page for an e-commerce catalog import."*, followed
by the page URL, title, meta description, the machine-declared product data ("TRUSTED for name, price, brand, SKU and
images"), JSON-LD, the candidate image list, the visible text, then our catalogue vocabulary, then:

> Call `extract_product` with the product data. Leave fields out entirely if genuinely not present on the page — do
> not invent data. `description` and `short_description` must be copied **VERBATIM** from the page text above — the
> exact same wording the page uses, not your own summary or rewrite of it. For images, return only URLs copied exactly
> from the candidate list above. Only fill `variants` when the page genuinely offers multiple selectable options for
> this same product; a single-option product should have no variants at all.

OpenAI path system line: *"You extract product data from scraped web pages into the given JSON schema."*

**Field rules in the `extract_product` tool schema:**

| Field | Rule given to the model |
|-------|-------------------------|
| `name` | Product name / title |
| `sku` | Manufacturer part number or SKU, if shown |
| `model` | Model number/name if shown separately from the title |
| `short_description` | Copied **verbatim**; the page's own highlights block (Key Features / Highlights / Overview), one feature per line; else the first 1–2 sentences of the description. **Never** the meta description / "Buy X at best price…" blurb |
| `description` | The page's own full description, **verbatim**, same words / sentences / order; paragraphs separated by a blank line, list items on their own lines. Never the meta description |
| `brand_name` | Brand/manufacturer; use **our** spelling when it matches one of our brands |
| `category_name` | Best single, most specific category; the exact name of one of **our** categories when one fits; a new name only when none fits |
| `category_names` | **Every** one of our categories (exact leaf names, from the list) the product belongs in (e.g. Monitors + Gaming Monitors) |
| `price` / `currency` | Numeric selling price, no symbol; ISO currency |
| `warranty` | Warranty terms; our existing option's exact wording when it means the same |
| `origin` | Country of origin if stated |
| `seller_site_name` | The selling site's display name exactly as shown (used only to scrub it from our copy) |
| `images` | Chosen **from the candidate list** — real product photos only, not logos / icons / banners |
| `specifications` | Technical specs grouped (`group` → `items[label, value]`) |
| `tags` | Up to 8 short search tags |
| `seo_title` | Under 70 characters |
| `seo_description` | Under 160 characters |
| `variants` | Only if the page offers this product in several buyable options (colour / size / storage…), each with a selector; each: name, sku, price, attributes, image. Omit for a single-option product |
| `confidence_notes` | Anything uncertain or guessed |

Context block added to the prompt: our categories as `Parent > Child` paths (up to 400), our brands (up to 400), our
warranty options (up to 100), and the active **admin preset rules** (section 9).

---

## 5. Post-processing after the model answers (code wins over the model)

| Rule | Where |
|------|-------|
| Null fields dropped; `source_url` = the page address | `_finalize` |
| If `description` equals the meta description → dropped (and `short_description` = first 2 sentences of the description when it too equalled the meta) | `_finalize` |
| A leading heading in the short description ("Key Features:", "Highlights", "Overview", "Features") is removed | `_finalize` |
| `seller_site_name` ← the page's `og:site_name` when present | `extract_from_url` |
| Brand: stray separators trimmed (`Gymshark |` → `Gymshark`) | `extract_from_url` |
| Price / brand / SKU / images from the page's **structured data** override the model's | `_apply_structured` |
| Image list completed from the page's candidates (`_complete_gallery`), max **8** images used | `extract_from_url` / `create` |
| Short description = the page's own highlights list, one point per line — **unless** an admin `catalog.product.short_description` preset exists | `extract_from_url` |
| Spec table = the one **parsed from the HTML**, unless it is clearly a fragment (parsed count × 2 < model's count) | `extract_from_url` |
| Warranty taken from a spec row labelled "Warranty" when the model gave none (max 200 chars) | `extract_from_url` |

**Warnings returned with the preview:** brand will be created · category will be created · no price found · no images found.

**Brand match:** case-insensitive name match. **Category match:** by name; each matched category's **parents** are added too
(Monitors → Peripherals) so the product shows in the broader category; most specific stays primary.

---

## 6. What is written when the product is created

| Field | Value |
|-------|-------|
| `status` | **draft** (chat and the AI column never publish) |
| `name` | page name (cut to 255); an existing draft keeps its own name |
| `slug` | slug of the name, made unique; existing draft keeps its slug |
| `sku` | the page's SKU/MPN when present (upper-case, spaces→`-`, max 40); else `BRAND-MODEL-xxxx` / `BRAND-FIRSTWORDS-xxxx` (4 random hex); made unique; existing draft keeps its SKU |
| `model` | page model (max 200) |
| `description` | long text, **seller name / domain replaced by our company name** (section 7), converted to paragraphs HTML |
| `short_description` | highlights, same replacement, converted to a bullet list HTML |
| `price` | the page's price, **copied as is** (0 when none) — no mark-up, no rounding |
| `product_type` | `variable` when variants exist, else `simple` |
| `brand` / `category` | matched, or **created** when missing (`create_brand_if_missing`, `create_category_if_missing`) in the `catalog` channel |
| `category_ids` | every matched category + parents; first = primary |
| `warranty`, `origin` | as extracted |
| `stock_status` | `in_stock`; `track_quantity` = false; stock 0 |
| `tags` | up to 8 from the model |
| `source_url` | the page address |
| `custom_specs_json` | the spec table (when there are specs) |
| `gallery_json` / `thumbnail` | the image URLs (first = thumbnail) |
| images | downloaded into our **media library** (alt text = product name), the main ones linked to the product |
| variants | one per option combination: SKU `<product sku>-<option letters>`, price (own or base), image, `options_json` |

Not set by the import: compare-at price, cost, stock quantity, warehouse, barcode, serial/batch tracking, locations,
videos, related products, dropship data.

---

## 7. Seller name scrub (`_sanitize_description`)

Applied to description, short description, SEO title and SEO description. Every mention of the **source store** is
replaced by **our registered company name** (`companies.legal_name` or `name`): its full name, the name without
`Ltd./Limited/Inc./LLC/PLC`, the short lead-in before `&` / `,` / `and` ("Star Tech & Engineering Ltd." → "Star Tech"),
the full host (`startech.com.bd`) and the bare domain word (`startech`). Longest first. Case-insensitive. Skipped when
we have no company name.

---

## 8. Specifications and SEO

**Specifications** (`spec_profile_service.apply_from_source`): when the product's category already has a specification
**profile**, the source spec table is mapped into its fields (LLM mapping; fields that already have a value are never
overwritten; off-list values are only offered as new options on request). **With no profile the specs stay as custom
specs** — creating a profile always needs the user's approval (chat tool `add_product_specs`), never silently.

**SEO** (`seo_writer.fill_on_import`, never fails the import): the model writes **focus keyphrase, meta title, meta
description** from the product's own facts, following the admin preset `catalog.product.seo`, else this default:

> Focus keyphrase: the brand + model as shoppers search it (2-5 words, lowercase), e.g. 'lenovo yoga 7 14ahp9' — never a
> generic category like 'lenovo laptops'. Meta title: the product name with its 1-2 most important specs, max 60
> characters, no store name. Meta description: 140-155 characters naming the product, its key specs (processor, RAM,
> storage, display — whatever the product type has) and who it suits, ending with a short call to action. No prices, no
> 'best price' phrases, no other store's name.

Prompt tail: *"Use only the facts above. Never name another store or website."* If the model is unavailable, template
values are used (keyphrase = brand + model, title = name cut to 70, description = short description cut to ~152) so the
focus keyphrase is never empty.

---

## 9. Admin presets (company rules on top of the defaults)

Admin → AI → Settings → Presets. Each active preset is a written rule injected into the prompt. **Moharaz has none set
(live DB: 0 rows)** — so only the defaults above apply. Targets and the placeholder text the editor shows:

| Target | Governs | Example in the editor |
|--------|---------|-----------------------|
| `general` | every AI chat | "Keep answers short and professional. Always call our company 'Monarch IT'." |
| `catalog` | all product content | "Write for Bangladeshi retail customers. Never mention competitor stores, EMI offers or delivery terms." |
| `catalog.product.name` | `name` | "Format: `<Brand> <Model> <Key spec> <Product type>` … Max 80 characters." |
| `catalog.product.short_description` | `short_description` | "4-6 bullet points of the most important specs, one per line, each under 60 characters." |
| `catalog.product.description` | `description` | "Write an original 150-200 word description… No prices, no seller names." |
| `catalog.product.category` | category choice | "Gaming laptops go in both 'Laptops' and 'Gaming'. Never use 'Uncategorized'." |
| `catalog.product.tags` | `tags` | "6-8 lowercase tags: brand, product type, key specs. No store names." |
| `catalog.product.warranty` | `warranty` | "Normalise to '<N> Year(s) Official Warranty'." |
| `catalog.product.seo` | SEO fields | "Meta title: '<Product name> Price in Bangladesh | <Company>' (max 60 chars)…" |

How rules change the run: content language defaults to **English**; `general` and `catalog` rules are shown as
"company-wide content rules"; for a field that has its own preset the model is told **not to copy the page text
verbatim but to write the field itself** to the rule, "using only facts that are on the page (never invent specs,
prices or warranty terms)". Without a preset, name/description/short description are copied verbatim.

---

## 10. The AI chat flow (tools the chat model is given)

All three are **write** tools in the `catalog` module and need catalog write permission.

| Tool | Description given to the model (condensed) |
|------|--------------------------------------------|
| `import_product_from_url` (`url`, `confirm`) | Import a product from its page on another website (startech.com.bd, ryans.com, any store). **Call this first, without `confirm`, the moment the user gives a product URL** — it returns a preview and creates nothing. If the preview's warnings say the URL was already imported, tell the user and ask whether they still want a duplicate before `confirm=true`. Creates a **draft**, auto-creating brand/category |
| `add_product_seo` (`product`, optional 3 fields, `confirm`) | Set Focus Keyphrase, Meta title, Meta description. Only after asking the user and they said yes (e.g. right after an import). **Omit the three fields** unless the user typed an exact value — the tool writes them from the product's specs by the company's SEO rule; values the model makes up are ignored. Preview first, then `confirm=true` |
| `add_product_specs` (`product`, `profile_name`, `add_missing_options`, `confirm`) | Add specs from the source spec table into the structured profile. Existing profile → preview of the values to fill. No profile → proposes one from the source groups; **creating a profile needs explicit approval**. Preview first, then confirm |

Confirm rule (`CONFIRM_NOTE`): *"Nothing was created. Show this preview to the user and ask them to confirm; call again
with confirm=true only after they explicitly agree."* The extracted draft is **cached by URL for 15 minutes** so the
confirm saves exactly what the preview showed (SEO values and spec plans are cached the same way). Product lookup by name /
SKU / id; an ambiguous name returns the candidates and asks the user.

---

## 11. Limits and known behaviour

- One product page per run; no category-page crawling. Page text is truncated before it reaches the model; JSON-LD to 3,000
  characters, structured data to 5,000, **20** candidate images, **8** images imported.
- Price is the **source shop's price** — it is not adjusted for Moharaz; set our own price afterwards.
- Name is the source's name (unless a name preset rewrites it).
- Re-running the AI column on a draft **overwrites** description, short description, price, brand, category, warranty,
  origin, tags, specs, gallery/thumbnail and SEO with the source's; name, SKU, slug, status and visibility stay.
- Images are copied into our media library (R2 on live).
- The Startech sitemap batch (`scripts/import_competitor_drafts.py`) only creates the empty drafts (title + source URL);
  the AI column / chat then fills them.

---

# Part D — Change requests (fill in)

Anything you want different from Part A or Part C goes here; the AI import follows Part A once the matching work in Part B
is done.

| # | What to change | Which rule / section | Status |
|---|----------------|----------------------|--------|
| 1 | | | |
