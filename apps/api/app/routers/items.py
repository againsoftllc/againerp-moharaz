from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access, get_current_company_id
from app.database import get_db
from app.models.auth_user import AuthUser
from app.models.item import Item
from app.schemas.item import (
    ItemCreate,
    ItemListMeta,
    ItemListResponse,
    ItemRead,
    ItemResponse,
    ItemUpdate,
)
from app.services.items.interfaces import ItemCreateInput, ItemUpdateInput
from app.services.items.item_identity_service import ItemIdentityService
from app.services.items.item_service import ItemService

router = APIRouter(prefix="/items", tags=["items"])


def _to_read(record, db: Session) -> ItemRead:
    data = dict(
        id=record.id,
        company_id=record.company_id,
        sku=record.sku,
        barcode=record.barcode,
        name=record.name,
        item_type=record.item_type,
        status=record.status,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
    if record.item_type == "service":
        from app.services.items.module_repositories import SqlAlchemyServiceItemRepository

        service_row = SqlAlchemyServiceItemRepository(db).get(record.id)
        if service_row:
            creator_name = None
            if service_row.created_by:
                creator = db.get(AuthUser, service_row.created_by)
                creator_name = creator.name if creator else None
            data.update(
                description=service_row.description,
                category=service_row.category,
                unit_type=service_row.unit_type,
                rate=service_row.rate,
                show_in_client_portal=service_row.show_in_client_portal,
                image_url=service_row.image_url,
                created_by=service_row.created_by,
                created_by_name=creator_name,
            )
    return ItemRead(**data)


@router.get("", response_model=ItemListResponse)
def list_items(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(default=None),
    item_type: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None, pattern="^(service|manufacturing)$"),
    q: Optional[str] = Query(default=None, max_length=120),
    company_id: str = Depends(get_current_company_id),
) -> ItemListResponse:
    from app.models.item import Item as ItemModel

    query = db.query(ItemModel).filter(ItemModel.company_id == company_id)
    if status:
        query = query.filter(ItemModel.status == status)
    if item_type:
        query = query.filter(ItemModel.item_type == item_type)
    if module == "service":
        from app.models.service_item import ServiceItem

        query = query.join(ServiceItem, ServiceItem.item_id == ItemModel.id)
    elif module == "manufacturing":
        from app.models.manufacturing_item import ManufacturingItem

        query = query.join(ManufacturingItem, ManufacturingItem.item_id == ItemModel.id)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ItemModel.sku.ilike(pattern),
                ItemModel.name.ilike(pattern),
                ItemModel.barcode.ilike(pattern),
            ),
        )
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(ItemModel.updated_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return ItemListResponse(
        data=[_to_read(row, db) for row in rows],
        meta=ItemListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> ItemResponse:
    service = ItemService(db)
    row = service.get(item_id, company_id=company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse(data=_to_read(row, db))


@router.post("", response_model=ItemResponse, status_code=201)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> ItemResponse:
    service = ItemService(db)
    created = service.create(
        ItemCreateInput(
            sku=payload.sku,
            name=payload.name,
            item_type=payload.item_type,
            status=payload.status,
            company_id=company_id,
            barcode=payload.barcode,
        ),
    )
    if payload.item_type == "service" or payload.register_module == "service":
        from app.services.items.module_repositories import SqlAlchemyServiceItemRepository

        SqlAlchemyServiceItemRepository(db).ensure_extension(
            created.id,
            company_id=company_id,
            description=payload.description,
            category=payload.category,
            unit_type=payload.unit_type,
            rate=payload.rate,
            show_in_client_portal=payload.show_in_client_portal,
            image_url=payload.image_url,
            created_by=user.id,
        )
    if payload.register_module == "manufacturing":
        from app.services.items.module_repositories import SqlAlchemyManufacturingItemRepository

        SqlAlchemyManufacturingItemRepository(db).ensure_extension(
            created.id,
            company_id=company_id,
        )
    db.commit()
    row = db.get(Item, created.id)
    if not row:
        raise HTTPException(status_code=500, detail="Item create failed")
    return ItemResponse(data=_to_read(row, db))


@router.patch("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: str,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> ItemResponse:
    service = ItemService(db)
    updated = service.update(
        item_id,
        ItemUpdateInput(
            sku=payload.sku,
            barcode=payload.barcode,
            name=payload.name,
            item_type=payload.item_type,
            status=payload.status,
        ),
        company_id=company_id,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    if updated.item_type == "service":
        from app.services.items.module_repositories import SqlAlchemyServiceItemRepository

        SqlAlchemyServiceItemRepository(db).update_extension(
            item_id,
            description=payload.description,
            category=payload.category,
            unit_type=payload.unit_type,
            rate=payload.rate,
            show_in_client_portal=payload.show_in_client_portal,
            image_url=payload.image_url,
        )
    ItemIdentityService(db).mirror_item_to_linked_catalog_products(item_id)
    db.commit()
    row = db.get(Item, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse(data=_to_read(row, db))
