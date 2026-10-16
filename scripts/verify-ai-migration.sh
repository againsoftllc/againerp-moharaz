#!/usr/bin/env bash
# Step 9 — verify AgainERP AI migration (no direct LLM, no @againerp/ai in apps).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0

check() {
  local label="$1"
  local pattern="$2"
  local paths=("${@:3}")
  if rg -q "$pattern" "${paths[@]}" 2>/dev/null; then
    echo "FAIL: $label"
    rg "$pattern" "${paths[@]}" || true
    fail=1
  else
    echo "OK:   $label"
  fi
}

echo "AgainERP AI migration verification"
echo "===================================="

check "no llm_client imports" 'from app\.services\.llm_client' apps/api
check "no direct OpenAI URLs" 'api\.openai\.com' apps/api apps/web
check "no direct Anthropic URLs" 'anthropic\.com/v1' apps/api apps/web
check "no @againerp/ai in apps" '@againerp/ai' apps/api apps/web

if ! rg -q '@againerp/runtime' apps/web/package.json; then
  echo "FAIL: apps/web must depend on @againerp/runtime"
  fail=1
else
  echo "OK:   @againerp/runtime linked in apps/web"
fi

center_routes=(
  apps/web/src/app/api/center-ai/chat/route.ts
  apps/web/src/app/api/center-ai/catalog/parse-specs/route.ts
  apps/web/src/app/api/center-ai/status/route.ts
)
for route in "${center_routes[@]}"; do
  if [[ -f "$route" ]]; then
    echo "OK:   route exists — ${route#apps/web/src/app/}"
  else
    echo "FAIL: missing route — $route"
    fail=1
  fi
done

echo "===================================="
if [[ "$fail" -ne 0 ]]; then
  echo "Verification failed."
  exit 1
fi
echo "All checks passed."
