#!/usr/bin/env bash
# Start AgainERP storefront AI stack (Center API + Gateway + AgainERP web).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CENTER="$(cd "$ROOT/../againerp-center" && pwd)"

echo "AgainERP Storefront AI — startup"
echo "==================================="

if ! lsof -i :8100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting Center API :8100…"
  (cd "$CENTER/apps/api" && source .venv/bin/activate && uvicorn main:app --host 127.0.0.1 --port 8100 --reload) &
  sleep 3
fi

if ! lsof -i :8200 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting AI Gateway :8200…"
  (cd "$CENTER/platform/ai-gateway" && npm run build && set -a && source .env && set +a && npm start) &
  sleep 4
fi

if ! lsof -i :8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting AgainERP API :8000…"
  (cd "$ROOT/apps/api" && source .venv/bin/activate && PYTHONPATH=. uvicorn main:app --host 127.0.0.1 --port 8000 --reload) &
  sleep 2
fi

if ! lsof -i :3200 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting AgainERP Web :3200…"
  (cd "$ROOT/apps/web" && npm run dev) &
  sleep 3
fi

echo ""
echo "Status:"
curl -s http://127.0.0.1:3200/api/center-ai/chat || echo "(web not ready yet)"
echo ""
echo "Storefront: http://localhost:3200"
echo "If disconnected, provision JWT:"
echo "  cd $CENTER && python scripts/provision_client_gateway_env.py --client-slug againerp --env $ROOT/apps/web/.env.local"
