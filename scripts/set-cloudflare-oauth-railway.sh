#!/usr/bin/env bash
# Push Cloudflare OAuth vars from apps/api/.env → Railway, then redeploy.
# Usage: ./scripts/set-cloudflare-oauth-railway.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1090
source "$HOME/.railway/env" 2>/dev/null || true

ENV_FILE="$ROOT/apps/api/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

get_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}"
}

CID="$(get_env CLOUDFLARE_OAUTH_CLIENT_ID)"
CSEC="$(get_env CLOUDFLARE_OAUTH_CLIENT_SECRET)"
REDIR="$(get_env CLOUDFLARE_OAUTH_REDIRECT_URI)"
SUCCESS="$(get_env CLOUDFLARE_OAUTH_SUCCESS_REDIRECT)"
SCOPES="$(get_env CLOUDFLARE_OAUTH_SCOPES)"
PUBLIC="$(get_env PUBLIC_API_BASE_URL)"

if [[ -z "$CID" || -z "$CSEC" ]]; then
  echo "CLOUDFLARE_OAUTH_CLIENT_ID / SECRET missing in apps/api/.env"
  exit 1
fi

: "${REDIR:=https://againerp-production.up.railway.app/api/v1/plugins/cloudflare/oauth/callback}"
: "${SUCCESS:=https://erp.againerp.com/settings/plugins/cloudflare}"
: "${SCOPES:=account-settings.read workers-r2.write images.write}"
: "${PUBLIC:=https://againerp-production.up.railway.app}"

echo "Setting Railway Cloudflare OAuth variables (values hidden)…"
railway variables set \
  "CLOUDFLARE_OAUTH_CLIENT_ID=${CID}" \
  "CLOUDFLARE_OAUTH_CLIENT_SECRET=${CSEC}" \
  "CLOUDFLARE_OAUTH_REDIRECT_URI=${REDIR}" \
  "CLOUDFLARE_OAUTH_SUCCESS_REDIRECT=${SUCCESS}" \
  "CLOUDFLARE_OAUTH_SCOPES=${SCOPES}" \
  "PUBLIC_API_BASE_URL=${PUBLIC}"

echo "Redeploying API…"
railway redeploy --yes

echo "Done. Wait ~1–2 min, then reload https://erp.againerp.com/settings/plugins/cloudflare"
