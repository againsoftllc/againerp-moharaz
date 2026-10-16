from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_page import WebsitePage, dump_json, load_json
from app.schemas.website_page import (
    WebsitePageAccess,
    WebsitePageAdvanced,
    WebsitePageCreate,
    WebsitePageFlags,
    WebsitePageListMeta,
    WebsitePageListResponse,
    WebsitePageRead,
    WebsitePageResponse,
    WebsitePageSeo,
    WebsitePageStats,
    WebsitePageUpdate,
    WebsitePageVersion,
)

router = APIRouter(prefix="/pages", tags=["website-pages"])

DEFAULT_SEO = WebsitePageSeo()
DEFAULT_ADVANCED = WebsitePageAdvanced()
DEFAULT_ACCESS = WebsitePageAccess()
DEFAULT_STATS = WebsitePageStats()
DEFAULT_FLAGS = WebsitePageFlags()

CATEGORY_TEMPLATE_ID = "pg-category"
CATEGORY_TEMPLATE_SLUG = "laptops"
CATEGORY_TEMPLATE_URL = "/laptops"


def _ensure_category_template_page(db: Session) -> None:
    """Ensure Category CMS template exists and points at Monarch /{slug}."""
    row = db.get(WebsitePage, CATEGORY_TEMPLATE_ID)
    legacy = db.get(WebsitePage, "pg-cat-electronics")
    changed = False

    if legacy is not None and row is None:
        db.delete(legacy)
        db.flush()
        changed = True

    if row is None:
        now = datetime.now(timezone.utc)
        db.add(
            WebsitePage(
                id=CATEGORY_TEMPLATE_ID,
                company_id="default",
                name="Category",
                slug=CATEGORY_TEMPLATE_SLUG,
                url=CATEGORY_TEMPLATE_URL,
                page_type="category",
                layout="default",
                template="Category Grid",
                language="en",
                description="Category PLP template — Live Edit preview uses a sample catalog category",
                visibility="public",
                status="published",
                seo_status="complete",
                creator="Admin",
                updated_by="Admin",
                published_at=now,
                current_version=1,
                seo_json=dump_json(
                    WebsitePageSeo(
                        meta_title="Category | AgainERP",
                        meta_description="Browse products by category.",
                        schema_type="CollectionPage",
                    ).model_dump()
                ),
                advanced_json=dump_json(DEFAULT_ADVANCED.model_dump()),
                access_json=dump_json(DEFAULT_ACCESS.model_dump()),
                stats_json=dump_json(DEFAULT_STATS.model_dump()),
                flags_json=dump_json(
                    WebsitePageFlags(slug_locked=True, delete_disabled=True).model_dump()
                ),
                versions_json=dump_json([]),
                permissions_json=dump_json(["public_read"]),
                created_at=now,
                updated_at=now,
            )
        )
        changed = True
    elif (
        row.name != "Category"
        or row.slug != CATEGORY_TEMPLATE_SLUG
        or row.url != CATEGORY_TEMPLATE_URL
        or row.page_type != "category"
    ):
        row.name = "Category"
        row.slug = CATEGORY_TEMPLATE_SLUG
        row.url = CATEGORY_TEMPLATE_URL
        row.page_type = "category"
        row.updated_at = datetime.now(timezone.utc)
        changed = True

    if changed:
        db.commit()


def _parse_seo(raw: object) -> WebsitePageSeo:
    if isinstance(raw, dict):
        return WebsitePageSeo.model_validate(raw)
    return DEFAULT_SEO.model_copy()


def _parse_advanced(raw: object) -> WebsitePageAdvanced:
    if isinstance(raw, dict):
        return WebsitePageAdvanced.model_validate(raw)
    return DEFAULT_ADVANCED.model_copy()


def _parse_access(raw: object) -> WebsitePageAccess:
    if isinstance(raw, dict):
        return WebsitePageAccess.model_validate(raw)
    return DEFAULT_ACCESS.model_copy()


def _parse_stats(raw: object) -> WebsitePageStats:
    if isinstance(raw, dict):
        return WebsitePageStats.model_validate(raw)
    return DEFAULT_STATS.model_copy()


def _parse_flags(raw: object) -> WebsitePageFlags:
    if isinstance(raw, dict):
        return WebsitePageFlags.model_validate(raw)
    return DEFAULT_FLAGS.model_copy()


def _parse_versions(raw: object) -> list[WebsitePageVersion]:
    if not isinstance(raw, list):
        return []
    rows: list[WebsitePageVersion] = []
    for item in raw:
        if isinstance(item, dict):
            rows.append(WebsitePageVersion.model_validate(item))
    return rows


def _parse_permissions(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(x) for x in raw]
    return []


def _to_read(row: WebsitePage) -> WebsitePageRead:
    return WebsitePageRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        slug=row.slug,
        url=row.url,
        page_type=row.page_type,  # type: ignore[arg-type]
        layout=row.layout,  # type: ignore[arg-type]
        template=row.template,
        language=row.language,  # type: ignore[arg-type]
        description=row.description or "",
        visibility=row.visibility,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        seo_status=row.seo_status,  # type: ignore[arg-type]
        creator=row.creator,
        updated_by=row.updated_by,
        published_at=row.published_at,
        scheduled_at=row.scheduled_at,
        expires_at=row.expires_at,
        current_version=row.current_version,
        seo=_parse_seo(load_json(row.seo_json, {})),
        advanced=_parse_advanced(load_json(row.advanced_json, {})),
        access=_parse_access(load_json(row.access_json, {})),
        stats=_parse_stats(load_json(row.stats_json, {})),
        flags=_parse_flags(load_json(row.flags_json, {})),
        versions=_parse_versions(load_json(row.versions_json, [])),
        permissions=_parse_permissions(load_json(row.permissions_json, [])),
        body_html=row.body_html or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _slug_to_url(slug: str) -> str:
    cleaned = slug.strip().lstrip("/")
    return f"/{cleaned}" if cleaned else "/"


def _ensure_unique_slug(db: Session, slug: str, exclude_id: str | None = None) -> None:
    query = db.query(WebsitePage).filter(WebsitePage.slug == slug)
    if exclude_id:
        query = query.filter(WebsitePage.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Slug already exists")


@router.get("", response_model=WebsitePageListResponse)
def list_pages(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    page_type: Optional[str] = Query(default=None),
) -> WebsitePageListResponse:
    _ensure_category_template_page(db)
    query = db.query(WebsitePage).order_by(WebsitePage.updated_at.desc())
    if status:
        query = query.filter(WebsitePage.status == status)
    if page_type:
        query = query.filter(WebsitePage.page_type == page_type)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            (WebsitePage.name.ilike(term))
            | (WebsitePage.slug.ilike(term))
            | (WebsitePage.url.ilike(term))
            | (WebsitePage.template.ilike(term)),
        )
    rows = query.all()
    data = [_to_read(row) for row in rows]
    return WebsitePageListResponse(data=data, meta=WebsitePageListMeta(count=len(data)))


@router.get("/{page_id}", response_model=WebsitePageResponse)
def get_page(page_id: str, db: Session = Depends(get_db)) -> WebsitePageResponse:
    row = db.get(WebsitePage, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return WebsitePageResponse(data=_to_read(row))


@router.post("", response_model=WebsitePageResponse, status_code=201)
def create_page(
    payload: WebsitePageCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsitePageResponse:
    slug = payload.slug.strip().lstrip("/")
    _ensure_unique_slug(db, slug)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    seo = payload.seo or WebsitePageSeo(
        meta_title=payload.name,
        meta_description=payload.description[:160] if payload.description else "",
        og_title=payload.name,
        og_description=payload.description[:160] if payload.description else "",
    )
    seo_status = "partial" if seo.meta_description else "missing"
    version = WebsitePageVersion(
        id=f"ver-1-{uuid.uuid4().hex[:8]}",
        version=1,
        label="Initial creation",
        status=payload.status,
        created_at=now.date().isoformat(),
        author=payload.creator,
        source="manual",
    )
    published_at = now if payload.status == "published" else None
    row = WebsitePage(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        slug=slug,
        url=_slug_to_url(slug),
        page_type=payload.page_type,
        layout=payload.layout,
        template=payload.template,
        language=payload.language,
        description=payload.description,
        visibility=payload.visibility,
        status=payload.status,
        seo_status=seo_status,
        creator=payload.creator,
        updated_by=payload.updated_by,
        published_at=published_at,
        scheduled_at=payload.scheduled_at,
        current_version=1,
        seo_json=dump_json(seo.model_dump()),
        advanced_json=dump_json(DEFAULT_ADVANCED.model_dump()),
        access_json=dump_json(WebsitePageAccess(owner=payload.creator, editors=[payload.creator]).model_dump()),
        stats_json=dump_json(DEFAULT_STATS.model_dump()),
        flags_json=dump_json(DEFAULT_FLAGS.model_dump()),
        versions_json=dump_json([version.model_dump()]),
        permissions_json=dump_json(["editor_write"]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WebsitePageResponse(data=_to_read(row))


@router.patch("/{page_id}", response_model=WebsitePageResponse)
def update_page(
    page_id: str,
    payload: WebsitePageUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsitePageResponse:
    row = db.get(WebsitePage, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")

    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] is not None:
        slug = str(data["slug"]).strip().lstrip("/")
        flags = _parse_flags(load_json(row.flags_json, {}))
        if flags.slug_locked and slug != row.slug:
            raise HTTPException(status_code=400, detail="Slug is locked for this page")
        _ensure_unique_slug(db, slug, exclude_id=row.id)
        row.slug = slug
        if "url" not in data:
            row.url = _slug_to_url(slug)
        data.pop("slug")

    json_fields = {
        "seo": "seo_json",
        "advanced": "advanced_json",
        "access": "access_json",
        "stats": "stats_json",
        "flags": "flags_json",
        "versions": "versions_json",
        "permissions": "permissions_json",
    }
    for key, column in json_fields.items():
        if key in data:
            value = data.pop(key)
            setattr(row, column, dump_json(value))

    for key, value in data.items():
        setattr(row, key, value)

    if payload.status == "published" and row.published_at is None:
        row.published_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(row)
    return WebsitePageResponse(data=_to_read(row))


@router.delete("/{page_id}", status_code=204)
def delete_page(
    page_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(WebsitePage, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    flags = _parse_flags(load_json(row.flags_json, {}))
    if flags.delete_disabled or flags.is_system:
        raise HTTPException(status_code=400, detail="This page cannot be deleted")
    db.delete(row)
    db.commit()
