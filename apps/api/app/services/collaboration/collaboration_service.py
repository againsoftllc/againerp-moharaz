"""Polymorphic collaboration services — reusable across entity types."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.collab_activity import CollabActivity
from app.models.collab_ai_note import CollabAiNote
from app.models.collab_approval_state import CollabApprovalState
from app.models.collab_comment import CollabComment
from app.models.collab_file import CollabFile
from app.models.collab_label import CollabLabel
from app.models.collab_ownership import CollabOwnership
from app.services.collaboration.constants import (
    ACTIVITY_ARCHIVED,
    ACTIVITY_CREATED,
    ACTIVITY_PRICE_CHANGE,
    ACTIVITY_PUBLISHED,
    ACTIVITY_STOCK_CHANGE,
    ACTIVITY_UPDATED,
    APPROVAL_STATUSES,
    AUTHOR_TYPES,
    COMMENT_VISIBILITY,
    FILE_TYPES,
    LABEL_CATALOG,
    OWNERSHIP_SOURCES,
)


class CollaborationService:
    """Facade for all collab_* operations."""

    def __init__(self, db: Session, company_id: str = "default") -> None:
        self.db = db
        self.company_id = company_id

    # ── Ownership ────────────────────────────────────────────────────────────

    def get_ownership(self, entity_type: str, entity_id: str) -> Optional[CollabOwnership]:
        return (
            self.db.query(CollabOwnership)
            .filter(
                CollabOwnership.entity_type == entity_type,
                CollabOwnership.entity_id == entity_id,
                CollabOwnership.company_id == self.company_id,
            )
            .first()
        )

    def ensure_ownership(
        self,
        entity_type: str,
        entity_id: str,
        *,
        created_by: Optional[str] = None,
        source: str = "user",
        assigned_to: Optional[str] = None,
    ) -> CollabOwnership:
        if source not in OWNERSHIP_SOURCES:
            source = "user"
        row = self.get_ownership(entity_type, entity_id)
        if row:
            if assigned_to is not None:
                row.assigned_to = assigned_to
            return row
        row = CollabOwnership(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            created_by=created_by,
            assigned_to=assigned_to,
            source=source,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def update_ownership(
        self,
        entity_type: str,
        entity_id: str,
        *,
        assigned_to: Optional[str] = None,
        source: Optional[str] = None,
    ) -> CollabOwnership:
        row = self.ensure_ownership(entity_type, entity_id)
        if assigned_to is not None:
            row.assigned_to = assigned_to
        if source is not None and source in OWNERSHIP_SOURCES:
            row.source = source
        self.db.flush()
        return row

    # ── Activity ─────────────────────────────────────────────────────────────

    def record_activity(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        *,
        performed_by: Optional[str] = None,
        performed_by_type: str = "user",
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> CollabActivity:
        if performed_by_type not in AUTHOR_TYPES:
            performed_by_type = "user"
        row = CollabActivity(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            action=action,
            performed_by=performed_by,
            performed_by_type=performed_by_type,
            old_value=old_value,
            new_value=new_value,
            # default=str: activity `details` is a log payload, not source-of-truth
            # data — callers pass raw model field values (e.g. Decimal price,
            # datetime, UUID) that json.dumps can't serialize natively.
            details_json=json.dumps(details or {}, default=str),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def list_activity(
        self,
        entity_type: str,
        entity_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CollabActivity], int]:
        query = (
            self.db.query(CollabActivity)
            .filter(
                CollabActivity.entity_type == entity_type,
                CollabActivity.entity_id == entity_id,
                CollabActivity.company_id == self.company_id,
            )
            .order_by(CollabActivity.created_at.desc())
        )
        total = query.count()
        rows = query.offset(offset).limit(limit).all()
        return rows, total

    # ── Comments ─────────────────────────────────────────────────────────────

    def list_comments(
        self,
        entity_type: str,
        entity_id: str,
        *,
        include_deleted: bool = False,
    ) -> list[CollabComment]:
        query = self.db.query(CollabComment).filter(
            CollabComment.entity_type == entity_type,
            CollabComment.entity_id == entity_id,
            CollabComment.company_id == self.company_id,
        )
        if not include_deleted:
            query = query.filter(CollabComment.is_deleted.is_(False))
        return query.order_by(CollabComment.created_at.asc()).all()

    def add_comment(
        self,
        entity_type: str,
        entity_id: str,
        comment: str,
        *,
        user_id: Optional[str] = None,
        author_type: str = "user",
        visibility: str = "internal",
        parent_comment_id: Optional[str] = None,
        mentions: Optional[list[str]] = None,
        attachments: Optional[list[str]] = None,
    ) -> CollabComment:
        if visibility not in COMMENT_VISIBILITY:
            visibility = "internal"
        if author_type not in AUTHOR_TYPES:
            author_type = "user"
        row = CollabComment(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            user_id=user_id,
            author_type=author_type,
            comment=comment,
            parent_comment_id=parent_comment_id,
            visibility=visibility,
            mentions_json=json.dumps(mentions or []),
            attachments_json=json.dumps(attachments or []),
        )
        self.db.add(row)
        self.db.flush()
        self.record_activity(
            entity_type,
            entity_id,
            "comment",
            performed_by=user_id,
            performed_by_type=author_type,
            details={"comment_id": row.id},
        )
        return row

    def soft_delete_comment(self, comment_id: str) -> Optional[CollabComment]:
        row = self.db.get(CollabComment, comment_id)
        if not row or row.is_deleted:
            return None
        row.is_deleted = True
        row.deleted_at = datetime.utcnow()
        self.db.flush()
        return row

    # ── Labels ───────────────────────────────────────────────────────────────

    def list_labels(self, entity_type: str, entity_id: str) -> list[CollabLabel]:
        return (
            self.db.query(CollabLabel)
            .filter(
                CollabLabel.entity_type == entity_type,
                CollabLabel.entity_id == entity_id,
                CollabLabel.company_id == self.company_id,
            )
            .order_by(CollabLabel.created_at.asc())
            .all()
        )

    def add_label(
        self,
        entity_type: str,
        entity_id: str,
        label: str,
        *,
        applied_by: Optional[str] = None,
        applied_by_type: str = "user",
    ) -> CollabLabel:
        catalog = LABEL_CATALOG.get(label, {"display": label.replace("_", " ").title(), "color": "#64748b"})
        existing = (
            self.db.query(CollabLabel)
            .filter(
                CollabLabel.entity_type == entity_type,
                CollabLabel.entity_id == entity_id,
                CollabLabel.label == label,
                CollabLabel.company_id == self.company_id,
            )
            .first()
        )
        if existing:
            return existing
        row = CollabLabel(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            label=label,
            label_display=catalog["display"],
            color=catalog.get("color"),
            applied_by=applied_by,
            applied_by_type=applied_by_type,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def remove_label(self, entity_type: str, entity_id: str, label: str) -> bool:
        row = (
            self.db.query(CollabLabel)
            .filter(
                CollabLabel.entity_type == entity_type,
                CollabLabel.entity_id == entity_id,
                CollabLabel.label == label,
                CollabLabel.company_id == self.company_id,
            )
            .first()
        )
        if not row:
            return False
        self.db.delete(row)
        self.db.flush()
        return True

    # ── Files ────────────────────────────────────────────────────────────────

    def list_files(
        self,
        entity_type: str,
        entity_id: str,
        *,
        file_type: Optional[str] = None,
    ) -> list[CollabFile]:
        query = self.db.query(CollabFile).filter(
            CollabFile.entity_type == entity_type,
            CollabFile.entity_id == entity_id,
            CollabFile.company_id == self.company_id,
            CollabFile.is_deleted.is_(False),
        )
        if file_type and file_type in FILE_TYPES:
            query = query.filter(CollabFile.file_type == file_type)
        return query.order_by(CollabFile.created_at.desc()).all()

    def add_file(
        self,
        entity_type: str,
        entity_id: str,
        *,
        filename: str,
        storage_ref: str,
        file_type: str = "other",
        mime_type: str = "application/octet-stream",
        size_bytes: int = 0,
        uploaded_by: Optional[str] = None,
        uploaded_by_type: str = "user",
    ) -> CollabFile:
        if file_type not in FILE_TYPES:
            file_type = "other"
        row = CollabFile(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            file_type=file_type,
            storage_ref=storage_ref,
            filename=filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            uploaded_by=uploaded_by,
            uploaded_by_type=uploaded_by_type,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def soft_delete_file(self, file_id: str) -> Optional[CollabFile]:
        row = self.db.get(CollabFile, file_id)
        if not row or row.is_deleted:
            return None
        row.is_deleted = True
        row.deleted_at = datetime.utcnow()
        self.db.flush()
        return row

    # ── AI Notes ─────────────────────────────────────────────────────────────

    def list_ai_notes(
        self,
        entity_type: str,
        entity_id: str,
        *,
        status: Optional[str] = None,
    ) -> list[CollabAiNote]:
        query = self.db.query(CollabAiNote).filter(
            CollabAiNote.entity_type == entity_type,
            CollabAiNote.entity_id == entity_id,
            CollabAiNote.company_id == self.company_id,
        )
        if status:
            query = query.filter(CollabAiNote.status == status)
        return query.order_by(CollabAiNote.created_at.desc()).all()

    # ── Approval ─────────────────────────────────────────────────────────────

    def get_approval(self, entity_type: str, entity_id: str) -> Optional[CollabApprovalState]:
        return (
            self.db.query(CollabApprovalState)
            .filter(
                CollabApprovalState.entity_type == entity_type,
                CollabApprovalState.entity_id == entity_id,
                CollabApprovalState.company_id == self.company_id,
            )
            .first()
        )

    def ensure_approval(
        self,
        entity_type: str,
        entity_id: str,
        *,
        status: str = "draft",
    ) -> CollabApprovalState:
        if status not in APPROVAL_STATUSES:
            status = "draft"
        row = self.get_approval(entity_type, entity_id)
        if row:
            return row
        row = CollabApprovalState(
            id=str(uuid.uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=self.company_id,
            status=status,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def update_approval(
        self,
        entity_type: str,
        entity_id: str,
        status: str,
        *,
        actor_id: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> CollabApprovalState:
        if status not in APPROVAL_STATUSES:
            raise ValueError(f"Invalid approval status: {status}")
        row = self.ensure_approval(entity_type, entity_id)
        now = datetime.utcnow()
        row.status = status
        if status == "review":
            row.submitted_at = now
            row.submitted_by = actor_id
        elif status == "approved":
            row.reviewed_at = now
            row.reviewed_by = actor_id
        elif status == "published":
            row.published_at = now
            row.published_by = actor_id
        elif status == "archived":
            row.archived_at = now
            row.archived_by = actor_id
        elif status == "rejected":
            row.rejected_at = now
            row.rejected_by = actor_id
            row.rejection_reason = rejection_reason
        self.db.flush()
        self.record_activity(
            entity_type,
            entity_id,
            "approval",
            performed_by=actor_id,
            new_value=status,
        )
        return row

    # ── Workspace summary ────────────────────────────────────────────────────

    def get_workspace_summary(
        self,
        entity_type: str,
        entity_id: str,
    ) -> dict[str, Any]:
        ownership = self.get_ownership(entity_type, entity_id)
        approval = self.get_approval(entity_type, entity_id)
        labels = self.list_labels(entity_type, entity_id)
        recent_activity, _ = self.list_activity(entity_type, entity_id, limit=5)
        comment_count = (
            self.db.query(CollabComment)
            .filter(
                CollabComment.entity_type == entity_type,
                CollabComment.entity_id == entity_id,
                CollabComment.company_id == self.company_id,
                CollabComment.is_deleted.is_(False),
            )
            .count()
        )
        file_count = (
            self.db.query(CollabFile)
            .filter(
                CollabFile.entity_type == entity_type,
                CollabFile.entity_id == entity_id,
                CollabFile.company_id == self.company_id,
                CollabFile.is_deleted.is_(False),
            )
            .count()
        )
        ai_note_count = (
            self.db.query(CollabAiNote)
            .filter(
                CollabAiNote.entity_type == entity_type,
                CollabAiNote.entity_id == entity_id,
                CollabAiNote.company_id == self.company_id,
                CollabAiNote.status == "pending",
            )
            .count()
        )
        return {
            "ownership": ownership,
            "approval": approval,
            "labels": labels,
            "recent_activity": recent_activity,
            "comment_count": comment_count,
            "file_count": file_count,
            "pending_ai_notes": ai_note_count,
        }


def on_item_created(
    db: Session,
    item_id: str,
    *,
    created_by: Optional[str] = None,
    source: str = "user",
    company_id: str = "default",
) -> None:
    """Hook: initialize collab state when an item is created."""
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.ensure_ownership(ENTITY_TYPE_ITEM, item_id, created_by=created_by, source=source)
    svc.ensure_approval(ENTITY_TYPE_ITEM, item_id, status="draft")
    svc.add_label(ENTITY_TYPE_ITEM, item_id, "draft", applied_by=created_by)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_CREATED,
        performed_by=created_by,
        details={"source": source},
    )


def on_item_updated(
    db: Session,
    item_id: str,
    *,
    performed_by: Optional[str] = None,
    changes: Optional[dict[str, Any]] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.ensure_ownership(ENTITY_TYPE_ITEM, item_id)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_UPDATED,
        performed_by=performed_by,
        details={"changes": changes or {}},
    )


def on_item_stock_change(
    db: Session,
    item_id: str,
    *,
    old_qty: Optional[str] = None,
    new_qty: Optional[str] = None,
    performed_by: Optional[str] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_STOCK_CHANGE,
        performed_by=performed_by,
        old_value=old_qty,
        new_value=new_qty,
    )


def on_item_price_change(
    db: Session,
    item_id: str,
    *,
    old_price: Optional[str] = None,
    new_price: Optional[str] = None,
    performed_by: Optional[str] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_PRICE_CHANGE,
        performed_by=performed_by,
        old_value=old_price,
        new_value=new_price,
    )


def on_item_published(
    db: Session,
    item_id: str,
    *,
    performed_by: Optional[str] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.update_approval(ENTITY_TYPE_ITEM, item_id, "published", actor_id=performed_by)
    svc.remove_label(ENTITY_TYPE_ITEM, item_id, "draft")
    svc.add_label(ENTITY_TYPE_ITEM, item_id, "published", applied_by=performed_by)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_PUBLISHED,
        performed_by=performed_by,
    )


def on_item_archived(
    db: Session,
    item_id: str,
    *,
    performed_by: Optional[str] = None,
    company_id: str = "default",
) -> None:
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db, company_id=company_id)
    svc.update_approval(ENTITY_TYPE_ITEM, item_id, "archived", actor_id=performed_by)
    svc.record_activity(
        ENTITY_TYPE_ITEM,
        item_id,
        ACTIVITY_ARCHIVED,
        performed_by=performed_by,
    )
