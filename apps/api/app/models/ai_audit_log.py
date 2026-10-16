from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiAuditLog(Base):
    """AI activity trail — extended in STEP 11 from a dashboard-only shape
    (action/agent/user/summary/tokens) to also carry a real per-tool-call and
    per-chat-turn record. See AGAINERP_AI_OS_MASTER_PLAN.md §24."""

    __tablename__ = "ai_audit_logs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    # "ai_chat" (one per turn) | "ai_tool_call" (one per tool execution within a turn).
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    agent: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Display name, kept for the pre-existing dashboard shape; user_id below is the FK.
    user: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    logged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    conversation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    provider_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    model_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tool_input_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_output_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_tier: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    module: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_creation_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
