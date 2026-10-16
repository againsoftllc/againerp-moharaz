#!/usr/bin/env bash
# Expose AgainERP API via Cloudflare Tunnel for local OAuth callbacks
# (Alibaba, Amazon SP-API, Google, Facebook, Microsoft, …).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ENV="$ROOT/apps/api/.env"

LOCAL_HOST="127.0.0.1"
LOCAL_PORT="8010"

if [ -f "$API_ENV" ]; then
  # shellcheck disable=SC1090
  set -a
  # Only pull tunnel-related keys (avoid sourcing broken tokens with |)
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      CLOUDFLARE_TUNNEL_LOCAL_HOST=*|CLOUDFLARE_TUNNEL_LOCAL_PORT=*|API_PORT=*)
        key="${line%%=*}"
        val="${line#*=}"
        val="${val%\"}"
        val="${val#\"}"
        export "$key=$val"
        ;;
    esac
  done < "$API_ENV"
  set +a
  LOCAL_HOST="${CLOUDFLARE_TUNNEL_LOCAL_HOST:-$LOCAL_HOST}"
  LOCAL_PORT="${CLOUDFLARE_TUNNEL_LOCAL_PORT:-${API_PORT:-$LOCAL_PORT}}"
fi

TARGET="http://${LOCAL_HOST}:${LOCAL_PORT}"

echo "AgainERP — Cloudflare Tunnel"
echo "============================="
echo "Local target: $TARGET"
echo ""

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found."
  echo "Install: brew install cloudflare/cloudflare/cloudflared"
  echo "Docs:    docs/CLOUDFLARE_TUNNEL.md"
  exit 1
fi

if ! lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "WARNING: nothing is listening on ${LOCAL_HOST}:${LOCAL_PORT}."
  echo "Start the API first, e.g.:"
  echo "  cd $ROOT/apps/api && source .venv/bin/activate && PYTHONPATH=. uvicorn main:app --host 127.0.0.1 --port ${LOCAL_PORT} --reload"
  echo ""
fi

echo "Starting quick tunnel (trycloudflare.com)…"
echo "When the URL appears:"
echo "  1) Set in apps/api/.env:"
echo "       CLOUDFLARE_TUNNEL_ENABLED=true"
echo "       CLOUDFLARE_TUNNEL_URL=https://<assigned>.trycloudflare.com"
echo "       ALIBABA_OAUTH_REDIRECT_URI=https://<assigned>.trycloudflare.com/api/v1/plugins/alibaba/oauth/callback"
echo "  2) Register that redirect URI in Alibaba Open Platform"
echo "  3) Restart API, then GET /api/v1/plugins/alibaba/oauth/callback"
echo ""

exec cloudflared tunnel --url "$TARGET"
