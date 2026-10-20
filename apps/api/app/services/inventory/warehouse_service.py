"""Warehouse master CRUD."""

from __future__ import annotations

import logging
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import engine
from app.models.hrm.org import HrmBranch
from app.models.inventory_incoming import InventoryIncoming
from app.models.inventory_item import InventoryItem
from app.models.inventory_reservation import InventoryReservation
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.pos import PosCart, PosSession, PosTerminal
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_receipt import PurchaseReceipt
from app.models.sales import SalesDelivery, SalesOrder
from app.models.service_job import ServiceJob, ServiceJobLine
from app.schemas.inventory.warehouse import WarehouseCreate, WarehouseUpdate

logger = logging.getLogger(__name__)

_CONTACT_FIELDS = (
    "address",
    "city",
    "state",
    "zip_code",
    "country",
    "mobile",
    "alternate_contact",
    "email",
    "website",
    "invoice_layout",
    "payment_option",
)


def ensure_warehouse_location_columns() -> None:
    statements = [
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS state VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS zip_code VARCHAR(32)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS is_rma_store BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS is_supplier_transit BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS alternate_contact VARCHAR(50)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS website VARCHAR(255)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS invoice_layout VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS payment_option VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS branch_id VARCHAR(36)",
        "ALTER TABLE inventory_warehouses DROP CONSTRAINT IF EXISTS inventory_warehouses_code_key",
        "DROP INDEX IF EXISTS inventory_warehouses_code_key",
        "DROP INDEX IF EXISTS ix_inventory_warehouses_code",
        "CREATE INDEX IF NOT EXISTS ix_inventory_warehouses_code ON inventory_warehouses (code)",
        """
        DO $$ DECLARE r record;
        BEGIN
            FOR r IN
                SELECT conname FROM pg_constraint
                WHERE conrelid = 'inventory_warehouses'::regclass
                  AND contype = 'u'
                  AND pg_get_constraintdef(oid) ILIKE '%code%'
                  AND pg_get_constraintdef(oid) NOT ILIKE '%company_id%'
            LOOP
                EXECUTE format('ALTER TABLE inventory_warehouses DROP CONSTRAINT IF EXISTS %I', r.conname);
            END LOOP;
        END $$
        """,
        """
        DO $$ BEGIN
            ALTER TABLE inventory_warehouses
                ADD CONSTRAINT fk_inventory_warehouses_branch_id
                FOREIGN KEY (branch_id) REFERENCES hrm_branches(id) ON DELETE SET NULL;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN undefined_table THEN NULL;
        END $$
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_warehouses_company_id_code_lower
        ON inventory_warehouses (company_id, lower(code))
        """,
        """
        UPDATE inventory_warehouses AS w
        SET branch_id = (
            SELECT b.id FROM hrm_branches b
            WHERE b.company_id = w.company_id
            ORDER BY b.created_at ASC
            LIMIT 1
        )
        WHERE w.branch_id IS NULL
        """,
    ]
    for stmt in statements:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception:
            logger.exception("ensure_warehouse_location_columns failed: %s", stmt.strip().splitlines()[0])


def _clean_opt(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _resolve_branch_id(db: Session, company_id: str, branch_id: Optional[str]) -> Optional[str]:
    cleaned = _clean_opt(branch_id)
    if not cleaned:
        return None
    branch = db.get(HrmBranch, cleaned)
    if not branch or branch.company_id != company_id:
        raise HTTPException(status_code=400, detail="Branch not found in this company")
    return branch.id


def branch_names_for(db: Session, rows: Sequence[InventoryWarehouse]) -> dict[str, str]:
    ids = {row.branch_id for row in rows if row.branch_id}
    if not ids:
        return {}
    found = db.query(HrmBranch).filter(HrmBranch.id.in_(ids)).all()
    return {row.id: row.name for row in found}


def list_warehouses(
    db: Session,
    *,
    company_id: str,
    is_active: Optional[bool] = None,
    q: Optional[str] = None,
) -> Sequence[InventoryWarehouse]:
    query = db.query(InventoryWarehouse).filter(InventoryWarehouse.company_id == company_id)
    if is_active is not None:
        query = query.filter(InventoryWarehouse.is_active.is_(is_active))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (InventoryWarehouse.name.ilike(like))
            | (InventoryWarehouse.code.ilike(like))
            | (InventoryWarehouse.type.ilike(like))
            | (InventoryWarehouse.address.ilike(like))
            | (InventoryWarehouse.city.ilike(like))
            | (InventoryWarehouse.mobile.ilike(like))
            | (InventoryWarehouse.email.ilike(like))
        )
    return query.order_by(
        InventoryWarehouse.sort_order.asc(), InventoryWarehouse.name.asc()
    ).all()


def get_warehouse(
    db: Session, warehouse_id: str, company_id: Optional[str] = None
) -> InventoryWarehouse:
    row = db.get(InventoryWarehouse, warehouse_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return row


def _clear_other_defaults(db: Session, company_id: str, keep_id: Optional[str]) -> None:
    query = db.query(InventoryWarehouse).filter(
        InventoryWarehouse.company_id == company_id,
        InventoryWarehouse.is_default.is_(True),
    )
    if keep_id:
        query = query.filter(InventoryWarehouse.id != keep_id)
    for row in query.all():
        row.is_default = False


def create_warehouse(db: Session, payload: WarehouseCreate) -> InventoryWarehouse:
    code = payload.code.strip()
    dup = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == payload.company_id,
            func.lower(InventoryWarehouse.code) == code.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Warehouse code already exists")

    row = InventoryWarehouse(
        company_id=payload.company_id,
        branch_id=_resolve_branch_id(db, payload.company_id, payload.branch_id),
        code=code,
        name=payload.name.strip(),
        type=payload.type,
        address=_clean_opt(payload.address),
        city=_clean_opt(payload.city),
        state=_clean_opt(payload.state),
        zip_code=_clean_opt(payload.zip_code),
        country=_clean_opt(payload.country),
        mobile=_clean_opt(payload.mobile),
        alternate_contact=_clean_opt(payload.alternate_contact),
        email=_clean_opt(payload.email),
        website=_clean_opt(payload.website),
        invoice_layout=_clean_opt(payload.invoice_layout),
        payment_option=_clean_opt(payload.payment_option),
        is_active=payload.is_active,
        is_default=payload.is_default,
        is_rma_store=payload.is_rma_store,
        is_supplier_transit=payload.is_supplier_transit,
        sort_order=payload.sort_order,
    )
    db.add(row)
    db.flush()
    if payload.is_default:
        _clear_other_defaults(db, payload.company_id, row.id)
    db.commit()
    db.refresh(row)
    return row


def update_warehouse(
    db: Session, warehouse_id: str, payload: WarehouseUpdate, *, company_id: str
) -> InventoryWarehouse:
    row = get_warehouse(db, warehouse_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    if "branch_id" in data:
        data["branch_id"] = _resolve_branch_id(db, company_id, data.get("branch_id"))
    if data.get("code") is not None:
        code = data["code"].strip()
        dup = (
            db.query(InventoryWarehouse)
            .filter(
                InventoryWarehouse.company_id == company_id,
                func.lower(InventoryWarehouse.code) == code.lower(),
                InventoryWarehouse.id != warehouse_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Warehouse code already exists")
        data["code"] = code
    if data.get("name") is not None:
        data["name"] = data["name"].strip()
    for key in _CONTACT_FIELDS:
        if key in data:
            data[key] = _clean_opt(data[key])

    # Never leave the company without a default warehouse.
    if data.get("is_default") is False and row.is_default:
        raise HTTPException(
            status_code=409,
            detail="Cannot unset the default warehouse — set another warehouse as default instead",
        )
    if data.get("is_active") is False and row.is_default:
        raise HTTPException(
            status_code=409,
            detail="Cannot deactivate the default warehouse — set another warehouse as default first",
        )

    for key, value in data.items():
        setattr(row, key, value)

    if data.get("is_default") is True:
        _clear_other_defaults(db, company_id, warehouse_id)

    db.commit()
    db.refresh(row)
    return row


def _repoint(db: Session, model, attr, from_id: str, to_id: str) -> None:
    db.query(model).filter(attr == from_id).update({attr: to_id}, synchronize_session=False)


def delete_warehouse(db: Session, warehouse_id: str, *, company_id: str) -> None:
    row = get_warehouse(db, warehouse_id, company_id=company_id)
    others = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == company_id,
            InventoryWarehouse.id != warehouse_id,
        )
        .order_by(
            InventoryWarehouse.is_default.desc(),
            InventoryWarehouse.sort_order.asc(),
            InventoryWarehouse.name.asc(),
        )
        .all()
    )
    if not others:
        raise HTTPException(status_code=409, detail="Cannot delete the last location")

    qty_row = (
        db.query(
            func.coalesce(func.sum(InventoryStockLevel.on_hand), 0),
            func.coalesce(func.sum(InventoryStockLevel.reserved), 0),
        )
        .filter(InventoryStockLevel.warehouse_id == warehouse_id)
        .first()
    )
    on_hand = int(qty_row[0] or 0) + int(qty_row[1] or 0)
    if on_hand:
        raise HTTPException(
            status_code=409,
            detail=f"Move or adjust {on_hand} unit(s) off this location before deleting it",
        )

    fallback = others[0]
    if row.is_default:
        fallback.is_default = True
        row.is_default = False

    _repoint(db, PurchaseOrder, PurchaseOrder.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, PurchaseReceipt, PurchaseReceipt.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, SalesOrder, SalesOrder.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, SalesDelivery, SalesDelivery.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, PosSession, PosSession.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, PosTerminal, PosTerminal.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, PosCart, PosCart.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, ServiceJob, ServiceJob.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, ServiceJobLine, ServiceJobLine.warehouse_id, warehouse_id, fallback.id)
    _repoint(db, InventoryItem, InventoryItem.default_warehouse_id, warehouse_id, fallback.id)

    db.execute(
        text(
            """
            DELETE FROM inventory_stock_adjustment_serials
            WHERE adjustment_id IN (
                SELECT id FROM inventory_stock_adjustments WHERE warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_adjustment_lines
            WHERE adjustment_id IN (
                SELECT id FROM inventory_stock_adjustments WHERE warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_adjustment_events
            WHERE adjustment_id IN (
                SELECT id FROM inventory_stock_adjustments WHERE warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text("DELETE FROM inventory_stock_adjustments WHERE warehouse_id = :wid"),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_transfer_serials
            WHERE transfer_id IN (
                SELECT id FROM inventory_stock_transfers
                WHERE from_warehouse_id = :wid OR to_warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_transfer_lines
            WHERE transfer_id IN (
                SELECT id FROM inventory_stock_transfers
                WHERE from_warehouse_id = :wid OR to_warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_transfer_events
            WHERE transfer_id IN (
                SELECT id FROM inventory_stock_transfers
                WHERE from_warehouse_id = :wid OR to_warehouse_id = :wid
            )
            """
        ),
        {"wid": warehouse_id},
    )
    db.execute(
        text(
            """
            DELETE FROM inventory_stock_transfers
            WHERE from_warehouse_id = :wid OR to_warehouse_id = :wid
            """
        ),
        {"wid": warehouse_id},
    )
    db.query(InventoryIncoming).filter(InventoryIncoming.warehouse_id == warehouse_id).delete(
        synchronize_session=False
    )
    db.query(InventoryReservation).filter(InventoryReservation.warehouse_id == warehouse_id).delete(
        synchronize_session=False
    )
    db.query(InventoryStockLevel).filter(InventoryStockLevel.warehouse_id == warehouse_id).delete(
        synchronize_session=False
    )

    try:
        db.flush()
        db.delete(row)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This location is still used by other records and cannot be deleted",
        ) from None
