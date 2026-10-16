"""AI long-term memory — STEP 30. Deliberately minimal: list + save, no update/delete/
search — see app/models/ai_memory.py's own docstring for why (extensible abstraction,
not a full system, per the master plan's own §15 instruction).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai_memory import AiMemory


def list_memories(db: Session, *, company_id: str, user_id: str) -> list[str]:
    """Company-wide (user_id IS NULL) + this user's own personal memories, oldest first —
    matches how a person actually remembers being told something, not a relevance ranking
    (no embeddings/semantic search here, by design)."""
    rows = (
        db.query(AiMemory)
        .filter(AiMemory.company_id == company_id)
        .filter((AiMemory.user_id == user_id) | (AiMemory.user_id.is_(None)))
        .order_by(AiMemory.created_at.asc())
        .all()
    )
    return [r.content for r in rows]


def save_memory(db: Session, *, company_id: str, user_id: str, content: str, scope: str) -> AiMemory:
    memory = AiMemory(
        company_id=company_id,
        user_id=None if scope == "company" else user_id,
        content=content,
    )
    db.add(memory)
    db.flush()  # need memory.id now — session is autoflush=False, caller's request owns the commit
    return memory
