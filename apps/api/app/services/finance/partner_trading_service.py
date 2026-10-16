"""Purchase / sales totals and product margin vs a dual-role partner."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.sales import SalesOrder, SalesOrderLine

ZERO = Decimal("0.00")
INACTIVE = ("cancelled", "draft")


def _money(value: object) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _catalog_prices(db: Session, company_id: str):
    return (
        db.query(
            CatalogProduct.item_id.label("item_id"),
            func.max(CatalogProduct.price).label("sell"),
            func.max(func.coalesce(CatalogProduct.purchase_price, 0)).label("cost"),
        )
        .filter(
            CatalogProduct.company_id == company_id,
            CatalogProduct.item_id.isnot(None),
        )
        .group_by(CatalogProduct.item_id)
        .subquery()
    )


def partner_trading(
    db: Session,
    *,
    company_id: str,
    supplier_id: str | None = None,
    customer_id: str | None = None,
) -> dict[str, Decimal]:
    prices = _catalog_prices(db, company_id)
    purchase_total = ZERO
    purchase_profit = ZERO
    sales_total = ZERO
    sales_profit = ZERO

    if supplier_id:
        purchase_total = _money(
            db.query(func.coalesce(func.sum(PurchaseOrder.total), 0))
            .filter(
                PurchaseOrder.company_id == company_id,
                PurchaseOrder.supplier_id == supplier_id,
                PurchaseOrder.status.notin_(INACTIVE),
            )
            .scalar()
        )
        purchase_profit = _money(
            db.query(
                func.coalesce(
                    func.sum(
                        PurchaseOrderLine.quantity_ordered
                        * (func.coalesce(prices.c.sell, 0) - PurchaseOrderLine.unit_cost)
                    ),
                    0,
                )
            )
            .select_from(PurchaseOrderLine)
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .outerjoin(prices, prices.c.item_id == PurchaseOrderLine.item_id)
            .filter(
                PurchaseOrder.company_id == company_id,
                PurchaseOrder.supplier_id == supplier_id,
                PurchaseOrder.status.notin_(INACTIVE),
            )
            .scalar()
        )

    if customer_id:
        sales_total = _money(
            db.query(func.coalesce(func.sum(SalesOrder.total), 0))
            .filter(
                SalesOrder.company_id == company_id,
                SalesOrder.customer_id == customer_id,
                SalesOrder.status.notin_(INACTIVE),
                SalesOrder.deleted_at.is_(None),
            )
            .scalar()
        )
        sales_profit = _money(
            db.query(
                func.coalesce(
                    func.sum(
                        SalesOrderLine.quantity_ordered
                        * (SalesOrderLine.unit_price - func.coalesce(prices.c.cost, 0))
                    ),
                    0,
                )
            )
            .select_from(SalesOrderLine)
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
            .outerjoin(prices, prices.c.item_id == SalesOrderLine.item_id)
            .filter(
                SalesOrder.company_id == company_id,
                SalesOrder.customer_id == customer_id,
                SalesOrder.status.notin_(INACTIVE),
                SalesOrder.deleted_at.is_(None),
            )
            .scalar()
        )

    return {
        "purchase_total": purchase_total,
        "sales_total": sales_total,
        "purchase_profit": purchase_profit,
        "sales_profit": sales_profit,
    }
