"""ERP admin control of what each vendor (or vendor group) can see and pay
for a catalog item — visibility rules and per-vendor price overrides.
Group-level pricing already lives on vendor_admin.py's /price-lists routes;
this file is the per-item counterpart surfaced from the catalog grid.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.item import Item
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_group import VendorGroup
from app.models.vendor.vendor_pricing import VendorProductPrice
from app.schemas.vendor.catalog_visibility import (
    VendorCatalogVisibilityListResponse,
    VendorCatalogVisibilityResponse,
    VendorCatalogVisibilityRuleRead,
    VendorCatalogVisibilityRuleWrite,
    VendorProductPriceListResponse,
    VendorProductPriceResponse,
    VendorProductPriceRead,
    VendorProductPriceWrite,
)
from app.services.vendor import vendor_catalog_visibility_service

router = APIRouter(prefix="/vendors", tags=["vendor-catalog-admin"])


def _rule_read(db: Session, row) -> VendorCatalogVisibilityRuleRead:
    group_name = None
    if row.vendor_group_id:
        group = db.get(VendorGroup, row.vendor_group_id)
        group_name = group.name if group else None
    vendor_name = None
    if row.vendor_id:
        vendor = db.get(Vendor, row.vendor_id)
        vendor_name = vendor.company_name if vendor else None

    return VendorCatalogVisibilityRuleRead(
        id=row.id,
        item_id=row.item_id,
        vendor_group_id=row.vendor_group_id,
        vendor_group_name=group_name,
        vendor_id=row.vendor_id,
        vendor_name=vendor_name,
        is_visible=row.is_visible,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/catalog-visibility", response_model=VendorCatalogVisibilityListResponse)
def list_catalog_visibility(
    item_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorCatalogVisibilityListResponse:
    rows = vendor_catalog_visibility_service.list_rules_for_item(db, item_id)
    return VendorCatalogVisibilityListResponse(data=[_rule_read(db, r) for r in rows])


@router.post("/catalog-visibility", response_model=VendorCatalogVisibilityResponse, status_code=201)
def upsert_catalog_visibility(
    payload: VendorCatalogVisibilityRuleWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorCatalogVisibilityResponse:
    row = vendor_catalog_visibility_service.upsert_rule(
        db,
        item_id=payload.item_id,
        vendor_group_id=payload.vendor_group_id,
        vendor_id=payload.vendor_id,
        is_visible=payload.is_visible,
    )
    return VendorCatalogVisibilityResponse(data=_rule_read(db, row))


@router.delete("/catalog-visibility/{rule_id}", status_code=204)
def delete_catalog_visibility(
    rule_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> None:
    vendor_catalog_visibility_service.delete_rule(db, rule_id)


# ---------------------------------------------------------- product prices


def _price_read(db: Session, row: VendorProductPrice) -> VendorProductPriceRead:
    vendor = db.get(Vendor, row.vendor_id)
    return VendorProductPriceRead(
        id=row.id,
        vendor_id=row.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
        item_id=row.item_id,
        unit_price=row.unit_price,
        min_qty=row.min_qty,
        max_qty=row.max_qty,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/product-prices", response_model=VendorProductPriceListResponse)
def list_product_prices(
    item_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorProductPriceListResponse:
    rows = (
        db.query(VendorProductPrice)
        .filter(VendorProductPrice.item_id == item_id)
        .order_by(VendorProductPrice.created_at.asc())
        .all()
    )
    return VendorProductPriceListResponse(data=[_price_read(db, r) for r in rows])


@router.post("/product-prices", response_model=VendorProductPriceResponse, status_code=201)
def upsert_product_price(
    payload: VendorProductPriceWrite,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> VendorProductPriceResponse:
    if not db.get(Vendor, payload.vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    if not db.get(Item, payload.item_id):
        raise HTTPException(status_code=404, detail="Item not found")

    row = (
        db.query(VendorProductPrice)
        .filter(
            VendorProductPrice.vendor_id == payload.vendor_id,
            VendorProductPrice.item_id == payload.item_id,
            VendorProductPrice.min_qty == payload.min_qty,
        )
        .first()
    )
    if row:
        row.unit_price = payload.unit_price
        row.max_qty = payload.max_qty
        row.is_active = payload.is_active
    else:
        row = VendorProductPrice(**payload.model_dump())
        db.add(row)
    db.commit()
    db.refresh(row)
    return VendorProductPriceResponse(data=_price_read(db, row))


@router.delete("/product-prices/{price_id}", status_code=204)
def delete_product_price(
    price_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> None:
    row = db.get(VendorProductPrice, price_id)
    if not row:
        raise HTTPException(status_code=404, detail="Price override not found")
    db.delete(row)
    db.commit()
