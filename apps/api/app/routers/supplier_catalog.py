from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.supplier.catalog import (
    MapSupplierInput,
    MapSupplierResponse,
    SupplierLinkListResponse,
    SupplierLinkRead,
    SupplierLinkUpdate,
    SupplierProductListMeta,
    SupplierProductListResponse,
    SupplierProductRead,
    SupplierProductUpdate,
)
from app.services.supplier import supplier_catalog_service as svc

router = APIRouter(prefix="/supplier", tags=["supplier-catalog"])


# ------------------------------------------------------------------- products


@router.get("/products", response_model=SupplierProductListResponse)
def list_supplier_products(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    supplier_id: Optional[str] = Query(default=None),
    api_source: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, description="Search supplier SKU or title"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> SupplierProductListResponse:
    rows, total = svc.list_supplier_products(
        db,
        company_id=company_id,
        supplier_id=supplier_id,
        api_source=api_source,
        search=search,
        page=page,
        per_page=per_page,
    )
    return SupplierProductListResponse(
        data=[svc.to_product_read(r) for r in rows],
        meta=SupplierProductListMeta(count=total, page=page, per_page=per_page),
    )


@router.patch("/products/{product_id}", response_model=SupplierProductRead)
def update_supplier_product(
    product_id: str,
    payload: SupplierProductUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
) -> SupplierProductRead:
    return svc.to_product_read(svc.update_supplier_product(db, product_id, payload))


# ---------------------------------------------------------------------- links


@router.get("/links/by-item/{item_id}", response_model=SupplierLinkListResponse)
def links_by_item(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
) -> SupplierLinkListResponse:
    links = svc.links_by_item(db, item_id)
    return SupplierLinkListResponse(data=svc.links_to_read(db, links))


@router.get("/links/by-supplier/{supplier_id}", response_model=SupplierLinkListResponse)
def links_by_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
) -> SupplierLinkListResponse:
    links = svc.links_by_supplier(db, supplier_id)
    return SupplierLinkListResponse(data=svc.links_to_read(db, links))


@router.post("/links/map", response_model=MapSupplierResponse)
def map_supplier_to_item(
    payload: MapSupplierInput,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> MapSupplierResponse:
    """Upsert the supplier product and link it to an inventory item."""
    product, link = svc.map_supplier_to_item(db, payload, company_id=company_id)
    return MapSupplierResponse(
        supplier_product=svc.to_product_read(product),
        link=svc.links_to_read(db, [link])[0],
    )


@router.patch("/links/{link_id}", response_model=SupplierLinkRead)
def update_link(
    link_id: str,
    payload: SupplierLinkUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
) -> SupplierLinkRead:
    row = svc.update_link(db, link_id, payload)
    return svc.links_to_read(db, [row])[0]


@router.delete("/links/{link_id}", status_code=204)
def delete_link(
    link_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "delete")),
) -> Response:
    svc.delete_link(db, link_id)
    return Response(status_code=204)
