"""Party Workspace lifecycle hooks."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.collaboration.collaboration_service import CollaborationService
from app.services.collaboration.constants import ACTIVITY_CREATED, ENTITY_TYPE_PARTY


def on_party_created(
    db: Session,
    party_id: str,
    *,
    created_by: Optional[str] = None,
    source: str = "user",
    company_id: str = "default",
) -> None:
    """Initialize collab state and default workspace when a party is created."""
    svc = CollaborationService(db, company_id=company_id)
    svc.ensure_ownership(ENTITY_TYPE_PARTY, party_id, created_by=created_by, source=source)
    svc.ensure_approval(ENTITY_TYPE_PARTY, party_id, status="draft")
    svc.add_label(ENTITY_TYPE_PARTY, party_id, "active", applied_by=created_by)
    svc.record_activity(
        ENTITY_TYPE_PARTY,
        party_id,
        ACTIVITY_CREATED,
        performed_by=created_by,
        details={"source": source},
    )


def on_party_updated(
    db: Session,
    party_id: str,
    *,
    performed_by: Optional[str] = None,
    changes: Optional[dict[str, Any]] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ACTIVITY_UPDATED

    svc = CollaborationService(db, company_id=company_id)
    svc.ensure_ownership(ENTITY_TYPE_PARTY, party_id)
    svc.record_activity(
        ENTITY_TYPE_PARTY,
        party_id,
        ACTIVITY_UPDATED,
        performed_by=performed_by,
        details={"changes": changes or {}},
    )
