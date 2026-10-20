"""Additive RMA / service-job schema patches for existing databases."""

from __future__ import annotations

from sqlalchemy import text

from app.database import engine
from app.models.rma import RmaReason
from app.services.rma.constants import DEFAULT_REASONS


def ensure_rma_columns() -> None:
    statements = [
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS rma_type VARCHAR(20) NOT NULL DEFAULT 'customer'",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS reason_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS claim_group_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS order_source VARCHAR(20) NOT NULL DEFAULT 'commerce'",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS location_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS expected_return_date DATE",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS courier VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS internal_notes TEXT",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS physical_condition VARCHAR(30)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS functional_result VARCHAR(20)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS qc_result VARCHAR(30)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS inspected_by VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMP",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS inspection_notes TEXT",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS service_job_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS refund_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS replacement_item_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS replacement_sku VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS replacement_warehouse_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS custody_state VARCHAR(24)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS unit_received BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS complaint_decision VARCHAR(24)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS complaint_decided_by VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS complaint_decided_by_name VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS complaint_decided_at TIMESTAMP",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS complaint_decision_reason TEXT",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS promised_delivery_date DATE",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS charge_estimate NUMERIC(14,2) NOT NULL DEFAULT 0",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS diagnosis_required BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS diagnosis_report TEXT",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS purchase_receipt_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS purchase_receipt_no VARCHAR(50)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS purchase_bill_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS purchase_bill_no VARCHAR(50)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS vendor_invoice_no VARCHAR(100)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS supplier_source VARCHAR(10) NOT NULL DEFAULT 'none'",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS supplier_override_reason TEXT",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS prior_rma_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS receipt_no VARCHAR(32)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS receipt_print_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS receipt_last_printed_at TIMESTAMP",
        "ALTER TABLE rma_stock_events ADD COLUMN IF NOT EXISTS dest_warehouse_id VARCHAR(36)",
        "ALTER TABLE rma_tickets ADD COLUMN IF NOT EXISTS received_serial_number VARCHAR(128)",
        "ALTER TABLE inventory_serials ADD COLUMN IF NOT EXISTS replaces_serial VARCHAR(128)",
        "ALTER TABLE inventory_serials ADD COLUMN IF NOT EXISTS replaced_by_serial VARCHAR(128)",
        "CREATE INDEX IF NOT EXISTS ix_inventory_serials_replaces_serial ON inventory_serials (replaces_serial)",
        "CREATE INDEX IF NOT EXISTS ix_inventory_serials_replaced_by_serial ON inventory_serials (replaced_by_serial)",
        "CREATE INDEX IF NOT EXISTS ix_rma_tickets_custody_state ON rma_tickets (custody_state)",
        "CREATE INDEX IF NOT EXISTS ix_rma_tickets_supplier_id ON rma_tickets (supplier_id)",
        "CREATE INDEX IF NOT EXISTS ix_rma_tickets_assigned_to_user_id ON rma_tickets (assigned_to_user_id)",
        "CREATE INDEX IF NOT EXISTS ix_rma_tickets_rma_type ON rma_tickets (rma_type)",
        "CREATE INDEX IF NOT EXISTS ix_rma_tickets_service_job_id ON rma_tickets (service_job_id)",
        "ALTER TABLE rma_tickets ALTER COLUMN status TYPE VARCHAR(30)",
        "ALTER TABLE IF EXISTS rma_settlements ADD COLUMN IF NOT EXISTS reverses_id VARCHAR(36)",
        "ALTER TABLE IF EXISTS rma_settlements ADD COLUMN IF NOT EXISTS reversed_by_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def seed_rma_reasons(db, company_id: str = "default") -> int:
    existing = {
        row.code
        for row in db.query(RmaReason).filter(RmaReason.company_id == company_id).all()
    }
    inserted = 0
    for index, (code, name, category) in enumerate(DEFAULT_REASONS):
        if code in existing:
            continue
        db.add(
            RmaReason(
                company_id=company_id,
                code=code,
                name=name,
                category=category,
                sort_order=index,
            )
        )
        inserted += 1
    if inserted:
        db.flush()
    return inserted
