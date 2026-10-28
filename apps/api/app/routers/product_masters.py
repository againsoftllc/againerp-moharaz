from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.services.inventory import product_master as masters

router = APIRouter(tags=["product-masters"])


class UnitTypeRow(BaseModel):
    code: str = Field("", max_length=20)
    name: str = Field(..., max_length=80)
    fraction_length: int = 0
    is_default: bool = False
    in_use: bool = False  # read only: a product uses it, so it cannot be removed


class UnitTypeList(BaseModel):
    data: List[UnitTypeRow]


class UnitTypeReplace(BaseModel):
    units: List[UnitTypeRow]


class WarehouseTypeList(BaseModel):
    data: List[str]


class WarehouseTypeReplace(BaseModel):
    names: List[str]


class RelationRow(BaseModel):
    related_product_id: str
    kind: str = "related"
    note: Optional[str] = Field(None, max_length=200)
    sku: Optional[str] = None  # read only
    name: Optional[str] = None
    price: Optional[str] = None


class RelationList(BaseModel):
    data: List[RelationRow]


class RelationReplace(BaseModel):
    relations: List[RelationRow]


# ── unit types (INV-08) ──────────────────────────────────────────────────────


def _units(db: Session, company_id: str) -> UnitTypeList:
    used = masters.units_in_use(db, company_id)
    return UnitTypeList(
        data=[
            UnitTypeRow(code=u.code, name=u.name, fraction_length=u.fraction_length, is_default=u.is_default, in_use=u.code in used)
            for u in masters.list_unit_types(db, company_id)
        ]
    )


@router.get("/inventory/unit-types", response_model=UnitTypeList)
def list_unit_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> UnitTypeList:
    result = _units(db, company_id)
    db.commit()  # the first read seeds the built-in units
    return result


@router.put("/inventory/unit-types", response_model=UnitTypeList)
def replace_unit_types(
    payload: UnitTypeReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> UnitTypeList:
    masters.replace_unit_types(db, company_id, [u.model_dump() for u in payload.units])
    db.commit()
    return _units(db, company_id)


# ── warehouse types (INV-08) ─────────────────────────────────────────────────


@router.get("/inventory/warehouse-types", response_model=WarehouseTypeList)
def list_warehouse_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> WarehouseTypeList:
    rows = masters.list_warehouse_types(db, company_id)
    db.commit()
    return WarehouseTypeList(data=[r.name for r in rows])


@router.put("/inventory/warehouse-types", response_model=WarehouseTypeList)
def replace_warehouse_types(
    payload: WarehouseTypeReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> WarehouseTypeList:
    rows = masters.replace_warehouse_types(db, company_id, payload.names)
    db.commit()
    return WarehouseTypeList(data=[r.name for r in rows])


# ── related / spare products ─────────────────────────────────────────────────


def _product(db: Session, product_id: str, company_id: str) -> CatalogProduct:
    row = db.get(CatalogProduct, product_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return row


def _relations(db: Session, product_id: str) -> RelationList:
    rows = masters.list_relations(db, product_id)
    others = {p.id: p for p in db.query(CatalogProduct).filter(CatalogProduct.id.in_({r.related_product_id for r in rows})).all()} if rows else {}
    return RelationList(
        data=[
            RelationRow(
                related_product_id=r.related_product_id, kind=r.kind, note=r.note,
                sku=others[r.related_product_id].sku if r.related_product_id in others else None,
                name=others[r.related_product_id].name if r.related_product_id in others else None,
                price=str(others[r.related_product_id].price) if r.related_product_id in others else None,
            )
            for r in rows
        ]
    )


@router.get("/catalog/products/{product_id}/relations", response_model=RelationList)
def list_relations(
    product_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RelationList:
    _product(db, product_id, company_id)
    return _relations(db, product_id)


@router.put("/catalog/products/{product_id}/relations", response_model=RelationList)
def replace_relations(
    product_id: str,
    payload: RelationReplace,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RelationList:
    product = _product(db, product_id, company_id)
    masters.replace_relations(db, product, [r.model_dump() for r in payload.relations])
    db.commit()
    return _relations(db, product_id)
