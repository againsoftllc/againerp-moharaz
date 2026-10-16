from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import get_current_user, require_write_access, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.zkteco_plugin import ZktecoPlugin
from app.schemas.zkteco_plugin import (
    ZktecoPluginRead,
    ZktecoPluginResponse,
    ZktecoPluginUpdate,
    ZktecoPunchesData,
    ZktecoPunchesResponse,
    ZktecoPunchItem,
    ZktecoPunchSummary,
)
from app.services.zkteco_attendance_store import list_punches
from app.services.zkteco_session_store import store as session_store

router = APIRouter(prefix="/plugins/zkteco", tags=["plugins-zkteco"])

DEFAULT_ID = "zkteco-default"


def _get_or_create(db: Session) -> ZktecoPlugin:
    row = db.get(ZktecoPlugin, DEFAULT_ID)
    if row:
        return row
    row = ZktecoPlugin(id=DEFAULT_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _adms_base_url() -> str:
    settings = get_settings()
    configured = (settings.public_api_base_url or "").strip().rstrip("/")
    if configured:
        return configured
    return "http://127.0.0.1:8010"


def _to_read(row: ZktecoPlugin) -> ZktecoPluginRead:
    return ZktecoPluginRead(
        id=row.id,
        company_id=row.company_id,
        installed=row.installed,
        enabled=row.enabled,
        receiver_enabled=row.receiver_enabled,
        allowed_serials=row.allowed_serials or "",
        raw_traffic_enabled=row.raw_traffic_enabled,
        device_name=row.device_name or "",
        device_serial_number=row.device_serial_number or "",
        firmware_version=row.firmware_version or "",
        push_version=row.push_version or "",
        server_address=row.server_address or "",
        server_port=row.server_port or 7074,
        https_enabled=row.https_enabled,
        connection_status=row.connection_status,
        connection_message=row.connection_message,
        last_device_seen_at=row.last_device_seen_at,
        last_device_sn=row.last_device_sn or "",
        adms_base_url=_adms_base_url(),
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=ZktecoPluginResponse)
def get_zkteco_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
) -> ZktecoPluginResponse:
    return ZktecoPluginResponse(data=_to_read(_get_or_create(db)))


@router.post("/install", response_model=ZktecoPluginResponse)
def install_zkteco_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> ZktecoPluginResponse:
    row = _get_or_create(db)
    row.installed = True
    row.enabled = True
    row.receiver_enabled = True
    if not row.device_serial_number:
        row.device_name = "F22"
        row.device_serial_number = "JJA1254800682"
        row.firmware_version = "6.60"
        row.push_version = "3.1.2"
        row.server_address = "192.168.10.46"
        row.server_port = 7074
        row.https_enabled = False
        row.allowed_serials = "JJA1254800682"
    row.connection_status = "disconnected"
    row.connection_message = "Installed — point device ADMS to this API /iclock"
    db.commit()
    db.refresh(row)
    return ZktecoPluginResponse(data=_to_read(row))


@router.delete("/install", response_model=ZktecoPluginResponse)
def uninstall_zkteco_plugin(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> ZktecoPluginResponse:
    row = _get_or_create(db)
    row.installed = False
    row.enabled = False
    row.receiver_enabled = False
    row.allowed_serials = ""
    row.raw_traffic_enabled = False
    row.connection_status = "disconnected"
    row.connection_message = ""
    row.last_device_seen_at = None
    row.last_device_sn = ""
    row.verified_at = None
    session_store.clear()
    db.commit()
    db.refresh(row)
    return ZktecoPluginResponse(data=_to_read(row))


@router.patch("", response_model=ZktecoPluginResponse)
def update_zkteco_plugin(
    payload: ZktecoPluginUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> ZktecoPluginResponse:
    row = _get_or_create(db)
    if not row.installed:
        row.installed = True
        row.enabled = True

    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.receiver_enabled is not None:
        row.receiver_enabled = payload.receiver_enabled
    if payload.allowed_serials is not None:
        row.allowed_serials = payload.allowed_serials.strip()
    if payload.raw_traffic_enabled is not None:
        row.raw_traffic_enabled = payload.raw_traffic_enabled
    if payload.device_name is not None:
        row.device_name = payload.device_name.strip()[:100]
    if payload.device_serial_number is not None:
        row.device_serial_number = payload.device_serial_number.strip().upper()[:64]
    if payload.firmware_version is not None:
        row.firmware_version = payload.firmware_version.strip()[:40]
    if payload.push_version is not None:
        row.push_version = payload.push_version.strip()[:40]
    if payload.server_address is not None:
        row.server_address = payload.server_address.strip()[:255]
    if payload.server_port is not None:
        if payload.server_port < 1 or payload.server_port > 65535:
            raise HTTPException(status_code=400, detail="Server port must be between 1 and 65535")
        row.server_port = payload.server_port
    if payload.https_enabled is not None:
        row.https_enabled = payload.https_enabled

    if payload.verify_connection:
        if not row.installed or not row.enabled:
            raise HTTPException(status_code=400, detail="Install and enable the plugin first")
        if not row.receiver_enabled:
            raise HTTPException(status_code=400, detail="Enable ADMS receiver first")
        if row.last_device_seen_at:
            row.connection_status = "connected"
            row.connection_message = (
                f"Last device contact: {row.last_device_sn or 'unknown'} "
                f"at {row.last_device_seen_at.isoformat()}"
            )
            row.verified_at = datetime.utcnow()
        else:
            row.connection_status = "disconnected"
            row.connection_message = (
                f"Receiver ready at {_adms_base_url()}/iclock — "
                "waiting for device handshake"
            )
            # Not an error — receiver is configured; device just has not called yet.
            row.verified_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return ZktecoPluginResponse(data=_to_read(row))


@router.get("/punches", response_model=ZktecoPunchesResponse)
def get_zkteco_punches(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    employee_code: Optional[str] = Query(default=None),
    sn: Optional[str] = Query(default=None),
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    company_id: str = Depends(get_current_company_id),
) -> ZktecoPunchesResponse:
    from app.services.hrm.biometric_service import enrich_punches_with_employees

    result = list_punches(
        db,
        page=page,
        page_size=page_size,
        employee_code=employee_code,
        serial_number=sn,
        from_date=from_date,
        to_date=to_date,
    )
    items = enrich_punches_with_employees(
        db, company_id=company_id, items=result["items"]
    )
    return ZktecoPunchesResponse(
        data=ZktecoPunchesData(
            items=[ZktecoPunchItem(**item) for item in items],
            page=result["page"],
            page_size=result["page_size"],
            total=result["total"],
            summary=ZktecoPunchSummary(**result["summary"]),
        ),
    )
