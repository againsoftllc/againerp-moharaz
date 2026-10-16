"""Additive service-job patches for databases that already have the thin table."""

from __future__ import annotations

from sqlalchemy import text

from app.database import engine


def ensure_service_job_columns() -> None:
    statements = [
        "ALTER TABLE service_jobs ALTER COLUMN status TYPE VARCHAR(30)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NOT NULL DEFAULT ''",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS brand VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS model VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS imei VARCHAR(32)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal'",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS technician_id VARCHAR(36)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS technician_name VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS expected_at TIMESTAMP",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS delivered_by VARCHAR(100)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(100)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS condition_notes TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS diagnosis TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS diagnosis_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS found_problems TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS recommended_action TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(8,2) NOT NULL DEFAULT 0",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'not_required'",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS approval_note TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS qc_status VARCHAR(20) NOT NULL DEFAULT 'not_required'",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS qc_notes TEXT",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS qc_checked_by VARCHAR(100)",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS qc_checked_at TIMESTAMP",
        "ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)",
        "CREATE INDEX IF NOT EXISTS ix_service_jobs_technician_id ON service_jobs (technician_id)",
        "CREATE INDEX IF NOT EXISTS ix_service_jobs_priority ON service_jobs (priority)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
