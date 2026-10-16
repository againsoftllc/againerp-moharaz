from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Literal, Optional, Tuple
from urllib.parse import unquote, urlparse

import httpx
from sqlalchemy.orm import Session

from app.models.media import Media
from app.services.cloudflare_client import (
    CloudflareError,
    delete_from_r2,
    download_from_r2,
    is_r2_connected,
    public_r2_url,
    upload_to_r2,
)
from app.services.media_storage import UPLOAD_DIR, get_cloudflare_plugin

MigrateTarget = Literal["local", "r2"]

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ALICDN_REFERERS = (
    "https://detail.1688.com/",
    "https://www.1688.com/",
    "https://sale.1688.com/",
    "https://www.alibaba.com/",
    "https://s.alicdn.com/",
    "https://www.taobao.com/",
)


@dataclass
class MediaMigrateItemResult:
    id: str
    ok: bool
    skipped: bool = False
    message: str = ""
    provider: Optional[str] = None


def _filename_candidates(row: Media) -> List[str]:
    names: List[str] = []
    if row.local_path and not row.local_path.startswith("r2://"):
        names.append(Path(row.local_path).name)
    if row.url:
        path = unquote(urlparse(row.url).path)
        if path:
            names.append(Path(path).name)
    if row.name:
        names.append(Path(row.name).name)
    seen: set[str] = set()
    out: List[str] = []
    for name in names:
        if not name or name in seen or name in {".", "/"}:
            continue
        seen.add(name)
        out.append(name)
    return out


def _local_file_path(row: Media) -> Path | None:
    for name in _filename_candidates(row):
        candidate = UPLOAD_DIR / name
        if candidate.is_file():
            return candidate
    return None


def _r2_key_from_row(row: Media) -> str | None:
    if row.local_path and row.local_path.startswith("r2://"):
        without_scheme = row.local_path[5:]
        if "/" in without_scheme:
            return without_scheme.split("/", 1)[1]
        return without_scheme or None
    if row.url:
        marker = "/media/"
        idx = row.url.find(marker)
        if idx >= 0:
            return f"media/{row.url[idx + len(marker) :].lstrip('/')}"
    return None


def _stored_name_for_local(row: Media) -> str:
    local_file = _local_file_path(row)
    if local_file:
        return local_file.name
    key = _r2_key_from_row(row)
    if key:
        return Path(key).name
    for name in _filename_candidates(row):
        return name
    return f"{row.id}_file.bin"


def _local_public_url(stored: str) -> str:
    from app.services.media_storage import local_public_url

    return local_public_url(stored)


def _is_file_backed(row: Media) -> bool:
    return row.provider not in {"youtube", "vimeo"}


def _is_on_r2(row: Media) -> bool:
    return row.provider == "r2" or bool(row.local_path and row.local_path.startswith("r2://"))


def _restore_alicdn_bang(value: str) -> str:
    """Filenames often sanitize `_!!` → `___` — restore for CDN fetch."""
    if "___" in value and "_!!" not in value:
        return value.replace("___", "_!!")
    return value


def _guess_alicdn_urls_from_name(name: str) -> List[str]:
    raw = Path(name).name
    if not raw:
        return []
    restored = _restore_alicdn_bang(raw)
    stems = [raw, restored]
    # ensure image extension
    extras: List[str] = []
    for stem in stems:
        extras.append(stem)
        if not Path(stem).suffix:
            extras.append(f"{stem}.jpg")
        elif stem.lower().endswith(".j"):
            extras.append(stem + "pg")
    out: List[str] = []
    for filename in extras:
        if "O1CN" not in filename and "alicdn" not in filename.lower():
            # still try cbu path for 1688-looking ids
            if "cib" not in filename.lower() and "!!" not in filename and "___" not in filename:
                continue
        out.append(f"https://cbu01.alicdn.com/img/ibank/{filename}")
        out.append(f"https://img.alicdn.com/imgextra/{filename}")
    return out


def _url_candidates(url: str, *, names: List[str] | None = None) -> List[str]:
    candidates: List[str] = []
    if url:
        candidates.append(url)
        restored = _restore_alicdn_bang(url)
        if restored != url:
            candidates.append(restored)
        # common host swap
        if "alicdn.com" in url:
            candidates.append(url.replace("https://img.alicdn.com/", "https://cbu01.alicdn.com/"))
            candidates.append(url.replace("https://cbu01.alicdn.com/", "https://img.alicdn.com/"))
    for name in names or []:
        candidates.extend(_guess_alicdn_urls_from_name(name))

    seen: set[str] = set()
    out: List[str] = []
    for item in candidates:
        item = item.strip()
        if not item or item in seen:
            continue
        if not item.startswith(("http://", "https://")):
            continue
        seen.add(item)
        out.append(item)
    return out


def _looks_like_image_bytes(content: bytes, content_type: str) -> bool:
    if len(content) < 32:
        return False
    ctype = (content_type or "").lower()
    if "image/" in ctype or "octet-stream" in ctype or "binary" in ctype:
        return True
    sig = content[:12]
    if sig.startswith(b"\xff\xd8\xff"):
        return True
    if sig.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if sig.startswith(b"GIF87a") or sig.startswith(b"GIF89a"):
        return True
    if sig.startswith(b"RIFF") and b"WEBP" in content[:16]:
        return True
    return False


def _download_url_bytes(url: str, *, names: List[str] | None = None) -> bytes:
    last_status = "no-response"
    for candidate in _url_candidates(url, names=names):
        host = (urlparse(candidate).hostname or "").lower()
        referers: List[Optional[str]] = [None]
        if "alicdn" in host or "alibaba" in host or "taobao" in host or "1688" in host:
            referers = list(ALICDN_REFERERS) + [None]

        for referer in referers:
            headers = {
                "User-Agent": BROWSER_UA,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            }
            if referer:
                headers["Referer"] = referer
            try:
                with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                    res = client.get(candidate, headers=headers)
                    last_status = str(res.status_code)
                    if res.status_code == 200 and _looks_like_image_bytes(
                        res.content, res.headers.get("content-type", "")
                    ):
                        return res.content
            except Exception as exc:
                last_status = str(exc)[:80]
                continue

    raise FileNotFoundError(
        f"Could not download source ({last_status}). "
        "Remote CDN blocked the server — re-upload the file, then Move to R2."
    )


def _resolve_local_bytes(row: Media) -> Tuple[bytes, str, Path | None]:
    """Return (content, stored_name, local_file_to_delete_or_None)."""
    local_file = _local_file_path(row)
    if local_file is not None:
        return local_file.read_bytes(), local_file.name, local_file

    names = _filename_candidates(row)

    if row.url:
        path = unquote(urlparse(row.url).path)
        if "/uploads/media/" in path:
            name = Path(path.split("/uploads/media/", 1)[1]).name
            candidate = UPLOAD_DIR / name
            if candidate.is_file():
                return candidate.read_bytes(), candidate.name, candidate

    # Prefer source_url (original CDN) when present — often more fetchable than sanitized url
    fetch_urls: List[str] = []
    if row.source_url:
        fetch_urls.append(row.source_url)
    if row.url:
        fetch_urls.append(row.url)

    last_error: Exception | None = None
    for fetch_url in fetch_urls:
        if not fetch_url.startswith(("http://", "https://")):
            continue
        try:
            content = _download_url_bytes(fetch_url, names=names)
            stored = _stored_name_for_local(row)
            # Prefer a clean stored name for R2 key
            if "___" in stored:
                stored = _restore_alicdn_bang(stored).replace("!", "_")
            return content, stored, None
        except Exception as exc:
            last_error = exc

    # Last resort: invent alicdn URLs from filename alone
    if names:
        try:
            content = _download_url_bytes("", names=names)
            stored = names[0]
            return content, stored, None
        except Exception as exc:
            last_error = exc

    if last_error:
        raise last_error
    raise FileNotFoundError(
        f"Local file missing ({row.local_path or 'no path'}; url={row.url or 'none'})"
    )


def _migrate_one(db: Session, row: Media, target: MigrateTarget) -> MediaMigrateItemResult:
    if not _is_file_backed(row):
        return MediaMigrateItemResult(
            id=row.id,
            ok=False,
            skipped=True,
            message="External video sources cannot be migrated",
            provider=row.provider,
        )

    on_r2 = _is_on_r2(row)
    if target == "r2" and on_r2:
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            skipped=True,
            message="Already on R2",
            provider=row.provider,
        )
    if target == "local" and not on_r2:
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            skipped=True,
            message="Already on local storage",
            provider=row.provider,
        )

    cf = get_cloudflare_plugin(db)
    if not is_r2_connected(cf):
        raise CloudflareError("Connect Cloudflare R2 before migrating storage")
    assert cf is not None

    if target == "r2":
        content, stored, local_file = _resolve_local_bytes(row)
        # sanitize key segment
        safe_stored = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in stored) or f"{row.id}.bin"
        key = f"media/{safe_stored}"
        upload_to_r2(cf, key, content, row.mime_type or "application/octet-stream")
        row.url = public_r2_url(cf, key)
        row.local_path = f"r2://{cf.r2_bucket.strip()}/{key}"
        row.provider = "r2"
        db.commit()
        if local_file is not None:
            local_file.unlink(missing_ok=True)
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            message="Moved to R2",
            provider="r2",
        )

    key = _r2_key_from_row(row)
    if not key:
        raise ValueError("Missing R2 object key")
    content = download_from_r2(cf, key, fallback_url=row.url)
    stored = _stored_name_for_local(row)
    dest = UPLOAD_DIR / stored
    dest.write_bytes(content)
    row.url = _local_public_url(stored)
    row.local_path = f"/storage/media/uploads/{stored}"
    row.provider = "direct"
    db.commit()
    try:
        delete_from_r2(cf, key)
    except Exception:
        pass
    return MediaMigrateItemResult(
        id=row.id,
        ok=True,
        message="Moved to local storage",
        provider="direct",
    )


def migrate_one_with_bytes(
    db: Session,
    row: Media,
    target: MigrateTarget,
    content: bytes,
    filename: Optional[str] = None,
) -> MediaMigrateItemResult:
    """Migrate using client/proxy-supplied bytes (bypasses CDN download from API host)."""
    if not content:
        raise FileNotFoundError("Empty file bytes")

    if not _is_file_backed(row):
        return MediaMigrateItemResult(
            id=row.id,
            ok=False,
            skipped=True,
            message="External video sources cannot be migrated",
            provider=row.provider,
        )

    on_r2 = _is_on_r2(row)
    if target == "r2" and on_r2:
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            skipped=True,
            message="Already on R2",
            provider=row.provider,
        )
    if target == "local" and not on_r2 and _local_file_path(row) is not None:
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            skipped=True,
            message="Already on local storage",
            provider=row.provider,
        )

    cf = get_cloudflare_plugin(db)
    if target == "r2" and not is_r2_connected(cf):
        raise CloudflareError("Connect Cloudflare R2 before migrating storage")

    stored = filename or _stored_name_for_local(row)
    safe_stored = (
        "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in Path(stored).name)
        or f"{row.id}.bin"
    )

    if target == "r2":
        assert cf is not None
        key = f"media/{safe_stored}"
        upload_to_r2(cf, key, content, row.mime_type or "application/octet-stream")
        local_file = _local_file_path(row)
        row.url = public_r2_url(cf, key)
        row.local_path = f"r2://{cf.r2_bucket.strip()}/{key}"
        row.provider = "r2"
        db.commit()
        if local_file is not None:
            local_file.unlink(missing_ok=True)
        return MediaMigrateItemResult(
            id=row.id,
            ok=True,
            message="Moved to R2",
            provider="r2",
        )

    # target == local — materialize remote/hotlinked bytes onto disk
    if on_r2:
        key = _r2_key_from_row(row)
        if key:
            try:
                delete_from_r2(cf, key)  # type: ignore[arg-type]
            except Exception:
                pass

    dest = UPLOAD_DIR / safe_stored
    dest.write_bytes(content)
    row.url = _local_public_url(safe_stored)
    row.local_path = f"/storage/media/uploads/{safe_stored}"
    row.provider = "direct"
    db.commit()
    return MediaMigrateItemResult(
        id=row.id,
        ok=True,
        message="Moved to local storage",
        provider="direct",
    )


def migrate_media_by_ids(
    db: Session,
    ids: List[str],
    target: MigrateTarget,
    company_id: Optional[str] = None,
) -> List[MediaMigrateItemResult]:
    if target == "r2":
        cf = get_cloudflare_plugin(db)
        if not is_r2_connected(cf):
            raise CloudflareError("Connect Cloudflare R2 before migrating to R2")

    results: List[MediaMigrateItemResult] = []
    for media_id in ids:
        row = db.get(Media, media_id)
        if not row or (company_id is not None and row.company_id != company_id):
            results.append(
                MediaMigrateItemResult(
                    id=media_id,
                    ok=False,
                    skipped=True,
                    message="Media not found",
                )
            )
            continue
        try:
            results.append(_migrate_one(db, row, target))
        except Exception as exc:
            db.rollback()
            results.append(
                MediaMigrateItemResult(
                    id=media_id,
                    ok=False,
                    message=str(exc)[:240],
                    provider=getattr(row, "provider", None),
                )
            )
    return results
