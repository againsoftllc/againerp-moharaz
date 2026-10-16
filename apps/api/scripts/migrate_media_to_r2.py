#!/usr/bin/env python3
"""Migrate local media files to Cloudflare R2.

Usage:
    python scripts/migrate_media_to_r2.py           # dry-run (shows what will happen)
    python scripts/migrate_media_to_r2.py --run     # actually migrate
    python scripts/migrate_media_to_r2.py --run --limit 10  # migrate first 10 only
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running from repo root or scripts/ dir
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models.media import Media
from app.services.cloudflare_client import (
    delete_from_r2,
    public_r2_url,
    is_r2_connected,
    upload_to_r2,
)
from app.services.media_storage import UPLOAD_DIR, get_cloudflare_plugin

# ── helpers ──────────────────────────────────────────────────────────────────

def _local_file_path(local_path: str) -> Path | None:
    """Convert DB local_path to absolute filesystem path."""
    if not local_path:
        return None
    p = Path(local_path)
    # e.g.  /storage/media/uploads/abc123_photo.jpg  → UPLOAD_DIR/abc123_photo.jpg
    return UPLOAD_DIR / p.name


def _r2_key(stored_name: str) -> str:
    return f"media/{stored_name}"


# ── main ─────────────────────────────────────────────────────────────────────

def run(dry_run: bool, limit: int | None) -> int:
    db = SessionLocal()
    try:
        cf = get_cloudflare_plugin(db)
        if not is_r2_connected(cf):
            print(
                "ERROR: Cloudflare R2 is not configured/enabled.\n"
                "Go to Settings → Plugins → Cloudflare and connect R2 first."
            )
            return 1

        q = db.query(Media).filter(Media.provider == "direct").order_by(Media.created_at)
        if limit:
            q = q.limit(limit)
        rows: list[Media] = q.all()

        if not rows:
            print("Nothing to migrate — no local media found.")
            return 0

        print(f"{'DRY RUN — ' if dry_run else ''}Found {len(rows)} local file(s) to migrate\n")

        ok = skip = fail = 0

        for row in rows:
            local_file = _local_file_path(row.local_path or "")
            stored_name = local_file.name if local_file else None

            if not stored_name or not local_file or not local_file.exists():
                print(f"  SKIP  [{row.id}] {row.name!r} — local file not found ({row.local_path})")
                skip += 1
                continue

            key = _r2_key(stored_name)
            new_url = public_r2_url(cf, key)
            new_local_path = f"r2://{cf.r2_bucket.strip()}/{key}"

            print(f"  {'PLAN' if dry_run else 'MIGR'}  [{row.id}] {row.name!r}")
            print(f"         {row.url}")
            print(f"         → {new_url}")

            if dry_run:
                ok += 1
                continue

            try:
                content = local_file.read_bytes()
                upload_to_r2(cf, key, content, row.mime_type or "application/octet-stream")

                row.url = new_url
                row.local_path = new_local_path
                row.provider = "r2"
                db.commit()

                # Remove the local copy after successful DB commit
                local_file.unlink(missing_ok=True)
                ok += 1
            except Exception as exc:
                db.rollback()
                print(f"         FAILED: {exc}")
                fail += 1

        label = "planned" if dry_run else "migrated"
        print(f"\nDone — {ok} {label}, {skip} skipped, {fail} failed")
        if dry_run and ok:
            print("Re-run with --run to apply.")
        return 0 if fail == 0 else 1

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local media to Cloudflare R2")
    parser.add_argument("--run", action="store_true", help="Actually migrate (default: dry-run)")
    parser.add_argument("--limit", type=int, default=None, help="Only migrate N files")
    args = parser.parse_args()

    sys.exit(run(dry_run=not args.run, limit=args.limit))
