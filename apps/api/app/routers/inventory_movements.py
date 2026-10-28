from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.core.access_scope import assert_warehouse_access, warehouse_scope
from app.schemas.inventory.movement import MovementListMeta, MovementListResponse
from app.services.inventory import stock_level_service
from app.services.inventory.stock_movement_service import StockMovementService

router = APIRouter(prefix="/movements", tags=["inventory-movements"])


@router.get("", response_model=MovementListResponse)
def list_movements(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    item_id: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    movement_type: Optional[str] = Query(
        default=None,
        max_length=40,
        description="Ledger type, e.g. purchase_receipt, sales_delivery, transfer_out. Legacy short names still match historical rows.",
    ),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> MovementListResponse:
    assert_warehouse_access(db, user, warehouse_id)
    scope = warehouse_scope(db, user)
    service = StockMovementService(db)
    rows = service.list_movements(
        warehouse_ids=scope,
        company_id=company_id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        limit=limit,
        offset=offset,
    )
    total = service.count_movements(
        company_id=company_id, item_id=item_id, warehouse_id=warehouse_id, movement_type=movement_type,
        warehouse_ids=scope,
    )
    data = stock_level_service.movements_to_read(db, rows)
    return MovementListResponse(
        data=data,
        meta=MovementListMeta(count=len(data), total=total, limit=limit, offset=offset),
    )
