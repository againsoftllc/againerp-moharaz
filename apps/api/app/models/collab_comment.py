from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CollabComment(Base):
    __tablename__ = "collab_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    author_type: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    parent_comment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="internal")
    mentions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
