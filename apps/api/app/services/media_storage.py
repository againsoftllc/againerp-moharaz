from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.cloudflare_plugin import CloudflarePlugin
from app.services.cloudflare_client import public_r2_url, should_use_r2, upload_to_r2

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "media"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_PLUGIN_ID = "cf-default"


def get_cloudflare_plugin(db: Session) -> Optional[CloudflarePlugin]:
    return db.get(CloudflarePlugin, DEFAULT_PLUGIN_ID)


def local_public_url(stored: str) -> str:
    """Prefer relative /uploads path so admin (Vercel) can proxy to the API."""
    settings = get_settings()
    base = (settings.public_api_base_url or "").strip().rstrip("/")
    if base:
        return f"{base}/uploads/media/{stored}"
    return f"/uploads/media/{stored}"


def save_media_bytes(
    db: Session,
    stored: str,
    content: bytes,
    mime: str,
) -> Tuple[str, str, str]:
    """Returns (public_url, local_path, provider)."""
    from app.services.cloudflare_client import CloudflareError

    row = get_cloudflare_plugin(db)
    if should_use_r2(row):
        key = f"media/{stored}"
        try:
            upload_to_r2(row, key, content, mime)
            return public_r2_url(row, key), f"r2://{row.r2_bucket}/{key}", "r2"
        except CloudflareError:
            # Misconfigured Object-token / expired keys — still save locally so create isn't blocked.
            pass

    dest = UPLOAD_DIR / stored
    dest.write_bytes(content)
    return local_public_url(stored), f"/storage/media/uploads/{stored}", "direct"
