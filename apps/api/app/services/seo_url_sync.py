"""Keep `seo_url_records` in step with the entities that produce public pages.

Products, categories, brands and website pages each own a storefront path. This
module projects them into one flat table so the SEO screens have a single place
to list every indexable URL, and so the audit has something to walk.

Paths follow the storefront convention already used by the menu builder
(`website_menu_service._slug_href`): a flat `/{slug}`, with website pages free to
override via their own `url` column. Nothing here invents a nested path.

Editable fields (`canonical_url`, `redirect_to`, `views_30d`) are treated as
human-owned: the sync refreshes what the entity is the source of truth for and
leaves the rest alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.seo_redirect import SeoRedirect
from app.models.seo_url_record import SeoUrlRecord
from app.models.website_page import WebsitePage

COMPANY_DEFAULT = "default"

# Entity states that mean "this page is live on the storefront".
PUBLISHED_PRODUCT_STATUSES = {"published", "active"}
PUBLISHED_PAGE_STATUSES = {"published", "live", "active"}


@dataclass(frozen=True)
class DesiredUrl:
    """One storefront path as its owning entity currently defines it."""

    entity_type: str
    entity_id: str
    title: str
    slug: str
    published: bool
    indexable: bool


def normalize_path(value: Optional[str]) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith(("http://", "https://")):
        return cleaned
    cleaned = "/" + cleaned.lstrip("/")
    # Trailing slashes make two spellings of the same page; keep the short one.
    if len(cleaned) > 1:
        cleaned = cleaned.rstrip("/") or "/"
    return cleaned


def _page_seo(page: WebsitePage) -> dict:
    try:
        data = json.loads(page.seo_json or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _product_urls(db: Session) -> Iterable[DesiredUrl]:
    for row in db.query(CatalogProduct).all():
        path = normalize_path(row.slug)
        if not path:
            continue
        published = (row.status or "").lower() in PUBLISHED_PRODUCT_STATUSES
        yield DesiredUrl(
            entity_type="product",
            entity_id=row.id,
            title=row.name or row.sku or path,
            slug=path,
            published=published,
            indexable=published,
        )


def _category_urls(db: Session) -> Iterable[DesiredUrl]:
    for row in db.query(CatalogCategory).all():
        path = normalize_path(row.slug)
        if not path:
            continue
        yield DesiredUrl(
            entity_type="category",
            entity_id=row.id,
            title=row.name or path,
            slug=path,
            published=bool(row.is_active),
            indexable=bool(row.is_active),
        )


def _brand_urls(db: Session) -> Iterable[DesiredUrl]:
    for row in db.query(CatalogBrand).all():
        path = normalize_path(row.slug)
        if not path:
            continue
        yield DesiredUrl(
            entity_type="brand",
            entity_id=row.id,
            title=row.name or path,
            slug=path,
            published=bool(row.is_active),
            indexable=bool(row.is_active),
        )


def _page_urls(db: Session) -> Iterable[DesiredUrl]:
    for row in db.query(WebsitePage).all():
        # A page may pin its own URL; fall back to the slug convention.
        path = normalize_path(row.url) or normalize_path(row.slug)
        if not path:
            continue
        published = (row.status or "").lower() in PUBLISHED_PAGE_STATUSES
        public = (row.visibility or "public").lower() == "public"
        yield DesiredUrl(
            entity_type="page",
            entity_id=row.id,
            title=row.name or path,
            slug=path,
            published=published,
            indexable=published and public,
        )


def collect_desired_urls(db: Session) -> list[DesiredUrl]:
    return [
        *_product_urls(db),
        *_category_urls(db),
        *_brand_urls(db),
        *_page_urls(db),
    ]


def _redirect_map(db: Session, company_id: str) -> dict[str, str]:
    """Active redirects keyed by the path they capture."""
    rows = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.company_id == company_id, SeoRedirect.status == "active")
        .all()
    )
    mapping: dict[str, str] = {}
    for row in rows:
        source = normalize_path(row.from_path)
        if source:
            mapping[source] = normalize_path(row.to_path)
    return mapping


def _status_for(desired: DesiredUrl, redirect_target: Optional[str]) -> str:
    if redirect_target is not None:
        return "redirect"
    if not desired.published:
        return "draft"
    if not desired.indexable:
        return "noindex"
    return "active"


def sync_seo_url_records(db: Session, *, company_id: str = COMPANY_DEFAULT) -> int:
    """Create, refresh and retire URL records to match the current entities.

    Returns the number of rows written (created + changed). Commits, because both
    callers — the seed and the manual resync endpoint — are batch operations that
    own the whole transaction.
    """
    desired = collect_desired_urls(db)
    redirects = _redirect_map(db, company_id)

    existing = (
        db.query(SeoUrlRecord).filter(SeoUrlRecord.company_id == company_id).all()
    )
    by_entity = {(row.entity_type, row.entity_id): row for row in existing}
    by_slug = {row.slug: row for row in existing}

    written = 0
    seen: set[tuple[str, str]] = set()

    for item in desired:
        key = (item.entity_type, item.entity_id)
        if key in seen:
            continue
        seen.add(key)

        redirect_target = redirects.get(item.slug)
        status = _status_for(item, redirect_target)
        record = by_entity.get(key)

        if record is None:
            # Two entities claiming one path is a real content problem, but the
            # slug column is unique — leave it for the audit to report rather
            # than blowing up the sync.
            clash = by_slug.get(item.slug)
            if clash is not None:
                continue
            record = SeoUrlRecord(
                company_id=company_id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                title=item.title,
                slug=item.slug,
                canonical_url="",
                status=status,
                indexable=item.indexable,
                redirect_to=redirect_target or "",
                views_30d=0,
            )
            db.add(record)
            by_entity[key] = record
            by_slug[item.slug] = record
            written += 1
            continue

        # Refresh only what the entity owns; canonical_url and views_30d stay.
        changed = False
        if record.title != item.title:
            record.title = item.title
            changed = True
        if record.slug != item.slug and item.slug not in by_slug:
            by_slug.pop(record.slug, None)
            record.slug = item.slug
            by_slug[item.slug] = record
            changed = True
        # A hand-set status wins over the derived one until it is unlocked.
        if not record.status_locked:
            if record.status != status:
                record.status = status
                changed = True
            if record.indexable != item.indexable:
                record.indexable = item.indexable
                changed = True
        target = redirect_target or ""
        if record.redirect_to != target:
            record.redirect_to = target
            changed = True
        if changed:
            written += 1

    # Entities that no longer exist should not linger as indexable URLs.
    for record in existing:
        if (record.entity_type, record.entity_id) not in seen:
            db.delete(record)
            written += 1

    db.commit()
    return written
