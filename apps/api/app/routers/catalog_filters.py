from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_filter import CatalogFilter
from app.schemas.filter import (
    FilterCreate,
    FilterListMeta,
    FilterListResponse,
    FilterRead,
    FilterReorderRequest,
    FilterResponse,
    FilterUpdate,
)

router = APIRouter(prefix="/filters", tags=["catalog-filters"])


def _to_read(row: CatalogFilter) -> FilterRead:
    return FilterRead.model_validate(row)


def _next_sort_order(db: Session) -> int:
    max_order = (
        db.query(CatalogFilter.sort_order)
        .order_by(CatalogFilter.sort_order.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


@router.get("", response_model=FilterListResponse)
def list_filters(db: Session = Depends(get_db)) -> FilterListResponse:
    rows = db.query(CatalogFilter).order_by(CatalogFilter.sort_order, CatalogFilter.name).all()
    data = [_to_read(r) for r in rows]
    return FilterListResponse(data=data, meta=FilterListMeta(count=len(data)))


@router.patch("/reorder", response_model=FilterListResponse)
def reorder_filters(
    payload: FilterReorderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> FilterListResponse:
    rows = db.query(CatalogFilter).all()
    row_map = {r.id: r for r in rows}

    if set(payload.ordered_ids) != set(row_map.keys()):
        raise HTTPException(status_code=400, detail="ordered_ids must include all filters")

    for index, filter_id in enumerate(payload.ordered_ids):
        row_map[filter_id].sort_order = index

    db.commit()

    all_rows = db.query(CatalogFilter).order_by(CatalogFilter.sort_order, CatalogFilter.name).all()
    data = [_to_read(r) for r in all_rows]
    return FilterListResponse(data=data, meta=FilterListMeta(count=len(data)))


@router.get("/{filter_id}", response_model=FilterResponse)
def get_filter(filter_id: str, db: Session = Depends(get_db)) -> FilterResponse:
    row = db.get(CatalogFilter, filter_id)
    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")
    return FilterResponse(data=_to_read(row))


@router.post("", response_model=FilterResponse, status_code=201)
def create_filter(
    payload: FilterCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> FilterResponse:
    existing = db.query(CatalogFilter).filter(CatalogFilter.param_key == payload.param_key).first()
    if existing:
        raise HTTPException(status_code=409, detail="Filter param_key already exists")

    row = CatalogFilter(**payload.model_dump())
    if payload.sort_order == 0:
        row.sort_order = _next_sort_order(db)
    if not row.url_example:
        row.url_example = f"?{row.param_key}="

    db.add(row)
    db.commit()
    db.refresh(row)
    return FilterResponse(data=_to_read(row))


@router.patch("/{filter_id}", response_model=FilterResponse)
def update_filter(
    filter_id: str,
    payload: FilterUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> FilterResponse:
    row = db.get(CatalogFilter, filter_id)
    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return FilterResponse(data=_to_read(row))

    if row.is_system:
        blocked = {"param_key", "source", "display_type"} & set(changes.keys())
        if blocked:
            raise HTTPException(
                status_code=400,
                detail="System filter param_key, source, and display_type cannot be changed",
            )

    param_key = changes.get("param_key", row.param_key)
    if param_key != row.param_key:
        conflict = (
            db.query(CatalogFilter)
            .filter(CatalogFilter.param_key == param_key, CatalogFilter.id != filter_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Filter param_key already exists")

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return FilterResponse(data=_to_read(row))


@router.delete("/{filter_id}", status_code=204)
def delete_filter(
    filter_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogFilter, filter_id)
    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")
    if row.is_system:
        raise HTTPException(status_code=400, detail="System filters cannot be deleted")
    db.delete(row)
    db.commit()
