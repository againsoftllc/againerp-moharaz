"""Vendor catalog visibility — show/hide catalog products per vendor group
or per individual vendor, independent of pricing (vendor_pricing_service.py).

Resolution priority (highest wins), mirroring the pricing tiers:
  1. Vendor-specific rule for this item
  2. Vendor's group rule for this item
  3. No rule — visible by default (opt-out model)
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_catalog_visibility import VendorCatalogVisibility
from app.models.vendor.vendor_group import VendorGroup


def resolve_visibility(db: Session, *, vendor: Vendor, item_id: str) -> bool:
    vendor_rule = (
        db.query(VendorCatalogVisibility)
        .filter(VendorCatalogVisibility.vendor_id == vendor.id, VendorCatalogVisibility.item_id == item_id)
        .first()
    )
    if vendor_rule:
        return vendor_rule.is_visible

    if vendor.vendor_group_id:
        group_rule = (
            db.query(VendorCatalogVisibility)
            .filter(
                VendorCatalogVisibility.vendor_group_id == vendor.vendor_group_id,
                VendorCatalogVisibility.item_id == item_id,
            )
            .first()
        )
        if group_rule:
            return group_rule.is_visible

    return True


def list_rules_for_item(db: Session, item_id: str) -> list[VendorCatalogVisibility]:
    return (
        db.query(VendorCatalogVisibility)
        .filter(VendorCatalogVisibility.item_id == item_id)
        .order_by(VendorCatalogVisibility.created_at.asc())
        .all()
    )


def upsert_rule(
    db: Session,
    *,
    item_id: str,
    vendor_group_id: Optional[str],
    vendor_id: Optional[str],
    is_visible: bool,
) -> VendorCatalogVisibility:
    if not db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    if vendor_group_id and not db.get(VendorGroup, vendor_group_id):
        raise HTTPException(status_code=404, detail="Vendor group not found")
    if vendor_id and not db.get(Vendor, vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")

    q = db.query(VendorCatalogVisibility).filter(VendorCatalogVisibility.item_id == item_id)
    q = q.filter(VendorCatalogVisibility.vendor_group_id == vendor_group_id) if vendor_group_id else q.filter(
        VendorCatalogVisibility.vendor_id == vendor_id
    )
    row = q.first()

    if row:
        row.is_visible = is_visible
    else:
        row = VendorCatalogVisibility(
            item_id=item_id,
            vendor_group_id=vendor_group_id,
            vendor_id=vendor_id,
            is_visible=is_visible,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_rule(db: Session, rule_id: str) -> None:
    row = db.get(VendorCatalogVisibility, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(row)
    db.commit()
