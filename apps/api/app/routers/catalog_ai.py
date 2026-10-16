"""Catalog AI helpers — URL image import, and AI product-from-URL import."""

from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.catalog_ai_import import (
    CatalogAiCreateRequest,
    CatalogAiCreateResponse,
    CatalogAiExtractRequest,
    CatalogAiExtractResponse,
)
from app.services.catalog_ai import spec_profile_service
from app.services.catalog_ai.importer_service import create_product_from_draft, extract_from_url
from app.services.catalog_ai.scraper import fetch_page
from app.models.catalog_product import CatalogProduct
from app.services.catalog_media_import import (
    CatalogImportImagesRequest,
    CatalogImportImagesResponse,
    import_catalog_images,
)

router = APIRouter(prefix="/ai", tags=["catalog-ai"])


@router.post("/import-images", response_model=CatalogImportImagesResponse)
def catalog_import_images(
    payload: CatalogImportImagesRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CatalogImportImagesResponse:
    if not payload.urls:
        raise HTTPException(status_code=400, detail="urls is required")

    try:
        result = import_catalog_images(db, payload, company_id=company_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.items:
        return result

    reason = result.failed[0].reason if result.failed else "No images imported"
    raise HTTPException(status_code=422, detail=reason)


@router.post("/import-from-url/extract", response_model=CatalogAiExtractResponse)
def catalog_ai_extract(
    payload: CatalogAiExtractRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CatalogAiExtractResponse:
    """Scrape + AI-extract a product draft. Read-only — nothing is saved."""
    return extract_from_url(db, str(payload.url), company_id=company_id)


@router.post("/import-from-url/create", response_model=CatalogAiCreateResponse, status_code=201)
def catalog_ai_create(
    payload: CatalogAiCreateRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "create")),
) -> CatalogAiCreateResponse:
    """Create the real catalog product from a (reviewed, possibly edited) draft."""
    row = create_product_from_draft(db, payload, user)
    return CatalogAiCreateResponse(id=row.id, sku=row.sku, slug=row.slug, name=row.name, status=row.status)


class FillFromSourceResponse(BaseModel):
    id: str
    name: str
    source_url: str
    price: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    images: int = 0
    status: str


@router.post("/products/{product_id}/fill-from-source", response_model=FillFromSourceResponse)
def catalog_ai_fill_from_source(
    product_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FillFromSourceResponse:
    """Fill a draft product from its own source URL — the AI chat's "import this product link" logic, applied to the
    existing row (name, SKU, slug, status and Price Compare links stay; description, price, brand, category, specs,
    images and SEO come from the source page)."""
    row = db.get(CatalogProduct, product_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    url = (row.source_url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="This product has no source URL — add one first")
    extracted = extract_from_url(db, url, company_id=company_id)
    if not extracted.draft.name.strip():
        raise HTTPException(status_code=422, detail="No product found on the source page")
    payload = CatalogAiCreateRequest(
        draft=extracted.draft,
        brand_id=extracted.matched_brand_id,
        category_id=extracted.matched_category_id,
        category_ids=extracted.matched_category_ids,
        create_brand_if_missing=True,
        create_category_if_missing=True,
        import_images=True,
        status=row.status if row.status in ("draft", "published") else "draft",
    )
    row = create_product_from_draft(db, payload, user, existing=row)
    return FillFromSourceResponse(
        id=row.id, name=row.name, source_url=url, price=str(row.price) if row.price is not None else None,
        brand=row.brand, category=row.category, images=len(extracted.draft.images or []), status=row.status,
    )


class SpecFillField(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    group: str = Field(default="", max_length=255)
    options: List[str] = Field(default_factory=list, max_length=500)
    unit: Optional[str] = Field(default=None, max_length=50)
    filterable: bool = False


class SpecFillRequest(BaseModel):
    url: HttpUrl
    fields: List[SpecFillField] = Field(min_length=1, max_length=400)


class SpecFillResponse(BaseModel):
    url: str
    source_count: int
    values: Dict[str, str]
    # Fields with allowed values that don't include the source's value — the editor offers
    # to add each as a new option (a profile change) instead of adding it silently.
    off_options: Dict[str, str]


@router.post("/spec-fill", response_model=SpecFillResponse)
def catalog_ai_spec_fill(
    payload: SpecFillRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SpecFillResponse:
    """Product editor → Specifications → Fill: read the source page's spec table and map it
    onto the fields the editor shows (profile and product-only ones). Read-only — the editor
    puts the values in the form and the user saves the product as usual."""
    # The page's spec table parsed from HTML is enough (and exact) — only fall back to the full
    # LLM extraction when the page has no recognisable table.
    page = fetch_page(str(payload.url))
    specs = page.spec_groups
    if not spec_profile_service.spec_item_count(specs):
        extracted = extract_from_url(db, str(payload.url), company_id=company_id)
        db.rollback()  # extraction is read-only
        specs = spec_profile_service.specs_from_draft(extracted.draft)
    count = spec_profile_service.spec_item_count(specs)
    if not count:
        raise HTTPException(status_code=422, detail="No specification table was found on that page.")
    values, off = spec_profile_service.map_values_detailed(
        db, company_id, specs, [f.model_dump() for f in payload.fields]
    )
    return SpecFillResponse(url=str(payload.url), source_count=count, values=values, off_options=off)
