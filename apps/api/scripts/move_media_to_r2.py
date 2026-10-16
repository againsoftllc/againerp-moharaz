"""Move the media library to Cloudflare R2 and point every stored image link at it.

Needs the Cloudflare plugin connected with R2 ready (Workspace → Plugins → Cloudflare: API token → R2 provisioned)
and a public base URL for the bucket (e.g. https://media.moharaz.com — R2 → bucket → Custom Domains).

Steps (each a dry run unless --apply):
  --upload    put every file of uploads/media on R2 as media/<name> (the key new uploads use); files already
              on R2 are skipped; local files stay as a backup
  --rewrite   in every text column of the database, "…/uploads/media/<name>" → "<R2 base>/media/<name>"
              (media.url, product / item thumbnails, variants, order lines, reviews, brands, categories, blog,
              homepage …); media rows on R2 get local_path r2://<bucket>/media/<name>
  --revert    the opposite of --rewrite: links back to /uploads/media/<name> (the local files are still there)

Usage (api container):
    python -m scripts.move_media_to_r2 --upload              # how many files, how many already on R2
    python -m scripts.move_media_to_r2 --upload --apply
    python -m scripts.move_media_to_r2 --rewrite             # how many links per column
    python -m scripts.move_media_to_r2 --rewrite --apply
"""
from __future__ import annotations

import argparse
import mimetypes
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.services.cloudflare_client import _s3_client, is_r2_connected, resolve_r2_s3_credentials, upload_to_r2
from app.services.media_storage import UPLOAD_DIR, get_cloudflare_plugin

LOCAL_MARK = "/uploads/media/"
# an absolute or relative link up to /uploads/media/ (stops at quotes, spaces and markup)
LOCAL_RE = r"""(https?://[^"'\s<>()]*)?/uploads/media/"""


def text_columns(db) -> list[tuple[str, str]]:
    return [
        (t, c)
        for t, c in db.execute(text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type IN ('text', 'character varying') "
            "AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')"
        ))
    ]


def count_links(db, pattern: str) -> list[tuple[str, str, int]]:
    out = []
    for t, c in text_columns(db):
        n = db.execute(text(f'SELECT count(*) FROM "{t}" WHERE "{c}" LIKE :p'), {"p": f"%{pattern}%"}).scalar()
        if n:
            out.append((t, c, n))
    return out


def upload(db, cf, apply: bool, workers: int) -> None:
    files = sorted(p for p in UPLOAD_DIR.iterdir() if p.is_file())
    access, secret = resolve_r2_s3_credentials(cf)
    s3 = _s3_client(cf, access, secret)
    existing: set[str] = set()
    token = None
    while True:
        page = s3.list_objects_v2(Bucket=cf.r2_bucket, Prefix="media/", **({"ContinuationToken": token} if token else {}))
        existing.update(o["Key"] for o in page.get("Contents", []))
        if not page.get("IsTruncated"):
            break
        token = page["NextContinuationToken"]
    todo = [p for p in files if f"media/{p.name}" not in existing]
    size = sum(p.stat().st_size for p in todo)
    print(f"local files: {len(files)} | already on R2: {len(files) - len(todo)} | to upload: {len(todo)} ({size / 1e6:.0f} MB)")
    if not apply or not todo:
        return

    def put(p):
        mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        upload_to_r2(cf, f"media/{p.name}", p.read_bytes(), mime)
        return p.name

    done = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(put, p): p for p in todo}
        for f in as_completed(futures):
            try:
                f.result()
                done += 1
            except Exception as exc:  # noqa: BLE001 — report and carry on; a re-run retries what is missing
                failed += 1
                print(f"  failed {futures[f].name}: {exc}", file=sys.stderr)
            if (done + failed) % 1000 == 0:
                print(f"  {done + failed}/{len(todo)}", flush=True)
    print(f"uploaded {done}, failed {failed}" + (" — run again to retry the failed ones" if failed else ""))


def rewrite(db, base: str, apply: bool, revert: bool) -> None:
    if revert:
        find, pattern = f"{base}/media/", f"{base}/media/"
    else:
        find, pattern = LOCAL_MARK, LOCAL_MARK
    rows = count_links(db, find)
    total = sum(n for *_, n in rows)
    for t, c, n in rows:
        print(f"  {t}.{c}: {n}")
    print(f"{'would change' if not apply else 'changing'} {total} values in {len(rows)} columns")
    if not apply:
        return
    for t, c, _ in rows:
        if revert:
            db.execute(text(f'UPDATE "{t}" SET "{c}" = replace("{c}", :a, :b) WHERE "{c}" LIKE :p'),
                       {"a": f"{base}/media/", "b": LOCAL_MARK, "p": f"%{pattern}%"})
        else:
            db.execute(text(f'UPDATE "{t}" SET "{c}" = regexp_replace("{c}", :re, :b, \'g\') WHERE "{c}" LIKE :p'),
                       {"re": LOCAL_RE, "b": f"{base}/media/", "p": f"%{pattern}%"})
    if revert:
        # the files are still on the disk: back to the path save_media_bytes writes for a local file
        db.execute(text(
            "UPDATE media SET local_path = '/storage/media/uploads/' || regexp_replace(local_path, '^r2://[^/]+/media/', '') "
            "WHERE local_path LIKE 'r2://%'"
        ))
    else:
        cf = get_cloudflare_plugin(db)
        db.execute(text(
            "UPDATE media SET local_path = 'r2://' || :bucket || '/media/' || regexp_replace(url, '^.*/media/', '') "
            "WHERE url LIKE :p"
        ), {"bucket": cf.r2_bucket if cf else "", "p": f"{base}/media/%"})
    db.commit()
    left = sum(n for *_, n in count_links(db, find))
    print(f"done — {left} links left with {find!r}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--rewrite", action="store_true")
    ap.add_argument("--revert", action="store_true")
    ap.add_argument("--apply", action="store_true", help="make the change (default: dry run)")
    ap.add_argument("--base", help="public base URL of the bucket (default: the Cloudflare plugin's)")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    if not (args.upload or args.rewrite or args.revert):
        ap.error("choose --upload, --rewrite or --revert")
    db = SessionLocal()
    try:
        cf = get_cloudflare_plugin(db)
        base = (args.base or (cf.r2_public_base_url if cf else "") or "").strip().rstrip("/")
        if args.upload:
            if not is_r2_connected(cf):
                sys.exit("R2 is not connected: Workspace → Plugins → Cloudflare (API token, then provision R2)")
            upload(db, cf, args.apply, args.workers)
        if args.rewrite or args.revert:
            if not base.startswith("https://"):
                sys.exit("Set the bucket's public base URL (https://…) in the Cloudflare plugin, or pass --base")
            rewrite(db, base, args.apply, args.revert)
    finally:
        db.close()


if __name__ == "__main__":
    main()
