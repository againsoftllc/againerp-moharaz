"""Parsers for ZKTeco push payloads: classic ATTLOG and ACC rtlog/transaction."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger("zkteco.parser")

_MAX_EMPLOYEE_CODE_LEN = 50

_TIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
)


@dataclass
class PunchRecord:
    """A single parsed attendance punch, ready to be persisted."""

    employee_code: str
    punch_time: datetime
    verify_mode: int | None = None
    inout_mode: int | None = None
    raw: str = ""


def _parse_time(value: str) -> datetime | None:
    value = value.strip()
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value).replace(microsecond=0, tzinfo=None)
    except ValueError:
        return None


def _to_int(value: str | None) -> int | None:
    if value is None or value.strip() == "":
        return None
    try:
        return int(value.strip())
    except ValueError:
        return None


def parse_attlog(body: str) -> list[PunchRecord]:
    """Parse classic ATTLOG lines:

    PIN \\t YYYY-MM-DD HH:MM:SS [\\t VerifyMode [\\t InOutMode [\\t WorkCode]]]
    """
    records: list[PunchRecord] = []
    for line in body.splitlines():
        line = line.strip("\r").strip()
        if not line:
            continue
        cols = line.split("\t")
        if len(cols) < 2:
            logger.warning("ATTLOG: skipping malformed line: %r", line[:200])
            continue
        pin = cols[0].strip()
        punch_time = _parse_time(cols[1])
        if not pin or punch_time is None:
            logger.warning("ATTLOG: skipping line with bad pin/time: %r", line[:200])
            continue
        records.append(
            PunchRecord(
                employee_code=pin[:_MAX_EMPLOYEE_CODE_LEN],
                punch_time=punch_time.replace(microsecond=0),
                verify_mode=_to_int(cols[2]) if len(cols) > 2 else None,
                inout_mode=_to_int(cols[3]) if len(cols) > 3 else None,
                raw=line,
            ),
        )
    return records


def parse_rtlog(body: str) -> list[PunchRecord]:
    """Parse ACC rtlog / transaction lines (tab-separated key=value pairs)."""
    records: list[PunchRecord] = []
    for line in body.splitlines():
        line = line.strip("\r").strip()
        if not line:
            continue
        fields: dict[str, str] = {}
        for part in line.split("\t"):
            if "=" in part:
                key, value = part.split("=", 1)
                fields[key.strip().lower()] = value.strip()

        pin = fields.get("pin")
        time_raw = fields.get("time")
        if not time_raw or not pin or pin == "0":
            logger.debug("rtlog: skipping non-punch line: %r", line[:200])
            continue
        punch_time = _parse_time(time_raw)
        if punch_time is None:
            logger.warning("rtlog: skipping line with unparsable time: %r", line[:200])
            continue
        records.append(
            PunchRecord(
                employee_code=pin[:_MAX_EMPLOYEE_CODE_LEN],
                punch_time=punch_time.replace(microsecond=0),
                verify_mode=_to_int(fields.get("verifytype")),
                inout_mode=_to_int(fields.get("inoutstatus")),
                raw=line,
            ),
        )
    return records
