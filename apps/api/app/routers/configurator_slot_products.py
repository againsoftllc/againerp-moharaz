"""Admin read of every Smart PC Builder slot with the products it would offer.

The storefront endpoints that serve the same data are behind the storefront's
`pc_builder` feature flag, so admin tools (Test Build, Ready Builds, Rules) read
it from here instead and keep working while the storefront page is switched off."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.configurator_category import ConfiguratorCategory
from app.services.ecommerce.storefront_configurator_service import (
    ConfiguratorError,
    StorefrontConfiguratorService,
)

router = APIRouter(prefix="/slot-products", tags=["configurator-slot-products"])


@router.get("")
def list_slot_products(
    profile: str = Query("pc-builder"),
    limit: int = Query(200, ge=1, le=200),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    svc = StorefrontConfiguratorService(db)
    try:
        prof = svc.get_profile(profile)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    categories = (
        db.query(ConfiguratorCategory)
        .filter(ConfiguratorCategory.profile_id == prof.id, ConfiguratorCategory.status == "active")
        .order_by(ConfiguratorCategory.sort_order, ConfiguratorCategory.name)
        .all()
    )
    slots = []
    for cat in categories:
        products = svc.list_slot_products(prof, cat.slug, limit=limit)
        slots.append(
            {
                "id": cat.id,
                "slug": cat.slug,
                "name": cat.name,
                "icon": cat.icon,
                "kind": cat.kind,
                "tab_id": cat.tab_id,
                "required": bool(cat.is_required),
                "min_select": max(cat.min_select or 0, 1 if cat.is_required else 0),
                "max_select": max(cat.max_select or 1, 2 if cat.selection_mode == "multiple" else 1),
                "products": [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "price": p["price"],
                        "in_stock": p["in_stock"],
                        "attributes": p.get("attributes", {}),
                    }
                    for p in products
                ],
            }
        )
    return {"data": {"slots": slots}}
