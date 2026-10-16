from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ZktecoPlugin(Base):
    """ZKTeco ADMS receiver settings (single row, id=zkteco-default)."""

    __tablename__ = "plugin_zkteco"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="zkteco-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receiver_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allowed_serials: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_traffic_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    device_name: Mapped[str] = mapped_column(String(100), nullable=False, default="F22")
    device_serial_number: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="JJA1254800682",
    )
    firmware_version: Mapped[str] = mapped_column(String(40), nullable=False, default="6.60")
    push_version: Mapped[str] = mapped_column(String(40), nullable=False, default="3.1.2")
    server_address: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="192.168.10.46",
    )
    server_port: Mapped[int] = mapped_column(Integer, nullable=False, default=7074)
    https_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    connection_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    connection_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    last_device_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_device_sn: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ZktecoAttendanceLog(Base):
    """One punch from a ZKTeco device (ADMS push)."""

    __tablename__ = "zkteco_attendance_logs"
    __table_args__ = (
        UniqueConstraint(
            "serial_number",
            "employee_code",
            "punch_time",
            name="uq_zkteco_device_employee_time",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    serial_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    employee_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    punch_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    verify_mode: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    inout_mode: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_table: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    raw_payload: Mapped[str] = mapped_column(Text, nullable=False, default="")
    received_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
