"""Aladin image tools — generate/edit product-ready images from chat and put them to use.

Three tools, each doing one thing (compose them rather than one do-everything call):

- generate_product_image: text → image, saved to the media library ("AI Images" folder).
  Never touches a product by itself.
- edit_product_image: an existing image (a product's current photo, another media item, or
  an external URL) + an instruction → a new edited image, also just saved to the library.
- attach_image_to_product: takes a media id (typically one just generated/edited) and puts
  it on a product's gallery (and as the primary photo unless the product already has one).

Splitting generation from attaching means a bad generation never touches product data, and
attaching is a small, auditable, reversible write (RBAC catalog:write) — no financial impact,
so it does not need the money-style approval gate other action tools use.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.media import Media
from app.services.ai.image_service import attach_media_to_product, edit_image, find_product, generate_images
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.media_storage import UPLOAD_DIR
from app.services.rbac import has_permission, is_system_manager

MIME_BY_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}


def _can_write_catalog(db: Session, user: Any) -> bool:
    if db is None or user is None:
        return False
    role = str(getattr(user, "role", "") or "").lower()
    if role in ("admin", "system_manager"):
        return True
    try:
        return is_system_manager(db, user) or has_permission(db, user, "catalog", "write")
    except Exception:
        return False


def _media_result(media: Media, *, action: str) -> dict:
    return {
        "status": "created",
        "action": action,
        "media_id": media.id,
        "url": media.url,
        "title": media.title,
        "folder": media.folder,
        "doc_link": f"doc://media/{media.id}",
        "note": "Show the image inline with ![<short description>](<url>). To use it on a product, call attach_image_to_product with this media_id.",
    }


def _product_brief(p: CatalogProduct) -> dict:
    return {"id": p.id, "name": p.name, "sku": p.sku, "current_thumbnail": p.thumbnail}


def build_image_tools(*, db: Session | None, company_id: str | None, user: Any | None) -> list[OrchestratorTool]:
    def _resolve_product(ref: str) -> dict:
        found = find_product(db, company_id, ref) if db is not None else None
        if found is None:
            return {"error": f"No product matches '{ref}'."}
        if isinstance(found, list):
            return {"error": f"'{ref}' matches several products — ask the user which one.", "candidates": [_product_brief(p) for p in found]}
        return {"ok": found}

    def _read_local_upload(url: str) -> tuple[bytes, str] | None:
        """`/uploads/media/<stored>` is served straight off this container's disk (see
        media_storage.save_media_bytes) — read it directly instead of round-tripping an HTTP
        request to ourselves, which would need the loopback port and can stall under load."""
        if not url.startswith("/uploads/media/"):
            return None
        stored = url.rsplit("/", 1)[-1]
        if not stored or "/" in stored or ".." in stored:
            return None
        path = UPLOAD_DIR / stored
        if not path.is_file():
            return None
        mime = MIME_BY_EXT.get(path.suffix.lower(), "image/png")
        return path.read_bytes(), mime

    def _fetch_source_bytes(inp: dict) -> tuple[bytes, str] | dict:
        media_id = str(inp.get("source_media_id") or "").strip()
        product_ref = str(inp.get("source_product") or "").strip()
        url = str(inp.get("source_image_url") or "").strip()
        label = "the image"
        if media_id:
            m = db.get(Media, media_id)  # type: ignore[union-attr]
            if not m or m.company_id != company_id:
                return {"error": f"No media '{media_id}' found."}
            url = m.url
            label = m.title or m.name
        elif product_ref:
            res = _resolve_product(product_ref)
            if "ok" not in res:
                return res
            p: CatalogProduct = res["ok"]
            if not p.thumbnail:
                return {"error": f"'{p.name}' has no current image to edit — generate one first with generate_product_image."}
            url = p.thumbnail
            label = p.name
        if not url:
            return {"error": "Provide source_product, source_media_id or source_image_url to edit."}
        local = _read_local_upload(url)
        if local:
            return local
        if not re.match(r"^https?://", url):
            return {"error": f"Could not read {label}: its stored location ('{url}') is not a fetchable URL."}
        try:
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                res = client.get(url)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            return {"error": f"Could not fetch {label}: {exc}"}
        return res.content, res.headers.get("content-type", "image/png").split(";")[0]

    def generate_product_image(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Creating images needs catalog write permission."}
        try:
            images = generate_images(
                db,  # type: ignore[arg-type]
                company_id=company_id,  # type: ignore[arg-type]
                prompt=str(inp.get("prompt") or ""),
                size=inp.get("size"),
                quality=inp.get("quality"),
                n=int(inp.get("count") or 1),
                uploaded_by=getattr(user, "name", "Aladin"),
                name_hint=inp.get("name"),
            )
        except Exception as exc:  # noqa: BLE001 — surface HTTPException.detail or a plain message
            return {"error": getattr(exc, "detail", str(exc))}
        if len(images) == 1:
            return _media_result(images[0], action="generated")
        return {
            "status": "created",
            "action": "generated",
            "count": len(images),
            "images": [{"media_id": m.id, "url": m.url, "doc_link": f"doc://media/{m.id}"} for m in images],
            "note": "Show each inline with ![description](url). Use attach_image_to_product with the chosen media_id to put one on a product.",
        }

    def edit_product_image(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Editing images needs catalog write permission."}
        source = _fetch_source_bytes(inp)
        if isinstance(source, dict):
            return source
        image_bytes, mime = source
        try:
            media = edit_image(
                db,  # type: ignore[arg-type]
                company_id=company_id,  # type: ignore[arg-type]
                image_bytes=image_bytes,
                image_mime=mime,
                prompt=str(inp.get("prompt") or ""),
                size=inp.get("size"),
                quality=inp.get("quality"),
                uploaded_by=getattr(user, "name", "Aladin"),
                name_hint=inp.get("name"),
            )
        except Exception as exc:  # noqa: BLE001
            return {"error": getattr(exc, "detail", str(exc))}
        return _media_result(media, action="edited")

    def attach_image_to_product(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Updating product images needs catalog write permission."}
        media_id = str(inp.get("media_id") or "").strip()
        if not media_id:
            return {"error": "media_id is required — use the id a generate/edit call returned."}
        media = db.get(Media, media_id)  # type: ignore[union-attr]
        if not media or media.company_id != company_id:
            return {"error": f"No media '{media_id}' found."}
        res = _resolve_product(str(inp.get("product") or ""))
        if "ok" not in res:
            return res
        product: CatalogProduct = res["ok"]
        result = attach_media_to_product(db, company_id=company_id, product=product, media=media, as_primary=bool(inp.get("as_primary")))  # type: ignore[arg-type]
        result["doc_link"] = f"doc://product/{product.id}"
        result["path"] = f"/website/products?edit={product.id}"
        return result

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="generate_product_image",
                description=(
                    "Generate a new image from a text description and save it to the media library (does not touch any "
                    "product). Use for 'make a product photo of…', 'create an image for…', 'design a banner…'. "
                    "Show the result inline with ![description](url); to put it on a product, call attach_image_to_product "
                    "with the returned media_id."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "Detailed description of the image to create"},
                        "size": {"type": "string", "enum": ["square", "landscape", "portrait"], "description": "Default square"},
                        "quality": {"type": "string", "enum": ["low", "medium", "high"], "description": "Default medium"},
                        "count": {"type": "integer", "description": "How many variations, 1-4 (default 1)"},
                        "name": {"type": "string", "description": "Short label for the media library"},
                    },
                    "required": ["prompt"],
                },
            ),
            handler=generate_product_image,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="edit_product_image",
                description=(
                    "Edit an existing image with an instruction (change background, remove an object, recolor, add text, "
                    "combine with another product's style, etc.) and save the result as a new media item — the original is "
                    "untouched. Give exactly one source: source_product (uses its current photo), source_media_id, or "
                    "source_image_url. Use for 'change the background of this product's photo to white', 'remove the "
                    "watermark from…'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "What to change"},
                        "source_product": {"type": "string", "description": "Product name/SKU/id whose current photo to edit"},
                        "source_media_id": {"type": "string"},
                        "source_image_url": {"type": "string"},
                        "size": {"type": "string", "enum": ["square", "landscape", "portrait"]},
                        "quality": {"type": "string", "enum": ["low", "medium", "high"]},
                        "name": {"type": "string"},
                    },
                    "required": ["prompt"],
                },
            ),
            handler=edit_product_image,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="attach_image_to_product",
                description=(
                    "Put a media item (usually one just generated or edited) onto a product's image gallery — the first "
                    "image attached, or as_primary=true, becomes the product's main photo. Use after generate_product_image "
                    "/ edit_product_image once the user confirms they want it on that product."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "media_id": {"type": "string", "description": "From a generate/edit result"},
                        "product": {"type": "string", "description": "Product name, SKU or id"},
                        "as_primary": {"type": "boolean", "description": "Force this as the main product photo"},
                    },
                    "required": ["media_id", "product"],
                },
            ),
            handler=attach_image_to_product,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
    ]
