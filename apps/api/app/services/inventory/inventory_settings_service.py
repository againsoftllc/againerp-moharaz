"""Per-company inventory & sales policy — the switches that gate stock movements
and how a sold unit's warranty is counted."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.inventory_setting import InventorySetting
from app.services.inventory.constants import ALLOW_NEGATIVE_STOCK

# Warranty countdown starts on the day the unit is sold (the shop's promise to the
# customer) or on the day it came into stock (supplier-style warranties).
WARRANTY_START_BASES: tuple[str, ...] = ("sale", "stock_in")
WARRANTY_START_DEFAULT = "sale"


def _row(db: Session, company_id: str) -> Optional[InventorySetting]:
    return db.query(InventorySetting).filter(InventorySetting.company_id == company_id).first()


def get_inventory_settings(db: Session, company_id: str = "default") -> dict[str, Any]:
    row = _row(db, company_id or "default")
    basis = (row.warranty_start_basis if row else None) or WARRANTY_START_DEFAULT
    return {
        "allow_negative_stock": bool(row.allow_negative_stock) if row else ALLOW_NEGATIVE_STOCK,
        "warranty_start_basis": basis if basis in WARRANTY_START_BASES else WARRANTY_START_DEFAULT,
    }


def allow_negative_stock(db: Session, company_id: str = "default") -> bool:
    return get_inventory_settings(db, company_id)["allow_negative_stock"]


def warranty_start_basis(db: Session, company_id: str = "default") -> str:
    return get_inventory_settings(db, company_id)["warranty_start_basis"]


def warranty_anchor_date(
    db: Session,
    company_id: str = "default",
    *,
    sold_on: Optional[date | datetime],
    received_at: Optional[date | datetime],
) -> Optional[date]:
    """The day a unit's warranty starts counting, per the company policy."""
    basis = warranty_start_basis(db, company_id)
    pick = received_at if basis == "stock_in" and received_at else sold_on
    if pick is None:
        return None
    return pick.date() if isinstance(pick, datetime) else pick


def update_inventory_settings(
    db: Session,
    company_id: str = "default",
    *,
    allow_negative_stock: Optional[bool] = None,
    warranty_start_basis: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> dict[str, Any]:
    company = company_id or "default"
    row = _row(db, company)
    if row is None:
        row = InventorySetting(company_id=company, allow_negative_stock=ALLOW_NEGATIVE_STOCK)
        db.add(row)
    if allow_negative_stock is not None:
        row.allow_negative_stock = bool(allow_negative_stock)
    if warranty_start_basis is not None:
        if warranty_start_basis not in WARRANTY_START_BASES:
            raise HTTPException(
                status_code=422,
                detail=f"warranty_start_basis must be one of {', '.join(WARRANTY_START_BASES)}",
            )
        row.warranty_start_basis = warranty_start_basis
    row.updated_by = actor_id
    db.flush()
    return get_inventory_settings(db, company)
