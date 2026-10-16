"""Seed demo ZKTeco punch logs so Biometric Attendance UI has sample rows.

No physical device required. Idempotent via unique (serial, employee_code, punch_time).

Run:
    docker compose exec api python scripts/seed_hrm_biometric_demo.py
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

import scripts.init_db  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models.hrm.org import HrmEmployee
from app.models.zkteco_plugin import ZktecoAttendanceLog, ZktecoPlugin
from scripts.init_db import ensure_zkteco_plugin_columns
from sqlalchemy.dialects.postgresql import insert

DEMO_SN = "DEMOF22001"
COMPANY_ID = "default"


def _punch(
    *,
    employee_code: str,
    when: datetime,
    verify_mode: int,
    inout_mode: int,
) -> dict:
    return {
        "serial_number": DEMO_SN,
        "employee_code": employee_code,
        "punch_time": when,
        "verify_mode": verify_mode,
        "inout_mode": inout_mode,
        "source_table": "ATTLOG",
        "raw_payload": f"demo|{employee_code}|{when.isoformat(sep=' ')}",
        "received_at": when,
    }


def _day_samples(on: date) -> list[dict]:
    """Varied punch patterns for one calendar day."""
    y, m, d = on.year, on.month, on.day
    rows: list[dict] = []

    # Matched: VERIFY Manager Ali (biometric 1001) — full day with break
    rows.extend(
        [
            _punch(
                employee_code="1001",
                when=datetime(y, m, d, 9, 2, 11),
                verify_mode=1,
                inout_mode=0,
            ),
            _punch(
                employee_code="1001",
                when=datetime(y, m, d, 13, 1, 5),
                verify_mode=15,
                inout_mode=1,
            ),
            _punch(
                employee_code="1001",
                when=datetime(y, m, d, 14, 5, 40),
                verify_mode=15,
                inout_mode=0,
            ),
            _punch(
                employee_code="1001",
                when=datetime(y, m, d, 18, 12, 3),
                verify_mode=1,
                inout_mode=1,
            ),
        ]
    )

    # Matched: Yeasin (BIO-1003) — simple in/out
    rows.extend(
        [
            _punch(
                employee_code="BIO-1003",
                when=datetime(y, m, d, 9, 15, 22),
                verify_mode=15,
                inout_mode=0,
            ),
            _punch(
                employee_code="BIO-1003",
                when=datetime(y, m, d, 17, 45, 8),
                verify_mode=15,
                inout_mode=1,
            ),
        ]
    )

    # Matched if Ayesha has biometric 2001 — single clock-in (still at office)
    rows.append(
        _punch(
            employee_code="2001",
            when=datetime(y, m, d, 8, 55, 0),
            verify_mode=1,
            inout_mode=0,
        )
    )

    # Unmatched device user — shows as unmatched row in UI
    rows.extend(
        [
            _punch(
                employee_code="9999",
                when=datetime(y, m, d, 10, 30, 15),
                verify_mode=2,
                inout_mode=0,
            ),
            _punch(
                employee_code="9999",
                when=datetime(y, m, d, 16, 0, 0),
                verify_mode=2,
                inout_mode=1,
            ),
        ]
    )

    return rows


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_zkteco_plugin_columns()

    today = date.today()
    days = [today - timedelta(days=1), today]

    with SessionLocal() as db:
        # Ensure Ayesha can match sample code 2001
        ayesha = (
            db.query(HrmEmployee)
            .filter(
                HrmEmployee.company_id == COMPANY_ID,
                HrmEmployee.name.ilike("%Ayesha%"),
            )
            .first()
        )
        if ayesha and not (ayesha.biometric_emp_id or "").strip():
            ayesha.biometric_emp_id = "2001"
            print(f"Set biometric_emp_id=2001 on {ayesha.name}")

        plugin = db.query(ZktecoPlugin).filter(ZktecoPlugin.id == "zkteco-default").first()
        if plugin is None:
            plugin = ZktecoPlugin(id="zkteco-default", company_id=COMPANY_ID)
            db.add(plugin)
        plugin.installed = True
        plugin.enabled = True
        plugin.receiver_enabled = True
        plugin.device_name = "F22 Demo"
        plugin.device_serial_number = DEMO_SN
        plugin.connection_status = "demo"
        plugin.connection_message = "Demo punches seeded (no physical device)"
        plugin.last_device_sn = DEMO_SN
        plugin.last_device_seen_at = datetime.now().replace(microsecond=0)

        inserted = 0
        for on in days:
            for values in _day_samples(on):
                result = db.execute(
                    insert(ZktecoAttendanceLog)
                    .values(**values)
                    .on_conflict_do_nothing(
                        constraint="uq_zkteco_device_employee_time",
                    )
                )
                if result.rowcount:
                    inserted += 1

        db.commit()
        print(f"Seeded biometric demo punches: +{inserted} new rows for {[d.isoformat() for d in days]}")
        print(f"Open: /hrm/attendance/biometric (date {today.isoformat()})")


if __name__ == "__main__":
    main()
