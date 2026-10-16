from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.collaboration import (
    CollabActivityListResponse,
    CollabActivityRead,
    CollabAiNoteRead,
    CollabApprovalRead,
    CollabApprovalUpdate,
    CollabCommentCreate,
    CollabCommentRead,
    CollabFileCreate,
    CollabFileRead,
    CollabLabelCreate,
    CollabLabelRead,
    CollabOwnershipRead,
    CollabOwnershipUpdate,
    CollabWorkspaceResponse,
    CollabWorkspaceSummary,
    activity_to_read,
    ai_note_to_read,
    comment_to_read,
)
from app.services.collaboration.collaboration_service import CollaborationService

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


def _svc(db: Session, company_id: str = "default") -> CollaborationService:
    return CollaborationService(db, company_id=company_id)


@router.get("/{entity_type}/{entity_id}/workspace", response_model=CollabWorkspaceResponse)
def get_workspace(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CollabWorkspaceResponse:
    summary = _svc(db, company_id).get_workspace_summary(entity_type, entity_id)
    return CollabWorkspaceResponse(
        data=CollabWorkspaceSummary(
            ownership=CollabOwnershipRead.model_validate(summary["ownership"])
            if summary["ownership"]
            else None,
            approval=CollabApprovalRead.model_validate(summary["approval"])
            if summary["approval"]
            else None,
            labels=[CollabLabelRead.model_validate(l) for l in summary["labels"]],
            recent_activity=[activity_to_read(a) for a in summary["recent_activity"]],
            comment_count=summary["comment_count"],
            file_count=summary["file_count"],
            pending_ai_notes=summary["pending_ai_notes"],
        ),
    )


@router.get("/{entity_type}/{entity_id}/ownership", response_model=CollabOwnershipRead)
def get_ownership(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CollabOwnershipRead:
    row = _svc(db, company_id).get_ownership(entity_type, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ownership record not found")
    return CollabOwnershipRead.model_validate(row)


@router.patch("/{entity_type}/{entity_id}/ownership", response_model=CollabOwnershipRead)
def update_ownership(
    entity_type: str,
    entity_id: str,
    payload: CollabOwnershipUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> CollabOwnershipRead:
    svc = _svc(db, company_id)
    row = svc.update_ownership(
        entity_type,
        entity_id,
        assigned_to=payload.assigned_to,
        source=payload.source,
    )
    if payload.department is not None:
        row.department = payload.department
        db.flush()
    if payload.assigned_to is not None:
        svc.record_activity(
            entity_type,
            entity_id,
            "assignment",
            performed_by=user.id,
            new_value=payload.assigned_to,
        )
    db.commit()
    db.refresh(row)
    return CollabOwnershipRead.model_validate(row)


@router.get("/{entity_type}/{entity_id}/activity", response_model=CollabActivityListResponse)
def list_activity(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> CollabActivityListResponse:
    rows, total = _svc(db, company_id).list_activity(
        entity_type,
        entity_id,
        limit=limit,
        offset=offset,
    )
    user_ids = {r.performed_by for r in rows if r.performed_by}
    names: dict[str, str] = {}
    if user_ids:
        for u in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all():
            names[u.id] = u.name
    return CollabActivityListResponse(
        data=[activity_to_read(r, performed_by_name=names.get(r.performed_by)) for r in rows],
        meta={"count": total, "limit": limit, "offset": offset},
    )


@router.get("/{entity_type}/{entity_id}/comments", response_model=list[CollabCommentRead])
def list_comments(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> list[CollabCommentRead]:
    rows = _svc(db, company_id).list_comments(entity_type, entity_id)
    return [comment_to_read(r) for r in rows]


@router.post("/{entity_type}/{entity_id}/comments", response_model=CollabCommentRead, status_code=201)
def create_comment(
    entity_type: str,
    entity_id: str,
    payload: CollabCommentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> CollabCommentRead:
    row = _svc(db, company_id).add_comment(
        entity_type,
        entity_id,
        payload.comment,
        user_id=user.id,
        visibility=payload.visibility,
        parent_comment_id=payload.parent_comment_id,
        mentions=payload.mentions,
        attachments=payload.attachments,
    )
    db.commit()
    db.refresh(row)
    return comment_to_read(row)


@router.delete("/{entity_type}/{entity_id}/comments/{comment_id}", status_code=204)
def delete_comment(
    entity_type: str,
    entity_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = _svc(db, company_id).soft_delete_comment(comment_id)
    if not row or row.entity_id != entity_id or row.entity_type != entity_type:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.commit()


@router.get("/{entity_type}/{entity_id}/labels", response_model=list[CollabLabelRead])
def list_labels(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> list[CollabLabelRead]:
    rows = _svc(db, company_id).list_labels(entity_type, entity_id)
    return [CollabLabelRead.model_validate(r) for r in rows]


@router.post("/{entity_type}/{entity_id}/labels", response_model=CollabLabelRead, status_code=201)
def add_label(
    entity_type: str,
    entity_id: str,
    payload: CollabLabelCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> CollabLabelRead:
    row = _svc(db, company_id).add_label(
        entity_type,
        entity_id,
        payload.label,
        applied_by=user.id,
    )
    db.commit()
    db.refresh(row)
    return CollabLabelRead.model_validate(row)


@router.delete("/{entity_type}/{entity_id}/labels/{label}", status_code=204)
def remove_label(
    entity_type: str,
    entity_id: str,
    label: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    if not _svc(db, company_id).remove_label(entity_type, entity_id, label):
        raise HTTPException(status_code=404, detail="Label not found")
    db.commit()


@router.get("/{entity_type}/{entity_id}/files", response_model=list[CollabFileRead])
def list_files(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    file_type: Optional[str] = Query(default=None),
) -> list[CollabFileRead]:
    rows = _svc(db, company_id).list_files(entity_type, entity_id, file_type=file_type)
    return [CollabFileRead.model_validate(r) for r in rows]


@router.post("/{entity_type}/{entity_id}/files", response_model=CollabFileRead, status_code=201)
def add_file(
    entity_type: str,
    entity_id: str,
    payload: CollabFileCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> CollabFileRead:
    row = _svc(db, company_id).add_file(
        entity_type,
        entity_id,
        filename=payload.filename,
        storage_ref=payload.storage_ref,
        file_type=payload.file_type,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        uploaded_by=user.id,
    )
    db.commit()
    db.refresh(row)
    return CollabFileRead.model_validate(row)


@router.delete("/{entity_type}/{entity_id}/files/{file_id}", status_code=204)
def delete_file(
    entity_type: str,
    entity_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = _svc(db, company_id).soft_delete_file(file_id)
    if not row or row.entity_id != entity_id or row.entity_type != entity_type:
        raise HTTPException(status_code=404, detail="File not found")
    db.commit()


@router.get("/{entity_type}/{entity_id}/ai-notes", response_model=list[CollabAiNoteRead])
def list_ai_notes(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
) -> list[CollabAiNoteRead]:
    rows = _svc(db, company_id).list_ai_notes(entity_type, entity_id, status=status)
    return [ai_note_to_read(r) for r in rows]


@router.get("/{entity_type}/{entity_id}/approval", response_model=CollabApprovalRead)
def get_approval(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CollabApprovalRead:
    row = _svc(db, company_id).get_approval(entity_type, entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Approval state not found")
    return CollabApprovalRead.model_validate(row)


@router.patch("/{entity_type}/{entity_id}/approval", response_model=CollabApprovalRead)
def update_approval(
    entity_type: str,
    entity_id: str,
    payload: CollabApprovalUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> CollabApprovalRead:
    try:
        row = _svc(db, company_id).update_approval(
            entity_type,
            entity_id,
            payload.status,
            actor_id=user.id,
            rejection_reason=payload.rejection_reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return CollabApprovalRead.model_validate(row)
