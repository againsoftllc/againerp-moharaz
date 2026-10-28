"""Product master rules (OnerERP roadmap §14 Phase 2, part C).

- Selling: a product marked *not for selling* cannot go on a sales line; a product that does not keep stock
  (IsStockMaintain off) is sold without moving stock; a product with *allow negative sales* may be sold past its
  stock even when the company does not allow negative stock (IsAllowNegativeSales).
- Serial tracking cannot be switched once the product has stock history (the serial registry would no longer match).
- Unit types and warehouse types are company masters on the server (INV-08: they lived in each browser).
- Related / spare products.
"""

from __future__ import annotations

import re
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.catalog_product import CatalogProduct
from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.product_master import CatalogProductRelation, InventoryUnitType, InventoryWarehouseType
from app.services.inventory.constants import WAREHOUSE_TYPE_PRESETS

NON_STOCK_ITEM_TYPES = ("service", "digital", "combo")

# what the product form always offered (lib/inventory/unit-types.ts UNIT_TYPE_OPTIONS)
BUILT_IN_UNITS = [
    ("ea", "Each", 0),
    ("pcs", "Piece", 0),
    ("box", "Box", 0),
    ("set", "Set", 0),
    ("pair", "Pair", 0),
    ("dozen", "Dozen", 0),
    ("kg", "Kilogram", 3),
    ("g", "Gram", 0),
    ("l", "Liter", 3),
    ("m", "Meter", 2),
]


def ensure_product_master_columns() -> None:
    """Additive columns (the project's ensure_* pattern)."""
    statements = [
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS allow_negative_sales BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS warranty_days INTEGER",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS lifetime_warranty BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS service_warranty_days INTEGER",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS return_days INTEGER",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS hs_code VARCHAR(20)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _http(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


# ── selling ──────────────────────────────────────────────────────────────────


def product_for_item(db: Session, item_id: str) -> Optional[CatalogProduct]:
    return (
        db.query(CatalogProduct)
        .filter(or_(CatalogProduct.item_id == item_id, CatalogProduct.id == item_id))
        .first()
    )


def moves_stock(db: Session, item: Optional[Item]) -> bool:
    """False for services / digital / combos and for a product that does not keep stock."""
    if item is None:
        return True
    if item.item_type in NON_STOCK_ITEM_TYPES:
        return False
    ext = db.query(InventoryItem).filter(InventoryItem.item_id == item.id).first()
    return bool(ext.track_stock) if ext is not None else True


def allows_negative(db: Session, item_id: str, company_id: Optional[str]) -> bool:
    """The company allows negative stock, or this product may be sold past its stock."""
    from app.services.inventory.inventory_settings_service import allow_negative_stock

    if allow_negative_stock(db, company_id or "default"):
        return True
    product = product_for_item(db, item_id)
    return bool(product and getattr(product, "allow_negative_sales", False))


def require_sellable(db: Session, item: Item) -> None:
    product = product_for_item(db, item.id)
    if product is not None and product.not_for_selling:
        raise _http(400, f"{item.sku}: {item.name} is marked not for selling")


# ── serial tracking lock ─────────────────────────────────────────────────────


def has_stock_history(db: Session, item_id: str) -> bool:
    if db.query(InventoryStockMovement.id).filter(InventoryStockMovement.item_id == item_id).first():
        return True
    return db.query(InventorySerial.id).filter(InventorySerial.item_id == item_id).first() is not None


def guard_serial_change(db: Session, item_id: Optional[str], current: bool, wanted: bool, sku: str) -> None:
    if not item_id or bool(current) == bool(wanted):
        return
    if has_stock_history(db, item_id):
        action = "turned on" if wanted else "turned off"
        raise _http(
            409,
            f"{sku}: serial tracking cannot be {action} — the product already has stock movements or serials. "
            "Make a new product for the serial-tracked (or untracked) units instead.",
        )


# ── unit types / warehouse types ─────────────────────────────────────────────


def _unit_code(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())[:20]


def list_unit_types(db: Session, company_id: str) -> list[InventoryUnitType]:
    rows = (
        db.query(InventoryUnitType)
        .filter(InventoryUnitType.company_id == company_id)
        .order_by(InventoryUnitType.sort_order, InventoryUnitType.name)
        .all()
    )
    if rows:
        return rows
    for order, (code, name, digits) in enumerate(BUILT_IN_UNITS, start=1):
        db.add(InventoryUnitType(company_id=company_id, code=code, name=name, fraction_length=digits, is_default=code == "ea", sort_order=order))
    db.flush()
    return list_unit_types(db, company_id)


def units_in_use(db: Session, company_id: str) -> set[str]:
    used = {
        (code or "").lower()
        for (code,) in db.query(InventoryItem.base_uom).filter(InventoryItem.company_id == company_id).distinct().all()
    }
    return {c for c in used if c}


def replace_unit_types(db: Session, company_id: str, units: Iterable[dict]) -> list[InventoryUnitType]:
    """The whole list as the screen holds it. A unit a product still uses cannot be removed."""
    clean: list[dict] = []
    seen: set[str] = set()
    for unit in units:
        name = (unit.get("name") or "").strip()
        code = _unit_code(unit.get("code") or name)
        if not name or not code:
            raise _http(400, "Each unit needs a name")
        if code in seen:
            raise _http(400, f"Unit {code} is listed twice")
        digits = int(unit.get("fraction_length") or 0)
        if digits < 0 or digits > 6:
            raise _http(400, f"{name}: decimals must be 0 to 6")
        seen.add(code)
        clean.append({"code": code, "name": name[:80], "fraction_length": digits, "is_default": bool(unit.get("is_default"))})
    if not clean:
        raise _http(400, "Keep at least one unit")
    dropped = sorted(units_in_use(db, company_id) - seen)
    current = {r.code for r in list_unit_types(db, company_id)}
    dropped = [c for c in dropped if c in current]
    if dropped:
        raise _http(409, f"Still used by products: {', '.join(dropped)}. Change those products first.")
    if not any(u["is_default"] for u in clean):
        clean[0]["is_default"] = True
    default_seen = False
    db.query(InventoryUnitType).filter(InventoryUnitType.company_id == company_id).delete(synchronize_session=False)
    for order, unit in enumerate(clean, start=1):
        is_default = unit["is_default"] and not default_seen
        default_seen = default_seen or is_default
        db.add(InventoryUnitType(company_id=company_id, sort_order=order, **{**unit, "is_default": is_default}))
    db.flush()
    return list_unit_types(db, company_id)


def list_warehouse_types(db: Session, company_id: str) -> list[InventoryWarehouseType]:
    rows = (
        db.query(InventoryWarehouseType)
        .filter(InventoryWarehouseType.company_id == company_id)
        .order_by(InventoryWarehouseType.sort_order, InventoryWarehouseType.name)
        .all()
    )
    if rows:
        return rows
    used = [t for (t,) in db.query(InventoryWarehouse.type).filter(InventoryWarehouse.company_id == company_id).distinct().all() if t]
    names: list[str] = []
    for name in list(WAREHOUSE_TYPE_PRESETS) + used:
        if name.strip() and name.strip().lower() not in {n.lower() for n in names}:
            names.append(name.strip())
    for order, name in enumerate(names, start=1):
        db.add(InventoryWarehouseType(company_id=company_id, name=name[:80], sort_order=order))
    db.flush()
    return list_warehouse_types(db, company_id)


def replace_warehouse_types(db: Session, company_id: str, names: Iterable[str]) -> list[InventoryWarehouseType]:
    clean: list[str] = []
    for raw in names:
        name = (raw or "").strip()[:80]
        if name and name.lower() not in {n.lower() for n in clean}:
            clean.append(name)
    list_warehouse_types(db, company_id)  # seed first, so the replace below is never the very first write
    db.query(InventoryWarehouseType).filter(InventoryWarehouseType.company_id == company_id).delete(synchronize_session=False)
    for order, name in enumerate(clean, start=1):
        db.add(InventoryWarehouseType(company_id=company_id, name=name, sort_order=order))
    db.flush()
    return (
        db.query(InventoryWarehouseType)
        .filter(InventoryWarehouseType.company_id == company_id)
        .order_by(InventoryWarehouseType.sort_order)
        .all()
    )


# ── related / spare products ─────────────────────────────────────────────────


def list_relations(db: Session, product_id: str) -> list[CatalogProductRelation]:
    return (
        db.query(CatalogProductRelation)
        .filter(CatalogProductRelation.product_id == product_id)
        .order_by(CatalogProductRelation.kind, CatalogProductRelation.sort_order)
        .all()
    )


def replace_relations(db: Session, product: CatalogProduct, rows: Iterable[dict]) -> list[CatalogProductRelation]:
    clean: list[CatalogProductRelation] = []
    seen: set[tuple[str, str]] = set()
    for order, row in enumerate(rows, start=1):
        other_id = row.get("related_product_id")
        kind = row.get("kind") or "related"
        if kind not in ("related", "spare"):
            raise _http(400, "A link is related or spare")
        if not other_id or other_id == product.id:
            raise _http(400, "Pick another product")
        other = db.get(CatalogProduct, other_id)
        if other is None or other.company_id != product.company_id:
            raise _http(404, "Product not found")
        if (other_id, kind) in seen:
            continue
        seen.add((other_id, kind))
        clean.append(
            CatalogProductRelation(
                company_id=product.company_id, product_id=product.id, related_product_id=other_id, kind=kind,
                sort_order=order, note=(row.get("note") or "").strip()[:200] or None,
            )
        )
    db.query(CatalogProductRelation).filter(CatalogProductRelation.product_id == product.id).delete(synchronize_session=False)
    db.add_all(clean)
    db.flush()
    return list_relations(db, product.id)
