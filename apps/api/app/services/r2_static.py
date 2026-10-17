"""/uploads with a Cloudflare R2 fallback.

A shop whose media library lives on R2 (the files were uploaded there with scripts/move_media_to_r2.py) but whose
database still links ``/uploads/media/<name>`` — or an API container with no local copy of the files, like the
Railway one — serves those links from the bucket: a file missing on disk is read from R2 (key ``media/<name>``)
with the Cloudflare plugin's S3 credentials, so the bucket can stay private. Local files always win.
"""
from __future__ import annotations

import logging
import mimetypes

from starlette.exceptions import HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.database import SessionLocal
from app.services.cloudflare_client import _s3_client, is_r2_connected, resolve_r2_s3_credentials
from app.services.media_storage import get_cloudflare_plugin

log = logging.getLogger(__name__)
# a slot ("<slug>-1.webp") can be replaced by a different picture, so no "immutable"
CACHE = "public, max-age=86400"


def _read_from_r2(key: str) -> tuple[bytes, str] | None:
    db = SessionLocal()
    try:
        row = get_cloudflare_plugin(db)
        if not is_r2_connected(row):
            return None
        access_key, secret = resolve_r2_s3_credentials(row)
        obj = _s3_client(row, access_key, secret).get_object(Bucket=row.r2_bucket.strip(), Key=key)
        return obj["Body"].read(), (obj.get("ContentType") or "")
    except Exception as exc:  # missing key, R2 down, no credentials → behave like a plain 404
        log.info("r2 fallback miss for %s: %s", key, exc)
        return None
    finally:
        db.close()


class R2FallbackStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not path.startswith("media/") or ".." in path:
                raise
            hit = await run_in_threadpool(_read_from_r2, path)
            if hit is None:
                raise
            body, mime = hit
            if not mime or mime == "binary/octet-stream":
                mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
            return Response(content=body, media_type=mime, headers={"Cache-Control": CACHE})
