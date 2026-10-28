from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthUserPermission(Base):
    """A permission given to (allow) or taken from (deny) one member on top of their roles (OnerERP §3.2 user-wise permission)."""

    __tablename__ = "auth_user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "module", "action", name="uq_auth_user_permission"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    allow: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class AuthUserPaymentAccount(Base):
    """Cash / bank accounts a member may see and move money through (OnerERP §3.5 Accounts Permission). None = all of them."""

    __tablename__ = "auth_user_payment_accounts"
    __table_args__ = (UniqueConstraint("user_id", "payment_account_id", name="uq_auth_user_payment_account"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_account_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
