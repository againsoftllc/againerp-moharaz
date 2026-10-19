from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.catalog_sitemap_import import RUN_BATCH, create_from_urls, preview

router = APIRouter(prefix="/catalog/sitemap-import", tags=["catalog-sitemap-import"])


class SitemapPreviewRequest(BaseModel):
    url: Optional[str] = None  # the sitemap's address ...
    xml: Optional[str] = None  # ... or its XML text (when the shop blocks our server)
    urls: Optional[List[str]] = Field(default=None, max_length=200_000)  # ... or a ready list of page addresses (from an Excel / text file)


class SitemapRunRequest(BaseModel):
    urls: List[str] = Field(default_factory=list, max_length=RUN_BATCH)


@router.post("/preview")
def preview_sitemap(
    payload: SitemapPreviewRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_permission("catalog", "create")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """Read the sitemap: how many pages are new products (with their made-up titles) and the list of their addresses."""
    return {"data": preview(db, company_id, payload.url, payload.xml, payload.urls)}


@router.post("/run")
def run_sitemap_import(
    payload: SitemapRunRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_permission("catalog", "create")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """Create unlisted products for up to 100 addresses (the page calls this again and again for a long list)."""
    return {"data": create_from_urls(db, company_id, payload.urls)}
