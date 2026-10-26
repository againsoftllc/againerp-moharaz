from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuthRolePermission(Base):
    """Module × action flags granted to a role."""

    __tablename__ = "auth_role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "module", name="uq_role_module"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("auth_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module: Mapped[str] = mapped_column(String(64), nullable=False)
    can_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_create: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_write: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_delete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # make records public on the website / go live (publish a product, a page, a post). The AI may only prepare drafts unless the
    # user's role has this (docs/AI/ai.md step 1.3). Existing roles got it where they could write, so no person lost anything.
    can_publish: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # export / dump lists of data (phones, e-mails, salaries ...). The AI refuses bulk personal-data lists without it
    # (docs/AI/ai.md step 1.3). Existing roles got it where they could write.
    can_export: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # finalize the documents that need approval (docs/approval.md) without asking, and approve other people's requests.
    # Off for everyone but the System Manager until a role is given it, so approvals are opt-out per role.
    can_approve: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    role = relationship("AuthRole", back_populates="permissions")
