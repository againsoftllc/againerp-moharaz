"""Shared helpers for the OpenCart → AgainERP importers (docs/DATA_MIGRATION.md)."""
from __future__ import annotations

import html
import json
import mimetypes
import os
import re
import uuid
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.models.media import Media
from app.models.provider_entity_mapping import ProviderEntityMapping
from app.services.catalog_media_import import _import_single_image
from app.services.media_storage import save_media_bytes

COMPANY_ID = "default"
PROVIDER = "opencart-moharaz"
# OpenCart serves `image` column paths from <site>/image/. Pass a local folder
# (the old server's `image/` directory, mounted into the container) instead and
# the same relative paths are read from disk.
DEFAULT_IMAGE_SOURCE = "https://www.moharaz.com/image/"


def clean_text(value: str | None) -> str:
    """Decode HTML entities (twice for double-encoded `&amp;amp;`), drop invisible chars, trim."""
    out = html.unescape(html.unescape(value or ""))
    return re.sub(r"[​-‏‪-‮﻿]", "", out).strip()


def clean_html(value: str | None) -> str | None:
    """OpenCart stores HTML entity-encoded; decode once to get real HTML."""
    out = html.unescape(value or "").strip()
    return out or None


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")


def load_slug_file(path: str | None) -> set[str]:
    if not path:
        return set()
    with open(path, encoding="utf-8") as fh:
        return {slugify(line) for line in fh if slugify(line)}


def import_image(
    db: Session,
    rel_path: str,
    *,
    source: str = DEFAULT_IMAGE_SOURCE,
    alt: str | None = None,
    folder: str = "Uploads",
) -> Media:
    """Store one OpenCart image (relative `image` path) in the media library.

    `source` is either a URL prefix or a local directory. `Media.source_url`
    keeps the original location so a later run can be traced back.
    """
    rel = rel_path.strip().lstrip("/")
    if source.startswith(("http://", "https://")):
        media = _import_single_image(
            db, source.rstrip("/") + "/" + quote(rel), company_id=COMPANY_ID, alt_prefix=alt
        )
    else:
        full = os.path.join(source, *rel.split("/"))
        with open(full, "rb") as fh:
            content = fh.read()
        mime = mimetypes.guess_type(full)[0] or "image/jpeg"
        media = store_image_bytes(
            db, rel, content, mime, source_url=f"opencart:image/{rel}", alt=alt, folder=folder
        )
    media.folder = folder
    db.flush()
    return media


def image_url(rel_path: str, source: str = DEFAULT_IMAGE_SOURCE) -> str:
    return source.rstrip("/") + "/" + quote(rel_path.strip().lstrip("/"))


def store_image_bytes(
    db: Session,
    rel_path: str,
    content: bytes,
    mime: str,
    *,
    source_url: str,
    alt: str | None = None,
    folder: str = "Uploads",
) -> Media:
    """Save already-fetched image bytes as a Media row (bulk importers download in parallel)."""
    if not mime.startswith("image/"):
        raise ValueError(f"Not an image: {rel_path} ({mime})")
    if not content:
        raise ValueError(f"Empty image: {rel_path}")
    name = os.path.basename(rel_path.strip().lstrip("/")) or "image.jpg"
    stored = f"{uuid.uuid4().hex}_{re.sub(r'[^a-zA-Z0-9._-]', '_', name)}"
    url, local_path, provider = save_media_bytes(db, stored, content, mime)
    media = Media(
        company_id=COMPANY_ID,
        name=name,
        title=os.path.splitext(name)[0],
        folder=folder,
        url=url,
        media_type="image",
        mime_type=mime,
        size_kb=max(1, len(content) // 1024),
        alt=(f"{alt} — {name}" if alt else name)[:240],
        source_url=source_url,
        local_path=local_path,
        imported_by="opencart",
        provider=provider,
        uploaded_by="Importer",
    )
    db.add(media)
    db.flush()
    return media


def record_mapping(
    db: Session,
    entity_type: str,
    source_id: int | str,
    erp_id: str,
    *,
    name: str = "",
    method: str = "import",
    metadata: dict | None = None,
) -> None:
    """Upsert the OpenCart id → ERP id link (provider_entity_mappings)."""
    row = (
        db.query(ProviderEntityMapping)
        .filter_by(provider=PROVIDER, entity_type=entity_type, provider_entity_id=str(source_id))
        .first()
    )
    if row is None:
        row = ProviderEntityMapping(
            company_id=COMPANY_ID,
            provider=PROVIDER,
            entity_type=entity_type,
            provider_entity_id=str(source_id),
        )
        db.add(row)
    row.provider_name = name[:500]
    row.erp_entity_id = erp_id
    row.erp_entity_name = name[:500]
    row.status = "approved"
    row.match_method = method[:20]
    row.confidence = 1.0
    row.metadata_json = json.dumps(metadata) if metadata else None
