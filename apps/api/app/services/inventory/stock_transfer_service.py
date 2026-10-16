"""Warehouse-to-warehouse stock transfers — two-step ship then receive."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_transfer import (
    InventoryStockTransfer,
    InventoryStockTransferEvent,
    InventoryStockTransferLine,
    InventoryStockTransferSerial,
)
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.services.inventory.constants import (
    INCOMING_SOURCE_TRANSFER,
    MOVEMENT_TRANSFER_IN,
    MOVEMENT_TRANSFER_OUT,
    TRACKING_BATCH,
    TRACKING_SERIAL,
    TRANSFER_SERIAL_RECEIVED,
    TRANSFER_SERIAL_SELECTED,
    TRANSFER_SERIAL_SHIPPED,
    TRANSFER_SHIPPED_STATUSES,
    tracking_type_of,
)
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.inventory import serial_service
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.core.sequence_service import last_sequence_value, next_number as allocate_number


@dataclass(frozen=True)
class TransferLineInput:
    item_id: str
    quantity: int
    serial_ids: tuple[str, ...] = ()
    notes: Optional[str] = None


@dataclass(frozen=True)
class TransferReceiveLineInput:
    line_id: str
    quantity: int
    serial_ids: tuple[str, ...] = ()


class StockTransferService:
    def __init__(self, db: Session, *, company_id: Optional[str] = None) -> None:
        self._company_id = company_id
        self._db = db

    def list_transfers(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        from_warehouse_id: Optional[str] = None,
        to_warehouse_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[InventoryStockTransfer], int]:
        query = self._db.query(InventoryStockTransfer).filter(
            InventoryStockTransfer.company_id == company_id
        )
        if status:
            query = query.filter(InventoryStockTransfer.status == status)
        if from_warehouse_id:
            query = query.filter(InventoryStockTransfer.from_warehouse_id == from_warehouse_id)
        if to_warehouse_id:
            query = query.filter(InventoryStockTransfer.to_warehouse_id == to_warehouse_id)
        total = query.count()
        rows = (
            query.order_by(InventoryStockTransfer.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_transfer(self, transfer_id: str) -> Optional[InventoryStockTransfer]:
        row = self._db.get(InventoryStockTransfer, transfer_id)
        if row and self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def create_transfer(
        self,
        *,
        from_warehouse_id: str,
        to_warehouse_id: str,
        lines: list[TransferLineInput],
        company_id: str = "default",
        transfer_date: Optional[date] = None,
        reference_number: Optional[str] = None,
        notes: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> InventoryStockTransfer:
        if from_warehouse_id == to_warehouse_id:
            raise HTTPException(
                status_code=400,
                detail="Source and destination warehouse must be different.",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one transfer line is required")

        source = self._require_warehouse(from_warehouse_id)
        dest = self._require_warehouse(to_warehouse_id)
        if not source.is_active:
            raise HTTPException(status_code=400, detail=f"Source warehouse {source.name} is inactive")
        if not dest.is_active:
            raise HTTPException(status_code=400, detail=f"Destination warehouse {dest.name} is inactive")

        transfer = InventoryStockTransfer(
            company_id=company_id,
            transfer_number=self._next_number(company_id),
            from_warehouse_id=from_warehouse_id,
            to_warehouse_id=to_warehouse_id,
            transfer_date=transfer_date or date.today(),
            reference_number=(reference_number or "").strip() or None,
            status="draft",
            requested_by=actor_id,
            notes=(notes or "").strip() or None,
        )
        self._db.add(transfer)
        self._db.flush()

        seen_serials: set[str] = set()
        for line_in in lines:
            self._add_draft_line(transfer, line_in, seen_serials)

        self._event(transfer, "Transfer Created", actor_id)
        self._db.flush()
        return transfer

    def ship_transfer(self, transfer_id: str, *, actor_id: Optional[str] = None) -> InventoryStockTransfer:
        transfer = self._require_transfer(transfer_id, for_update=True)
        if transfer.status in TRANSFER_SHIPPED_STATUSES:
            return transfer
        if transfer.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft transfers can be shipped")

        source_wh = self._require_warehouse(transfer.from_warehouse_id)
        dest_wh = self._require_warehouse(transfer.to_warehouse_id)
        if not source_wh.is_active:
            raise HTTPException(status_code=400, detail=f"Source warehouse {source_wh.name} is inactive")
        if not dest_wh.is_active:
            raise HTTPException(status_code=400, detail=f"Destination warehouse {dest_wh.name} is inactive")

        lines = self._lines(transfer.id)
        if not lines:
            raise HTTPException(status_code=400, detail="Transfer has no lines")

        movement_svc = StockMovementService(self._db)
        now = datetime.utcnow()

        for line in lines:
            source, dest = self._lock_pair(
                line.item_id,
                transfer.from_warehouse_id,
                transfer.to_warehouse_id,
                transfer.company_id,
            )
            available = max(source.on_hand - source.reserved, 0)
            if line.quantity > available:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock. Available quantity is {available}.",
                )
            self._validate_ship_serials(transfer, line)

            movement_svc.apply_movement(
                MovementInput(
                    item_id=line.item_id,
                    warehouse_id=transfer.from_warehouse_id,
                    movement_type=MOVEMENT_TRANSFER_OUT,
                    quantity=line.quantity,
                    company_id=transfer.company_id,
                    source_warehouse_id=transfer.from_warehouse_id,
                    dest_warehouse_id=transfer.to_warehouse_id,
                    reference=transfer.transfer_number,
                    notes=f"TRANSFER_OUT {transfer.transfer_number}",
                    created_by=actor_id,
                    source_type="stock_transfer",
                    source_id=transfer.id,
                ),
            )
            movement_svc.add_incoming(
                item_id=line.item_id,
                warehouse_id=transfer.to_warehouse_id,
                quantity=line.quantity,
                company_id=transfer.company_id,
                source_type=INCOMING_SOURCE_TRANSFER,
                source_id=transfer.id,
                source_line_id=line.id,
                reference=transfer.transfer_number,
                notes=f"TRANSFER_IN_TRANSIT {transfer.transfer_number}",
                created_by=actor_id,
                source_warehouse_id=transfer.from_warehouse_id,
                dest_warehouse_id=transfer.to_warehouse_id,
            )
            line.shipped_qty = line.quantity
            self._ship_serials(line, now)

        transfer.status = "in_transit"
        transfer.shipped_at = now
        transfer.shipped_by = actor_id
        self._event(transfer, "Shipment Confirmed", actor_id)
        self._db.flush()
        return transfer

    def receive_transfer(
        self,
        transfer_id: str,
        lines: list[TransferReceiveLineInput],
        *,
        actor_id: Optional[str] = None,
    ) -> InventoryStockTransfer:
        transfer = self._require_transfer(transfer_id, for_update=True)
        if transfer.status == "completed":
            return transfer
        if transfer.status not in {"in_transit", "partial_received"}:
            raise HTTPException(status_code=400, detail="Only in-transit transfers can be received")
        if not lines:
            raise HTTPException(status_code=400, detail="At least one receive line is required")

        by_id = {row.id: row for row in self._lines(transfer.id)}
        movement_svc = StockMovementService(self._db)
        now = datetime.utcnow()
        received_any = False

        for line_in in lines:
            line = by_id.get(line_in.line_id)
            if not line:
                raise HTTPException(status_code=404, detail=f"Transfer line not found: {line_in.line_id}")
            remaining = line.shipped_qty - line.received_qty
            if remaining <= 0:
                continue
            if line_in.quantity > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=f"{line.sku}: receive {line_in.quantity} exceeds remaining {remaining}",
                )
            self._validate_receive_serials(line, line_in)

            dest = self._lock_stock(line.item_id, transfer.to_warehouse_id, transfer.company_id)
            movement_svc.consume_incoming(
                item_id=line.item_id,
                warehouse_id=transfer.to_warehouse_id,
                quantity=line_in.quantity,
                company_id=transfer.company_id,
                source_type=INCOMING_SOURCE_TRANSFER,
                source_id=transfer.id,
                source_line_id=line.id,
            )
            movement_svc.apply_movement(
                MovementInput(
                    item_id=line.item_id,
                    warehouse_id=transfer.to_warehouse_id,
                    movement_type=MOVEMENT_TRANSFER_IN,
                    quantity=line_in.quantity,
                    company_id=transfer.company_id,
                    source_warehouse_id=transfer.from_warehouse_id,
                    dest_warehouse_id=transfer.to_warehouse_id,
                    reference=transfer.transfer_number,
                    notes=f"TRANSFER_IN {transfer.transfer_number}",
                    created_by=actor_id,
                    source_type="stock_transfer",
                    source_id=transfer.id,
                ),
            )
            line.received_qty += line_in.quantity
            self._receive_serials(line, line_in.serial_ids, transfer.to_warehouse_id, now)
            received_any = True

        if not received_any:
            raise HTTPException(status_code=400, detail="Nothing left to receive")

        total_shipped = sum(row.shipped_qty for row in by_id.values())
        total_received = sum(row.received_qty for row in by_id.values())
        if total_received >= total_shipped:
            transfer.status = "completed"
            transfer.completed_at = now
            transfer.received_by = actor_id
            self._event(transfer, "Transfer Received", actor_id)
        else:
            transfer.status = "partial_received"
            transfer.received_by = actor_id
            self._event(transfer, "Transfer Partially Received", actor_id, f"{total_received}/{total_shipped}")
        self._db.flush()
        return transfer

    def cancel_transfer(self, transfer_id: str, *, actor_id: Optional[str] = None) -> InventoryStockTransfer:
        transfer = self._require_transfer(transfer_id, for_update=True)
        if transfer.status == "cancelled":
            return transfer
        if transfer.status != "draft":
            raise HTTPException(
                status_code=400,
                detail="Only draft transfers can be cancelled. Shipped stock must be received at the destination.",
            )
        transfer.status = "cancelled"
        self._event(transfer, "Transfer Cancelled", actor_id)
        self._db.flush()
        return transfer

    def _add_draft_line(
        self,
        transfer: InventoryStockTransfer,
        line_in: TransferLineInput,
        seen_serials: set[str],
    ) -> None:
        if line_in.quantity <= 0:
            raise HTTPException(status_code=400, detail="Transfer quantity must be greater than zero")

        item = self._db.get(Item, line_in.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item not found: {line_in.item_id}")
        if item.status in {"inactive", "discontinued", "archived"}:
            raise HTTPException(status_code=400, detail=f"{item.sku} is {item.status} and cannot be transferred")

        source = self._stock(line_in.item_id, transfer.from_warehouse_id)
        available = max((source.on_hand - source.reserved), 0) if source else 0
        if line_in.quantity > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available quantity is {available}.",
            )

        inv = InventoryItemService(self._db).get_by_item_id(item.id)
        if inv and (not inv.is_active or inv.inventory_status in {"inactive", "discontinued"}):
            raise HTTPException(status_code=400, detail=f"{item.sku} is inactive and cannot be transferred")
        tracking = tracking_type_of(
            bool(inv.track_serial) if inv else False,
            bool(inv.track_batch) if inv else False,
        )
        notes = (line_in.notes or "").strip() or None
        if tracking == TRACKING_BATCH:
            batch = (notes or "").strip()
            if not batch.upper().startswith("BATCH:") or len(batch) < 7:
                raise HTTPException(
                    status_code=400,
                    detail=f"{item.sku} is batch-tracked: batch number is required.",
                )

        serial_ids = self._clean_ids(line_in.serial_ids)
        if tracking == TRACKING_SERIAL:
            if len(serial_ids) != line_in.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{item.sku} is serial-tracked: transfer {line_in.quantity} requires "
                        f"exactly {line_in.quantity} serial(s), got {len(serial_ids)}."
                    ),
                )
            self._assert_source_serials(
                serial_ids,
                item_id=item.id,
                warehouse_id=transfer.from_warehouse_id,
                company_id=transfer.company_id,
                seen=seen_serials,
            )
        elif serial_ids:
            raise HTTPException(
                status_code=400,
                detail=f"{item.sku} is not serial-tracked — do not attach serials.",
            )

        line = InventoryStockTransferLine(
            transfer_id=transfer.id,
            item_id=item.id,
            sku=item.sku,
            name=item.name,
            tracking_type=tracking,
            quantity=line_in.quantity,
            notes=notes,
        )
        self._db.add(line)
        self._db.flush()
        for serial_id in serial_ids:
            self._db.add(
                InventoryStockTransferSerial(
                    transfer_id=transfer.id,
                    transfer_line_id=line.id,
                    serial_id=serial_id,
                    status=TRANSFER_SERIAL_SELECTED,
                )
            )

    def _validate_ship_serials(
        self, transfer: InventoryStockTransfer, line: InventoryStockTransferLine
    ) -> None:
        attached = self._line_serials(line.id)
        if line.tracking_type == TRACKING_SERIAL:
            if len(attached) != line.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"{line.sku}: ship requires exactly {line.quantity} serial(s).",
                )
            seen: set[str] = set()
            self._assert_source_serials(
                [row.serial_id for row in attached],
                item_id=line.item_id,
                warehouse_id=transfer.from_warehouse_id,
                company_id=transfer.company_id,
                seen=seen,
            )

    def _validate_receive_serials(
        self, line: InventoryStockTransferLine, line_in: TransferReceiveLineInput
    ) -> None:
        serial_ids = self._clean_ids(line_in.serial_ids)
        if line.tracking_type != TRACKING_SERIAL:
            if serial_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"{line.sku} is not serial-tracked — do not attach serials.",
                )
            return
        if len(serial_ids) != line_in.quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{line.sku}: receive {line_in.quantity} requires exactly "
                    f"{line_in.quantity} in-transit serial(s)."
                ),
            )
        attached = {row.serial_id: row for row in self._line_serials(line.id)}
        for serial_id in serial_ids:
            link = attached.get(serial_id)
            if not link or link.status != TRANSFER_SERIAL_SHIPPED:
                raise HTTPException(
                    status_code=400,
                    detail="Serial is not in transit on this transfer.",
                )

    def _assert_source_serials(
        self,
        serial_ids: list[str],
        *,
        item_id: str,
        warehouse_id: str,
        company_id: str,
        seen: set[str],
    ) -> None:
        for serial_id in serial_ids:
            if serial_id in seen:
                raise HTTPException(status_code=400, detail="Duplicate serial selection.")
            seen.add(serial_id)
            row = self._db.get(InventorySerial, serial_id)
            if not row or row.company_id != company_id:
                raise HTTPException(status_code=404, detail="Serial not found")
            if row.item_id and row.item_id != item_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} does not belong to this product.",
                )
            if row.warehouse_id != warehouse_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} does not belong to the source warehouse.",
                )
            if row.status == "in_transit":
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} is already in transit.",
                )
            if row.status == "sold":
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} is already sold.",
                )
            if row.status in {"scrapped", "replaced"}:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} cannot be transferred ({row.status}).",
                )
            if row.status != "in_stock":
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial {row.serial_number} is {row.status} and cannot be transferred.",
                )

    def _ship_serials(self, line: InventoryStockTransferLine, now: datetime) -> None:
        for link in self._line_serials(line.id):
            row = self._db.get(InventorySerial, link.serial_id)
            if not row:
                continue
            serial_service.set_status(self._db, row, "in_transit")
            link.status = TRANSFER_SERIAL_SHIPPED
            link.shipped_at = now

    def _receive_serials(
        self,
        line: InventoryStockTransferLine,
        serial_ids: tuple[str, ...],
        dest_warehouse_id: str,
        now: datetime,
    ) -> None:
        wanted = set(self._clean_ids(serial_ids))
        for link in self._line_serials(line.id):
            if link.serial_id not in wanted:
                continue
            row = self._db.get(InventorySerial, link.serial_id)
            if not row:
                continue
            serial_service.set_status(self._db, row, "in_stock")
            row.warehouse_id = dest_warehouse_id
            link.status = TRANSFER_SERIAL_RECEIVED
            link.received_at = now

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

    def _lock_pair(
        self,
        item_id: str,
        source_warehouse_id: str,
        dest_warehouse_id: str,
        company_id: str,
    ) -> tuple[InventoryStockLevel, InventoryStockLevel]:
        first_id, second_id = sorted((source_warehouse_id, dest_warehouse_id))
        first = self._lock_stock(item_id, first_id, company_id)
        second = self._lock_stock(item_id, second_id, company_id)
        by_id = {first.warehouse_id: first, second.warehouse_id: second}
        return by_id[source_warehouse_id], by_id[dest_warehouse_id]

    def _lines(self, transfer_id: str) -> list[InventoryStockTransferLine]:
        return (
            self._db.query(InventoryStockTransferLine)
            .filter(InventoryStockTransferLine.transfer_id == transfer_id)
            .all()
        )

    def _line_serials(self, line_id: str) -> list[InventoryStockTransferSerial]:
        return (
            self._db.query(InventoryStockTransferSerial)
            .filter(InventoryStockTransferSerial.transfer_line_id == line_id)
            .all()
        )

    def _event(
        self,
        transfer: InventoryStockTransfer,
        action: str,
        actor_id: Optional[str],
        details: Optional[str] = None,
    ) -> None:
        self._db.add(
            InventoryStockTransferEvent(
                transfer_id=transfer.id,
                action=action,
                performed_by=actor_id,
                details=details,
            )
        )

    def _require_transfer(self, transfer_id: str, *, for_update: bool = False) -> InventoryStockTransfer:
        query = self._db.query(InventoryStockTransfer).filter(InventoryStockTransfer.id == transfer_id)
        if for_update:
            query = query.with_for_update()
        row = query.first()
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            raise HTTPException(status_code=404, detail="Transfer not found")
        return row

    def _require_warehouse(self, warehouse_id: str) -> InventoryWarehouse:
        row = self._db.get(InventoryWarehouse, warehouse_id)
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        return row

    def _next_number(self, company_id: str) -> str:
        prefix = f"TR-{date.today().year}-"
        return allocate_number(
            self._db,
            company_id,
            "inventory.transfer",
            initial=lambda: last_sequence_value(
                self._db,
                InventoryStockTransfer.transfer_number,
                InventoryStockTransfer.company_id == company_id,
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


def transfer_to_read(db: Session, transfer: InventoryStockTransfer) -> dict:
    from app.schemas.inventory.stock_transfer import (
        StockTransferEventRead,
        StockTransferLineRead,
        StockTransferRead,
        StockTransferSerialRead,
    )

    source = db.get(InventoryWarehouse, transfer.from_warehouse_id)
    dest = db.get(InventoryWarehouse, transfer.to_warehouse_id)
    users: dict[str, str] = {}
    user_ids = {transfer.requested_by, transfer.shipped_by, transfer.received_by}
    user_ids.update(event.performed_by for event in transfer.events)
    user_ids.discard(None)
    if user_ids:
        for row in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all():
            users[row.id] = row.name

    lines = (
        db.query(InventoryStockTransferLine)
        .filter(InventoryStockTransferLine.transfer_id == transfer.id)
        .all()
    )
    serial_ids = [
        link.serial_id
        for line in lines
        for link in (
            db.query(InventoryStockTransferSerial)
            .filter(InventoryStockTransferSerial.transfer_line_id == line.id)
            .all()
        )
    ]
    serial_map: dict[str, InventorySerial] = {}
    if serial_ids:
        serial_map = {
            row.id: row
            for row in db.query(InventorySerial).filter(InventorySerial.id.in_(serial_ids)).all()
        }

    line_reads: list[StockTransferLineRead] = []
    for line in lines:
        stock = (
            db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == line.item_id,
                InventoryStockLevel.warehouse_id == transfer.from_warehouse_id,
            )
            .first()
        )
        available = max(stock.on_hand - stock.reserved, 0) if stock else 0
        links = (
            db.query(InventoryStockTransferSerial)
            .filter(InventoryStockTransferSerial.transfer_line_id == line.id)
            .all()
        )
        line_reads.append(
            StockTransferLineRead(
                id=line.id,
                item_id=line.item_id,
                sku=line.sku,
                name=line.name,
                tracking_type=line.tracking_type,
                quantity=line.quantity,
                shipped_qty=line.shipped_qty,
                received_qty=line.received_qty,
                remaining_qty=max(0, line.shipped_qty - line.received_qty),
                available_qty=available,
                notes=line.notes,
                serials=[
                    StockTransferSerialRead(
                        id=link.id,
                        serial_id=link.serial_id,
                        serial_number=(serial_map[link.serial_id].serial_number if link.serial_id in serial_map else ""),
                        status=link.status,
                        shipped_at=link.shipped_at,
                        received_at=link.received_at,
                    )
                    for link in links
                ],
            )
        )

    return StockTransferRead(
        id=transfer.id,
        company_id=transfer.company_id,
        transfer_number=transfer.transfer_number,
        from_warehouse_id=transfer.from_warehouse_id,
        from_warehouse_name=source.name if source else None,
        to_warehouse_id=transfer.to_warehouse_id,
        to_warehouse_name=dest.name if dest else None,
        transfer_date=transfer.transfer_date,
        reference_number=transfer.reference_number,
        status=transfer.status,
        requested_by=transfer.requested_by,
        requested_by_name=users.get(transfer.requested_by or ""),
        shipped_by=transfer.shipped_by,
        received_by=transfer.received_by,
        notes=transfer.notes,
        shipped_at=transfer.shipped_at,
        completed_at=transfer.completed_at,
        created_at=transfer.created_at,
        updated_at=transfer.updated_at,
        item_count=len(line_reads),
        lines=line_reads,
        events=[
            StockTransferEventRead(
                id=event.id,
                action=event.action,
                performed_by=event.performed_by,
                performed_by_name=users.get(event.performed_by or ""),
                details=event.details,
                created_at=event.created_at,
            )
            for event in (
                db.query(InventoryStockTransferEvent)
                .filter(InventoryStockTransferEvent.transfer_id == transfer.id)
                .order_by(InventoryStockTransferEvent.created_at.asc())
                .all()
            )
        ],
    )
