# AgainERP — STRUCTURE

Full project map for humans + AI. Intent & run rules → [BRAIN.md](./BRAIN.md).

**Separate from MoharazNX + Monarch.** This repo uses DB `againerp` @ **5440**, API **8010**, admin **3210**.  
MoharazNX uses `moharaznx` @ **5433** / API **8000** / admin **3200**, with Monarch as its storefront.

---

## 1. Quick map

| Bag | Path | Port | Role |
|-----|------|------|------|
| Admin dashboard | `apps/web/` | **3210** | Catalog, Sales, Website, Inventory, … |
| API + DB | `apps/api/` + Docker Postgres | **8010** / **5440** | Business data + `/api/v1/*` |
| Customer frontstore | `apps/frontstore/` | **3010** | Shop, cart, checkout |
| China import plugin | `plugins/china-import/` | — | Alibaba / 1688 import UI (POC) |
| Legacy AI runtime | `ai/` | — | Copied AI package (mostly unused locally) |

```
Browser
  ├─ Admin UI      :3210  →  apps/web
  ├─ Frontstore    :3010  →  apps/frontstore  ──fetch──▶  API :8010
  └─ Admin proxy   /api/v1 → Next rewrites → API :8010
                                              │
                                         Postgres :5440
```

---

## 2. Root tree

```
againerp/
├── BRAIN.md
├── STRUCTURE.md                  ← this file
├── SKYBUYBD.md                   # Dropship / SkyBuy process notes
├── SEPARATION.md                 # AgainERP vs MoharazNX isolation map
├── .gitignore
├── docker-compose.yml            # AgainERP postgres/api/web (5440/8010/3210)
├── docker-compose.override.yml
├── docker-compose.run.yml        # AgainERP standalone run (not MoharazNX)
├── apps/
│   ├── web/                      # AgainERP admin (Next.js) :3210
│   ├── api/                      # AgainERP API (FastAPI) :8010 → DB :5440
│   └── frontstore/               # AgainERP shop UI :3010 (own copy; not /htdocs/monarch)
├── plugins/
│   └── china-import/
├── ai/                           # legacy AI runtime code
├── scripts/                      # repo helper scripts
└── docs/                         # leftover HTML UI refs (no .md)
    └── frontstore/ui-reference/
```

---

## 3. `apps/web` — Admin dashboard

**Stack:** Next.js · TypeScript · Tailwind · AG Grid · Shadcn-style UI  
**Dev:** `npm run dev` → http://localhost:3210  
**Env:** `apps/web/.env.local`

```
apps/web/
├── package.json
├── next.config.ts
├── .env.local
├── public/
└── src/
    ├── app/
    │   ├── layout.tsx / globals.css / login/
    │   ├── (admin)/          # ← main ERP admin shell
    │   ├── (storefront)/     # legacy storefront inside admin app
    │   ├── (print)/          # print / live-edit / preview routes
    │   └── api/              # Next BFF routes (proxy / plugins / center-ai)
    ├── components/           # UI by domain
    ├── lib/                  # API clients, helpers, mock-data
    ├── hooks/
    └── design-system/
```

### 3.1 Admin routes — `src/app/(admin)/`

| Module | Path | Screens |
|--------|------|---------|
| **Home / Dashboard** | `home/`, `dashboard/` | overview |
| **Catalog** ★ | `catalog/` | products, **import (Elim dropship)**, categories, brands, attributes, variants, collections, filters, bundles, reviews, specifications, product-configurator, settings |
| **Sales** ★ | `sales/` | orders, **dropship (1688 fulfill)**, settings |
| **Sales** ★ | `sales/` | orders, settings |
| **Website** ★ | `website/` | pages, menus, layout, list, configuration |
| **Website 2** | `website-2/` | builder, pages, layouts, domain, forms, blog, SEO, AI, settings, … |
| **Inventory** | `inventory/` | stock, warehouses, transfers, receipts, deliveries, purchase-orders, adjustments, lots, scraps, replenishment, … |
| **Customers** | `customers/` | all, groups, segments, wallet, wishlists, loyalty, marketing, support, … |
| **Suppliers** | `suppliers/` | all, purchase-orders, quotations, bills, receipts, returns, rfq, stock-feed |
| **Marketing** | `marketing/` | coupons, campaigns, audiences, journeys, flash-sales, promotions |
| **SEO** | `seo/` | meta, urls, redirects, sitemap, schema, audit, keywords, … |
| **Media** | `media/` | media library |
| **Blog** | `blog/` | articles, categories, comments, settings |
| **Configurator** | `configurator/` | attributes, compatibility |
| **Service** | `service/` | items, invoices |
| **Finance** | `finance/` | finance screens |
| **Manufacturing** | `manufacturing/` | bom, items |
| **Reports** | `reports/` | reports |
| **Plugins** | `plugins/` | china-import, … |
| **AI OS** | `ai-os/` | AI operator UI |
| **Settings** | `settings/` | business, stores, localisation, AI, plugins |
| **System** | `system/` | users, roles |
| **Notifications** | `notifications/` | notifications |

★ = AgainERP primary modules (catalog / sales / website).

### 3.2 Admin storefront (legacy) — `src/app/(storefront)/`

Used for preview / live-edit inside admin app (customer shop primary is `apps/frontstore`).

```
(storefront)/
├── [slug]/              # product / category / CMS flat URL
├── products/, categories/, search/, deals/, new/, bestsellers/
├── cart/, checkout/, wishlist/, compare/
├── account/…            # orders, addresses, wallet, returns, …
├── blog/, builder/, about/, contact/, faq/, shipping/, track/
└── …
```

### 3.3 Print / preview — `src/app/(print)/`

```
(print)/
├── sales/print/
├── website/live-edit/
└── website-2/preview/
```

### 3.4 Next BFF — `src/app/api/`

```
api/
├── v1/ai/…                 # AI proxy
├── center-ai/              # catalog, chat, commerce, seo, status
└── plugins/china-import/   # plugin API bridge
```

### 3.5 Components — `src/components/`

```
activity, again, ai-os, attributes, auth, blog, brands, bundles,
catalog, categories, collections, commerce, configurator, customers,
dashboard, data-grid, filters, inventory, item-workspace, layout,
localisation, manufacturing, marketing, media, navigation, products,
providers, purchase, reports, reviews, sales, seo, service, settings,
shared, specifications, storefront, suppliers, theme, timeline, ui,
variants, website, website-shell, workspace
```

### 3.6 Lib — `src/lib/`

```
api/, catalog/, commerce/, inventory/, sales/, storefront/, website/,
seo/, media/, marketing/, customers/, plugins/, mock-data/, navigation/,
url-slug/, workspace/, center-ai/, …
```

---

## 4. `apps/frontstore` — Customer shop

**Stack:** Next.js · TypeScript · Tailwind  
**Dev:** `npm run dev` → http://localhost:3010  
**Env:** `apps/frontstore/.env.local` → `NEXT_PUBLIC_API_URL=http://127.0.0.1:8010`  
**Calls:** AgainERP API `/api/v1/storefront/*`

```
apps/frontstore/
├── package.json
├── .env.local
├── public/
└── src/
    ├── app/
    │   ├── page.tsx              # homepage
    │   ├── [slug]/              # product / category / CMS
    │   ├── checkout/
    │   │   └── cart/
    │   ├── compare/
    │   ├── login/
    │   ├── register/
    │   └── order-track/
    ├── components/
    │   ├── storefront/
    │   │   ├── home/
    │   │   ├── catalog/
    │   │   ├── product/
    │   │   ├── cart/
    │   │   ├── compare/
    │   │   ├── wishlist/
    │   │   └── auth/
    │   └── ui/
    └── lib/
        ├── api/
        └── mock-data/
```

---

## 5. `apps/api` — Backend

**Stack:** FastAPI · SQLAlchemy · PostgreSQL (psycopg)  
**Dev:** `uvicorn main:app --host 127.0.0.1 --port 8010 --reload`  
**Env:** `apps/api/.env`  
**Docs:** http://127.0.0.1:8010/docs  
**Health:** http://127.0.0.1:8010/health

```
apps/api/
├── main.py
├── requirements.txt
├── Dockerfile
├── .env / .env.example
├── app/
│   ├── database.py
│   ├── deps/
│   ├── models/          # ~105 SQLAlchemy models
│   ├── schemas/
│   ├── routers/         # /api/v1/* endpoints
│   ├── services/        # business logic by domain
│   └── integrations/    # e.g. opencart
├── modules/
│   └── sales/           # sales permissions + workflow
├── scripts/
│   ├── init_db.py       # create tables + seed
│   ├── test_connection.py
│   └── *_seed_data.py
├── seed_assets/         # header / footer / side_menu images
└── uploads/
```

### 5.1 Routers (by domain)

| Domain | Router files |
|--------|----------------|
| **Auth** | `auth`, `auth_users` |
| **Catalog** | `catalog_products`, `catalog_categories`, `catalog_brands`, `catalog_variants`, `catalog_collections`, `catalog_filters`, `catalog_reviews`, `catalog_attribute_profiles`, `catalog_ai`, blog routers |
| **Commerce / Sales** | `commerce_orders`, `commerce_customers`, `commerce_returns`, `commerce_refunds`, `commerce_suppliers`, `sales`, `invoices` |
| **Inventory** | `inventory_*` (stock, warehouses, pickings, quants, scraps, replenishment, …) |
| **Items / Ecommerce** | `items`, `ecommerce_items`, `digital_files` |
| **Storefront** | `storefront_products`, `storefront_cart`, `storefront_checkout`, `storefront_orders`, `storefront_nav`, `storefront_menus`, `storefront_homepage`, `storefront_category_page`, `storefront_resolve`, `storefront_chat` |
| **Website** | `website_pages`, `website_menus`, `website_layouts`, `website_settings`, `website_homepage`, `website_category_page`, `website_builder_documents` |
| **Marketing** | `marketing_coupons`, `marketing_campaigns`, `marketing_audiences`, `marketing_journeys` |
| **SEO** | `seo_meta`, `seo_urls`, `seo_redirects`, `seo_audit`, `seo_pagespeed` |
| **Media** | `media` |
| **Parties** | `parties`, `party_workspace`, `collaboration` |
| **Purchase / Supplier** | `purchase`, `supplier_catalog`, `provider_import_staging`, `provider_mapping` |
| **POS / Finance** | `pos`, `finance` |
| **Configurator** | `configurator_*` |
| **Service** | `service_categories` |
| **AI** | `ai_agents`, `ai_tools`, `ai_providers`, `ai_connections`, `ai_approvals`, `ai_audit_logs`, `ai_dashboard` |
| **Plugins / Platform** | `plugins_cloudflare`, `plugins_alibaba`, `platform_settings` |
| **Health** | `health` |

### 5.2 Services — `app/services/`

```
collaboration/, commerce/, ecommerce/, finance/, inventory/,
items/, parties/, pos/, purchase/, sales/, supplier/
(+ top-level service modules for website, catalog, SEO, …)
```

### 5.3 Key models (examples)

```
catalog_product, catalog_category, catalog_brand, catalog_product_variant
commerce_order, commerce_order_item, commerce_customer, commerce_supplier
item, ecommerce_item, inventory_*, party*
storefront_cart, website_page, website_menu, website_homepage
marketing_*, seo_*, media, auth_user, provider_import*
```

---

## 6. `plugins/china-import`

Dropshipping-related import UI (1688 / Alibaba POC). Loaded from admin `plugins/china-import`.

```
plugins/china-import/
└── src/
    ├── ChinaImportApp.tsx
    ├── index.ts / app.ts
    ├── api/
    ├── components/
    ├── config/
    ├── core/
    ├── explorer/
    ├── fixtures/
    ├── hooks/
    ├── mapper/ + mapping/
    ├── models/
    ├── pages/
    ├── providers/
    ├── services/
    ├── types/
    └── utils/
```

Enable flag (admin web): `NEXT_PUBLIC_CHINA_IMPORT_PLUGIN=1`

---

## 7. `ai/` — Legacy AI runtime package

Large copied package from AgainERP (context, memory, prompt, orchestrator, registry, security, …).  
Not the primary AgainERP product path — prefer API `ai_*` routers + Center gateway if needed.

```
ai/
├── adapters/, config/, constants/, core/
├── context/, memory/, prompt/, orchestrator/
├── providers/, registry/, security/, tools/
├── models/, types/, utils/, validation/
└── …
```

---

## 8. Infra & scripts

| File / path | Purpose |
|-------------|---------|
| `docker-compose.yml` | `againerp-postgres` on **5440**; optional api/web containers |
| `apps/api/scripts/init_db.py` | create tables + seed demo data |
| `scripts/start-storefront-ai.sh` | helper |
| `scripts/start-cloudflare-tunnel.sh` | Cloudflare Tunnel for local OAuth callbacks |
| `scripts/verify-ai-migration.sh` | helper |

### Ports vs AgainERP

| | AgainERP | AgainERP |
|--|----------|-----------|
| Admin | 3210 | 3200 |
| API | 8010 | 8000 |
| DB | 5440 | 5433 |
| Frontstore | 3010 | 3000 |

Do **not** merge databases.

### Sibling deps

`apps/web` may use file deps:

- `../againerp-center/platform/runtime-sdk`
- `../againerp-center/platform/shared-contracts`

---

## 9. Dropshipping focus (what matters most)

```
Elim API (Taobao / 1688)
        │
        ▼
  Admin select  →  /catalog/import
        │  English title + BDT = cost×rate + profit + server fee
        ▼
  Catalog (only selected SKUs)  →  Frontstore customer
        │
        ▼
  Local commerce order
        │
        ▼
  /sales/dropship  →  open 1688 link  →  manual supplier order + status
```

| Piece | Path |
|-------|------|
| Import UI | `apps/web/src/app/(admin)/catalog/import/page.tsx` |
| Import API | `apps/api/app/routers/elim_import.py` |
| Pricing map | `apps/api/app/services/elim_catalog_import.py` |
| Fulfill UI | `apps/web/src/app/(admin)/sales/dropship/page.tsx` |
| Fulfill API | `apps/api/app/routers/dropship.py` |

Catalog `custom_specs_json` keeps: `elim_id`, `platform`, `cost_cny`, `exchange_rate`, `profit_bdt`, `server_charge_bdt`, `supplier_link`.  
Order columns: `supplier_order_status`, `supplier_order_id`, `supplier_notes`.

