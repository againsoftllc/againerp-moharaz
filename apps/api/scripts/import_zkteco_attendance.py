"""One-time/idempotent import from the standalone ZKTeco test database.

Run from apps/api:
    .venv\\Scripts\\python.exe scripts\\import_zkteco_attendance.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

import scripts.init_db  # noqa: F401 — register all ORM metadata
from app.database import Base, SessionLocal, engine
from app.models.zkteco_plugin import ZktecoAttendanceLog, ZktecoPlugin
from scripts.init_db import ensure_zkteco_plugin_columns

SOURCE_URL = os.getenv(
    "ZKTECO_LEGACY_DATABASE_URL",
    "postgresql://zkteco:zkteco@127.0.0.1:5432/zkteco",
)
PLUGIN_ID = "zkteco-default"
REAL_DEVICE_SN = "JJA1254800682"


def _naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=None)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_zkteco_plugin_columns()

    with psycopg.connect(SOURCE_URL) as source:
        with source.cursor() as cursor:
            cursor.execute(
                """
                SELECT serial_number, employee_code, punch_time, verify_mode,
                       inout_mode, source_table, raw_payload, received_at
                FROM attendance_logs
                ORDER BY id
                """,
            )
            source_rows = cursor.fetchall()

    with SessionLocal() as db:
        # Remove only the synthetic row created by the Phase 1 smoke test.
        db.execute(
            delete(ZktecoAttendanceLog).where(
                ZktecoAttendanceLog.serial_number == "TESTSN001",
            ),
        )

        imported = 0
        for row in source_rows:
            result = db.execute(
                insert(ZktecoAttendanceLog)
                .values(
                    serial_number=str(row[0]).strip().upper(),
                    employee_code=str(row[1]).strip(),
                    punch_time=_naive(row[2]),
                    verify_mode=row[3],
                    inout_mode=row[4],
                    source_table=row[5] or "",
                    raw_payload=row[6] or "",
                    received_at=_naive(row[7]),
                )
                .on_conflict_do_nothing(
                    constraint="uq_zkteco_device_employee_time",
                ),
            )
            if result.rowcount and result.rowcount > 0:
                imported += int(result.rowcount)

        plugin = db.get(ZktecoPlugin, PLUGIN_ID)
        if plugin is None:
            plugin = ZktecoPlugin(id=PLUGIN_ID)
            db.add(plugin)
        plugin.installed = True
        plugin.enabled = True
        plugin.receiver_enabled = True
        plugin.allowed_serials = REAL_DEVICE_SN
        plugin.raw_traffic_enabled = True
        plugin.device_name = "F22"
        plugin.device_serial_number = REAL_DEVICE_SN
        plugin.firmware_version = "6.60"
        plugin.push_version = "3.1.2"
        plugin.server_address = os.getenv(
            "ZKTECO_ADMS_SERVER_ADDRESS",
            "192.168.10.46",
        )
        plugin.server_port = int(os.getenv("ZKTECO_ADMS_SERVER_PORT", "7074"))
        plugin.https_enabled = False
        plugin.connection_status = "disconnected"
        plugin.connection_message = (
            "Real F22 configuration loaded; waiting for the device to contact "
            "AgainERP ADMS receiver"
        )
        db.commit()

        total = db.query(ZktecoAttendanceLog).count()
        print(
            f"Source rows: {len(source_rows)}; newly imported: {imported}; "
            f"AgainERP total: {total}",
        )


if __name__ == "__main__":
    main()
