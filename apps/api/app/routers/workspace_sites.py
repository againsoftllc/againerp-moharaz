from __future__ import annotations

import re
import uuid
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.deps.auth import require_write_access
from app.models.catalog_product import CatalogProduct
from app.models.commerce_order import CommerceOrder
from app.models.website_settings import DEFAULT_WEBSITE_SETTINGS_ID, WebsiteSettings
from app.models.workspace_site import DEFAULT_SITE_ID, WorkspaceSite
from app.schemas.workspace_site import (
    WorkspaceSiteCreate,
    WorkspaceSiteListResponse,
    WorkspaceSiteRead,
    WorkspaceSiteResponse,
    WorkspaceSiteUpdate,
)
from app.services.site_cors import get_site_cors_origins, refresh_site_cors_origins
from app.services.site_store_options import dump_site_options, load_site_options

router = APIRouter(prefix="/workspace/sites", tags=["workspace-sites"])


def _normalize_origin(raw: str | None) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    if not re.match(r"^https?://", value, re.I):
        value = f"https://{value}"
    try:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    except Exception:
        return ""


def _normalize_domain(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if not value:
        return ""
    value = re.sub(r"^https?://", "", value)
    value = value.split("/")[0].strip()
    return value


def ensure_order_site_column() -> None:
    """`commerce_orders.site_id` — added after multi-site; no Alembic in this repo."""
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS site_id VARCHAR(36)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_commerce_orders_site_id "
                "ON commerce_orders (site_id)"
            )
        )


def _order_counts(db: Session) -> dict[str, int]:
    """Orders per site id. Rows with no site fall to the primary site."""
    ensure_order_site_column()
    counts: dict[str, int] = {}
    unassigned = 0
    for site_id, total in (
        db.query(CommerceOrder.site_id, func.count(CommerceOrder.id))
        .group_by(CommerceOrder.site_id)
        .all()
    ):
        if site_id:
            counts[site_id] = int(total)
        else:
            unassigned += int(total)

    if unassigned:
        primary = get_primary_site(db)
        if primary:
            counts[primary.id] = counts.get(primary.id, 0) + unassigned
    return counts


def _product_count(db: Session) -> int:
    """Sites share one catalog, so every site reports the same product total."""
    return db.query(CatalogProduct).count()


def _read_with_counts(db: Session, row: WorkspaceSite) -> WorkspaceSiteRead:
    return _to_read(
        row,
        products=_product_count(db),
        orders=_order_counts(db).get(row.id, 0),
    )


def _to_read(row: WorkspaceSite, *, products: int = 0, orders: int = 0) -> WorkspaceSiteRead:
    return WorkspaceSiteRead(
        id=row.id,
        company_id=row.company_id,
        code=row.code,
        name=row.name,
        status=row.status,
        plan=row.plan or "",
        owner=row.owner or "",
        primary_domain=row.primary_domain or "",
        domain_aliases=row.domain_aliases or "",
        storefront_url_local=row.storefront_url_local or "",
        storefront_url_preview=row.storefront_url_preview or "",
        storefront_url_production=row.storefront_url_production or "",
        git_repo_url=row.git_repo_url or "",
        git_default_branch=row.git_default_branch or "main",
        vercel_project_id=row.vercel_project_id or "",
        vercel_project_name=row.vercel_project_name or "",
        vercel_team_slug=row.vercel_team_slug or "",
        tagline=row.tagline or "",
        logo_url=row.logo_url or "",
        logo_mobile_url=row.logo_mobile_url or "",
        favicon_url=row.favicon_url or "",
        address=row.address or "",
        contact_phone=row.contact_phone or "",
        contact_email=row.contact_email or "",
        whatsapp_number=row.whatsapp_number or "",
        copyright_text=row.copyright_text or "",
        business_hours=row.business_hours or "",
        meta_title=row.meta_title or "",
        meta_description=row.meta_description or "",
        meta_keywords=getattr(row, "meta_keywords", None) or "",
        options=load_site_options(getattr(row, "options_json", None)),
        currency=row.currency or "BDT",
        timezone=row.timezone or "Asia/Dhaka",
        notes=row.notes or "",
        is_primary=bool(row.is_primary),
        branches=1,
        products=products,
        orders=orders,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_website_settings(db: Session, site: WorkspaceSite) -> None:
    """Keep singleton website_settings aligned with the primary site brand."""
    if not site.is_primary:
        return
    row = db.get(WebsiteSettings, DEFAULT_WEBSITE_SETTINGS_ID)
    if not row:
        row = WebsiteSettings(id=DEFAULT_WEBSITE_SETTINGS_ID)
        db.add(row)
    row.site_name = site.name or row.site_name
    row.tagline = site.tagline or ""
    row.logo_url = site.logo_url or ""
    row.logo_mobile_url = site.logo_mobile_url or ""
    row.favicon_url = site.favicon_url or ""
    row.address = site.address or ""
    row.contact_phone = site.contact_phone or ""
    row.contact_email = site.contact_email or ""
    row.whatsapp_number = site.whatsapp_number or ""
    row.copyright_text = site.copyright_text or row.copyright_text


def _normalize_brand_url(url: str | None) -> str:
    if not url:
        return ""
    value = str(url).strip()
    if not value:
        return ""
    if value.startswith("/uploads/"):
        return value
    marker = "/uploads/"
    idx = value.find(marker)
    if idx >= 0:
        return value[idx:]
    return value


def _sync_cms_logos_from_site(site: WorkspaceSite) -> None:
    """Keep live-edit CMS header logos aligned when Sites Image is saved."""
    import json

    raw = getattr(site, "storefront_cms_json", None) or ""
    data: dict = {}
    if raw and str(raw).strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = {}
    header = data.get("header") if isinstance(data.get("header"), dict) else {}
    if not isinstance(header, dict):
        header = {}
    logo = _normalize_brand_url(site.logo_url)
    mobile = _normalize_brand_url(site.logo_mobile_url) or logo
    if logo:
        header["logoDesktop"] = logo
    if mobile:
        header["logoMobile"] = mobile
    if site.name:
        header["logoAlt"] = site.name
    data["header"] = header
    site.storefront_cms_json = json.dumps(data, ensure_ascii=False)


def _clear_other_primary(db: Session, keep_id: str) -> None:
    others = (
        db.query(WorkspaceSite)
        .filter(WorkspaceSite.id != keep_id, WorkspaceSite.is_primary.is_(True))
        .all()
    )
    for other in others:
        other.is_primary = False


def _get_site(db: Session, site_id: str) -> WorkspaceSite:
    row = db.get(WorkspaceSite, site_id)
    if not row:
        # Allow lookup by code
        row = db.query(WorkspaceSite).filter(WorkspaceSite.code == site_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    return row


def get_primary_site(db: Session) -> Optional[WorkspaceSite]:
    row = (
        db.query(WorkspaceSite)
        .filter(WorkspaceSite.is_primary.is_(True))
        .order_by(WorkspaceSite.updated_at.desc())
        .first()
    )
    if row:
        return row
    return db.query(WorkspaceSite).order_by(WorkspaceSite.created_at.asc()).first()


@router.get("", response_model=WorkspaceSiteListResponse)
def list_sites(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None),
) -> WorkspaceSiteListResponse:
    products = _product_count(db)
    orders_by_site = _order_counts(db)
    query = db.query(WorkspaceSite).order_by(
        WorkspaceSite.is_primary.desc(),
        WorkspaceSite.name.asc(),
    )
    rows = query.all()
    if q:
        needle = q.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r.name or "").lower()
            or needle in (r.code or "").lower()
            or needle in (r.primary_domain or "").lower()
            or needle in (r.owner or "").lower()
        ]
    return WorkspaceSiteListResponse(
        data=[
            _to_read(r, products=products, orders=orders_by_site.get(r.id, 0))
            for r in rows
        ],
        total=len(rows),
    )


@router.get("/primary", response_model=WorkspaceSiteResponse)
def get_primary_site_endpoint(db: Session = Depends(get_db)) -> WorkspaceSiteResponse:
    row = get_primary_site(db)
    if not row:
        raise HTTPException(status_code=404, detail="No site configured")
    return WorkspaceSiteResponse(data=_read_with_counts(db, row))


@router.get("/cors-origins")
def list_cors_origins(db: Session = Depends(get_db)) -> dict:
    origins = refresh_site_cors_origins(db)
    return {"data": {"origins": origins, "count": len(origins)}}


@router.post("/refresh-cors")
def refresh_cors(
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> dict:
    origins = refresh_site_cors_origins(db)
    return {"data": {"origins": origins, "count": len(origins), "ok": True}}


@router.get("/{site_id}", response_model=WorkspaceSiteResponse)
def get_site(site_id: str, db: Session = Depends(get_db)) -> WorkspaceSiteResponse:
    row = _get_site(db, site_id)
    return WorkspaceSiteResponse(data=_read_with_counts(db, row))


@router.post("", response_model=WorkspaceSiteResponse)
def create_site(
    payload: WorkspaceSiteCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WorkspaceSiteResponse:
    code = payload.code.strip().upper()
    if db.query(WorkspaceSite).filter(WorkspaceSite.code == code).first():
        raise HTTPException(status_code=400, detail="Site code already exists")
    site_id = (payload.id or "").strip() or str(uuid.uuid4())
    if db.get(WorkspaceSite, site_id):
        raise HTTPException(status_code=400, detail="Site id already exists")

    existing_count = db.query(WorkspaceSite).count()
    is_primary = payload.is_primary or existing_count == 0
    row = WorkspaceSite(
        id=site_id,
        code=code,
        name=payload.name.strip(),
        status=payload.status,
        plan=payload.plan.strip(),
        owner=payload.owner.strip(),
        primary_domain=_normalize_domain(payload.primary_domain),
        domain_aliases=payload.domain_aliases.strip(),
        storefront_url_local=_normalize_origin(payload.storefront_url_local),
        storefront_url_preview=_normalize_origin(payload.storefront_url_preview),
        storefront_url_production=_normalize_origin(payload.storefront_url_production),
        git_repo_url=payload.git_repo_url.strip(),
        git_default_branch=(payload.git_default_branch or "main").strip() or "main",
        vercel_project_id=payload.vercel_project_id.strip(),
        vercel_project_name=payload.vercel_project_name.strip(),
        vercel_team_slug=payload.vercel_team_slug.strip(),
        tagline=payload.tagline.strip(),
        logo_url=payload.logo_url.strip(),
        logo_mobile_url=payload.logo_mobile_url.strip(),
        favicon_url=payload.favicon_url.strip(),
        address=payload.address.strip(),
        contact_phone=payload.contact_phone.strip(),
        contact_email=payload.contact_email.strip(),
        whatsapp_number=payload.whatsapp_number.strip(),
        copyright_text=payload.copyright_text.strip(),
        business_hours=payload.business_hours.strip(),
        meta_title=payload.meta_title.strip(),
        meta_description=payload.meta_description.strip(),
        meta_keywords=getattr(payload, "meta_keywords", "") or "",
        options_json=dump_site_options(getattr(payload, "options", None) or {}),
        currency=(payload.currency or "BDT").strip() or "BDT",
        timezone=(payload.timezone or "Asia/Dhaka").strip() or "Asia/Dhaka",
        notes=payload.notes.strip(),
        is_primary=is_primary,
    )
    if is_primary:
        _clear_other_primary(db, site_id)
    db.add(row)
    _sync_website_settings(db, row)
    db.commit()
    db.refresh(row)
    refresh_site_cors_origins(db)
    return WorkspaceSiteResponse(data=_read_with_counts(db, row))


@router.patch("/{site_id}", response_model=WorkspaceSiteResponse)
def update_site(
    site_id: str,
    payload: WorkspaceSiteUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WorkspaceSiteResponse:
    row = _get_site(db, site_id)
    changes = payload.model_dump(exclude_unset=True)
    if "code" in changes and changes["code"] is not None:
        code = str(changes["code"]).strip().upper()
        clash = (
            db.query(WorkspaceSite)
            .filter(WorkspaceSite.code == code, WorkspaceSite.id != row.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Site code already exists")
        changes["code"] = code
    if "primary_domain" in changes:
        changes["primary_domain"] = _normalize_domain(changes.get("primary_domain"))
    for key in ("storefront_url_local", "storefront_url_preview", "storefront_url_production"):
        if key in changes:
            changes[key] = _normalize_origin(changes.get(key))
    if "options" in changes:
        options_payload = changes.pop("options")
        changes["options_json"] = dump_site_options(
            options_payload if isinstance(options_payload, dict) else {}
        )
    for key, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
        if key in ("logo_url", "logo_mobile_url", "favicon_url") and isinstance(value, str):
            value = _normalize_brand_url(value)
        setattr(row, key, value)
    if changes.get("is_primary"):
        _clear_other_primary(db, row.id)
        row.is_primary = True
    if any(k in changes for k in ("logo_url", "logo_mobile_url", "name")):
        _sync_cms_logos_from_site(row)
    _sync_website_settings(db, row)
    db.commit()
    db.refresh(row)
    refresh_site_cors_origins(db)
    return WorkspaceSiteResponse(data=_read_with_counts(db, row))


@router.delete("/{site_id}", response_model=WorkspaceSiteResponse)
def delete_site(
    site_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WorkspaceSiteResponse:
    row = _get_site(db, site_id)
    if row.id == DEFAULT_SITE_ID or row.is_primary:
        raise HTTPException(status_code=400, detail="Cannot delete the primary site")
    data = _read_with_counts(db, row)
    db.delete(row)
    db.commit()
    refresh_site_cors_origins(db)
    return WorkspaceSiteResponse(data=data)
