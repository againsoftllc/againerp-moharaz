from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CollabLabel(Base):
    __tablename__ = "collab_labels"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "label", "company_id", name="uq_collab_label"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label_display: Mapped[str] = mapped_column(String(128), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    applied_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    applied_by_type: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
