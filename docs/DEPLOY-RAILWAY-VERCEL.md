# Live deploy: Railway (API + Postgres) + Vercel (Admin Web)

**Adding another customer frontend (same API, different UI):** see [MULTI-FRONTEND-API-CONNECT.md](./MULTI-FRONTEND-API-CONNECT.md).

## Architecture

| Piece | Where | How |
|-------|--------|-----|
| PostgreSQL | Railway | Railway Postgres plugin |
| FastAPI (`apps/api`) | Railway | Docker (`apps/api/Dockerfile`) |
| Next.js admin (`apps/web`) | Vercel | Node build via `apps/web` + root `vercel.json` |

**How API calls work (Docker + Vercel):** the browser always calls **same-origin** `/api/v1/...`. Next.js forwards to FastAPI using **`API_PROXY_TARGET`** (runtime). Do **not** point the browser at `http://127.0.0.1:8010` in production — that is why login showed “Cannot reach API server”.

Local DB is **not** exposed to the internet. Dump it and restore into Railway Postgres with `scripts/migrate-db-to-railway.sh`.

---

## Local Docker

```bash
docker compose up --build -d
# Admin http://localhost:3210 · API http://127.0.0.1:8010
```

Compose already sets:

```
API_PROXY_TARGET=http://api:8010   # web → api service DNS
CORS_ORIGINS=…localhost:3210…3010…
```

After pulling API/web code changes (images bake source via override):

```bash
docker compose up --build -d --force-recreate --no-deps api web
```

---

## You must do (login) — required before I can finish deploy

### 1) Railway login
In a terminal:

```bash
source "$HOME/.railway/env"
railway login
```

Browser open হবে → Againsoft Railway account দিয়ে approve করুন।

### 2) Vercel login

```bash
export PATH="$HOME/.local/bin:$PATH"
vercel login
```

Browser-এ Vercel account approve করুন।

Login শেষ হলে chat-এ লিখুন: **“logged in”** — তারপর আমি project create, Postgres add, API deploy, DB migrate, এবং Vercel link করে দেব।

---

## Railway setup (after login)

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub** → `againsoft/againerp`
2. Add plugin: **PostgreSQL**
3. Add service **api**:
   - Root Directory: `apps/api`
   - Builder: Dockerfile (uses `apps/api/Dockerfile` + `railway.toml`)
4. API Variables (Variables tab):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
# If API uses psycopg URL style, set:
# DATABASE_URL=postgresql+psycopg://…  (or keep Railway URL — API normalizes it)

CORS_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app,https://YOUR-CUSTOM-DOMAIN
APP_ENV=production
APP_DEBUG=false
ELIM_API_KEY=<your AgainDrop API key>
ELIM_BASE_URL=https://openapi.elim.asia
```

`*.vercel.app` preview URLs are also allowed via CORS regex in the API.

5. Generate public domain for the API service (Settings → Networking → Generate Domain).
6. Note the API URL, e.g. `https://againerp-api-production.up.railway.app`

### Migrate local DB → Railway

```bash
source "$HOME/.railway/env"
cd /Applications/projects/againerp
railway link   # select the project
# If using docker-compose DB on 5440:
LOCAL_DATABASE_URL='postgresql://againerp:againerp@127.0.0.1:5440/againerp' ./scripts/migrate-db-to-railway.sh
```

---

## Vercel setup (after login)

1. [vercel.com](https://vercel.com) → Add New Project → Import `againsoft/againerp`
2. **Root Directory**: set to **`apps/web`** (required — Next.js lives here)
3. Framework: Next.js · Install: `npm ci` · Build: `npm run build`
4. Environment variables (**Production + Preview**):

```
API_PROXY_TARGET=https://YOUR-RAILWAY-API-DOMAIN
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-API-DOMAIN
NEXT_PUBLIC_STOREFRONT_URL=https://YOUR-STOREFRONT-DOMAIN
NEXT_PUBLIC_CHINA_IMPORT_PLUGIN=1
```

`API_PROXY_TARGET` is the important one (server proxy). `NEXT_PUBLIC_API_URL` is a fallback for SSR/build — set it to the same Railway HTTPS URL, **never** `http://127.0.0.1:8010` on Vercel.

5. Deploy.

---

## After both are live

1. Open Vercel URL → login (`admin@againerp.local` / `admin123`) — **change password after go-live**.
2. If login fails with “Cannot reach API”, confirm Railway API is up (`/docs`) and Vercel `API_PROXY_TARGET` matches that origin (no trailing slash).
3. Workspace → Plugins → AgainDropAPI → Test connection.

---

## Cloudflare OAuth + R2 (live)

OAuth credentials live on the **Railway API** only. Vercel admin only receives the success redirect.

### 1) Cloudflare dashboard — create OAuth app

1. Open [Cloudflare dashboard](https://dash.cloudflare.com/) → manage account / API credentials for **OAuth applications**.
2. Create an OAuth app with redirect URI **exactly**:
   ```
   https://againerp-production.up.railway.app/api/v1/plugins/cloudflare/oauth/callback
   ```
3. Scopes: `account-settings.read` · `workers-r2.write` · `images.write`
4. Copy **Client ID** + **Client Secret**.

### 2) Railway variables

```
CLOUDFLARE_OAUTH_CLIENT_ID=<from Cloudflare>
CLOUDFLARE_OAUTH_CLIENT_SECRET=<from Cloudflare>
CLOUDFLARE_OAUTH_REDIRECT_URI=https://againerp-production.up.railway.app/api/v1/plugins/cloudflare/oauth/callback
CLOUDFLARE_OAUTH_SUCCESS_REDIRECT=https://erp.againerp.com/settings/plugins/cloudflare
CLOUDFLARE_OAUTH_SCOPES=account-settings.read workers-r2.write images.write
PUBLIC_API_BASE_URL=https://againerp-production.up.railway.app
```

Redeploy / restart the API service after setting secrets.

### 3) Vercel

No Cloudflare OAuth secrets needed on Vercel. Admin is already at `https://erp.againerp.com` (success redirect target).

Optional: `NEXT_PUBLIC_STOREFRONT_URL=https://monarchit-web.vercel.app` (or your live shop domain) for Website Live Edit.

### 4) Activate R2 in admin

1. Open `https://erp.againerp.com/settings/plugins/cloudflare`
2. **Connect with Cloudflare** (OAuth) → account should show connected
3. R2 section: bucket name + R2 S3 access key / secret + public base URL (custom domain or `*.r2.dev`)
4. **Verify R2 Connection** → set media storage to **Cloudflare R2** → Save

---

## Storefront (monarchit-web) on Vercel

Same pattern: set `API_PROXY_TARGET` / `NEXT_PUBLIC_API_URL` to the Railway API HTTPS URL. Browser uses same-origin `/api/v1` rewrites.

Add the storefront origin to Railway `CORS_ORIGINS` if any browser code calls the API directly.

---

## Important notes

- Push latest code to GitHub first (`main`) so Railway/Vercel pick up the runtime API proxy.
- Free Railway plan may hit request/credit limits.
- Do **not** commit `.env` / API keys. Set them only in Railway / Vercel dashboards.
- Repo-root `Dockerfile.web` is optional (Railway web). Preferred: **Vercel for web**.

## AI via AgainERP Center (OpenAI key stays in Center)

The admin AI module (`/ai`) can run entirely through Center: the ERP never holds an OpenAI
key. Center's `/agent/v1/conversation` is text-only, so `CenterProvider` carries tool calls
over a text protocol (see `apps/api/app/services/ai/providers/center_provider.py`); tools
still execute inside the ERP with the signed-in user's permissions.

One-time setup:

1. **Center → Settings → Integrations**: set the *OpenAI API Key* (use its Test button).
2. **Center → Clients**: add/select the client for this ERP, enable *AI Access*, copy the
   client id and the fleet API key.
3. **Railway → api → Variables** (dev API):

   ```
   AI_DEFAULT_PROVIDER=center
   AGAINERP_CENTER_URL=https://center-api-production.up.railway.app
   AGAINERP_CLIENT_ID=<client id from Center>
   AGAINERP_CLIENT_API_KEY=<fleet api key from Center>
   ```

   Or from the repo root: `railway variables --set AI_DEFAULT_PROVIDER=center --set AGAINERP_CENTER_URL=... --set AGAINERP_CLIENT_ID=... --set AGAINERP_CLIENT_API_KEY=...`

If Center is not bound but `ANTHROPIC_API_KEY` is set, the gateway falls back to Claude
automatically; with neither, `/ai` returns a clear "provider not configured" error.

## AgainAI engine key (OpenAI, branded AgainAI)

The AI module runs on OpenAI by default; users only ever see "AgainAI". The key is resolved
per company: **AI → Settings (gear icon, admins)** stores it in the workspace database, and
`OPENAI_API_KEY` on the API service is the deployment-wide fallback. No redeploy is needed
when the key is set from the AI screen. Optional: `OPENAI_MODEL` (default `gpt-4o-mini`).
