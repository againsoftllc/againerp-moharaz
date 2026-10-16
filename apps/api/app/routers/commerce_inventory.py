from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id
from app.schemas.commerce_inventory import (
    CommerceInventoryAlertListResponse,
    CommerceInventoryAlertRead,
    CommerceInventoryHistoryListResponse,
    CommerceInventoryHistoryRead,
)
from app.services.ecommerce.commerce_inventory_service import CommerceInventoryService

router = APIRouter(prefix="/inventory", tags=["commerce-inventory"])


def _service(db: Session, company_id: str) -> CommerceInventoryService:
    return CommerceInventoryService(db, company_id=company_id)


def _movement_to_read(row) -> CommerceInventoryHistoryRead:
    return CommerceInventoryHistoryRead(
        id=row.id,
        item_id=row.item_id,
        warehouse_id=row.warehouse_id,
        movement_type=row.movement_type,
        quantity=row.quantity,
        qty_before=row.qty_before,
        qty_after=row.qty_after,
        reference=row.reference,
        notes=row.notes,
        created_at=row.created_at,
    )


@router.get("/history", response_model=CommerceInventoryHistoryListResponse)
def commerce_inventory_history(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    item_id: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    reference: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> CommerceInventoryHistoryListResponse:
    rows = _service(db, company_id).list_history(
        item_id=item_id,
        warehouse_id=warehouse_id,
        reference=reference,
        limit=limit,
    )
    return CommerceInventoryHistoryListResponse(
        data=[_movement_to_read(r) for r in rows],
        meta={"count": len(rows)},
    )


@router.get("/alerts/low-stock", response_model=CommerceInventoryAlertListResponse)
def commerce_low_stock_alerts(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> CommerceInventoryAlertListResponse:
    alerts = _service(db, company_id).low_stock_alerts(warehouse_id=warehouse_id, limit=limit)
    return CommerceInventoryAlertListResponse(
        data=[
            CommerceInventoryAlertRead(
                item_id=a.item_id,
                warehouse_id=a.warehouse_id,
                sku=a.sku,
                name=a.name,
                available=a.available,
                reorder_level=a.reorder_level,
                message=a.message,
            )
            for a in alerts
        ],
        meta={"count": len(alerts)},
    )
