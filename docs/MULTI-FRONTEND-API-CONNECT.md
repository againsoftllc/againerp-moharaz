# Multi-frontend ↔ AgainERP API connect playbook

**Goal:** One **admin + API + DB** (AgainERP). Many **customer frontends** (different UI themes) talk to the **same API**.

Use this doc every time you add another storefront (like `againerp-frontend`).

Related: [DEPLOY-RAILWAY-VERCEL.md](./DEPLOY-RAILWAY-VERCEL.md) · reference frontend: `../againerp-frontend`

---

## Architecture (fixed)

```
┌─────────────────────────────┐
│  AgainERP admin (Vercel)    │  https://erp.againerp.com
│  apps/web :3210 local       │  NEXT_PUBLIC_STOREFRONT_URL → active shop
└─────────────┬───────────────┘
              │ API_PROXY_TARGET
              ▼
┌─────────────────────────────┐
│  AgainERP API (Railway)     │  https://againerp-production.up.railway.app
│  apps/api :8010 local       │  CORS_ORIGINS includes every frontend origin
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Postgres                   │  Railway / local :5440
└─────────────────────────────┘

Frontends (N themes, same API):
  • againerp-frontend  → Vercel + local :3010   (Autology UI)
  • (next theme…)      → own Vercel project + port
  • TechPickly pair    → separate ERP stack (AgainERP-Techpickly) — do not mix
```

**Rules**

1. Admin stays in `againerp` — do not fork admin per theme.
2. Each customer UI = **own repo / Vercel project**.
3. Browser must call **same-origin** `/api/v1/...` on the frontend; Next proxies with `API_PROXY_TARGET`.
4. Never set production `NEXT_PUBLIC_API_URL` / proxy to `http://127.0.0.1:8010`.
5. Local Docker: frontend joins network `againerp_default` and uses `http://api:8010`.

---

## Checklist — connect a new frontend

Replace `NEW_FRONTEND` / ports / URLs with the new theme’s values.

### A) Repo scaffold

- [ ] New folder next to `againerp`, e.g. `../NEW_FRONTEND`
- [ ] Own git remote (not inside `againerp`)
- [ ] Next.js App Router
- [ ] Copy proxy pattern from `againerp-frontend`:
  - `src/lib/api/proxy-to-api.ts`
  - `src/app/api/v1/[...path]/route.ts`
  - `src/app/uploads/[...path]/route.ts` (if media from API)
  - `src/lib/api/client.ts` — **browser base URL = `""`** (same-origin)

### B) Env files (frontend repo)

`.env.example` / local `.env.local`:

```bash
# Local npm
NEXT_PUBLIC_API_URL=http://127.0.0.1:8010
API_PROXY_TARGET=http://127.0.0.1:8010
NEXT_PUBLIC_ADMIN_ORIGIN=http://localhost:3210

# Docker compose overrides for SSR:
# API_PROXY_TARGET=http://api:8010
# API_INTERNAL_URL=http://api:8010
```

`next.config.ts`: `frame-ancestors` include admin origins (`localhost:3210` + `NEXT_PUBLIC_ADMIN_ORIGIN`) so Website Live Edit iframe works.

### C) Local Docker

1. ERP stack already up:

```bash
cd ../againerp && docker compose up -d
# Admin :3210 · API :8010 · DB :5440 · network: againerp_default
```

2. Frontend `docker-compose.yml` (pattern):

```yaml
name: NEW_FRONTEND
services:
  storefront:
    build: .
    ports: ["3010:3010"]   # pick a free port if 3010 taken
    environment:
      API_PROXY_TARGET: http://api:8010
      API_INTERNAL_URL: http://api:8010
      NEXT_PUBLIC_API_URL: http://127.0.0.1:8010
      NEXT_PUBLIC_ADMIN_ORIGIN: http://localhost:3210
    networks:
      - default
      - againerp
networks:
  againerp:
    external: true
    name: againerp_default
```

3. Verify:

```bash
curl -sI http://localhost:3010
curl -s http://localhost:3010/api/v1/storefront/settings
# expect HTTP 200 (or auth-shaped JSON from API — not 502)
```

### D) GitHub + Vercel

```bash
# In NEW_FRONTEND repo
git push -u origin main
vercel link --yes --project NEW_FRONTEND   # or create project
```

**Vercel Production (+ Preview) env:**

| Variable | Value (AgainERP) |
|----------|------------------|
| `API_PROXY_TARGET` | `https://againerp-production.up.railway.app` |
| `NEXT_PUBLIC_API_URL` | `https://againerp-production.up.railway.app` |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | `https://erp.againerp.com` |

```bash
vercel deploy --prod --yes
# Note production URL, e.g. https://NEW_FRONTEND.vercel.app
```

### E) Railway API (CORS)

From `againerp` (linked to Railway project **AgainERP**):

```bash
railway link   # AgainERP / production / againerp service
# Append the new storefront origin to CORS_ORIGINS (comma-separated), e.g.:
# ...,https://NEW_FRONTEND.vercel.app,http://localhost:PORT
railway variables set "CORS_ORIGINS=..." --service againerp
```

Also allow `*.vercel.app` previews via API CORS regex if already configured in FastAPI.

### F) Admin points Live Edit at this shop

On Vercel project **`againerp`** (admin):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_STOREFRONT_URL` | `https://NEW_FRONTEND.vercel.app` (no trailing slash) |

Redeploy admin so the public env is baked in:

```bash
cd ../againerp && vercel deploy --prod --yes
```

Local admin compose already uses `NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3010` (or update port).

### G) Smoke tests

| Check | Expect |
|-------|--------|
| `https://NEW_FRONTEND.vercel.app` | 200 |
| `https://NEW_FRONTEND.vercel.app/api/v1/storefront/settings` | 200 / API JSON (not 502) |
| Admin → Website Live Edit | iframe loads new storefront |
| Local `:PORT` + Docker API | same proxy OK |

---

## Reference: what we did for `againerp-frontend` (Aug 2026)

| Step | Result |
|------|--------|
| Source UI | Copied from `autology` → `againerp-frontend` |
| Git | https://github.com/againsoft/againerp-frontend |
| Local | Docker on **:3010**, network `againerp_default` → `api:8010` |
| Vercel | Project `againerp-frontend` → https://againerp-frontend.vercel.app |
| Railway | CORS includes `https://againerp-frontend.vercel.app` |
| Admin | `NEXT_PUBLIC_STOREFRONT_URL=https://againerp-frontend.vercel.app` · https://erp.againerp.com |
| API proxy | `/api/v1/*` + `/uploads/*` → FastAPI |

**Do not confuse with TechPickly:** `techpickly` + `againerp-techpickly` is a **separate** ERP tenant/stack (`erp.techpickly.com`). AgainERP multi-frontend work always targets Railway project **AgainERP** + admin **erp.againerp.com**.

---

## Dynamic UI later (API wiring)

Frontends start with mock/`src/data/*`. When making pages live:

1. Use `apiFetch('/api/v1/storefront/...')` from `src/lib/api/client.ts` (same-origin in browser).
2. Prefer existing storefront routes on the API (`/api/v1/storefront/products`, `homepage`, `cart`, `checkout`, `auth`, …).
3. No change needed to Railway URL if proxy + CORS already set — only frontend code swaps mock → API.
4. After UI deploy, re-check `/api/v1/storefront/settings` on the Vercel domain.

---

## Live Editor (two entry points, one content)

**Same homepage CMS can be edited from both places** — order of work:

| Phase | Where | What |
|-------|--------|------|
| **1 (now)** | Storefront (`againerp-frontend`) | Monarch-style self-contained Live Edit: `/website/live-edit` → shell + iframe preview + drawers. Save via `homepageRepository` (file JSON first). |
| **2 (next)** | AgainERP admin | Website Live Edit iframe (`?liveEdit=1` + postMessage) + admin drawers; Save via AgainERP API/DB. Same `HomepageContent` contract. |

Reference playbook (Monarch): `../Monarch-IT-V2/docs/LIVE-EDIT-PLAYBOOK.md`  
AgainERP detail doc: [LIVE-EDIT-MULTI-ENTRY.md](./LIVE-EDIT-MULTI-ENTRY.md)

### Hard rules

1. **One content contract** (`HomepageContent`) for public site + storefront editor + (later) admin.
2. Persist only through `homepageRepository` — Phase 2 swaps file → API adapter; shell/canvas/drawers stay.
3. Device preview = **real iframe viewport** (not CSS-only width).
4. Storefront local auth = cookie + middleware (not bare `?liveEdit=1` unlock). Admin guest mode uses `?liveEdit=1` only inside admin iframe.
5. Only one admin `NEXT_PUBLIC_STOREFRONT_URL` “active” for iframe Live Edit at a time.

### Autology section map (Phase 1)

| Type | UI |
|------|-----|
| `hero` | Hero banners + side ads |
| `notice` | Notice marquee |
| `categories` | Featured category icons |
| `products` | Featured products grid |
| `seo` | SEO blocks |
| chrome | `header`, `footer` |

### Phase 1 checklist (per frontend)

- [ ] `src/lib/live-edit/*` + `src/data/homepage.json`
- [ ] `src/components/live-edit/*` (shell, preview, section, drawers)
- [ ] Routes: `/website/live-edit`, `/home`, `/home/preview` + `/api/live-edit/*`
- [ ] `middleware.ts` auth guard
- [ ] Public `/` reads `homepageRepository`
- [ ] Copy/adapt playbook into that frontend’s `docs/`
- [ ] Env: `LIVE_EDIT_USER` / `LIVE_EDIT_PASS` / `LIVE_EDIT_SECRET`

### Phase 2 checklist (admin connect)

- [ ] `homepageRepository` → AgainERP API write/read
- [ ] Storefront guest: `?liveEdit=1` outlines + `postMessage` (`live-edit:select`, preview, lock) matching `apps/web/src/lib/website/live-edit.ts`
- [ ] `frame-ancestors` includes admin origins
- [ ] Admin `NEXT_PUBLIC_STOREFRONT_URL` → this shop
- [ ] CORS already includes shop origin

---

## Port map (local)

| Service | Port |
|---------|------|
| AgainERP admin | 3210 |
| AgainERP API | 8010 |
| AgainERP Postgres | 5440 |
| Primary shop (`againerp-frontend`) | 3010 |
| Next theme | choose free port (e.g. 3011) + CORS + `STOREFRONT_URL` when that theme is “active” for Live Edit |

Only **one** `NEXT_PUBLIC_STOREFRONT_URL` is active on admin at a time (the shop Live Edit embeds). Extra themes can still call the same API with their own Vercel + CORS entries.
