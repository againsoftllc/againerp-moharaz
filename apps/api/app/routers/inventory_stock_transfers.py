from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.stock_transfer import (
    StockTransferCreate,
    StockTransferListMeta,
    StockTransferListResponse,
    StockTransferReceive,
    StockTransferResponse,
)
from app.services.inventory.stock_transfer_service import (
    StockTransferService,
    TransferLineInput,
    TransferReceiveLineInput,
    transfer_to_read,
)

router = APIRouter(prefix="/stock-transfers", tags=["inventory-stock-transfers"])


def _commit_transfer(db: Session, row):
    try:
        db.commit()
        db.refresh(row)
        return row
    except Exception:
        db.rollback()
        raise


@router.get("", response_model=StockTransferListResponse)
def list_transfers(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    from_warehouse_id: Optional[str] = Query(default=None),
    to_warehouse_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> StockTransferListResponse:
    svc = StockTransferService(db)
    rows, total = svc.list_transfers(
        company_id=company_id,
        status=status,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return StockTransferListResponse(
        data=[transfer_to_read(db, row) for row in rows],
        meta=StockTransferListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{transfer_id}", response_model=StockTransferResponse)
def get_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> StockTransferResponse:
    row = StockTransferService(db, company_id=company_id).get_transfer(transfer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return StockTransferResponse(data=transfer_to_read(db, row))


@router.post("", response_model=StockTransferResponse, status_code=201)
def create_transfer(
    payload: StockTransferCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> StockTransferResponse:
    try:
        row = StockTransferService(db, company_id=company_id).create_transfer(
            company_id=company_id,
            from_warehouse_id=payload.from_warehouse_id,
            to_warehouse_id=payload.to_warehouse_id,
            lines=[
                TransferLineInput(
                    item_id=line.item_id,
                    quantity=line.quantity,
                    serial_ids=tuple(line.serial_ids),
                    notes=line.notes,
                )
                for line in payload.lines
            ],
            transfer_date=payload.transfer_date,
            reference_number=payload.reference_number,
            notes=payload.notes,
            actor_id=user.id,
        )
        row = _commit_transfer(db, row)
        return StockTransferResponse(data=transfer_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise


@router.post("/{transfer_id}/ship", response_model=StockTransferResponse)
def ship_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockTransferResponse:
    try:
        row = StockTransferService(db, company_id=company_id).ship_transfer(transfer_id, actor_id=user.id)
        row = _commit_transfer(db, row)
        return StockTransferResponse(data=transfer_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise


@router.post("/{transfer_id}/receive", response_model=StockTransferResponse)
def receive_transfer(
    transfer_id: str,
    payload: StockTransferReceive,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockTransferResponse:
    try:
        row = StockTransferService(db, company_id=company_id).receive_transfer(
            transfer_id,
            [
                TransferReceiveLineInput(
                    line_id=line.line_id,
                    quantity=line.quantity,
                    serial_ids=tuple(line.serial_ids),
                )
                for line in payload.lines
            ],
            actor_id=user.id,
        )
        row = _commit_transfer(db, row)
        return StockTransferResponse(data=transfer_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise


@router.post("/{transfer_id}/cancel", response_model=StockTransferResponse)
def cancel_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockTransferResponse:
    try:
        row = StockTransferService(db, company_id=company_id).cancel_transfer(transfer_id, actor_id=user.id)
        row = _commit_transfer(db, row)
        return StockTransferResponse(data=transfer_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise
