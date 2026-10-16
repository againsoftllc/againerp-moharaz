# AgainERP — BRAIN

AI + developer entry. Structure → [STRUCTURE.md](./STRUCTURE.md).  
Dropship process reference → [SKYBUYBD.md](./SKYBUYBD.md).  
**DB/project isolation** → [SEPARATION.md](./SEPARATION.md).  
Local OAuth tunnel → [docs/CLOUDFLARE_TUNNEL.md](./docs/CLOUDFLARE_TUNNEL.md).  
**Vendor module spec (read before touching this module)** → [apps/api/modules/vendor/SPEC.md](./apps/api/modules/vendor/SPEC.md) — implementation status → [STATUS.md](./apps/api/modules/vendor/STATUS.md).

---

## Three projects (do not mix)

```
┌─────────────────────────────┐     aligned pair (ERP + shop UI)
│  MoharazNX                  │◄──►│  Monarch                 │
│  /htdocs/moharaznx          │     │  /htdocs/monarch         │
│  Admin :3200  API :8000     │     │  Storefront → API :8000  │
│  DB moharaznx @ :5433       │     │                          │
└─────────────────────────────┘     └──────────────────────────┘

┌─────────────────────────────┐
│  AgainERP  (THIS repo)      │   fully separate
│  /htdocs/againerp           │
│  Admin :3210  API :8010     │
│  Frontstore :3010           │
│  DB againerp @ :5440        │
└─────────────────────────────┘
```

| Project | Role | Database | Ports |
|---------|------|----------|-------|
| **MoharazNX** | ERP / admin + API | `moharaznx` @ **5433** | Admin **3200**, API **8000** |
| **Monarch** | Customer storefront for MoharazNX | *(uses MoharazNX API/DB)* | Shop → API **8000** |
| **AgainERP** | Dropshipping / ERP product (own stack) | `againerp` @ **5440** | Admin **3210**, API **8010**, Shop **3010** |

### Rules

1. **MoharazNX ↔ Monarch stay aligned.** Do not put AgainERP features into Monarch or MoharazNX unless the user asks for that work.
2. **AgainERP is separate.** Own folder, own Postgres (`againerp` / port **5440**), own ports. Never point AgainERP at MoharazNX DB (`5433`).
3. AgainERP `apps/frontstore` is AgainERP’s own shop UI (started from a Monarch copy). Do not sync AgainERP features back into `/htdocs/monarch`.
4. Keep port offsets so both stacks can run at once.

---

## Product (AgainERP only)

```
Elim API  →  Admin import  →  Local catalog (EN + BDT)
                                 ↓
Customer (AgainERP frontstore)  →  Local order  →  Admin 1688 fulfill
```

- Sell price: `cost_cny × exchange_rate + profit_bdt + server_charge_bdt`
- Fulfillment: manual on 1688 (`/sales/dropship`)

## Where to work (AgainERP)

| Task | Path |
|------|------|
| Elim import | `apps/web/.../catalog/import` + `apps/api/.../elim_*` |
| China API (backend) | `apps/api/.../storefront_china.py` |
| Alibaba.com OAuth callback | `apps/api/.../plugins_alibaba.py` + [docs/CLOUDFLARE_TUNNEL.md](./docs/CLOUDFLARE_TUNNEL.md) |
| 1688 queue | `apps/web/.../sales/dropship` |
| Admin | `apps/web/` :3210 |
| Shop | `apps/frontstore/` :3010 → API :8010 (fresh **Monarch** copy) |
| API + DB | `apps/api/` + Postgres :5440 |
| Vendor Management (spec first!) | `apps/api/modules/vendor/SPEC.md` |

**Multi-frontend (same admin/API, different shop UI):** [docs/MULTI-FRONTEND-API-CONNECT.md](./docs/MULTI-FRONTEND-API-CONNECT.md) — reference: sibling `againerp-frontend`.  
**Live Edit (shop + later admin, one content):** [docs/LIVE-EDIT-MULTI-ENTRY.md](./docs/LIVE-EDIT-MULTI-ENTRY.md).

## Run (AgainERP local)

| Service | URL |
|---------|-----|
| Admin | http://localhost:3210 |
| Frontstore (Monarch UI) | http://localhost:3010 |
| Admin → Website Live Edit | opens frontstore iframe from :3010 |
| API | http://127.0.0.1:8010 |
| DB | `postgresql://againerp:againerp@127.0.0.1:5440/againerp` |
| Elim Import | http://localhost:3210/catalog/import |
| Dropship | http://localhost:3210/sales/dropship |

Login: `admin@againerp.local` / `admin123`  
Env: `ELIM_API_KEY`, `DROPSHIP_CNY_TO_BDT`, `DROPSHIP_DEFAULT_PROFIT_BDT`, `DROPSHIP_DEFAULT_SERVER_FEE_BDT`  
OAuth tunnel: `./scripts/start-cloudflare-tunnel.sh` → set `CLOUDFLARE_TUNNEL_*` + `ALIBABA_OAUTH_*` (see [docs/CLOUDFLARE_TUNNEL.md](./docs/CLOUDFLARE_TUNNEL.md))
