"""AI long-term memory — STEP 30, the piece §15 deferred until conversations (STEP 08)
existed to distinguish it from. Conversation-scoped ("short-term") context already works
via ai_conversations/ai_messages; nothing carries forward *across* separate conversations
until this. Deliberately the "extensible abstraction, not a full system" the master plan's
own instruction called for: one freeform table, no tiers, no auto-extraction/summarization,
no embeddings/semantic search — a fact is remembered because the user explicitly asked the
assistant to remember it, not because something guessed it was worth keeping.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiMemory(Base):
    __tablename__ = "ai_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    # NULL = company-wide (a business preference any user's conversation should see);
    # set = personal to that one user. Same two-tier split the master plan's own §15
    # note called for ("short-term vs long-term... likely just two columns/tables").
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
