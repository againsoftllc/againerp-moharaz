"""ZKTeco ADMS / Security PUSH protocol endpoints (/iclock/*).

Ported from the standalone zkteco test project. Device always gets OK,
even when DB/plugin persist is skipped.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.zkteco_plugin import ZktecoPlugin
from app.services.zkteco_attendance_store import PLUGIN_ID, save_punches, touch_device_seen
from app.services.zkteco_parser import PunchRecord, parse_attlog, parse_rtlog
from app.services.zkteco_session_store import DeviceSession, store
from app.services.zkteco_traffic_log import DEFAULT_TRAFFIC_FILE, append_raw_traffic

logger = logging.getLogger("zkteco.iclock")

router = APIRouter(prefix="/iclock", tags=["zkteco-iclock"])

_BOTH = ["GET", "POST"]


def _query(request: Request, *names: str) -> str | None:
    lowered = {k.lower(): v for k, v in request.query_params.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value is not None:
            return value
    return None


async def _read_body(request: Request) -> str:
    raw = await request.body()
    if not raw:
        return ""
    return raw.decode("utf-8", errors="replace")


def _device_response(text: str, session: DeviceSession | None = None) -> PlainTextResponse:
    response = PlainTextResponse(
        content=text,
        headers={"Cache-Control": "no-store"},
    )
    if session is not None:
        response.headers.append(
            "set-cookie",
            f"JSESSIONID={session.session_id}; Path=/; HttpOnly",
        )
        response.headers.append("set-cookie", f"token={session.token}; Path=/")
    return response


def _ok() -> PlainTextResponse:
    return _device_response("OK")


def _traffic_enabled(db: Session) -> bool:
    row = db.get(ZktecoPlugin, PLUGIN_ID)
    return bool(row and row.raw_traffic_enabled)


def _log_request(request: Request, body: str, db: Session) -> None:
    url = str(request.url.path)
    if request.url.query:
        url += "?" + request.url.query
    preview = body[:500].replace("\t", "\\t").replace("\n", " | ")
    logger.info("%s %s body=%r", request.method, url, preview)
    if _traffic_enabled(db):
        append_raw_traffic(DEFAULT_TRAFFIC_FILE, request.method, url, body)


def _acc_registered_options_block(session: DeviceSession, pushver: str | None) -> str:
    return "\n".join(
        [
            "registry=ok",
            f"RegistryCode={session.registry_code}",
            "ServerVersion=3.1.2",
            "ServerName=againerp-zkteco",
            f"PushProtVer={pushver or session.push_version or '3.1.2'}",
            "ErrorDelay=30",
            "RequestDelay=10",
            "TransTimes=00:00;14:05",
            "TransInterval=1",
            "TransTables=User Transaction",
            "Realtime=1",
            f"SessionID={session.session_id}",
            "TimeoutSec=60",
        ],
    )


def _acc_push_block(session: DeviceSession) -> str:
    return "\n".join(
        [
            "ServerVersion=3.1.2",
            "ServerName=againerp-zkteco",
            "PushVersion=3.1.2",
            "ErrorDelay=30",
            "RequestDelay=10",
            "TransTimes=00:00;14:05",
            "TransInterval=1",
            "TransTables=User Transaction",
            "Realtime=1",
            f"SessionID={session.session_id}",
            "TimeoutSec=60",
        ],
    )


def _att_options_block(sn: str, pushver: str | None, push_options_flag: str | None) -> str:
    lines = [
        f"GET OPTION FROM: {sn}",
        "ATTLOGStamp=0",
        "OPERLOGStamp=0",
        "ATTPHOTOStamp=0",
        "BIODATAStamp=0",
        "ErrorDelay=30",
        "Delay=10",
        "TransTimes=00:00;14:05",
        "TransInterval=1",
        "TransFlag=111111111111",
        "TimeZone=6",
        "Realtime=1",
        "Encrypt=0",
        "ServerVer=3.0.1",
        f"PushProtVer={pushver or '2.4.1'}",
        "SupportPing=1",
    ]
    if push_options_flag == "1":
        lines += [
            "PushOptionsFlag=1",
            "PushOptions=RegDeviceType,FingerFunOn,FaceFunOn,FPVersion,FaceVersion,"
            "NetworkType,HardwareId3,HardwareId5,HardwareId56,LicenseStatus3,"
            "LicenseStatus5,LicenseStatus56",
        ]
    return "\n".join(lines)


def _save_punches(db: Session, sn: str, records: list[PunchRecord], source_table: str) -> None:
    if not records:
        return
    if not sn:
        logger.warning("Punch(es) without SN; skipping %d record(s)", len(records))
        return
    try:
        saved = save_punches(db, sn, records, source_table=source_table)
        logger.info("Persisted %d/%d punch(es) for SN %s", saved, len(records), sn)
    except Exception:
        logger.exception("Failed to save punches for SN %s (device still gets OK)", sn)
        try:
            db.rollback()
        except Exception:
            pass


@router.api_route("/cdata", methods=_BOTH)
async def cdata(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    body = await _read_body(request)
    _log_request(request, body, db)

    sn = (_query(request, "SN") or "").strip()
    device_type = (_query(request, "DeviceType") or "").strip().lower()
    pushver = _query(request, "pushver")
    options = _query(request, "options", "option")
    table = (_query(request, "table") or "").strip()

    session = store.get_or_create(sn) if sn else None
    if session:
        session.touch()
        if pushver:
            session.push_version = pushver
        if device_type:
            session.device_type = device_type
        try:
            touch_device_seen(db, sn)
        except Exception:
            db.rollback()

    if options == "all":
        is_acc = device_type == "acc" or (
            not device_type and session is not None and session.device_type == "acc"
        )
        if is_acc and session is not None:
            if session.registered:
                return _device_response(
                    _acc_registered_options_block(session, pushver),
                    session,
                )
            return _ok()
        return _device_response(
            _att_options_block(sn, pushver, _query(request, "PushOptionsFlag")),
        )

    if table:
        table_lower = table.lower()
        if table_lower == "attlog":
            records = parse_attlog(body)
            _save_punches(db, sn, records, "ATTLOG")
        elif table_lower in ("rtlog", "transaction"):
            records = parse_rtlog(body)
            _save_punches(db, sn, records, table)
        elif table_lower == "rtstate":
            logger.info("rtstate SN=%s acknowledged (not attendance)", sn)
        else:
            logger.info("Unhandled table=%s SN=%s body=%r", table, sn, body[:200])
        return _ok()

    return _ok()


@router.api_route("/registry", methods=_BOTH)
async def registry(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    body = await _read_body(request)
    _log_request(request, body, db)

    sn = (_query(request, "SN") or "").strip()
    if not sn:
        return _ok()

    session = store.get_or_create(sn)
    session.touch()
    session.last_registry_body = body or session.last_registry_body
    if "devicetype=acc" in body.lower():
        session.device_type = "acc"
    session.registered = True
    try:
        touch_device_seen(db, sn)
    except Exception:
        db.rollback()

    return _device_response(f"RegistryCode={session.registry_code}", session)


@router.api_route("/push", methods=_BOTH)
async def push(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    body = await _read_body(request)
    _log_request(request, body, db)

    sn = (_query(request, "SN") or "").strip()
    if not sn:
        return _ok()

    session = store.get_or_create(sn)
    session.touch()
    session.registered = True
    try:
        touch_device_seen(db, sn)
    except Exception:
        db.rollback()
    return _device_response(_acc_push_block(session), session)


@router.get("/getrequest")
async def getrequest(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    _log_request(request, "", db)
    sn = (_query(request, "SN") or "").strip()
    if sn:
        store.get_or_create(sn).touch()
        try:
            touch_device_seen(db, sn)
        except Exception:
            db.rollback()
    return _ok()


@router.api_route("/devicecmd", methods=_BOTH)
async def devicecmd(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    body = await _read_body(request)
    _log_request(request, body, db)
    return _ok()


@router.get("/ping")
async def ping(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    _log_request(request, "", db)
    return _ok()


@router.api_route("/{path:path}", methods=_BOTH)
async def catch_all(path: str, request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    body = await _read_body(request)
    _log_request(request, body, db)
    logger.warning("Unknown /iclock path: %s body=%r", path, body[:200])
    return _ok()
