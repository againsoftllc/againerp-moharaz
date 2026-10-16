"""Cycle counting — snapshot expected qty, record counted qty, post variances as IN/OUT."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_count import (
    InventoryStockCount,
    InventoryStockCountLine,
    InventoryStockCountSerial,
)
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.services.inventory import serial_service
from app.services.inventory.constants import (
    MOVEMENT_STOCK_COUNT_IN,
    MOVEMENT_STOCK_COUNT_OUT,
    TRACKING_SERIAL,
    tracking_type_of,
)
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.core.sequence_service import last_sequence_value, next_number as allocate_number


def _next_count_number(db: Session, company_id: str) -> str:
    prefix = f"SC-{datetime.utcnow().year}-"
    return allocate_number(
        db,
        company_id,
        "inventory.count",
        initial=lambda: last_sequence_value(
            db,
            InventoryStockCount.count_number,
            InventoryStockCount.company_id == company_id,
            prefix,
        )
        + 1,
    )


def list_counts(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Sequence[InventoryStockCount]:
    query = db.query(InventoryStockCount).filter(InventoryStockCount.company_id == company_id)
    if warehouse_id:
        query = query.filter(InventoryStockCount.warehouse_id == warehouse_id)
    if status:
        query = query.filter(InventoryStockCount.status == status)
    return query.order_by(InventoryStockCount.created_at.desc()).all()


def get_count(db: Session, count_id: str, *, company_id: Optional[str] = None) -> InventoryStockCount:
    row = db.get(InventoryStockCount, count_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Stock count not found")
    return row


def create_count(
    db: Session,
    *,
    company_id: str,
    warehouse_id: str,
    counted_by: Optional[str] = None,
    notes: Optional[str] = None,
) -> InventoryStockCount:
    if not db.get(InventoryWarehouse, warehouse_id):
        raise HTTPException(status_code=404, detail="Warehouse not found")

    stock_rows = (
        db.query(InventoryStockLevel)
        .filter(
            InventoryStockLevel.company_id == company_id,
            InventoryStockLevel.warehouse_id == warehouse_id,
            InventoryStockLevel.item_id.isnot(None),
        )
        .order_by(InventoryStockLevel.sku)
        .all()
    )
    if not stock_rows:
        raise HTTPException(
            status_code=400, detail="This warehouse has no stock lines to count"
        )

    tracking = _tracking_map(db, {row.item_id for row in stock_rows if row.item_id})

    count = InventoryStockCount(
        company_id=company_id,
        count_number=_next_count_number(db, company_id),
        warehouse_id=warehouse_id,
        status="draft",
        counted_by=counted_by,
        notes=notes,
    )
    db.add(count)
    db.flush()

    for stock in stock_rows:
        tracking_type = tracking.get(stock.item_id or "", "none")
        line = InventoryStockCountLine(
            count_id=count.id,
            item_id=stock.item_id,
            stock_level_id=stock.id,
            sku=stock.sku,
            name=stock.name,
            expected_qty=stock.on_hand,
            tracking_type=tracking_type,
            unit_cost=stock.unit_cost,
        )
        db.add(line)
        db.flush()
        if tracking_type == TRACKING_SERIAL and stock.item_id:
            serials = serial_service.list_serials(
                db,
                company_id=company_id,
                status="in_stock",
                item_id=stock.item_id,
                warehouse_id=warehouse_id,
                limit=5000,
            )
            for serial in serials:
                db.add(
                    InventoryStockCountSerial(
                        count_id=count.id,
                        count_line_id=line.id,
                        serial_id=serial.id,
                        serial_number=serial.serial_number,
                        role="expected",
                    )
                )

    db.commit()
    db.refresh(count)
    return count


def update_line_counted_qty(
    db: Session,
    count_id: str,
    line_id: str,
    counted_qty: Optional[int],
    *,
    company_id: str,
    counted_serials: Optional[list[str]] = None,
) -> InventoryStockCountLine:
    count = get_count(db, count_id, company_id=company_id)
    if count.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft counts can be edited")

    line = (
        db.query(InventoryStockCountLine)
        .filter(InventoryStockCountLine.id == line_id, InventoryStockCountLine.count_id == count_id)
        .first()
    )
    if not line:
        raise HTTPException(status_code=404, detail="Count line not found")

    if line.tracking_type == TRACKING_SERIAL:
        serials = [serial_service.clean_serial(value) for value in (counted_serials or [])]
        serials = [value for value in serials if value]
        seen: set[str] = set()
        unique: list[str] = []
        for value in serials:
            key = value.lower()
            if key in seen:
                raise HTTPException(status_code=400, detail=f"Duplicate serial {value} on this count line")
            seen.add(key)
            unique.append(value)
        (
            db.query(InventoryStockCountSerial)
            .filter(
                InventoryStockCountSerial.count_line_id == line.id,
                InventoryStockCountSerial.role == "counted",
            )
            .delete(synchronize_session=False)
        )
        for value in unique:
            existing = serial_service.find_by_number(db, value, company_id=company_id)
            db.add(
                InventoryStockCountSerial(
                    count_id=count.id,
                    count_line_id=line.id,
                    serial_id=existing.id if existing else None,
                    serial_number=value,
                    role="counted",
                )
            )
        line.counted_qty = len(unique)
    else:
        if counted_qty is not None and counted_qty < 0:
            raise HTTPException(status_code=400, detail="Counted quantity cannot be negative")
        line.counted_qty = counted_qty

    db.commit()
    db.refresh(line)
    return line


def post_count(db: Session, count_id: str, *, company_id: str, actor_id: Optional[str] = None) -> InventoryStockCount:
    count = get_count(db, count_id, company_id=company_id)
    if count.status != "draft":
        raise HTTPException(status_code=409, detail="Count already posted or cancelled")

    movement_svc = StockMovementService(db)
    for line in count.lines:
        if line.counted_qty is None:
            continue
        stock = movement_svc.lock_stock(line.item_id, count.warehouse_id, company_id)
        if stock.on_hand != line.expected_qty:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{line.sku}: stock has changed since this count was created. "
                    "Please review the count before posting."
                ),
            )
        if line.tracking_type == TRACKING_SERIAL:
            _apply_serial_variance(db, count, line, company_id)
        delta = line.counted_qty - line.expected_qty
        if delta == 0:
            continue
        if line.counted_qty < stock.reserved:
            raise HTTPException(
                status_code=400,
                detail=f"{line.sku}: cannot set on-hand below reserved quantity ({stock.reserved}).",
            )
        movement_svc.apply_movement(
            MovementInput(
                item_id=line.item_id,
                warehouse_id=count.warehouse_id,
                movement_type=MOVEMENT_STOCK_COUNT_IN if delta > 0 else MOVEMENT_STOCK_COUNT_OUT,
                quantity=abs(delta),
                company_id=company_id,
                reference=count.count_number,
                notes=f"Stock count {count.count_number}" + (f" — {line.notes}" if line.notes else ""),
                created_by=actor_id,
                stock_level_id=line.stock_level_id,
                unit_cost=line.unit_cost,
                source_type="stock_count",
                source_id=count.id,
            )
        )

    count.status = "completed"
    count.posted_at = datetime.utcnow()
    count.posted_by = actor_id
    db.commit()
    db.refresh(count)
    return count


def _apply_serial_variance(
    db: Session,
    count: InventoryStockCount,
    line: InventoryStockCountLine,
    company_id: str,
) -> None:
    expected = {
        row.serial_number.lower(): row
        for row in line.serials
        if row.role == "expected"
    }
    counted = {
        row.serial_number.lower(): row
        for row in line.serials
        if row.role == "counted"
    }
    missing = [row for key, row in expected.items() if key not in counted]
    extra = [row for key, row in counted.items() if key not in expected]
    for row in missing:
        if not row.serial_id:
            continue
        serial = db.get(InventorySerial, row.serial_id)
        if serial and serial.status == "in_stock":
            serial_service.set_status(db, serial, "lost")
    for row in extra:
        existing = serial_service.find_by_number(db, row.serial_number, company_id=company_id)
        if existing is None:
            serial_service.register_serials_or_raise(
                db,
                [row.serial_number],
                item_id=line.item_id,
                warehouse_id=count.warehouse_id,
                company_id=company_id,
                source_type="adjustment",
                source_id=count.id,
            )
            continue
        if existing.item_id and existing.item_id != line.item_id:
            raise HTTPException(
                status_code=400,
                detail=f"Serial {row.serial_number} belongs to a different product",
            )
        if existing.status in {"lost", "damaged"}:
            serial_service.set_status(db, existing, "in_stock")
            existing.warehouse_id = count.warehouse_id
        elif existing.status != "in_stock":
            raise HTTPException(
                status_code=400,
                detail=f"Serial {row.serial_number} is {existing.status} and cannot be counted in",
            )


def cancel_count(db: Session, count_id: str, *, company_id: str) -> InventoryStockCount:
    count = get_count(db, count_id, company_id=company_id)
    if count.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft counts can be cancelled")
    count.status = "cancelled"
    db.commit()
    db.refresh(count)
    return count


def delete_count(db: Session, count_id: str, *, company_id: str) -> None:
    count = get_count(db, count_id, company_id=company_id)
    if count.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft counts can be deleted")
    db.delete(count)
    db.commit()


def _tracking_map(db: Session, item_ids: set[str]) -> dict[str, str]:
    if not item_ids:
        return {}
    rows = db.query(InventoryItem).filter(InventoryItem.item_id.in_(item_ids)).all()
    return {
        row.item_id: tracking_type_of(bool(row.track_serial), bool(row.track_batch))
        for row in rows
    }
