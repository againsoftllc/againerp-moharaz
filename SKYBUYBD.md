# SkyBuy BD — Reference Structure (AgainERP target process)

Study of [skybuybd.com](https://skybuybd.com) (Jul 2026).  
AgainERP will **maintain this hybrid process** (live China browse + local cache + local orders).

Related: [BRAIN.md](./BRAIN.md) · [STRUCTURE.md](./STRUCTURE.md)

---

## 1. Model (what we copy)

```
Customer search / browse
        │
        ▼
┌───────────────────────┐     live keyword / image search
│  China marketplace    │◄──── Elim (or similar) via OUR backend
│  LIVE proxy API       │
└───────────┬───────────┘
            │ open product / import / first view
            ▼
┌───────────────────────┐     English title + BDT price + specs
│  Local product cache  │◄──── Mongo/Postgres row (abb-{offerId})
│  (DB)                 │      images stay on 1688 CDN (optional hotlink)
└───────────┬───────────┘
            │ add to cart / checkout
            ▼
┌───────────────────────┐
│  Local cart + orders  │──── admin fulfills on 1688 manually
└───────────────────────┘
```

**Not** admin-only import. Customer can search China catalog live; selected / opened products land in our DB.

---

## 2. What SkyBuy actually does

### Stack (observed)

| Piece | SkyBuy |
|-------|--------|
| Frontend | Next.js App Router (`/_next/...`), Cloudflare |
| Customer API | `https://api.skybuybd.com/v1/customer` |
| China proxy API | `https://api.skybuybd.com/bcommerce` |
| Upload / CDN API | `https://cdnapi.skybuybd.com/v1/customer` |
| Media (gallery) | DigitalOcean Spaces |
| Product images | Hotlink `cbu01.alicdn.com` / `global-img-cdn.1688.com` |
| Elim in browser? | **No** — browser never calls Elim; only SkyBuy’s API |

### Two data paths

| Path | Endpoint pattern | Behavior |
|------|------------------|----------|
| **Live search** | `GET /bcommerce/search?keyword=phone` | Returns ~thousands of hits; numeric offer codes; BDT price already; alicdn thumbs |
| **Local / cached catalog** | `GET /v1/customer/products/trending` | Mongo `_id`, code `abb-{1688OfferId}`, `createdAt` / `updatedAt`, BDT `regular_price` |
| **PDP** | `/product/abb-{id}` (SSR) | Full product from **their DB** (`platform: "skybuy"`); images still 1688 CDN |
| **Orders / cart / account** | `/v1/customer/...` | Fully local |

### Product identity

- Prefix **`abb-`** + 1688 offer id → China-sourced product in their system  
- Prefix **`sky-`** → domestic / own SKU (UI checks both)  
- Search result numeric `code` → front builds link as `/product/abb-{code}`

### Sitemap / SEO note

Public sitemap lists only static pages (`/`, `/products`, `/categories`, …) — not millions of SKUs. Catalog is API-driven, not a fully static local dump.

### Frontend routes (customer)

| Route | Role |
|-------|------|
| `/` | Home + trending from local API |
| `/products` | Curated / trending list |
| `/marketplace/products` | Marketplace entry |
| `/marketplace/search/{keyword}` | Live China search UI |
| `/marketplace/domestic` · `/global` · `/stores` | Marketplace segments |
| `/product/{code}` | Product detail (cached row) |
| `/shop/{slug}` | Category shop pages |
| `/cart` · `/account/*` | Local commerce |

### Pricing / shipping (config API)

`GET /v1/customer/config` → country `BD`, air shipping slabs (৳/kg by category).  
Sell prices shown to customer are already **BDT** (conversion + margin happen on **their backend**, not in the browser).

---

## 3. AgainERP process to maintain (target)

Mirror SkyBuy’s hybrid — use **Elim** as China source behind our API.

### A. Live (customer-facing)

1. Frontstore search / marketplace → **our API** → Elim search/find  
2. Return list: title, BDT preview price, thumbnail URL, `elim_id` / offer id  
3. Browser never holds Elim API key

### B. Cache on open / select

1. Customer opens PDP **or** admin imports → upsert **local catalog** row  
2. Store: English title, BDT sell price, specs, `elim_id`, supplier link, cost CNY, rate used  
3. Formula (unchanged):  
   `sell_bdt = cost_cny × exchange_rate + profit_bdt + server_charge_bdt`  
4. Optional later: “Refresh from Elim” to update cost/price

### C. Local commerce

1. Cart + checkout + orders = **local DB only**  
2. Admin `/sales/dropship` → open 1688 link → place supplier order manually → status notes

### D. What we do **not** copy blindly

- Their private `bcommerce` stack (we build our own slim Elim proxy)  
- Re-hosting all images (hotlink or cache later)  
- Auto-buy on 1688 (still manual unless we add it later)

---

## 4. AgainERP implementation map

| SkyBuy concept | AgainERP equivalent |
|----------------|---------------------|
| `bcommerce/search` | API: Elim search proxy e.g. `/api/v1/storefront/china/search` |
| `v1/customer/products/*` | Local catalog + storefront catalog APIs |
| `/marketplace/search/...` | **Not in Monarch frontstore** — future AgainERP-only storefront |
| `/product/abb-...` | Future AgainERP storefront PDP + cache-on-open |
| Config shipping / rates | Env + settings: `DROPSHIP_CNY_TO_BDT`, profit, server fee |
| Admin fulfill | `/sales/dropship` (already) |
| Admin bulk pick | `/catalog/import` (already; keep for ops) |

### Boundary (important)

- **Monarch** (`/htdocs/monarch`): no AgainERP marketplace UI.
- **AgainERP frontstore** (`apps/frontstore`): live China marketplace + local cart (SkyBuy hybrid).
- **AgainERP API**: `/api/v1/storefront/china/*` for search + cache-on-open.

### Phased build order (revised)

1. Admin Elim search + import — **DONE** (`/catalog/import`)
2. DropShip API china proxy + cache — **DONE**
3. Hotlink gallery/video URLs (no media download) — **DONE**
4. AgainERP frontstore marketplace + cache-on-open — **DONE** (`/marketplace`)
5. Curated categories + `china_search_keyword` browse (SkyBuy sidebar) — **DONE**
6. Keep `/sales/dropship` for 1688 fulfill

### Category browse (SkyBuy hybrid)

- Local `catalog_categories.china_search_keyword` (e.g. Hoodies → `Hoodies Women`)
- Storefront `/{slug}` with keyword → live Elim search (40/page) + sidebar
- Cache-on-open sends `category_id` so product aligns to that category
- Free marketplace search still works; auto-map uses title/keyword rules when no preferred id

### Admin flow (current)

```
Admin /catalog/import  →  Elim title search  →  import to local catalog
                                                      ↓
Frontstore China browse OR /marketplace  →  cache-on-open (+ category)
                                                      ↓
Local PDP / cart / checkout  →  /sales/dropship
```

---

## 5. Probe cheatsheet (SkyBuy — for re-check)

```bash
# Live China search
curl -s 'https://api.skybuybd.com/bcommerce/search?keyword=phone' | head

# Local trending cache
curl -s 'https://api.skybuybd.com/v1/customer/products/trending?limit=2' | head

# Site config (shipping, BD)
curl -s 'https://api.skybuybd.com/v1/customer/config' | head
```

---

## 6. Decision log

| Date | Decision |
|------|----------|
| 2026-07-12 | Studied SkyBuy: hybrid live + local cache |
| 2026-07-13 | Phase 1: Elim gallery/video = CDN URL columns only (no Media file rows) |
| 2026-07-12 | AgainERP will **maintain this process** (not admin-import-only forever) |
| 2026-07-12 | Elim stays server-side; customer sees our API only |
| 2026-07-13 | Hybrid API built; then **Monarch frontstore AgainERP UI rolled back** |
| 2026-07-13 | Rule: never put AgainERP marketplace code in Monarch / `apps/frontstore` |
