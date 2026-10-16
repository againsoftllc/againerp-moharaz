# Live Edit — multi-entry (storefront + admin)

**Goal:** Same homepage content editable from **(1) the customer frontend** and **(2) AgainERP admin**.  
Do Phase 1 first, then Phase 2.

Related: [MULTI-FRONTEND-API-CONNECT.md](./MULTI-FRONTEND-API-CONNECT.md) · Monarch playbook: `../Monarch-IT-V2/docs/LIVE-EDIT-PLAYBOOK.md`

---

## Architecture

```
┌──────────────────────────────────────┐
│  Storefront Live Edit (Phase 1)      │  /website/live-edit/*
│  againerp-frontend :3010 / Vercel    │  drawers + iframe on shop domain
└──────────────────┬───────────────────┘
                   │ homepageRepository
                   ▼
┌──────────────────────────────────────┐
│  HomepageContent (one JSON contract) │  file today → API/DB tomorrow
└──────────────────┬───────────────────┘
                   │ Phase 2 adapter
                   ▼
┌──────────────────────────────────────┐
│  AgainERP API + DB                   │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│  Admin Website Live Edit (Phase 2)   │  erp.againerp.com
│  iframe → shop?liveEdit=1            │  drawers in admin; postMessage
└──────────────────────────────────────┘
```

Both UIs must read/write the **same** `HomepageContent` shape (or a versioned 1:1 map).

---

## Phase 1 — Monarch-style on frontend (do first)

Port patterns from `Monarch-IT-V2` into `againerp-frontend` (Againsoft/Autology-theme sections, not Monarch’s dream_pc/brands).

Demo login: **againsoft** / **againsoft123** · logo: `/images/againcart-logo.png`

| Path | Purpose |
|------|---------|
| `/website/live-edit` | Demo login |
| `/website/live-edit/home` | Editor shell |
| `/website/live-edit/home/preview` | Iframe document |
| `GET/POST /api/live-edit/homepage` | Read / auth write |
| `POST /api/live-edit/login` · logout · session | Auth |

Defaults: user `liveedit` / pass `monarch123` (override with env).

**Partial progress (as of last session):**  
`againerp-frontend` Phase 1 is **wired**: Autology `HomepageContent`, shell/preview/drawers, `/website/live-edit`, file `homepage.json`, public `/` via repository.  
Open http://localhost:3010/website/live-edit — `liveedit` / `monarch123`.  
Playbook: `../againerp-frontend/docs/LIVE-EDIT-PLAYBOOK.md`.

**Next:** Phase 2 admin iframe + API repository.

---

## Phase 2 — Admin connect (after Phase 1 works)

1. Implement `homepageRepository` against AgainERP storefront/homepage API.
2. On storefront: guest mode for admin iframe (`?liveEdit=1`) using message types in `apps/web/src/lib/website/live-edit.ts`.
3. Point admin `NEXT_PUBLIC_STOREFRONT_URL` at the shop; ensure CORS + `frame-ancestors`.

Admin already has `HomeLiveEditShell` etc. — storefront must speak that protocol; do **not** invent a third editor.

---

## Agent resume

When disk/workspace writes to `againerp-frontend` work again:

1. Finish Phase 1 checklist above (follow Monarch playbook §16, Autology section map in MULTI-FRONTEND doc).
2. Smoke: login → edit notice/hero → Save → public `/` updates; lock/unlock hero links.
3. Then Phase 2.
