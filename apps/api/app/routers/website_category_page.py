from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_category_page import dump_json
from app.schemas.website_category_page import (
    CategoryPageContent,
    WebsiteCategoryPageRead,
    WebsiteCategoryPageResponse,
    WebsiteCategoryPageUpdate,
)
from app.services.website_category_page_service import (
    ensure_category_page,
    load_category_page_raw,
)

router = APIRouter(prefix="/category-page", tags=["website-category-page"])


def _to_read(row) -> WebsiteCategoryPageRead:
    raw = load_category_page_raw(row)
    content = CategoryPageContent.model_validate(raw)
    return WebsiteCategoryPageRead(
        id=row.id,
        company_id=row.company_id,
        content=content,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=WebsiteCategoryPageResponse)
def get_category_page(db: Session = Depends(get_db)) -> WebsiteCategoryPageResponse:
    row = ensure_category_page(db)
    return WebsiteCategoryPageResponse(data=_to_read(row))


@router.patch("", response_model=WebsiteCategoryPageResponse)
def update_category_page(
    payload: WebsiteCategoryPageUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteCategoryPageResponse:
    row = ensure_category_page(db)
    if payload.content is not None:
        row.content_json = dump_json(payload.content.model_dump())
    db.commit()
    db.refresh(row)
    return WebsiteCategoryPageResponse(data=_to_read(row))
