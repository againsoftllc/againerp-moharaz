"""Warehouse stock adjustments — draft snapshot, apply writes inventory + ledger."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_adjustment import (
    InventoryStockAdjustment,
    InventoryStockAdjustmentEvent,
    InventoryStockAdjustmentLine,
    InventoryStockAdjustmentSerial,
)
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.services.inventory import serial_service
from app.services.inventory.constants import (
    ADJUSTMENT_DECREASE_SERIAL_STATUS,
    ADJUSTMENT_REASONS,
    ADJUSTMENT_SERIAL_ADD,
    ADJUSTMENT_SERIAL_KEEP,
    ADJUSTMENT_SERIAL_REMOVE,
    MOVEMENT_STOCK_ADJUSTMENT_IN,
    MOVEMENT_STOCK_ADJUSTMENT_OUT,
    TRACKING_BATCH,
    TRACKING_SERIAL,
    tracking_type_of,
)
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.core.sequence_service import last_sequence_value, next_number as allocate_number


@dataclass(frozen=True)
class AdjustmentLineInput:
    item_id: str
    physical_qty: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    keep_serial_ids: tuple[str, ...] = ()
    add_serial_numbers: tuple[str, ...] = ()


class StockAdjustmentService:
    def __init__(self, db: Session, *, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    def list_adjustments(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        reason: Optional[str] = None,
        adjustment_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[InventoryStockAdjustment], int]:
        query = self._db.query(InventoryStockAdjustment).filter(
            InventoryStockAdjustment.company_id == company_id
        )
        if status:
            query = query.filter(InventoryStockAdjustment.status == status)
        if warehouse_id:
            query = query.filter(InventoryStockAdjustment.warehouse_id == warehouse_id)
        if reason:
            query = query.filter(InventoryStockAdjustment.reason == reason)
        if adjustment_type:
            query = query.filter(InventoryStockAdjustment.adjustment_type == adjustment_type)
        total = query.count()
        rows = (
            query.order_by(InventoryStockAdjustment.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_adjustment(self, adjustment_id: str) -> Optional[InventoryStockAdjustment]:
        row = self._db.get(InventoryStockAdjustment, adjustment_id)
        if row and self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def create_adjustment(
        self,
        *,
        warehouse_id: str,
        reason: str,
        lines: list[AdjustmentLineInput],
        company_id: str = "default",
        adjustment_date: Optional[date] = None,
        reason_details: Optional[str] = None,
        reference_number: Optional[str] = None,
        notes: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> InventoryStockAdjustment:
        reason_key = (reason or "").strip()
        if reason_key not in ADJUSTMENT_REASONS:
            raise HTTPException(status_code=400, detail="Invalid adjustment reason")
        details = (reason_details or "").strip() or None
        if reason_key == "other" and not details:
            raise HTTPException(status_code=400, detail="Reason details are required when reason is Other.")
        if not lines:
            raise HTTPException(status_code=400, detail="At least one adjustment line is required")

        warehouse = self._require_warehouse(warehouse_id)
        if not warehouse.is_active:
            raise HTTPException(status_code=400, detail=f"Warehouse {warehouse.name} is inactive")

        row = InventoryStockAdjustment(
            company_id=company_id,
            adjustment_number=self._next_number(company_id),
            warehouse_id=warehouse_id,
            adjustment_date=adjustment_date or date.today(),
            reason=reason_key,
            reason_details=details,
            reference_number=(reference_number or "").strip() or None,
            status="draft",
            created_by=actor_id,
            notes=(notes or "").strip() or None,
        )
        self._db.add(row)
        self._db.flush()

        diffs: list[int] = []
        for line_in in lines:
            diffs.append(self._add_draft_line(row, line_in, reason_key))

        nonzero = [d for d in diffs if d != 0]
        if not nonzero:
            raise HTTPException(
                status_code=400,
                detail="No quantity difference to adjust. Physical qty matches system stock.",
            )
        if all(d > 0 for d in nonzero):
            row.adjustment_type = "increase"
        elif all(d < 0 for d in nonzero):
            row.adjustment_type = "decrease"
        else:
            row.adjustment_type = "mixed"

        if reason_key == "found" and row.adjustment_type != "increase":
            raise HTTPException(status_code=400, detail="Found adjustments can only increase stock.")
        if reason_key in {"lost", "damaged", "broken", "expired"} and row.adjustment_type != "decrease":
            raise HTTPException(
                status_code=400,
                detail=f"{ADJUSTMENT_REASONS[reason_key]} adjustments can only decrease stock.",
            )

        self._event(row, "Adjustment Created", actor_id)
        self._db.flush()
        return row

    def apply_adjustment(
        self, adjustment_id: str, *, actor_id: Optional[str] = None
    ) -> InventoryStockAdjustment:
        row = self._require_adjustment(adjustment_id, for_update=True)
        if row.status == "applied":
            return row
        if row.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft adjustments can be applied")

        warehouse = self._require_warehouse(row.warehouse_id)
        if not warehouse.is_active:
            raise HTTPException(status_code=400, detail=f"Warehouse {warehouse.name} is inactive")

        lines = self._lines(row.id)
        if not lines:
            raise HTTPException(status_code=400, detail="Adjustment has no lines")

        movement_svc = StockMovementService(self._db)
        now = datetime.utcnow()
        reason_label = ADJUSTMENT_REASONS.get(row.reason, row.reason)

        for line in lines:
            if line.adjustment_qty == 0:
                continue
            stock = self._lock_stock(line.item_id, row.warehouse_id, row.company_id)
            if stock.on_hand != line.system_qty:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Stock has changed since this adjustment was created. "
                        "Please review the adjustment before applying."
                    ),
                )
            if line.physical_qty < stock.reserved:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{line.sku}: cannot set on-hand below reserved quantity "
                        f"({stock.reserved})."
                    ),
                )
            self._apply_serials(row, line)
            delta = line.adjustment_qty
            movement_type = MOVEMENT_STOCK_ADJUSTMENT_IN if delta > 0 else MOVEMENT_STOCK_ADJUSTMENT_OUT
            movement_svc.apply_movement(
                MovementInput(
                    item_id=line.item_id,
                    warehouse_id=row.warehouse_id,
                    movement_type=movement_type,
                    quantity=abs(delta),
                    company_id=row.company_id,
                    reference=row.adjustment_number,
                    notes=f"STOCK_ADJUSTMENT {row.adjustment_number} · {reason_label}",
                    created_by=actor_id,
                    source_type="stock_adjustment",
                    source_id=row.id,
                    document_date=row.adjustment_date,
                ),
            )

        row.status = "applied"
        row.applied_at = now
        row.applied_by = actor_id
        self._event(row, "Adjustment Applied", actor_id)
        self._db.flush()
        return row

    def cancel_adjustment(
        self, adjustment_id: str, *, actor_id: Optional[str] = None
    ) -> InventoryStockAdjustment:
        row = self._require_adjustment(adjustment_id, for_update=True)
        if row.status == "cancelled":
            return row
        if row.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft adjustments can be cancelled")
        row.status = "cancelled"
        self._event(row, "Adjustment Cancelled", actor_id)
        self._db.flush()
        return row

    def _add_draft_line(
        self,
        adjustment: InventoryStockAdjustment,
        line_in: AdjustmentLineInput,
        header_reason: str,
    ) -> int:
        if line_in.physical_qty < 0:
            raise HTTPException(status_code=400, detail="Physical quantity cannot be negative")

        item = self._db.get(Item, line_in.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item not found: {line_in.item_id}")
        if item.status in {"inactive", "discontinued", "archived"}:
            raise HTTPException(
                status_code=400,
                detail=f"{item.sku} is {item.status} and cannot be adjusted",
            )

        inv = InventoryItemService(self._db).get_by_item_id(item.id)
        if inv and (not inv.is_active or inv.inventory_status in {"inactive", "discontinued"}):
            raise HTTPException(status_code=400, detail=f"{item.sku} is inactive and cannot be adjusted")
        tracking = tracking_type_of(
            bool(inv.track_serial) if inv else False,
            bool(inv.track_batch) if inv else False,
        )

        stock = self._stock(item.id, adjustment.warehouse_id)
        system_qty = stock.on_hand if stock else 0
        physical_qty = line_in.physical_qty
        adjustment_qty = physical_qty - system_qty
        notes = (line_in.notes or "").strip() or None
        if tracking == TRACKING_BATCH:
            batch = (notes or "").strip()
            if not batch.upper().startswith("BATCH:") or len(batch) < 7:
                raise HTTPException(
                    status_code=400,
                    detail=f"{item.sku} is batch-tracked: batch number is required.",
                )

        line_reason = (line_in.reason or "").strip() or None
        if line_reason and line_reason not in ADJUSTMENT_REASONS:
            raise HTTPException(status_code=400, detail=f"{item.sku}: invalid line reason")

        line = InventoryStockAdjustmentLine(
            adjustment_id=adjustment.id,
            item_id=item.id,
            sku=item.sku,
            name=item.name,
            tracking_type=tracking,
            system_qty=system_qty,
            physical_qty=physical_qty,
            adjustment_qty=adjustment_qty,
            reason=line_reason,
            notes=notes,
        )
        self._db.add(line)
        self._db.flush()

        if tracking == TRACKING_SERIAL and adjustment_qty != 0:
            self._attach_serials(
                adjustment,
                line,
                keep_ids=self._clean_ids(line_in.keep_serial_ids),
                add_numbers=self._clean_serial_numbers(line_in.add_serial_numbers),
                header_reason=header_reason,
            )
        elif tracking != TRACKING_SERIAL and (line_in.keep_serial_ids or line_in.add_serial_numbers):
            raise HTTPException(
                status_code=400,
                detail=f"{item.sku} is not serial-tracked — do not attach serials.",
            )
        return adjustment_qty

    def _attach_serials(
        self,
        adjustment: InventoryStockAdjustment,
        line: InventoryStockAdjustmentLine,
        *,
        keep_ids: list[str],
        add_numbers: list[str],
        header_reason: str,
    ) -> None:
        current = self._in_stock_serials(line.item_id, adjustment.warehouse_id, adjustment.company_id)
        current_ids = {row.id for row in current}
        current_map = {row.id: row for row in current}

        if line.adjustment_qty < 0:
            if add_numbers:
                raise HTTPException(
                    status_code=400,
                    detail=f"{line.sku}: do not add serials on a decrease adjustment.",
                )
            if len(keep_ids) != line.physical_qty:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{line.sku}: physical {line.physical_qty} requires exactly "
                        f"{line.physical_qty} remaining serial(s)."
                    ),
                )
            for serial_id in keep_ids:
                if serial_id not in current_ids:
                    raise HTTPException(
                        status_code=400,
                        detail="Serial is not in stock at the selected warehouse.",
                    )
                self._add_serial_link(
                    adjustment.id,
                    line.id,
                    serial_id=serial_id,
                    serial_number=current_map[serial_id].serial_number,
                    action=ADJUSTMENT_SERIAL_KEEP,
                )
            for serial_id, serial_row in current_map.items():
                if serial_id in keep_ids:
                    continue
                self._add_serial_link(
                    adjustment.id,
                    line.id,
                    serial_id=serial_id,
                    serial_number=serial_row.serial_number,
                    action=ADJUSTMENT_SERIAL_REMOVE,
                )
            return

        if keep_ids:
            missing_keep = current_ids - set(keep_ids)
            extra_keep = set(keep_ids) - current_ids
            if missing_keep or extra_keep:
                raise HTTPException(
                    status_code=400,
                    detail=f"{line.sku}: keep the existing in-stock serials when increasing.",
                )
        keep_ids = list(current_ids)
        if len(add_numbers) != line.adjustment_qty:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{line.sku}: increase {line.adjustment_qty} requires exactly "
                    f"{line.adjustment_qty} new serial(s)."
                ),
            )
        for serial_id in keep_ids:
            self._add_serial_link(
                adjustment.id,
                line.id,
                serial_id=serial_id,
                serial_number=current_map[serial_id].serial_number,
                action=ADJUSTMENT_SERIAL_KEEP,
            )
        seen: set[str] = set()
        for number in add_numbers:
            key = number.lower()
            if key in seen:
                raise HTTPException(status_code=400, detail="Duplicate serial selection.")
            seen.add(key)
            existing = serial_service.find_by_number(self._db, number, company_id=adjustment.company_id)
            if existing:
                self._assert_restorable(existing, line, header_reason)
            self._add_serial_link(
                adjustment.id,
                line.id,
                serial_id=existing.id if existing else None,
                serial_number=number,
                action=ADJUSTMENT_SERIAL_ADD,
            )

    def _apply_serials(
        self, adjustment: InventoryStockAdjustment, line: InventoryStockAdjustmentLine
    ) -> None:
        if line.tracking_type != TRACKING_SERIAL:
            return
        header_reason = line.reason or adjustment.reason
        remove_status = ADJUSTMENT_DECREASE_SERIAL_STATUS.get(header_reason, "lost")
        for link in self._line_serials(line.id):
            if link.action == ADJUSTMENT_SERIAL_KEEP:
                serial_row = self._db.get(InventorySerial, link.serial_id) if link.serial_id else None
                if (
                    not serial_row
                    or serial_row.status != "in_stock"
                    or serial_row.warehouse_id != adjustment.warehouse_id
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Stock has changed since this adjustment was created. "
                            "Please review the adjustment before applying."
                        ),
                    )
            elif link.action == ADJUSTMENT_SERIAL_REMOVE:
                serial_row = self._db.get(InventorySerial, link.serial_id) if link.serial_id else None
                if not serial_row:
                    raise HTTPException(status_code=404, detail="Serial not found")
                if serial_row.status == "in_transit":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Serial {serial_row.serial_number} is in transit and cannot be adjusted.",
                    )
                if serial_row.status == "sold":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Serial {serial_row.serial_number} is already sold.",
                    )
                serial_service.set_status(self._db, serial_row, remove_status)
            elif link.action == ADJUSTMENT_SERIAL_ADD:
                existing = None
                if link.serial_id:
                    existing = self._db.get(InventorySerial, link.serial_id)
                if existing is None:
                    existing = serial_service.find_by_number(
                        self._db, link.serial_number, company_id=adjustment.company_id
                    )
                if existing:
                    self._assert_restorable(existing, line, header_reason)
                    serial_service.set_status(self._db, existing, "in_stock")
                    existing.warehouse_id = adjustment.warehouse_id
                    link.serial_id = existing.id
                else:
                    created = serial_service.register_serials_or_raise(
                        self._db,
                        [link.serial_number],
                        company_id=adjustment.company_id,
                        item_id=line.item_id,
                        warehouse_id=adjustment.warehouse_id,
                        source_type="adjustment",
                        source_id=adjustment.id,
                        notes=f"{adjustment.adjustment_number} · found",
                    )
                    if created and created[0].serial_id:
                        link.serial_id = created[0].serial_id

    def _assert_restorable(
        self,
        existing: InventorySerial,
        line: InventoryStockAdjustmentLine,
        header_reason: str,
    ) -> None:
        if existing.item_id and existing.item_id != line.item_id:
            raise HTTPException(
                status_code=400,
                detail=f"Serial {existing.serial_number} belongs to another product.",
            )
        if existing.status == "sold":
            raise HTTPException(
                status_code=400,
                detail=f"Serial {existing.serial_number} is already sold.",
            )
        if existing.status == "in_transit":
            raise HTTPException(
                status_code=400,
                detail=f"Serial {existing.serial_number} is in transit and cannot be adjusted.",
            )
        if existing.status == "in_stock":
            raise HTTPException(
                status_code=400,
                detail=f"Serial {existing.serial_number} already exists in inventory.",
            )
        if existing.status in {"lost", "damaged"}:
            return
        raise HTTPException(
            status_code=400,
            detail=f"Serial {existing.serial_number} is {existing.status} and cannot be added to stock.",
        )

    def _add_serial_link(
        self,
        adjustment_id: str,
        line_id: str,
        *,
        serial_id: Optional[str],
        serial_number: str,
        action: str,
    ) -> None:
        self._db.add(
            InventoryStockAdjustmentSerial(
                adjustment_id=adjustment_id,
                adjustment_line_id=line_id,
                serial_id=serial_id,
                serial_number=serial_number,
                action=action,
            )
        )

    def _in_stock_serials(
        self, item_id: str, warehouse_id: str, company_id: str
    ) -> list[InventorySerial]:
        return (
            self._db.query(InventorySerial)
            .filter(
                InventorySerial.company_id == company_id,
                InventorySerial.item_id == item_id,
                InventorySerial.warehouse_id == warehouse_id,
                InventorySerial.status == "in_stock",
            )
            .order_by(InventorySerial.serial_number.asc())
            .all()
        )

    def _stock(self, item_id: str, warehouse_id: str) -> Optional[InventoryStockLevel]:
        return (
            self._db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == item_id,
                InventoryStockLevel.warehouse_id == warehouse_id,
            )
            .first()
        )

    def _lock_stock(self, item_id: str, warehouse_id: str, company_id: str) -> InventoryStockLevel:
        row = (
            self._db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == item_id,
                InventoryStockLevel.warehouse_id == warehouse_id,
                InventoryStockLevel.company_id == company_id,
            )
            .with_for_update()
            .first()
        )
        if row:
            return row
        created = StockMovementService(self._db)._get_or_create_stock(
            item_id, warehouse_id, company_id
        )
        return (
            self._db.query(InventoryStockLevel)
            .filter(InventoryStockLevel.id == created.id)
            .with_for_update()
            .first()
            or created
        )

    def _lines(self, adjustment_id: str) -> list[InventoryStockAdjustmentLine]:
        return (
            self._db.query(InventoryStockAdjustmentLine)
            .filter(InventoryStockAdjustmentLine.adjustment_id == adjustment_id)
            .all()
        )

    def _line_serials(self, line_id: str) -> list[InventoryStockAdjustmentSerial]:
        return (
            self._db.query(InventoryStockAdjustmentSerial)
            .filter(InventoryStockAdjustmentSerial.adjustment_line_id == line_id)
            .all()
        )

    def _event(
        self,
        adjustment: InventoryStockAdjustment,
        action: str,
        actor_id: Optional[str],
        details: Optional[str] = None,
    ) -> None:
        self._db.add(
            InventoryStockAdjustmentEvent(
                adjustment_id=adjustment.id,
                action=action,
                performed_by=actor_id,
                details=details,
            )
        )

    def _require_adjustment(
        self, adjustment_id: str, *, for_update: bool = False
    ) -> InventoryStockAdjustment:
        query = self._db.query(InventoryStockAdjustment).filter(
            InventoryStockAdjustment.id == adjustment_id
        )
        if for_update:
            query = query.with_for_update()
        row = query.first()
        if not row:
            raise HTTPException(status_code=404, detail="Adjustment not found")
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            raise HTTPException(status_code=404, detail="Adjustment not found")
        return row

    def _require_warehouse(self, warehouse_id: str) -> InventoryWarehouse:
        row = self._db.get(InventoryWarehouse, warehouse_id)
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        return row

    def _next_number(self, company_id: str) -> str:
        prefix = f"ADJ-{date.today().year}-"
        return allocate_number(
            self._db,
            company_id,
            "inventory.adjustment",
            initial=lambda: last_sequence_value(
                self._db,
                InventoryStockAdjustment.adjustment_number,
                InventoryStockAdjustment.company_id == company_id,
                prefix,
            )
            + 1,
        )

    @staticmethod
    def _clean_ids(raw: tuple[str, ...] | list[str] | None) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in raw or ():
            cleaned = (value or "").strip()
            if not cleaned:
                continue
            if cleaned in seen:
                raise HTTPException(status_code=400, detail="Duplicate serial selection.")
            seen.add(cleaned)
            out.append(cleaned)
        return out

    @staticmethod
    def _clean_serial_numbers(raw: tuple[str, ...] | list[str] | None) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in raw or ():
            cleaned = (value or "").strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                raise HTTPException(status_code=400, detail="Duplicate serial selection.")
            seen.add(key)
            out.append(cleaned)
        return out


def adjustment_to_read(db: Session, adjustment: InventoryStockAdjustment):
    from app.schemas.inventory.stock_adjustment import (
        StockAdjustmentEventRead,
        StockAdjustmentLineRead,
        StockAdjustmentRead,
        StockAdjustmentSerialRead,
    )

    warehouse = db.get(InventoryWarehouse, adjustment.warehouse_id)
    users: dict[str, str] = {}
    user_ids = {adjustment.created_by, adjustment.applied_by}
    user_ids.update(event.performed_by for event in adjustment.events)
    user_ids.discard(None)
    if user_ids:
        for row in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all():
            users[row.id] = row.name

    lines = (
        db.query(InventoryStockAdjustmentLine)
        .filter(InventoryStockAdjustmentLine.adjustment_id == adjustment.id)
        .all()
    )

    line_reads: list[StockAdjustmentLineRead] = []
    for line in lines:
        links = (
            db.query(InventoryStockAdjustmentSerial)
            .filter(InventoryStockAdjustmentSerial.adjustment_line_id == line.id)
            .all()
        )
        serial_ids = [link.serial_id for link in links if link.serial_id]
        serial_map: dict[str, InventorySerial] = {}
        if serial_ids:
            serial_map = {
                row.id: row
                for row in db.query(InventorySerial).filter(InventorySerial.id.in_(serial_ids)).all()
            }
        line_reads.append(
            StockAdjustmentLineRead(
                id=line.id,
                item_id=line.item_id,
                sku=line.sku,
                name=line.name,
                tracking_type=line.tracking_type,
                system_qty=line.system_qty,
                physical_qty=line.physical_qty,
                adjustment_qty=line.adjustment_qty,
                reason=line.reason,
                notes=line.notes,
                serials=[
                    StockAdjustmentSerialRead(
                        id=link.id,
                        serial_id=link.serial_id,
                        serial_number=link.serial_number
                        or (
                            serial_map[link.serial_id].serial_number
                            if link.serial_id in serial_map
                            else ""
                        ),
                        action=link.action,
                        status=(
                            serial_map[link.serial_id].status if link.serial_id in serial_map else None
                        ),
                    )
                    for link in links
                ],
            )
        )

    return StockAdjustmentRead(
        id=adjustment.id,
        company_id=adjustment.company_id,
        adjustment_number=adjustment.adjustment_number,
        warehouse_id=adjustment.warehouse_id,
        warehouse_name=warehouse.name if warehouse else None,
        adjustment_date=adjustment.adjustment_date,
        adjustment_type=adjustment.adjustment_type,
        reason=adjustment.reason,
        reason_label=ADJUSTMENT_REASONS.get(adjustment.reason, adjustment.reason),
        reason_details=adjustment.reason_details,
        reference_number=adjustment.reference_number,
        status=adjustment.status,
        created_by=adjustment.created_by,
        created_by_name=users.get(adjustment.created_by or ""),
        applied_by=adjustment.applied_by,
        applied_by_name=users.get(adjustment.applied_by or ""),
        notes=adjustment.notes,
        applied_at=adjustment.applied_at,
        created_at=adjustment.created_at,
        updated_at=adjustment.updated_at,
        item_count=len(line_reads),
        lines=line_reads,
        events=[
            StockAdjustmentEventRead(
                id=event.id,
                action=event.action,
                performed_by=event.performed_by,
                performed_by_name=users.get(event.performed_by or ""),
                details=event.details,
                created_at=event.created_at,
            )
            for event in (
                db.query(InventoryStockAdjustmentEvent)
                .filter(InventoryStockAdjustmentEvent.adjustment_id == adjustment.id)
                .order_by(InventoryStockAdjustmentEvent.created_at.asc())
                .all()
            )
        ],
    )
