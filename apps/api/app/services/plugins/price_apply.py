"""Copy competitor prices / stock into our own catalog (Price Compare → "Update price" / "Update
stock" on the picked cells).

Values come from the saved competitor matches on the server, never from the browser. Saving goes
through the real PATCH /catalog/products/{id} handler so the website, inventory mirror and
history behave exactly as if an admin had edited the product by hand.
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.models.price_update_plugin import PriceUpdateMatch
from app.schemas.product import ProductUpdate
from app.services.plugins import price_update_service as svc

_STATUS_LABEL = {
    "in_stock": "In stock",
    "out_of_stock": "Out of stock",
    "pre_order": "Pre-order",
    "coming_soon": "Coming soon",
}


def competitor_stock_status(match: PriceUpdateMatch) -> Optional[str]:
    """Our stock_status for what the competitor shows, or None when it says nothing definite
    ("Call For Price", nothing read)."""
    label = (match.stock_label or "").lower()
    if re.search(r"pre[\s-]*order", label):
        return "pre_order"
    if re.search(r"coming|upcoming|announce|tba", label):
        return "coming_soon"
    if re.search(r"discontinu|out\s*of\s*stock|stock\s*out|sold\s*out|unavailable|not\s*available", label):
        return "out_of_stock"
    if re.search(r"call\s*for|on\s*request", label):
        return None
    if match.in_stock is True:
        return "in_stock"
    if match.in_stock is False:
        return "out_of_stock"
    return None


def plan(
    db: Session, *, company_id: str, items: list[tuple[str, str]], field: str,
) -> list[dict]:
    """One row per product: what would change and from which site, or why it's skipped."""
    if field not in ("price", "stock"):
        raise HTTPException(status_code=400, detail="field must be price or stock")
    labels = {s.id: s.label for s in svc.list_competitor_sites(db, company_id)}
    by_product: dict[str, list[str]] = {}
    for product_id, competitor in items:
        by_product.setdefault(product_id, [])
        if competitor not in by_product[product_id]:
            by_product[product_id].append(competitor)

    rows: list[dict] = []
    for product_id, competitors in by_product.items():
        product = db.get(CatalogProduct, product_id)
        if not product or (product.company_id or "default") != company_id:
            continue
        matches = (
            db.query(PriceUpdateMatch)
            .filter(
                PriceUpdateMatch.company_id == company_id,
                PriceUpdateMatch.product_id == product_id,
                PriceUpdateMatch.competitor.in_(competitors),
            )
            .all()
        )
        row = {"product_id": product_id, "name": product.name, "competitor": None, "site": None,
               "current": None, "new": None, "skip": None}
        if field == "price":
            row["current"] = float(product.price) if product.price is not None else None
            priced = [m for m in matches if m.status == "matched" and m.price is not None and m.price > 0]
            if not priced:
                row["skip"] = "no competitor price on the picked site" + ("s" if len(competitors) > 1 else "")
            else:
                best = min(priced, key=lambda m: m.price)
                row.update(competitor=best.competitor, site=labels.get(best.competitor, best.competitor),
                           new=float(best.price))
                if len(priced) > 1:
                    row["site"] += " (lowest of " + ", ".join(labels.get(m.competitor, m.competitor) for m in priced) + ")"
                if row["current"] is not None and abs(row["current"] - row["new"]) < 0.005:
                    row["skip"] = "already the same price"
        else:
            row["current"] = _STATUS_LABEL.get(product.stock_status or "", product.stock_status or "—")
            statuses = [(m, competitor_stock_status(m)) for m in matches]
            statuses = [(m, s) for m, s in statuses if s]
            if not statuses:
                row["skip"] = "the picked site doesn't say clearly (e.g. “Call For Price”)"
            else:
                # Several sites: if any of them has it in stock, it's available in the market.
                m, status = next(((m, s) for m, s in statuses if s == "in_stock"), statuses[0])
                row.update(competitor=m.competitor, site=labels.get(m.competitor, m.competitor),
                           new=_STATUS_LABEL[status], new_status=status)
                if (product.stock_status or "") == status:
                    row["skip"] = "already the same"
        rows.append(row)
    return rows


def apply(
    db: Session, *, company_id: str, user: AuthUser, items: list[tuple[str, str]], field: str,
) -> list[dict]:
    from app.routers.catalog_products import update_product as patch_product

    rows = plan(db, company_id=company_id, items=items, field=field)
    for row in rows:
        if row["skip"]:
            continue
        payload = (
            ProductUpdate(price=Decimal(str(row["new"])))
            if field == "price"
            else ProductUpdate(stock_status=row["new_status"])
        )
        try:
            patch_product(row["product_id"], payload, db=db, user=user, company_id=company_id)
            row["applied"] = True
        except HTTPException as exc:
            db.rollback()
            row["applied"] = False
            row["skip"] = str(exc.detail)
    return rows
