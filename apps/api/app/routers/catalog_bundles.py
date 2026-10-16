from __future__ import annotations

from decimal import ROUND_CEILING, Decimal
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.catalog_bundle import CatalogBundle
from app.schemas.catalog_bundle import (
    BundleComponent,
    BundleCreate,
    BundleListMeta,
    BundleListResponse,
    BundleRead,
    BundleResponse,
    BundleUpdate,
)

router = APIRouter(prefix="/bundles", tags=["catalog-bundles"])


def _summary_from_components(components: list[dict[str, Any]]) -> str:
    if not components:
        return "0 items"
    names: list[str] = []
    for row in components[:3]:
        name = str(row.get("product_name") or "").strip()
        names.append(name.split(" ")[0] if name else "Item")
    extra = f" +{len(components) - 3}" if len(components) > 3 else ""
    return f"{len(components)} items · {' + '.join(names)}{extra}"


def _retail_total(components: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    for row in components:
        qty = Decimal(str(row.get("quantity") or 1))
        price = Decimal(str(row.get("unit_price") or 0))
        total += qty * price
    return total


# the most a bundle may take off its items' total, whatever the bundle is set to (shop policy)
MAX_BUNDLE_DISCOUNT_PERCENT = Decimal("5")


def _bundle_price(
    retail: Decimal,
    mode: str,
    fixed: Decimal,
    discount_percent: Decimal,
) -> Decimal:
    if mode == "fixed":
        price = fixed
    else:
        pct = max(Decimal("0"), min(discount_percent, MAX_BUNDLE_DISCOUNT_PERCENT))
        price = (retail * (Decimal("100") - pct) / Decimal("100")).quantize(Decimal("0.01"))
    # never below the items' total less MAX_BUNDLE_DISCOUNT_PERCENT (rounded up to whole taka)
    if retail > 0:
        floor = (retail * (Decimal("100") - MAX_BUNDLE_DISCOUNT_PERCENT) / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_CEILING)
        price = max(price, min(floor, retail))
    return price


def _normalize_components(raw: list[BundleComponent] | list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        data = item.model_dump() if isinstance(item, BundleComponent) else dict(item)
        out.append(
            {
                "id": str(data.get("id") or data.get("product_id") or ""),
                "product_id": str(data.get("product_id") or ""),
                "product_name": str(data.get("product_name") or ""),
                "sku": str(data.get("sku") or ""),
                "quantity": int(data.get("quantity") or 1),
                "unit_price": str(Decimal(str(data.get("unit_price") or 0))),
                "is_optional": bool(data.get("is_optional", False)),
                "thumbnail": data.get("thumbnail"),
            }
        )
    return out


def _apply_totals(row: CatalogBundle) -> None:
    components = list(row.components_json or [])
    retail = _retail_total(components)
    row.retail_total = retail
    row.component_count = len(components)
    row.components_summary = _summary_from_components(components)
    row.bundle_price = _bundle_price(
        retail,
        row.pricing_mode,
        Decimal(str(row.bundle_price or 0)),
        Decimal(str(row.discount_percent or 0)),
    )


def _to_read(row: CatalogBundle) -> BundleRead:
    components = [
        BundleComponent(
            id=str(c.get("id") or ""),
            product_id=str(c.get("product_id") or ""),
            product_name=str(c.get("product_name") or ""),
            sku=str(c.get("sku") or ""),
            quantity=int(c.get("quantity") or 1),
            unit_price=Decimal(str(c.get("unit_price") or 0)),
            is_optional=bool(c.get("is_optional", False)),
            thumbnail=c.get("thumbnail"),
        )
        for c in (row.components_json or [])
    ]
    return BundleRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        slug=row.slug,
        sku=row.sku,
        status=row.status,  # type: ignore[arg-type]
        pricing_mode=row.pricing_mode,  # type: ignore[arg-type]
        bundle_price=row.bundle_price,
        discount_percent=row.discount_percent,
        retail_total=row.retail_total,
        component_count=row.component_count,
        components_summary=row.components_summary,
        stock=row.stock,
        thumbnail=row.thumbnail,
        category=row.category,
        description=row.description,
        components=components,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=BundleListResponse)
def list_bundles(db: Session = Depends(get_db)) -> BundleListResponse:
    rows = db.query(CatalogBundle).order_by(CatalogBundle.updated_at.desc(), CatalogBundle.name).all()
    data = [_to_read(r) for r in rows]
    return BundleListResponse(data=data, meta=BundleListMeta(count=len(data)))


@router.get("/{bundle_id}", response_model=BundleResponse)
def get_bundle(bundle_id: str, db: Session = Depends(get_db)) -> BundleResponse:
    row = db.get(CatalogBundle, bundle_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bundle not found")
    return BundleResponse(data=_to_read(row))


@router.post("", response_model=BundleResponse, status_code=201)
def create_bundle(
    payload: BundleCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BundleResponse:
    existing = db.query(CatalogBundle).filter(CatalogBundle.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Bundle slug already exists")

    components = _normalize_components(payload.components)
    row = CatalogBundle(
        name=payload.name,
        slug=payload.slug,
        sku=payload.sku or f"BND-{payload.slug[:20].upper()}",
        status=payload.status,
        pricing_mode=payload.pricing_mode,
        bundle_price=payload.bundle_price,
        discount_percent=payload.discount_percent,
        stock=payload.stock,
        thumbnail=payload.thumbnail,
        category=payload.category or "General",
        description=payload.description,
        components_json=components,
    )
    _apply_totals(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return BundleResponse(data=_to_read(row))


@router.patch("/{bundle_id}", response_model=BundleResponse)
def update_bundle(
    bundle_id: str,
    payload: BundleUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BundleResponse:
    row = db.get(CatalogBundle, bundle_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bundle not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return BundleResponse(data=_to_read(row))

    if "slug" in changes and changes["slug"] != row.slug:
        conflict = (
            db.query(CatalogBundle)
            .filter(CatalogBundle.slug == changes["slug"], CatalogBundle.id != bundle_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Bundle slug already exists")

    if "components" in changes:
        row.components_json = _normalize_components(payload.components)
        changes.pop("components", None)

    for key, value in changes.items():
        setattr(row, key, value)

    _apply_totals(row)
    db.commit()
    db.refresh(row)
    return BundleResponse(data=_to_read(row))


@router.delete("/{bundle_id}", status_code=204)
def delete_bundle(
    bundle_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogBundle, bundle_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bundle not found")
    db.delete(row)
    db.commit()


class BundleBulkDeleteRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)


@router.post("/bulk-delete", status_code=204)
def bulk_delete_bundles(
    payload: BundleBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    if not payload.ids:
        return
    rows = db.query(CatalogBundle).filter(CatalogBundle.id.in_(payload.ids)).all()
    for row in rows:
        db.delete(row)
    db.commit()
