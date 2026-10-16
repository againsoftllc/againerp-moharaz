from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §7-8 — example portal roles. Kept as a plain string (not an enum
# column) so an admin isn't blocked from inviting a user with a role name
# that doesn't exist in this tuple yet; permissions.py treats unknown roles
# as "staff" (least privilege).
VENDOR_USER_ROLES = ("owner", "purchase_manager", "accounts_manager", "staff")


class VendorUser(Base):
    """A person who signs in to the vendor portal on behalf of one vendor.

    Separate from AuthUser and from SupplierUser on purpose — same isolation
    rule as the supplier portal: admin staff, suppliers, and vendors must
    never share an identity table or a session table.
    """

    __tablename__ = "vendor_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="staff")
    # Null until the invite is accepted and a password is set.
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    invite_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, unique=True, index=True)
    invite_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    invited_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class VendorSession(Base):
    """Bearer session for a vendor portal user."""

    __tablename__ = "vendor_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Denormalised so a session lookup never needs the client to say who it is.
    vendor_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
