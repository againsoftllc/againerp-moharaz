#!/usr/bin/env bash
# Dump local Postgres → restore into Railway Postgres.
# Usage:
#   1. railway login && railway link  (select the project that has Postgres)
#   2. ./scripts/migrate-db-to-railway.sh
#
# Requires: pg_dump, pg_restore (or psql), railway CLI

set -euo pipefail

# Prefer Postgres.app tools when available (macOS)
for _pg in \
  /Applications/Postgres.app/Contents/Versions/latest/bin \
  /Applications/Postgres.app/Contents/Versions/18/bin \
  /opt/homebrew/bin \
  /usr/local/bin
do
  if [ -x "$_pg/pg_dump" ]; then
    export PATH="$_pg:$PATH"
    break
  fi
done

if ! command -v pg_dump >/dev/null || ! command -v pg_restore >/dev/null; then
  echo "ERROR: pg_dump / pg_restore not found. Install Postgres client tools first."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="${ROOT}/.deploy"
DUMP_FILE="${DUMP_DIR}/againerp-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$DUMP_DIR"

# Local DB — matches apps/api/.env default (port 5432) or docker-compose (5440)
LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://againerp:againerp@127.0.0.1:5440/againerp}"

echo "==> Dumping local database…"
echo "    source: ${LOCAL_URL%%@*}@…"
pg_dump "$LOCAL_URL" --format=custom --no-owner --no-acl --file="$DUMP_FILE"
echo "    wrote: $DUMP_FILE ($(du -h "$DUMP_FILE" | awk '{print $1}'))"

echo "==> Fetching Railway DATABASE_URL…"
# Prefer public URL for restore from laptop
RAIL_URL="$(railway variables --service Postgres --json 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("DATABASE_PUBLIC_URL") or d.get("DATABASE_URL") or "")
' 2>/dev/null || true)"

if [ -z "$RAIL_URL" ]; then
  RAIL_URL="$(railway variables --json 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("DATABASE_PUBLIC_URL") or d.get("DATABASE_URL") or "")
' 2>/dev/null || true)"
fi

if [ -z "$RAIL_URL" ]; then
  echo "ERROR: Could not read Railway DATABASE_URL."
  echo "Run: railway link   then ensure a Postgres service exists."
  echo "Or set: export RAILWAY_DATABASE_URL='postgresql://…'"
  exit 1
fi

# Normalize SQLAlchemy-style URL if pasted by mistake
RAIL_URL="${RAIL_URL/postgresql+psycopg:\/\//postgresql:\/\/}"

echo "==> Restoring into Railway Postgres…"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RAIL_URL" "$DUMP_FILE" || {
  echo "pg_restore reported warnings/errors — check output above."
  echo "If schema already exists empty, try without --clean."
}

echo "==> Done. Point the API service DATABASE_URL at Railway Postgres and redeploy."
echo "    Dump kept at: $DUMP_FILE"
