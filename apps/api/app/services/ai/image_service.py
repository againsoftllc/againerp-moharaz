"""Aladin images — generate / edit product-ready images and put them in the media library.

Uses the company's Aladin engine key (same resolution as chat: workspace key, then env).
Every result is saved through the normal media pipeline (`save_media_bytes` → R2 or local),
so generated images show up in Media → "AI Images" and can be attached to any product, exactly
like an uploaded file. Branding stays Aladin: vendor names never reach the user.
"""

from __future__ import annotations

import base64
import re
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_media import CatalogProductMedia
from app.models.media import Media
from app.services.ai.ai_key_service import resolve_openai_key
from app.services.ai.providers.openai_provider import DEFAULT_BASE_URL, NOT_CONFIGURED, _brand
from app.services.media_storage import save_media_bytes

IMAGE_MODELS = ("gpt-image-1", "dall-e-3")
SIZES = {"square": "1024x1024", "landscape": "1536x1024", "portrait": "1024x1536"}
QUALITIES = {"low", "medium", "high", "auto"}
AI_FOLDER = "AI Images"


def _engine(db: Session, company_id: str) -> tuple[str, str]:
    key, _ = resolve_openai_key(db, company_id)
    if not key:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return key, (get_settings().openai_base_url or DEFAULT_BASE_URL).rstrip("/")


def _error(res: httpx.Response, what: str) -> HTTPException:
    detail = res.text[:300]
    try:
        detail = res.json().get("error", {}).get("message", detail)
    except Exception:  # noqa: BLE001
        pass
    if res.status_code == 400 and ("safety" in detail.lower() or "policy" in detail.lower()):
        return HTTPException(status_code=422, detail="Aladin could not create that image — the request was flagged by the image safety filter. Rephrase and try again.")
    return HTTPException(status_code=502, detail=f"Aladin image {what} failed: {_brand(str(detail))}")


def _size(size: Optional[str]) -> str:
    s = (size or "square").strip().lower()
    if s in SIZES:
        return SIZES[s]
    if re.fullmatch(r"\d{3,4}x\d{3,4}", s):
        return s
    return SIZES["square"]


def _slug(text: str, n: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return (s[:n] or "image").rstrip("-")


def save_generated_image(
    db: Session,
    *,
    company_id: str,
    png_bytes: bytes,
    prompt: str,
    uploaded_by: str = "Aladin",
    name_hint: Optional[str] = None,
) -> Media:
    stored = f"{uuid.uuid4().hex}_{_slug(name_hint or prompt)}.png"
    public_url, local_path, provider = save_media_bytes(db, stored, png_bytes, "image/png")
    title = (name_hint or prompt).strip()[:120]
    row = Media(
        company_id=company_id,
        name=f"{_slug(name_hint or prompt)}.png",
        title=title,
        folder=AI_FOLDER,
        url=public_url,
        media_type="image",
        mime_type="image/png",
        size_kb=max(1, len(png_bytes) // 1024),
        alt=title,
        local_path=local_path,
        imported_by="ai",
        provider=provider,
        uploaded_by=uploaded_by,
        title_linked_to_name=False,
        alt_linked_to_name=False,
    )
    db.add(row)
    db.flush()
    return row


def generate_images(
    db: Session,
    *,
    company_id: str,
    prompt: str,
    size: Optional[str] = None,
    quality: Optional[str] = None,
    n: int = 1,
    uploaded_by: str = "Aladin",
    name_hint: Optional[str] = None,
) -> list[Media]:
    key, base = _engine(db, company_id)
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    n = max(1, min(int(n or 1), 4))
    q = (quality or "medium").lower()
    if q not in QUALITIES:
        q = "medium"
    last: Optional[HTTPException] = None
    with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=httpx.Timeout(180.0, connect=15.0)) as client:
        for model in IMAGE_MODELS:
            body: dict = {"model": model, "prompt": prompt, "n": n if model == "gpt-image-1" else 1, "size": _size(size)}
            if model == "gpt-image-1":
                body["quality"] = q
                body["output_format"] = "png"
            else:
                body["response_format"] = "b64_json"
                body["size"] = "1024x1024" if _size(size) == "1024x1024" else ("1792x1024" if "1536x1024" == _size(size) else "1024x1792")
            try:
                res = client.post(f"{base}/images/generations", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=body)
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Aladin images are unreachable ({exc.__class__.__name__}).") from exc
            if res.status_code in (403, 404) or (res.status_code == 400 and "model" in res.text.lower() and "not" in res.text.lower()):
                last = _error(res, "generation")
                continue
            if res.status_code >= 400:
                raise _error(res, "generation")
            data = res.json().get("data") or []
            out: list[Media] = []
            for item in data:
                b64 = item.get("b64_json")
                if not b64:
                    continue
                out.append(save_generated_image(db, company_id=company_id, png_bytes=base64.b64decode(b64), prompt=prompt, uploaded_by=uploaded_by, name_hint=name_hint))
            if not out:
                raise HTTPException(status_code=502, detail="Aladin returned no image.")
            db.commit()
            for m in out:
                db.refresh(m)
            return out
    raise last or HTTPException(status_code=502, detail="Aladin image generation is unavailable.")


def edit_image(
    db: Session,
    *,
    company_id: str,
    image_bytes: bytes,
    image_mime: str,
    prompt: str,
    size: Optional[str] = None,
    quality: Optional[str] = None,
    mask_bytes: Optional[bytes] = None,
    uploaded_by: str = "Aladin",
    name_hint: Optional[str] = None,
) -> Media:
    key, base = _engine(db, company_id)
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="image is required")
    q = (quality or "medium").lower()
    if q not in QUALITIES:
        q = "medium"
    ext = {"image/jpeg": "jpg", "image/webp": "webp"}.get(image_mime, "png")
    files: dict = {"image": (f"source.{ext}", image_bytes, image_mime or "image/png")}
    if mask_bytes:
        files["mask"] = ("mask.png", mask_bytes, "image/png")
    form = {"model": "gpt-image-1", "prompt": prompt, "size": _size(size), "quality": q, "n": "1"}
    try:
        with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=httpx.Timeout(180.0, connect=15.0)) as client:
            res = client.post(f"{base}/images/edits", headers={"Authorization": f"Bearer {key}"}, data=form, files=files)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Aladin images are unreachable ({exc.__class__.__name__}).") from exc
    if res.status_code >= 400:
        raise _error(res, "edit")
    data = res.json().get("data") or []
    b64 = data[0].get("b64_json") if data else None
    if not b64:
        raise HTTPException(status_code=502, detail="Aladin returned no image.")
    media = save_generated_image(db, company_id=company_id, png_bytes=base64.b64decode(b64), prompt=prompt, uploaded_by=uploaded_by, name_hint=name_hint)
    db.commit()
    db.refresh(media)
    return media


def find_product(db: Session, company_id: str, ref: str) -> CatalogProduct | list[CatalogProduct] | None:
    """Exact id / sku match, else a unique name match; a list means ambiguous."""
    ref = (ref or "").strip()
    if not ref:
        return None
    row = db.get(CatalogProduct, ref)
    if row and (row.company_id or "default") == company_id:
        return row
    q = db.query(CatalogProduct).filter((CatalogProduct.company_id == company_id) | (CatalogProduct.company_id.is_(None)))
    rows = q.filter(func.lower(CatalogProduct.sku) == ref.lower()).all()
    if len(rows) == 1:
        return rows[0]
    rows = q.filter(CatalogProduct.name.ilike(f"%{ref}%")).limit(6).all()
    if len(rows) == 1:
        return rows[0]
    if not rows:
        # Every word, in any order — "lenovo yoga 7 14ahp9" finds
        # "Lenovo Yoga 7 2-in-1 14AHP9 …" (the model rarely repeats the exact full name).
        words = [w for w in re.split(r"\s+", ref) if w][:8]
        if len(words) > 1:
            wq = q
            for w in words:
                wq = wq.filter(CatalogProduct.name.ilike(f"%{w}%"))
            rows = wq.limit(6).all()
            if len(rows) == 1:
                return rows[0]
    return rows or None


def attach_media_to_product(db: Session, *, company_id: str, product: CatalogProduct, media: Media, as_primary: bool = False) -> dict:
    if media.company_id != company_id:
        raise HTTPException(status_code=404, detail="Image not found")
    existing = db.query(CatalogProductMedia).filter(CatalogProductMedia.product_id == product.id).order_by(CatalogProductMedia.sort_order).all()
    link = next((l for l in existing if l.media_id == media.id), None)
    if link is None:
        link = CatalogProductMedia(company_id=product.company_id or company_id, product_id=product.id, media_id=media.id, sort_order=len(existing), is_primary=False)
        db.add(link)
        existing.append(link)
    make_primary = as_primary or not any(l.is_primary for l in existing if l is not link) or not product.thumbnail
    if make_primary:
        for l in existing:
            l.is_primary = l is link
        product.thumbnail = media.url
    db.flush()
    try:
        from app.services.ecommerce.ecommerce_item_service import EcommerceItemService

        EcommerceItemService(db).sync_content_from_catalog(product, mirror_publish=True)
    except Exception:  # noqa: BLE001 — storefront mirror is best-effort
        pass
    db.commit()
    return {
        "product_id": product.id,
        "product": product.name,
        "sku": product.sku,
        "media_id": media.id,
        "url": media.url,
        "is_primary": bool(link.is_primary),
        "image_count": len(existing),
        "updated_at": datetime.utcnow().isoformat(),
    }
