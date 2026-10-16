"""Conversation runtime — STEP 08.

`ai_agent`/`ai_tool`/`ai_approval`/`ai_audit_log` (confirmed while auditing this step) are
shaped for the dashboard mock this project already had (`lib/mock-data/ai-os.ts`) — string
"agent" labels, a `summary` text field, no conversation/message concept anywhere. None of
them fit a real multi-turn transcript, so this is new, not a duplicate of something unwired.

Deliberately minimal: only the *outer* user/assistant text turns are persisted, not the
in-turn tool_use/tool_result exchange (that's already handled correctly in-memory within one
Orchestrator.run() call — see orchestrator.py). Replaying full raw content blocks across
every future HTTP request would make conversations grow unbounded in token cost for no
benefit the final text answer doesn't already carry. See master plan §14 for the tradeoff.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiConversation(Base):
    __tablename__ = "ai_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "user" | "assistant" — matches AIMessage.role in providers/base.py.
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
