# AI product upload — the instructions that run today

> **Status:** a record of what the code does **right now** (2026-10-17). Nothing here is a proposal. The idea: read it,
> tell us what to change, and the change goes into the file named in the last column of each table.
> Section 12 collects the change requests.

---

## 1. What it does

Give the system the address of a product page on another website; it reads the page, lets an AI model pull out the
product's data, and **creates a draft product** in our catalogue (or fills an existing draft).

Three entry points use the same code:

| # | Entry point | Where | Notes |
|---|-------------|-------|-------|
| 1 | **AI chat** (Aladin) — tool `import_product_from_url` | AI chat in the admin | Always **preview first, then confirm**. Creates a new draft |
| 2 | **Import dialog** — `POST /api/v1/catalog/ai/import-from-url/extract` then `/create` | Website → Products → AI import | Extract is read-only; create saves the reviewed draft |
| 3 | **Product Draft → AI column** — `POST /api/v1/catalog/ai/products/{id}/fill-from-source` | Website → Catalog → Product Draft (the ✨ icon) | Fills the **existing** draft from its own `source_url` (keeps id, SKU, slug, status, Price Compare links) |

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

## 12. Change requests (fill in)

| # | What to change | Which part | Status |
|---|----------------|------------|--------|
| 1 | | | |
