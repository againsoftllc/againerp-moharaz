from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthUserWarehouse(Base):
    """Many-to-many: user ↔ warehouse the user may work in.

    A user with no rows here is unrestricted (every warehouse). Otherwise the
    rows are the only warehouses their sales/purchase documents may use, and the
    `is_default` one is pre-selected on new documents.
    """

    __tablename__ = "auth_user_warehouses"
    __table_args__ = (UniqueConstraint("user_id", "warehouse_id", name="uq_user_warehouse"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inventory_warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
