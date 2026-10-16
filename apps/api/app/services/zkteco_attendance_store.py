"""Persists punches into zkteco_attendance_logs (idempotent upserts)."""

from __future__ import annotations

import logging
from datetime import date, datetime, time
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.zkteco_plugin import ZktecoAttendanceLog, ZktecoPlugin
from app.services.zkteco_parser import PunchRecord

logger = logging.getLogger("zkteco.db")

PLUGIN_ID = "zkteco-default"
CONSTRAINT = "uq_zkteco_device_employee_time"


def plugin_allows_persist(db: Session, serial_number: str) -> bool:
    row = db.get(ZktecoPlugin, PLUGIN_ID)
    if not row or not row.installed or not row.enabled or not row.receiver_enabled:
        return False
    allowed = (row.allowed_serials or "").strip()
    if not allowed:
        return True
    sn = serial_number.strip().upper()
    allowed_set = {part.strip().upper() for part in allowed.replace(";", ",").split(",") if part.strip()}
    return sn in allowed_set


def touch_device_seen(db: Session, serial_number: str) -> None:
    row = db.get(ZktecoPlugin, PLUGIN_ID)
    if not row:
        return
    row.last_device_seen_at = datetime.utcnow()
    row.last_device_sn = serial_number.strip().upper()
    if row.connection_status != "connected":
        row.connection_status = "connected"
        row.connection_message = f"Device {row.last_device_sn} contacted ADMS receiver"
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to update last_device_seen")


def save_punches(
    db: Session,
    serial_number: str,
    punches: list[PunchRecord],
    source_table: str | None = None,
) -> int:
    if not punches:
        return 0
    if not plugin_allows_persist(db, serial_number):
        logger.info(
            "Skipping %d punch(es) for SN %s (plugin disabled or SN not allowed)",
            len(punches),
            serial_number,
        )
        return 0

    saved = 0
    sn = serial_number.strip().upper()
    for punch in punches:
        stmt = (
            insert(ZktecoAttendanceLog)
            .values(
                serial_number=sn,
                employee_code=punch.employee_code,
                punch_time=punch.punch_time,
                verify_mode=punch.verify_mode,
                inout_mode=punch.inout_mode,
                source_table=source_table or "",
                raw_payload=punch.raw or "",
            )
            .on_conflict_do_nothing(constraint=CONSTRAINT)
        )
        result = db.execute(stmt)
        if result.rowcount and result.rowcount > 0:
            saved += 1
    db.commit()
    touch_device_seen(db, sn)
    if saved > 0:
        _auto_sync_hrm_attendance(db, punches)
    return saved


def _auto_sync_hrm_attendance(db: Session, punches: list[PunchRecord]) -> None:
    """Best-effort: upsert HRM attendance for punch dates (matched biometric codes)."""
    try:
        from app.services.hrm.biometric_service import sync_biometric_to_attendance

        plugin = db.get(ZktecoPlugin, PLUGIN_ID)
        company_id = (plugin.company_id if plugin else None) or "default"
        dates = sorted({p.punch_time.date() for p in punches if p.punch_time})
        for on_date in dates:
            result = sync_biometric_to_attendance(
                db,
                company_id=company_id,
                on_date=on_date,
                created_by=None,
            )
            logger.info(
                "HRM auto-sync %s: synced=%s unmatched=%s skipped=%s",
                on_date.isoformat(),
                result.synced,
                result.unmatched,
                result.skipped,
            )
    except Exception:
        logger.exception("HRM biometric auto-sync failed (punches still saved)")


def list_punches(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    employee_code: Optional[str] = None,
    serial_number: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> dict[str, Any]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size

    base = select(ZktecoAttendanceLog)
    if employee_code:
        base = base.where(ZktecoAttendanceLog.employee_code.ilike(f"%{employee_code.strip()}%"))
    if serial_number:
        base = base.where(ZktecoAttendanceLog.serial_number == serial_number.strip().upper())
    if from_date:
        base = base.where(ZktecoAttendanceLog.punch_time >= datetime.combine(from_date, time.min))
    if to_date:
        base = base.where(ZktecoAttendanceLog.punch_time <= datetime.combine(to_date, time.max))

    total = int(db.execute(select(func.count()).select_from(base.subquery())).scalar_one())
    rows = (
        db.execute(
            base.order_by(ZktecoAttendanceLog.punch_time.desc(), ZktecoAttendanceLog.id.desc())
            .offset(offset)
            .limit(page_size),
        )
        .scalars()
        .all()
    )

    today = date.today()
    today_count = int(
        db.execute(
            select(func.count())
            .select_from(ZktecoAttendanceLog)
            .where(
                ZktecoAttendanceLog.punch_time >= datetime.combine(today, time.min),
                ZktecoAttendanceLog.punch_time <= datetime.combine(today, time.max),
            ),
        ).scalar_one(),
    )
    device_count = int(
        db.execute(select(func.count(func.distinct(ZktecoAttendanceLog.serial_number)))).scalar_one(),
    )
    all_total = int(db.execute(select(func.count()).select_from(ZktecoAttendanceLog)).scalar_one())

    items = [
        {
            "id": row.id,
            "serial_number": row.serial_number,
            "employee_code": row.employee_code,
            "punch_time": row.punch_time.isoformat(sep=" "),
            "verify_mode": row.verify_mode,
            "inout_mode": row.inout_mode,
            "source_table": row.source_table,
            "raw_payload": row.raw_payload,
            "received_at": row.received_at.isoformat() if row.received_at else None,
        }
        for row in rows
    ]
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "summary": {
            "total_punches": all_total,
            "today_punches": today_count,
            "device_count": device_count,
        },
    }
