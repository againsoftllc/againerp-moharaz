from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.inventory.inventory_settings_service import (
    get_inventory_settings,
    update_inventory_settings,
)

router = APIRouter(prefix="/settings", tags=["inventory-settings"])


class InventorySettingsUpdate(BaseModel):
    allow_negative_stock: Optional[bool] = None
    # "sale" = warranty counts from the day the unit is sold; "stock_in" = from receipt.
    warranty_start_basis: Optional[Literal["sale", "stock_in"]] = None


@router.get("")
def get_settings(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    return {"data": get_inventory_settings(db, company_id)}


@router.put("")
def put_settings(
    payload: InventorySettingsUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    data = update_inventory_settings(
        db,
        company_id,
        allow_negative_stock=payload.allow_negative_stock,
        warranty_start_basis=payload.warranty_start_basis,
        actor_id=user.id,
    )
    db.commit()
    return {"data": data}
