from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmAttendanceRecord
from app.models.hrm.org import HrmDesignation, HrmEmployee
from app.models.zkteco_plugin import ZktecoAttendanceLog
from app.schemas.hrm.biometric import (
    BiometricDayRecordRead,
    BiometricPunchRead,
    BiometricSyncResult,
    BiometricUnmatchedCode,
)

# Common ZKTeco verify_mode values
_VERIFY_MAP = {
    0: "Password",
    1: "Fingerprint",
    2: "Card",
    3: "Password",
    4: "Card",
    15: "Face",
    200: "Face",
}


def _pad2(n: int) -> str:
    return f"{n:02d}"


def _hhmmss(dt: datetime) -> str:
    return f"{_pad2(dt.hour)}:{_pad2(dt.minute)}:{_pad2(dt.second)}"


def _verify_label(mode: Optional[int]) -> str:
    if mode is None:
        return "Fingerprint"
    return _VERIFY_MAP.get(mode, "Fingerprint")


def _is_clock_in(index: int, inout_mode: Optional[int], total: int) -> bool:
    """Prefer device inout_mode; else alternate starting with Clock In."""
    if inout_mode is not None:
        # 0 / 4 typically check-in; 1 / 5 check-out on many ZK firmwares
        if inout_mode in (0, 2, 4):
            return True
        if inout_mode in (1, 3, 5):
            return False
    return index % 2 == 0


def _terminal_label(serial: str) -> str:
    sn = (serial or "").strip()
    if not sn:
        return "ZKTeco"
    return f"ZKTeco-{sn[-4:]}" if len(sn) >= 4 else f"ZKTeco-{sn}"


def _employee_map_by_biometric(db: Session, company_id: str) -> dict[str, HrmEmployee]:
    rows = (
        db.query(HrmEmployee)
        .filter(
            HrmEmployee.company_id == company_id,
            HrmEmployee.biometric_emp_id.isnot(None),
            HrmEmployee.biometric_emp_id != "",
        )
        .all()
    )
    out: dict[str, HrmEmployee] = {}
    for row in rows:
        code = (row.biometric_emp_id or "").strip()
        if code:
            out[code.lower()] = row
            out[code] = row
    return out


def _designation_names(db: Session, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = db.query(HrmDesignation).filter(HrmDesignation.id.in_(list(ids))).all()
    return {r.id: r.name for r in rows}


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    return datetime.combine(d, time.min), datetime.combine(d, time.max)


def list_biometric_day_records(
    db: Session,
    *,
    company_id: str,
    on_date: date,
    q: Optional[str] = None,
) -> list[BiometricDayRecordRead]:
    start, end = _day_bounds(on_date)
    punches = (
        db.query(ZktecoAttendanceLog)
        .filter(
            ZktecoAttendanceLog.punch_time >= start,
            ZktecoAttendanceLog.punch_time <= end,
        )
        .order_by(ZktecoAttendanceLog.punch_time.asc(), ZktecoAttendanceLog.id.asc())
        .all()
    )
    if not punches:
        return []

    emp_by_code = _employee_map_by_biometric(db, company_id)
    grouped: dict[str, list[ZktecoAttendanceLog]] = defaultdict(list)
    for p in punches:
        key = (p.employee_code or "").strip()
        grouped[key].append(p)

    # Existing attendance for sync status
    emp_ids = {e.id for e in emp_by_code.values()}
    existing: dict[tuple[str, date], HrmAttendanceRecord] = {}
    if emp_ids:
        for rec in (
            db.query(HrmAttendanceRecord)
            .filter(
                HrmAttendanceRecord.company_id == company_id,
                HrmAttendanceRecord.date == on_date,
                HrmAttendanceRecord.employee_id.in_(list(emp_ids)),
            )
            .all()
        ):
            if rec.employee_id:
                existing[(rec.employee_id, on_date)] = rec

    desig_ids = {
        e.designation_id
        for e in emp_by_code.values()
        if e.designation_id
    }
    desig_names = _designation_names(db, desig_ids)

    ymd = on_date.isoformat()
    records: list[BiometricDayRecordRead] = []

    for code, logs in grouped.items():
        emp = emp_by_code.get(code) or emp_by_code.get(code.lower())
        punch_reads: list[BiometricPunchRead] = []
        for i, log in enumerate(logs):
            clock_in = _is_clock_in(i, log.inout_mode, len(logs))
            punch_reads.append(
                BiometricPunchRead(
                    id=str(log.id),
                    time=_hhmmss(log.punch_time),
                    status="Clock In" if clock_in else "Clock Out",
                    verify_type=_verify_label(log.verify_mode),
                    terminal=_terminal_label(log.serial_number),
                    punch_time=log.punch_time.isoformat(sep=" "),
                    employee_code=log.employee_code,
                    serial_number=log.serial_number,
                    matched=emp is not None,
                )
            )

        clock_in = punch_reads[0].time if punch_reads else ""
        clock_out = punch_reads[-1].time if len(punch_reads) > 1 else ""
        # Prefer last Clock Out for clock_out display
        outs = [p for p in punch_reads if p.status == "Clock Out"]
        if outs:
            clock_out = outs[-1].time
        ins = [p for p in punch_reads if p.status == "Clock In"]
        if ins:
            clock_in = ins[0].time

        terminal = punch_reads[-1].terminal if punch_reads else ""

        if emp:
            att = existing.get((emp.id, on_date))
            status = "synced" if att else "pending"
            records.append(
                BiometricDayRecordRead(
                    id=f"{emp.id}_{ymd}",
                    employee_id=emp.id,
                    employee_name=emp.name,
                    employee_code=emp.biometric_emp_id or emp.employee_code or code,
                    designation=desig_names.get(emp.designation_id or "", "") or "—",
                    date=ymd,
                    clock_in=clock_in,
                    clock_out=clock_out,
                    total_entries=len(punch_reads),
                    punches=punch_reads,
                    status=status,
                    terminal=terminal,
                    attendance_record_id=att.id if att else None,
                )
            )
        else:
            records.append(
                BiometricDayRecordRead(
                    id=f"unmatched_{code}_{ymd}",
                    employee_id=None,
                    employee_name=f"Unmatched ({code})",
                    employee_code=code,
                    designation="—",
                    date=ymd,
                    clock_in=clock_in,
                    clock_out=clock_out,
                    total_entries=len(punch_reads),
                    punches=punch_reads,
                    status="failed",
                    terminal=terminal,
                    attendance_record_id=None,
                )
            )

    if q:
        like = q.strip().lower()
        records = [
            r
            for r in records
            if like in r.employee_name.lower()
            or like in r.employee_code.lower()
            or like in r.designation.lower()
            or like in r.terminal.lower()
        ]

    records.sort(key=lambda r: (r.status == "failed", r.employee_name.lower()))
    return records


def sync_biometric_to_attendance(
    db: Session,
    *,
    company_id: str,
    on_date: date,
    employee_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> BiometricSyncResult:
    day_rows = list_biometric_day_records(db, company_id=company_id, on_date=on_date)
    synced = 0
    skipped = 0
    unmatched = 0
    ids: list[str] = []

    for row in day_rows:
        if not row.employee_id:
            unmatched += 1
            continue
        if employee_id and row.employee_id != employee_id:
            continue
        if not row.punches:
            skipped += 1
            continue

        first = row.punches[0]
        last = row.punches[-1]
        clock_in = row.clock_in or first.time
        clock_out = row.clock_out or (last.time if len(row.punches) > 1 else "")

        total_hours = Decimal("0")
        if clock_in and clock_out:
            try:
                tin = datetime.strptime(f"{on_date.isoformat()} {clock_in}", "%Y-%m-%d %H:%M:%S")
                tout = datetime.strptime(f"{on_date.isoformat()} {clock_out}", "%Y-%m-%d %H:%M:%S")
                if tout > tin:
                    total_hours = Decimal(str(round((tout - tin).total_seconds() / 3600.0, 2)))
            except ValueError:
                pass

        biometric_id = f"zk:{row.employee_code}:{on_date.isoformat()}"
        existing = (
            db.query(HrmAttendanceRecord)
            .filter(
                HrmAttendanceRecord.company_id == company_id,
                HrmAttendanceRecord.employee_id == row.employee_id,
                HrmAttendanceRecord.date == on_date,
            )
            .first()
        )
        if existing:
            existing.clock_in = clock_in or existing.clock_in
            existing.clock_out = clock_out or existing.clock_out
            existing.total_hours = total_hours
            existing.biometric_id = biometric_id
            existing.is_absent = False
            note = (existing.notes or "").strip()
            if "ZKTeco" not in note:
                existing.notes = f"{note}; Synced from ZKTeco".strip("; ").strip()
            ids.append(existing.id)
            synced += 1
        else:
            rec = HrmAttendanceRecord(
                company_id=company_id,
                employee_id=row.employee_id,
                biometric_id=biometric_id,
                date=on_date,
                clock_in=clock_in or None,
                clock_out=clock_out or None,
                total_hours=total_hours,
                is_absent=False,
                status="present",
                notes="Synced from ZKTeco",
                created_by=created_by,
            )
            # status field may expect active — use present if allowed else active
            # Model default is "active"; keep active for consistency with other HRM screens
            rec.status = "active"
            db.add(rec)
            db.flush()
            ids.append(rec.id)
            synced += 1

    db.commit()
    return BiometricSyncResult(
        synced=synced,
        skipped=skipped,
        unmatched=unmatched,
        attendance_record_ids=ids,
    )


def list_unmatched_codes(
    db: Session,
    *,
    company_id: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> list[BiometricUnmatchedCode]:
    emp_by_code = _employee_map_by_biometric(db, company_id)
    known = {c.lower() for c in emp_by_code.keys()}

    query = db.query(ZktecoAttendanceLog)
    if from_date:
        query = query.filter(
            ZktecoAttendanceLog.punch_time >= datetime.combine(from_date, time.min)
        )
    if to_date:
        query = query.filter(
            ZktecoAttendanceLog.punch_time <= datetime.combine(to_date, time.max)
        )
    rows = query.order_by(ZktecoAttendanceLog.punch_time.desc()).all()

    agg: dict[str, dict] = {}
    for row in rows:
        code = (row.employee_code or "").strip()
        if not code or code.lower() in known:
            continue
        bucket = agg.setdefault(
            code,
            {"count": 0, "last": None, "sns": set()},
        )
        bucket["count"] += 1
        if bucket["last"] is None or row.punch_time > bucket["last"]:
            bucket["last"] = row.punch_time
        bucket["sns"].add(row.serial_number)

    out: list[BiometricUnmatchedCode] = []
    for code, info in sorted(agg.items(), key=lambda x: -x[1]["count"]):
        last = info["last"]
        out.append(
            BiometricUnmatchedCode(
                employee_code=code,
                punch_count=info["count"],
                last_punch_at=last.isoformat(sep=" ") if last else None,
                serial_numbers=sorted(info["sns"]),
            )
        )
    return out


def enrich_punches_with_employees(
    db: Session, *, company_id: str, items: list[dict]
) -> list[dict]:
    """Attach employee_id / employee_name onto raw ZK punch dicts."""
    emp_by_code = _employee_map_by_biometric(db, company_id)
    enriched = []
    for item in items:
        code = (item.get("employee_code") or "").strip()
        emp = emp_by_code.get(code) or emp_by_code.get(code.lower())
        row = dict(item)
        row["employee_id"] = emp.id if emp else None
        row["employee_name"] = emp.name if emp else None
        row["matched"] = emp is not None
        enriched.append(row)
    return enriched
