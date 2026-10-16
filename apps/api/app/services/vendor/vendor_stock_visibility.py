"""Vendor-facing stock visibility — SPEC.md §12.

Quantity comes from the existing inventory tables (InventoryStockLevel), via
the same compute_stock_status() the internal inventory screens use — this
module only decides what to SHOW a vendor, never how much stock there is.
Configurable per vendor group today; per-vendor/per-product/per-category
overrides are a Phase 2 extension of the same `resolve_stock_display` call
site, not a new code path.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.inventory_stock_level import InventoryStockLevel
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_group import VendorGroup
from app.services.inventory.stock_status import compute_stock_status

THRESHOLD_STEP = 5  # "5+ Available" style rounding for the threshold display mode


@dataclass(frozen=True)
class VendorStockDisplay:
    mode: str  # exact | availability | threshold | hidden
    status: str  # out_of_stock | low_stock | in_stock | overstock
    available_quantity: int  # raw number — used for order-qty validation, not always shown
    label: str


def _available_quantity(db: Session, product_id: str) -> int:
    total = (
        db.query(func.coalesce(func.sum(InventoryStockLevel.on_hand - InventoryStockLevel.reserved), 0))
        .filter(InventoryStockLevel.product_id == product_id)
        .scalar()
    )
    return max(int(total or 0), 0)


def _visibility_mode(db: Session, vendor: Vendor) -> str:
    if vendor.vendor_group_id:
        group = db.get(VendorGroup, vendor.vendor_group_id)
        if group:
            return group.stock_visibility_mode
    return "availability"


def _label(mode: str, status: str, available: int) -> str:
    if mode == "hidden":
        return "Contact Sales"
    if mode == "exact":
        return f"{available} Units" if available > 0 else "Out of Stock"
    if mode == "threshold":
        if available <= 0:
            return "Out of Stock"
        floor = (available // THRESHOLD_STEP) * THRESHOLD_STEP
        return f"{floor}+ Available" if floor > 0 else f"Below {THRESHOLD_STEP} Available"
    # availability
    return {
        "out_of_stock": "Out of Stock",
        "low_stock": "Limited Stock",
        "in_stock": "In Stock",
        "overstock": "In Stock",
    }.get(status, "In Stock")


def resolve_stock_display(
    db: Session,
    *,
    vendor: Vendor,
    product_id: str,
    min_qty: int = 0,
    max_qty: int = 0,
) -> VendorStockDisplay:
    available = _available_quantity(db, product_id)
    status = compute_stock_status(available, min_qty, max_qty)
    mode = _visibility_mode(db, vendor)
    return VendorStockDisplay(
        mode=mode,
        status=status,
        available_quantity=available,
        label=_label(mode, status, available),
    )
