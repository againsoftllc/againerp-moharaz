from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_warranty import CatalogWarranty
from app.schemas.warranty import (
    WarrantyCreate,
    WarrantyListMeta,
    WarrantyListResponse,
    WarrantyResponse,
    WarrantyUpdate,
)

router = APIRouter(prefix="/warranties", tags=["catalog-warranties"])


def _next_sort_order(db: Session) -> int:
    max_order = db.query(CatalogWarranty.sort_order).order_by(CatalogWarranty.sort_order.desc()).first()
    return (max_order[0] + 1) if max_order else 0


@router.get("", response_model=WarrantyListResponse)
def list_warranties(db: Session = Depends(get_db)) -> WarrantyListResponse:
    rows = db.query(CatalogWarranty).order_by(CatalogWarranty.sort_order, CatalogWarranty.name).all()
    return WarrantyListResponse(data=list(rows), meta=WarrantyListMeta(count=len(rows)))


@router.post("", response_model=WarrantyResponse, status_code=201)
def create_warranty(
    payload: WarrantyCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WarrantyResponse:
    existing = (
        db.query(CatalogWarranty)
        .filter(func.lower(CatalogWarranty.name) == payload.name.strip().lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Warranty already exists")

    row = CatalogWarranty(name=payload.name.strip(), sort_order=payload.sort_order or _next_sort_order(db))
    db.add(row)
    db.commit()
    db.refresh(row)
    return WarrantyResponse(data=row)


@router.patch("/{warranty_id}", response_model=WarrantyResponse)
def update_warranty(
    warranty_id: str,
    payload: WarrantyUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WarrantyResponse:
    row = db.get(CatalogWarranty, warranty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Warranty not found")

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is not None:
        name = changes["name"].strip()
        conflict = (
            db.query(CatalogWarranty)
            .filter(func.lower(CatalogWarranty.name) == name.lower(), CatalogWarranty.id != warranty_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Warranty already exists")
        changes["name"] = name

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return WarrantyResponse(data=row)


@router.delete("/{warranty_id}", status_code=204)
def delete_warranty(
    warranty_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogWarranty, warranty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Warranty not found")
    db.delete(row)
    db.commit()
