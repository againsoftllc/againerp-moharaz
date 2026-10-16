from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ApprovalLimit(Base):
    """How much a role may approve on one document, by document type.

    A role with no row for a document type is unlimited, so nothing changes
    until an admin sets a ceiling. The check runs where the document is
    approved or confirmed, which is the point money is actually committed.
    """

    __tablename__ = "approval_limits"
    __table_args__ = (
        UniqueConstraint("company_id", "role_slug", "document_type", name="uq_approval_limit"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    role_slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # "finance.expense", "purchase.order", "sales.order" — see APPROVAL_DOCUMENTS.
    document_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
