from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.models.auth_user import AuthUser
from app.database import get_db
from app.models.catalog_product import CatalogProduct
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.models.ecommerce_item_media import EcommerceItemMedia
from app.models.media import Media
from app.schemas.ecommerce_item import (
    EcommerceCategoryLinkRead,
    EcommerceItemListResponse,
    EcommerceItemRead,
    EcommerceItemResponse,
    EcommerceItemUpdate,
    EcommerceMediaLinkRead,
)
from app.services.collaboration import (
    CollaborationService,
    on_item_archived,
    on_item_published,
)
from app.services.collaboration.constants import ENTITY_TYPE_ITEM
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.ecommerce.publish_service import PublishWorkflowError

router = APIRouter(prefix="/items", tags=["ecommerce-items"])


def _enrich_read(db: Session, row: EcommerceItem) -> EcommerceItemRead:
    import json

    categories = (
        db.query(EcommerceItemCategory)
        .filter(EcommerceItemCategory.item_id == row.item_id)
        .order_by(EcommerceItemCategory.sort_order)
        .all()
    )
    media_rows = (
        db.query(EcommerceItemMedia, Media)
        .join(Media, Media.id == EcommerceItemMedia.media_id)
        .filter(EcommerceItemMedia.item_id == row.item_id)
        .order_by(EcommerceItemMedia.sort_order)
        .all()
    )
    keywords = json.loads(row.seo_keywords_json or "[]")
    if not isinstance(keywords, list):
        keywords = []
    base = EcommerceItemRead.model_validate(row, from_attributes=True)
    return base.model_copy(
        update={
            "seo_keywords": keywords,
            "categories": [
                EcommerceCategoryLinkRead(
                    category_id=c.category_id,
                    is_primary=c.is_primary,
                    sort_order=c.sort_order,
                )
                for c in categories
            ],
            "media": [
                EcommerceMediaLinkRead(
                    media_id=link.media_id,
                    url=media.url,
                    name=media.name,
                    sort_order=link.sort_order,
                    is_primary=link.is_primary,
                    is_featured=link.is_featured,
                )
                for link, media in media_rows
            ],
        },
    )


def _workflow_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PublishWorkflowError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=404, detail=str(exc))
    raise exc


@router.get("", response_model=EcommerceItemListResponse)
def list_ecommerce_items(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    publish_status: Optional[str] = Query(default=None),
    featured: Optional[bool] = Query(default=None),
) -> EcommerceItemListResponse:
    query = db.query(EcommerceItem).order_by(
        EcommerceItem.sort_order,
        EcommerceItem.updated_at.desc(),
    )
    if publish_status:
        query = query.filter(EcommerceItem.publish_status == publish_status)
    if featured is not None:
        query = query.filter(EcommerceItem.featured == featured)
    total = query.count()
    offset = (page - 1) * per_page
    rows = query.offset(offset).limit(per_page).all()
    return EcommerceItemListResponse(
        data=[_enrich_read(db, row) for row in rows],
        meta={"count": total, "page": page, "per_page": per_page},
    )


@router.get("/{item_id}", response_model=EcommerceItemResponse)
def get_ecommerce_item(item_id: str, db: Session = Depends(get_db)) -> EcommerceItemResponse:
    row = EcommerceItemService(db).get_by_item_id(item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ecommerce item not found")
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/sync-from-catalog", response_model=EcommerceItemResponse)
def sync_ecommerce_from_catalog(
    item_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    row = service.get_by_item_id(item_id)
    if not row or not row.catalog_product_id:
        raise HTTPException(status_code=404, detail="Ecommerce item or catalog link not found")
    product = db.get(CatalogProduct, row.catalog_product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Catalog product not found")
    updated = service.sync_content_from_catalog(product, row=row, mirror_publish=False)
    db.commit()
    db.refresh(updated)
    return EcommerceItemResponse(data=_enrich_read(db, updated))


@router.patch("/{item_id}", response_model=EcommerceItemResponse)
def update_ecommerce_item(
    item_id: str,
    payload: EcommerceItemUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    row = service.get_by_item_id(item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ecommerce item not found")

    updates = payload.model_dump(exclude_unset=True, exclude={"category_ids", "seo_keywords"})
    if payload.seo_keywords is not None:
        import json

        row.seo_keywords_json = json.dumps(payload.seo_keywords)
    for key, value in updates.items():
        setattr(row, key, value)

    if payload.category_ids is not None:
        service.replace_categories(
            item_id,
            payload.category_ids,
            primary_category_id=payload.primary_category_id,
            company_id=row.company_id,
        )

    row.is_active = row.publish_status == "published"

    if row.catalog_product_id:
        product = db.get(CatalogProduct, row.catalog_product_id)
        if product:
            service.sync_to_catalog_product(row, product)

    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/submit-for-review", response_model=EcommerceItemResponse)
def submit_ecommerce_for_review(
    item_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.submit_for_review(item_id)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    CollaborationService(db, company_id=row.company_id).update_approval(
        ENTITY_TYPE_ITEM,
        item_id,
        "review",
        actor_id=user.id,
    )
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/reject-review", response_model=EcommerceItemResponse)
def reject_ecommerce_review(
    item_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.reject_review(item_id)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    CollaborationService(db, company_id=row.company_id).update_approval(
        ENTITY_TYPE_ITEM,
        item_id,
        "draft",
        actor_id=user.id,
    )
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/publish", response_model=EcommerceItemResponse)
def publish_ecommerce_item(
    item_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.publish(item_id)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    on_item_published(db, item_id, performed_by=user.id, company_id=row.company_id)
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/unpublish", response_model=EcommerceItemResponse)
def unpublish_ecommerce_item(
    item_id: str,
    db: Session = Depends(get_db),
    hidden: bool = Query(default=False),
    _: object = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.unpublish(item_id, hidden=hidden)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/archive", response_model=EcommerceItemResponse)
def archive_ecommerce_item(
    item_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.archive(item_id)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    on_item_archived(db, item_id, performed_by=user.id, company_id=row.company_id)
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))


@router.post("/{item_id}/restore", response_model=EcommerceItemResponse)
def restore_ecommerce_item(
    item_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> EcommerceItemResponse:
    service = EcommerceItemService(db)
    try:
        row = service.restore(item_id)
    except (PublishWorkflowError, ValueError) as exc:
        raise _workflow_error(exc) from exc
    db.commit()
    db.refresh(row)
    return EcommerceItemResponse(data=_enrich_read(db, row))
