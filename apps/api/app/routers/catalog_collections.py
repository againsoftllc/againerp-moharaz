from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_collection import CatalogCollection
from app.schemas.collection import (
    CollectionCreate,
    CollectionListMeta,
    CollectionListResponse,
    CollectionRead,
    CollectionReorderRequest,
    CollectionResponse,
    CollectionUpdate,
)

router = APIRouter(prefix="/collections", tags=["catalog-collections"])


def _to_read(row: CatalogCollection) -> CollectionRead:
    return CollectionRead.model_validate(row)


def _next_sort_order(db: Session) -> int:
    max_order = (
        db.query(CatalogCollection.sort_order)
        .order_by(CatalogCollection.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


@router.get("", response_model=CollectionListResponse)
def list_collections(db: Session = Depends(get_db)) -> CollectionListResponse:
    rows = (
        db.query(CatalogCollection)
        .order_by(CatalogCollection.sort_order, CatalogCollection.name)
        .all()
    )
    data = [_to_read(r) for r in rows]
    return CollectionListResponse(data=data, meta=CollectionListMeta(count=len(data)))


@router.patch("/reorder", response_model=CollectionListResponse)
def reorder_collections(
    payload: CollectionReorderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CollectionListResponse:
    rows = db.query(CatalogCollection).all()
    row_map = {r.id: r for r in rows}

    if set(payload.ordered_ids) != set(row_map.keys()):
        raise HTTPException(status_code=400, detail="ordered_ids must include all collections")

    for index, collection_id in enumerate(payload.ordered_ids):
        row_map[collection_id].sort_order = index

    db.commit()

    all_rows = (
        db.query(CatalogCollection)
        .order_by(CatalogCollection.sort_order, CatalogCollection.name)
        .all()
    )
    data = [_to_read(r) for r in all_rows]
    return CollectionListResponse(data=data, meta=CollectionListMeta(count=len(data)))


@router.get("/{collection_id}", response_model=CollectionResponse)
def get_collection(collection_id: str, db: Session = Depends(get_db)) -> CollectionResponse:
    row = db.get(CatalogCollection, collection_id)
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionResponse(data=_to_read(row))


@router.post("", response_model=CollectionResponse, status_code=201)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CollectionResponse:
    existing = db.query(CatalogCollection).filter(CatalogCollection.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Collection slug already exists")

    row = CatalogCollection(**payload.model_dump())
    if payload.sort_order == 0:
        row.sort_order = _next_sort_order(db)

    db.add(row)
    db.commit()
    db.refresh(row)
    return CollectionResponse(data=_to_read(row))


@router.patch("/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: str,
    payload: CollectionUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CollectionResponse:
    row = db.get(CatalogCollection, collection_id)
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return CollectionResponse(data=_to_read(row))

    if row.is_system:
        blocked = {"collection_type", "rule_summary"} & set(changes.keys())
        if blocked:
            raise HTTPException(
                status_code=400,
                detail="System collection type and rules cannot be changed",
            )

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = (
            db.query(CatalogCollection)
            .filter(CatalogCollection.slug == slug, CatalogCollection.id != collection_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Collection slug already exists")

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return CollectionResponse(data=_to_read(row))


@router.delete("/{collection_id}", status_code=204)
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogCollection, collection_id)
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    if row.is_system:
        raise HTTPException(status_code=400, detail="System collections cannot be deleted")
    db.delete(row)
    db.commit()
