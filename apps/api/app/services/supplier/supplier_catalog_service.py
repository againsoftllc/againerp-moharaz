"""Supplier catalog: their product list, and the mapping onto inventory items."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_supplier import CommerceSupplier
from app.models.item import Item
from app.models.supplier_link import SupplierLink
from app.models.supplier_product import SupplierProduct
from app.schemas.supplier.catalog import (
    MapSupplierInput,
    SupplierLinkRead,
    SupplierLinkUpdate,
    SupplierProductRead,
    SupplierProductUpdate,
)

# ------------------------------------------------------------- supplier products


def list_supplier_products(
    db: Session,
    *,
    company_id: str,
    supplier_id: Optional[str] = None,
    api_source: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[Sequence[SupplierProduct], int]:
    query = db.query(SupplierProduct).filter(SupplierProduct.company_id == company_id)
    if supplier_id:
        query = query.filter(SupplierProduct.supplier_id == supplier_id)
    if api_source:
        query = query.filter(SupplierProduct.api_source == api_source)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (SupplierProduct.supplier_sku.ilike(like))
            | (SupplierProduct.supplier_title.ilike(like))
        )

    total = query.count()
    rows = (
        query.order_by(SupplierProduct.supplier_title.asc())
        .offset(max(page - 1, 0) * per_page)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_supplier_product(db: Session, product_id: str) -> SupplierProduct:
    row = db.get(SupplierProduct, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Supplier product not found")
    return row


def update_supplier_product(
    db: Session, product_id: str, payload: SupplierProductUpdate
) -> SupplierProduct:
    row = get_supplier_product(db, product_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------- link reads


def _link_context(
    db: Session, links: Sequence[SupplierLink]
) -> tuple[dict[str, SupplierProduct], dict[str, CommerceSupplier], dict[str, Item], dict[str, Decimal]]:
    product_ids = {l.supplier_product_id for l in links if l.supplier_product_id}
    supplier_ids = {l.supplier_id for l in links}
    item_ids = {l.item_id for l in links}

    products = (
        {
            p.id: p
            for p in db.query(SupplierProduct).filter(SupplierProduct.id.in_(product_ids)).all()
        }
        if product_ids
        else {}
    )
    suppliers = (
        {
            s.id: s
            for s in db.query(CommerceSupplier)
            .filter(CommerceSupplier.id.in_(supplier_ids))
            .all()
        }
        if supplier_ids
        else {}
    )
    items = (
        {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids
        else {}
    )
    # Retail price lives on the catalog product that mirrors the item.
    retail: dict[str, Decimal] = {}
    if item_ids:
        for product in (
            db.query(CatalogProduct).filter(CatalogProduct.item_id.in_(item_ids)).all()
        ):
            if product.item_id and product.item_id not in retail:
                retail[product.item_id] = product.price or Decimal("0")
    return products, suppliers, items, retail


def link_to_read(
    link: SupplierLink,
    product: Optional[SupplierProduct],
    supplier: Optional[CommerceSupplier],
    item: Optional[Item],
    retail_price: Optional[Decimal],
) -> SupplierLinkRead:
    cost = product.supplier_price if product else None
    margin: Optional[float] = None
    if retail_price and retail_price > 0 and cost is not None:
        margin = float(round((retail_price - cost) / retail_price * 100, 2))

    return SupplierLinkRead(
        id=link.id,
        item_id=link.item_id,
        supplier_id=link.supplier_id,
        supplier_product_id=link.supplier_product_id,
        is_preferred=link.is_preferred,
        is_published=link.is_published,
        conversion_factor=link.conversion_factor,
        sort_order=link.sort_order,
        created_at=link.created_at,
        updated_at=link.updated_at,
        supplier_name=supplier.name if supplier else None,
        supplier_sku=product.supplier_sku if product else None,
        supplier_title=product.supplier_title if product else None,
        supplier_price=cost,
        supplier_stock=product.supplier_stock if product else None,
        stock_status=product.stock_status if product else None,
        lead_time_days=product.lead_time_days if product else None,
        min_order_qty=product.min_order_qty if product else None,
        warranty=product.warranty if product else None,
        item_sku=item.sku if item else None,
        item_name=item.name if item else None,
        retail_price=float(retail_price) if retail_price is not None else None,
        margin_pct=margin,
    )


def links_to_read(db: Session, links: Sequence[SupplierLink]) -> list[SupplierLinkRead]:
    products, suppliers, items, retail = _link_context(db, links)
    return [
        link_to_read(
            link,
            products.get(link.supplier_product_id or ""),
            suppliers.get(link.supplier_id),
            items.get(link.item_id),
            retail.get(link.item_id),
        )
        for link in links
    ]


def links_by_item(db: Session, item_id: str) -> list[SupplierLink]:
    return (
        db.query(SupplierLink)
        .filter(SupplierLink.item_id == item_id)
        .order_by(SupplierLink.is_preferred.desc(), SupplierLink.sort_order.asc())
        .all()
    )


def links_by_supplier(db: Session, supplier_id: str) -> list[SupplierLink]:
    return (
        db.query(SupplierLink)
        .filter(SupplierLink.supplier_id == supplier_id)
        .order_by(SupplierLink.sort_order.asc())
        .all()
    )


def get_link(db: Session, link_id: str) -> SupplierLink:
    row = db.get(SupplierLink, link_id)
    if not row:
        raise HTTPException(status_code=404, detail="Supplier link not found")
    return row


# ---------------------------------------------------------------- link writes


def _clear_other_preferred(db: Session, item_id: str, keep_id: Optional[str]) -> None:
    query = db.query(SupplierLink).filter(
        SupplierLink.item_id == item_id, SupplierLink.is_preferred.is_(True)
    )
    if keep_id:
        query = query.filter(SupplierLink.id != keep_id)
    for row in query.all():
        row.is_preferred = False


def map_supplier_to_item(
    db: Session, payload: MapSupplierInput, *, company_id: str
) -> tuple[SupplierProduct, SupplierLink]:
    """Upsert the supplier product, then link it to the item (idempotent per pair)."""
    item = db.get(Item, payload.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    supplier = db.get(CommerceSupplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    product = (
        db.query(SupplierProduct)
        .filter(
            SupplierProduct.supplier_id == payload.supplier_id,
            SupplierProduct.supplier_sku == payload.supplier_sku,
        )
        .first()
    )
    if product is None:
        product = SupplierProduct(
            company_id=company_id,
            supplier_id=payload.supplier_id,
            supplier_sku=payload.supplier_sku,
            supplier_title=payload.supplier_title,
            supplier_price=payload.supplier_price,
            currency=payload.currency or "BDT",
            supplier_stock=payload.supplier_stock,
            stock_status=payload.stock_status or "unknown",
            lead_time_days=payload.lead_time_days if payload.lead_time_days is not None else 7,
            min_order_qty=payload.min_order_qty or 1,
            warranty=payload.warranty,
            api_source=payload.api_source or "manual",
        )
        db.add(product)
        db.flush()
    else:
        product.supplier_title = payload.supplier_title
        product.supplier_price = payload.supplier_price
        if payload.currency:
            product.currency = payload.currency
        if payload.supplier_stock is not None:
            product.supplier_stock = payload.supplier_stock
        if payload.stock_status:
            product.stock_status = payload.stock_status
        if payload.lead_time_days is not None:
            product.lead_time_days = payload.lead_time_days
        if payload.min_order_qty is not None:
            product.min_order_qty = payload.min_order_qty
        if payload.warranty is not None:
            product.warranty = payload.warranty
        db.flush()

    link = (
        db.query(SupplierLink)
        .filter(
            SupplierLink.item_id == payload.item_id,
            SupplierLink.supplier_id == payload.supplier_id,
        )
        .first()
    )
    if link is None:
        link = SupplierLink(
            company_id=company_id,
            item_id=payload.item_id,
            supplier_id=payload.supplier_id,
            supplier_product_id=product.id,
            is_preferred=bool(payload.is_preferred),
            is_published=bool(payload.is_published),
            conversion_factor=payload.conversion_factor or Decimal("1"),
        )
        db.add(link)
        db.flush()
    else:
        link.supplier_product_id = product.id
        if payload.is_preferred is not None:
            link.is_preferred = payload.is_preferred
        if payload.is_published is not None:
            link.is_published = payload.is_published
        if payload.conversion_factor is not None:
            link.conversion_factor = payload.conversion_factor
        db.flush()

    # Only one preferred supplier per item.
    if link.is_preferred:
        _clear_other_preferred(db, payload.item_id, link.id)

    db.commit()
    db.refresh(product)
    db.refresh(link)
    return product, link


def update_link(db: Session, link_id: str, payload: SupplierLinkUpdate) -> SupplierLink:
    row = get_link(db, link_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, key, value)
    if row.is_preferred:
        _clear_other_preferred(db, row.item_id, row.id)
    db.commit()
    db.refresh(row)
    return row


def delete_link(db: Session, link_id: str) -> None:
    row = get_link(db, link_id)
    db.delete(row)
    db.commit()


def to_product_read(row: SupplierProduct) -> SupplierProductRead:
    return SupplierProductRead.model_validate(row)


# --------------------------------------------------------- class-based facade


@dataclass(frozen=True)
class SupplierProductInput:
    """A supplier product with no item mapping yet — a raw feed row."""

    supplier_id: str
    supplier_sku: str
    supplier_title: str
    supplier_price: Decimal
    supplier_stock: Optional[int] = None
    stock_status: str = "unknown"
    lead_time_days: int = 7
    min_order_qty: int = 1
    warranty: Optional[str] = None
    api_source: str = "manual"
    currency: str = "BDT"
    company_id: str = "default"


class SupplierCatalogService:
    """Session-bound wrapper over this module's functions.

    The database seeder drives the catalog through this class, so it stays part
    of the public surface even though the routers call the functions directly.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def map_supplier_to_item(
        self, payload: MapSupplierInput, *, company_id: str = "default"
    ) -> tuple[SupplierProduct, SupplierLink]:
        return map_supplier_to_item(self._db, payload, company_id=company_id)

    def create_product(self, payload: SupplierProductInput) -> SupplierProduct:
        existing = (
            self._db.query(SupplierProduct)
            .filter(
                SupplierProduct.supplier_id == payload.supplier_id,
                SupplierProduct.supplier_sku == payload.supplier_sku,
            )
            .first()
        )
        if existing:
            return existing

        row = SupplierProduct(
            company_id=payload.company_id,
            supplier_id=payload.supplier_id,
            supplier_sku=payload.supplier_sku,
            supplier_title=payload.supplier_title,
            supplier_price=payload.supplier_price,
            currency=payload.currency,
            supplier_stock=payload.supplier_stock,
            stock_status=payload.stock_status,
            lead_time_days=payload.lead_time_days,
            min_order_qty=payload.min_order_qty,
            warranty=payload.warranty,
            api_source=payload.api_source,
        )
        self._db.add(row)
        self._db.flush()
        return row

    def links_by_item(self, item_id: str) -> list[SupplierLink]:
        return links_by_item(self._db, item_id)

    def links_by_supplier(self, supplier_id: str) -> list[SupplierLink]:
        return links_by_supplier(self._db, supplier_id)
