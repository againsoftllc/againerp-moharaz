"""Conversation persistence — STEP 08.

Thin on purpose: load history for a conversation, append the two new turns after a run.
No summarization, no long-term memory tiers — that's STEP 16 (§15), which this module is
deliberately left simple enough to grow into rather than pre-building.
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.models.ai_conversation import AiConversation, AiMessage
from app.services.ai.providers.base import AIMessage


def _title_from(message: str) -> str:
    text = message.strip().replace("\n", " ")
    return text[:197] + "..." if len(text) > 200 else text


def get_or_create_conversation(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    conversation_id: Optional[str],
    first_message: str,
) -> AiConversation:
    if conversation_id:
        convo = db.get(AiConversation, conversation_id)
        if not convo or convo.company_id != company_id or convo.user_id != user_id:
            # Same reasoning as every tenant-isolation check elsewhere in this codebase:
            # 404, not 403 — don't confirm another user's conversation exists at all.
            raise HTTPException(status_code=404, detail="Conversation not found")
        return convo

    convo = AiConversation(company_id=company_id, user_id=user_id, title=_title_from(first_message))
    db.add(convo)
    db.flush()
    return convo


def load_history(db: Session, conversation_id: str) -> list[AIMessage]:
    rows = (
        db.query(AiMessage)
        .filter(AiMessage.conversation_id == conversation_id)
        .order_by(asc(AiMessage.created_at))
        .all()
    )
    return [AIMessage(role=r.role, content=r.content) for r in rows]  # type: ignore[arg-type]


def append_turn(db: Session, conversation_id: str, *, user_text: str, assistant_text: str) -> None:
    db.add(AiMessage(conversation_id=conversation_id, role="user", content=user_text))
    db.add(AiMessage(conversation_id=conversation_id, role="assistant", content=assistant_text))
    convo = db.get(AiConversation, conversation_id)
    if convo is not None:
        # Keep the sidebar ordered by last activity even when the DB default only sets created_at.
        from datetime import datetime

        convo.updated_at = datetime.utcnow()
