from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_variant import CatalogProductVariant
from app.schemas.variant import VariantListMeta, VariantListResponse, VariantRead

router = APIRouter(prefix="/variants", tags=["catalog-variants"])


def _to_read(variant: CatalogProductVariant, product: CatalogProduct) -> VariantRead:
    return VariantRead(
        id=variant.id,
        product_id=variant.product_id,
        product_name=product.name,
        product_sku=product.sku,
        variant_label=variant.name,
        variant_sku=variant.sku,
        price=variant.price,
        stock=variant.stock,
        status=variant.status,
        category=product.category or "Uncategorized",
        is_default=variant.is_default,
        sort_order=variant.sort_order,
        created_at=variant.created_at,
        updated_at=variant.updated_at,
    )


@router.get("", response_model=VariantListResponse)
def list_variants(
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
) -> VariantListResponse:
    query = (
        db.query(CatalogProductVariant, CatalogProduct)
        .join(CatalogProduct, CatalogProduct.id == CatalogProductVariant.product_id)
        .order_by(CatalogProduct.name, CatalogProductVariant.sort_order)
    )

    if category:
        query = query.filter(CatalogProduct.category == category)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (CatalogProduct.name.ilike(term))
            | (CatalogProduct.sku.ilike(term))
            | (CatalogProductVariant.sku.ilike(term))
            | (CatalogProductVariant.name.ilike(term))
        )

    rows = query.all()
    data = [_to_read(variant, product) for variant, product in rows]
    return VariantListResponse(data=data, meta=VariantListMeta(count=len(data)))
