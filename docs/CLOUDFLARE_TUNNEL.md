# Cloudflare Tunnel — local OAuth callbacks

> **Product:** AgainERP  
> **Location:** `scripts/start-cloudflare-tunnel.sh` + `apps/api` Settings  
> **Status:** Dev helper (quick tunnel)  
> **Authority:** Follows AgainERP Cloudflare OAuth plugin patterns + AgainERP script/env conventions

Expose the local AgainERP API through Cloudflare Tunnel so third-party OAuth
providers can redirect to `localhost` during development.

Reusable for:

| Provider | Callback (API) |
|----------|----------------|
| Alibaba.com (GGS-ISV) | `/api/v1/plugins/alibaba/oauth/callback` |
| Cloudflare (existing) | `/api/v1/plugins/cloudflare/oauth/callback` |
| Amazon SP-API | *(future — same tunnel URL)* |
| Google / Facebook / Microsoft | *(future — same tunnel URL)* |

---

## Problem statement

Alibaba (and most OAuth providers) require a public `https://` redirect URI.
Local `http://127.0.0.1:8010` is not reachable from their servers. A Cloudflare
quick tunnel fronts the existing API without changing architecture.

---

## Prerequisites

1. AgainERP API listening on `:8010` (see [BRAIN.md](../BRAIN.md))
2. `cloudflared` installed: `brew install cloudflare/cloudflare/cloudflared`

---

## Run

```bash
# Terminal A — API
cd apps/api && source .venv/bin/activate
PYTHONPATH=. uvicorn main:app --host 127.0.0.1 --port 8010 --reload

# Terminal B — tunnel
./scripts/start-cloudflare-tunnel.sh
```

Copy the printed `https://….trycloudflare.com` URL into `apps/api/.env`:

```bash
CLOUDFLARE_TUNNEL_ENABLED=true
CLOUDFLARE_TUNNEL_URL=https://<assigned>.trycloudflare.com
ALIBABA_OAUTH_REDIRECT_URI=https://<assigned>.trycloudflare.com/api/v1/plugins/alibaba/oauth/callback
ALIBABA_OAUTH_APP_KEY=<from Alibaba console>
ALIBABA_OAUTH_APP_SECRET=<from Alibaba console>
```

Restart the API so Settings reload. Register the same redirect URI in the
Alibaba Open Platform console.

---

## Callback behaviour (Alibaba)

| Route | Auth | Behaviour |
|-------|------|-----------|
| `GET /api/v1/plugins/alibaba/oauth/status` | Bearer | Shows configured redirect URI + tunnel |
| `GET /api/v1/plugins/alibaba/oauth/callback` | Public | Reachability JSON, or redirect on `?code=` |

**Token exchange is not implemented.** The callback only proves the tunnel +
redirect URI work. Exchange lands in a later step (same pattern as
`cloudflare_oauth.exchange_authorization_code`).

---

## Env reference

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_TUNNEL_ENABLED` | When true, local Alibaba redirect may rewrite to tunnel URL |
| `CLOUDFLARE_TUNNEL_URL` | Public origin from `cloudflared` |
| `CLOUDFLARE_TUNNEL_LOCAL_HOST` / `_PORT` | What the tunnel forwards to (default `127.0.0.1:8010`) |
| `ALIBABA_OAUTH_*` | App key/secret + redirect/success URLs |

---

## Related

- Cloudflare plugin OAuth: `apps/api/app/services/cloudflare_oauth.py`
- Alibaba helpers: `apps/api/app/services/alibaba_oauth.py`
- Router: `apps/api/app/routers/plugins_alibaba.py`
- Run map: [BRAIN.md](../BRAIN.md)
- Structure: [STRUCTURE.md](../STRUCTURE.md)
