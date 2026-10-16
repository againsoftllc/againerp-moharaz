from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.serial import (
    ScanProductHit,
    ScanProductResponse,
    SerialAssignRequest,
    SerialBatchResponse,
    SerialListMeta,
    SerialListResponse,
    SerialLookupResponse,
    SerialRegisterRequest,
    SerialResponse,
    SerialResultRead,
    SerialUpdate,
)
from app.services.inventory import serial_service

router = APIRouter(prefix="/serials", tags=["inventory-serials"])


def _batch_response(results: list[serial_service.SerialResult]) -> SerialBatchResponse:
    data = [
        SerialResultRead(
            serial_number=r.serial_number,
            outcome=r.outcome,
            detail=r.detail,
            serial_id=r.serial_id,
        )
        for r in results
    ]
    return SerialBatchResponse(
        data=data,
        created=sum(1 for r in results if r.outcome == "created"),
        duplicates=sum(1 for r in results if r.outcome == "duplicate"),
        rejected=sum(1 for r in results if r.outcome == "rejected"),
    )


@router.get("", response_model=SerialListResponse)
def list_serials(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    item_id: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Search serial, SKU, product, customer"),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
) -> SerialListResponse:
    rows = serial_service.list_serials(
        db,
        company_id=company_id,
        status=status_filter,
        item_id=item_id,
        warehouse_id=warehouse_id,
        q=q,
        limit=limit,
        offset=offset,
    )
    totals = serial_service.dashboard(db, company_id=company_id)
    matching = serial_service.count_serials(
        db,
        company_id=company_id,
        status=status_filter,
        item_id=item_id,
        warehouse_id=warehouse_id,
        q=q,
    )
    return SerialListResponse(
        data=serial_service.serials_to_read(db, rows),
        meta=SerialListMeta(count=len(rows), total_matching=matching, **totals),
    )


@router.post("", response_model=SerialBatchResponse, status_code=status.HTTP_201_CREATED)
def register_serials(
    payload: SerialRegisterRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> SerialBatchResponse:
    if not payload.item_id and not payload.sku:
        raise HTTPException(status_code=400, detail="item_id or sku is required")

    results = serial_service.register_serials(
        db,
        payload.serial_numbers,
        company_id=company_id,
        item_id=payload.item_id,
        sku=payload.sku,
        warehouse_id=payload.warehouse_id,
        source_type=payload.source_type,
        source_id=payload.source_id,
        supplier_id=payload.supplier_id,
        notes=payload.notes,
    )
    db.commit()
    return _batch_response(results)


@router.post("/assign-order", response_model=SerialBatchResponse)
def assign_to_order(
    payload: SerialAssignRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SerialBatchResponse:
    results = serial_service.assign_to_order(
        db,
        payload.serial_numbers,
        order_number=payload.order_number,
        company_id=company_id,
    )
    db.commit()
    return _batch_response(results)


@router.get("/lookup", response_model=SerialLookupResponse)
def lookup_serial(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    serial_number: str = Query(min_length=1),
    company_id: str = Depends(get_current_company_id),
) -> SerialLookupResponse:
    """Resolve a serial to its sale and warranty verdict.

    An unknown serial is not an error — it returns empty so intake can fall back
    to the order number.
    """
    context = serial_service.lookup_for_claim(db, serial_number, company_id=company_id)
    if context is None:
        return SerialLookupResponse()

    return SerialLookupResponse(
        data=serial_service.serial_to_read(db, context.serial),
        warranty_status=context.verdict.status,
        warranty_note=context.verdict.note,
        purchased_on=context.purchased_on,
        open_rma_id=context.open_claim.id if context.open_claim else None,
        open_rma_number=context.open_claim.rma_number if context.open_claim else None,
    )


@router.get("/scan", response_model=ScanProductResponse)
def scan_inventory_code(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    code: str = Query(min_length=1, max_length=128),
) -> ScanProductResponse:
    """Resolve a barcode, SKU, or serial number to a product (scanner / typeahead)."""
    hit = serial_service.scan_code(db, code, company_id=company_id)
    if hit is None:
        return ScanProductResponse(data=None)
    return ScanProductResponse(data=ScanProductHit(**hit))


@router.get("/{serial_id}", response_model=SerialResponse)
def get_serial(
    serial_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SerialResponse:
    row = serial_service.get_serial(db, serial_id, company_id=company_id)
    return SerialResponse(data=serial_service.serial_to_read(db, row))


@router.patch("/{serial_id}", response_model=SerialResponse)
def update_serial(
    serial_id: str,
    payload: SerialUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SerialResponse:
    row = serial_service.get_serial(db, serial_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    # Status goes through the transition map; the rest are plain edits.
    if "status" in data and data["status"] is not None:
        serial_service.set_status(db, row, data.pop("status"))
    data.pop("status", None)

    for field, value in data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return SerialResponse(data=serial_service.serial_to_read(db, row))


@router.delete("/{serial_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_serial(
    serial_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    row = serial_service.get_serial(db, serial_id, company_id=company_id)
    if row.status == "in_service":
        raise HTTPException(
            status_code=400,
            detail="This unit is on an open claim — close the claim before deleting it.",
        )
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
