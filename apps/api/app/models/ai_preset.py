"""AI presets — admin-authored instructions the AI follows for a specific job or field.

Different from ai_memories (app/models/ai_memory.py): a memory is a fact or preference anyone
can ask the assistant to remember, injected into every chat. A preset is a company-wide rule an
administrator sets for one *target* — e.g. how product descriptions are written
(`catalog.product.description`) — and is read by the tool that produces that field, not just
the chat prompt. Targets are a fixed list in code (app/services/ai/preset_service.py) so an
admin can never attach a rule to something nothing reads.

Every edit keeps the previous text in ai_preset_versions so a bad change can be rolled back.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiPreset(Base):
    __tablename__ = "ai_presets"
    # One preset per target per company — the editor edits it in place (with version history)
    # rather than stacking several competing rules for the same field.
    __table_args__ = (UniqueConstraint("company_id", "target", name="uq_ai_presets_company_target"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    target: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    examples: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AiPresetVersion(Base):
    """Snapshot of a preset as it was *before* each change (and on delete)."""

    __tablename__ = "ai_preset_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    preset_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    target: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    examples: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    changed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    change: Mapped[str] = mapped_column(String(20), nullable=False, default="update")  # update | delete | rollback
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
