from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.collaboration import (
    CollabActivityListResponse,
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
    activity_to_read,
    comment_to_read,
)
from app.schemas.party_workspace import (
    PartyAddressCreate,
    PartyAddressRead,
    PartyAddressUpdate,
    PartyBankAccountCreate,
    PartyBankAccountRead,
    PartyBankAccountUpdate,
    PartyContactCreate,
    PartyContactRead,
    PartyContactUpdate,
    PartyDocumentCreate,
    PartyDocumentRead,
    PartyDocumentUpdate,
    PartyModuleListResponse,
    PartyModuleSummaryRead,
    PartyNoteCreate,
    PartyNoteRead,
    PartyNoteUpdate,
    PartyUserLink,
    PartyUserRead,
    PartyWorkspaceSummaryRead,
    PartyWorkspaceSummaryResponse,
)
from app.services.parties.party_workspace_service import PartyWorkspaceError, PartyWorkspaceService

router = APIRouter(prefix="/parties", tags=["party-workspace"])


def _ws(db: Session, party_id: str, company_id: str = "default") -> PartyWorkspaceService:
    return PartyWorkspaceService(db, party_id, company_id=company_id)


def _handle_error(exc: PartyWorkspaceError) -> HTTPException:
    if "not found" in str(exc).lower():
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


@router.get("/{party_id}/workspace", response_model=PartyWorkspaceSummaryResponse)
def get_workspace_summary(
    party_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> PartyWorkspaceSummaryResponse:
    try:
        summary = _ws(db, party_id, company_id).get_summary()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return PartyWorkspaceSummaryResponse(data=PartyWorkspaceSummaryRead.model_validate(summary))


@router.get("/{party_id}/modules", response_model=PartyModuleListResponse)
def list_modules(party_id: str, db: Session = Depends(get_db)) -> PartyModuleListResponse:
    try:
        modules = _ws(db, party_id).list_modules()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return PartyModuleListResponse(data=modules)


@router.get("/{party_id}/modules/{module_key}", response_model=PartyModuleSummaryRead)
def get_module_summary(
    party_id: str,
    module_key: str,
    db: Session = Depends(get_db),
) -> PartyModuleSummaryRead:
    try:
        summary = _ws(db, party_id).get_module_summary(module_key)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartyModuleSummaryRead.model_validate(summary)


# ── Contacts ──────────────────────────────────────────────────────────────────


@router.get("/{party_id}/contacts", response_model=list[PartyContactRead])
def list_contacts(
    party_id: str,
    db: Session = Depends(get_db),
    contact_kind: Optional[str] = Query(default=None),
) -> list[PartyContactRead]:
    try:
        rows = _ws(db, party_id).list_contacts(contact_kind=contact_kind)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyContactRead.model_validate(r) for r in rows]


@router.post("/{party_id}/contacts", response_model=PartyContactRead, status_code=201)
def create_contact(
    party_id: str,
    payload: PartyContactCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyContactRead:
    try:
        row = _ws(db, party_id).add_contact(**payload.model_dump())
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    return PartyContactRead.model_validate(row)


@router.patch("/{party_id}/contacts/{contact_id}", response_model=PartyContactRead)
def update_contact(
    party_id: str,
    contact_id: str,
    payload: PartyContactUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyContactRead:
    try:
        row = _ws(db, party_id).update_contact(contact_id, **payload.model_dump(exclude_unset=True))
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.commit()
    return PartyContactRead.model_validate(row)


@router.delete("/{party_id}/contacts/{contact_id}", status_code=204)
def delete_contact(
    party_id: str,
    contact_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).delete_contact(contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    db.commit()


# ── Addresses ─────────────────────────────────────────────────────────────────


@router.get("/{party_id}/addresses", response_model=list[PartyAddressRead])
def list_addresses(
    party_id: str,
    db: Session = Depends(get_db),
    address_type: Optional[str] = Query(default=None),
) -> list[PartyAddressRead]:
    try:
        rows = _ws(db, party_id).list_addresses(address_type=address_type)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyAddressRead.model_validate(r) for r in rows]


@router.post("/{party_id}/addresses", response_model=PartyAddressRead, status_code=201)
def create_address(
    party_id: str,
    payload: PartyAddressCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyAddressRead:
    try:
        row = _ws(db, party_id).add_address(**payload.model_dump())
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    return PartyAddressRead.model_validate(row)


@router.patch("/{party_id}/addresses/{address_id}", response_model=PartyAddressRead)
def update_address(
    party_id: str,
    address_id: str,
    payload: PartyAddressUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyAddressRead:
    try:
        row = _ws(db, party_id).update_address(address_id, **payload.model_dump(exclude_unset=True))
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Address not found")
    db.commit()
    return PartyAddressRead.model_validate(row)


@router.delete("/{party_id}/addresses/{address_id}", status_code=204)
def delete_address(
    party_id: str,
    address_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).delete_address(address_id):
        raise HTTPException(status_code=404, detail="Address not found")
    db.commit()


# ── Documents ─────────────────────────────────────────────────────────────────


@router.get("/{party_id}/documents", response_model=list[PartyDocumentRead])
def list_documents(
    party_id: str,
    db: Session = Depends(get_db),
    document_type: Optional[str] = Query(default=None),
) -> list[PartyDocumentRead]:
    try:
        rows = _ws(db, party_id).list_documents(document_type=document_type)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyDocumentRead.model_validate(r) for r in rows]


@router.post("/{party_id}/documents", response_model=PartyDocumentRead, status_code=201)
def create_document(
    party_id: str,
    payload: PartyDocumentCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyDocumentRead:
    try:
        row = _ws(db, party_id).add_document(**payload.model_dump())
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    return PartyDocumentRead.model_validate(row)


@router.patch("/{party_id}/documents/{document_id}", response_model=PartyDocumentRead)
def update_document(
    party_id: str,
    document_id: str,
    payload: PartyDocumentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyDocumentRead:
    try:
        row = _ws(db, party_id).update_document(document_id, **payload.model_dump(exclude_unset=True))
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    db.commit()
    return PartyDocumentRead.model_validate(row)


@router.delete("/{party_id}/documents/{document_id}", status_code=204)
def delete_document(
    party_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).delete_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found")
    db.commit()


# ── Bank accounts ─────────────────────────────────────────────────────────────


@router.get("/{party_id}/bank-accounts", response_model=list[PartyBankAccountRead])
def list_bank_accounts(party_id: str, db: Session = Depends(get_db)) -> list[PartyBankAccountRead]:
    try:
        rows = _ws(db, party_id).list_bank_accounts()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyBankAccountRead.model_validate(r) for r in rows]


@router.post("/{party_id}/bank-accounts", response_model=PartyBankAccountRead, status_code=201)
def create_bank_account(
    party_id: str,
    payload: PartyBankAccountCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyBankAccountRead:
    try:
        row = _ws(db, party_id).add_bank_account(**payload.model_dump())
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    return PartyBankAccountRead.model_validate(row)


@router.patch("/{party_id}/bank-accounts/{account_id}", response_model=PartyBankAccountRead)
def update_bank_account(
    party_id: str,
    account_id: str,
    payload: PartyBankAccountUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyBankAccountRead:
    try:
        row = _ws(db, party_id).update_bank_account(account_id, **payload.model_dump(exclude_unset=True))
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Bank account not found")
    db.commit()
    return PartyBankAccountRead.model_validate(row)


@router.delete("/{party_id}/bank-accounts/{account_id}", status_code=204)
def delete_bank_account(
    party_id: str,
    account_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).delete_bank_account(account_id):
        raise HTTPException(status_code=404, detail="Bank account not found")
    db.commit()


# ── Notes ─────────────────────────────────────────────────────────────────────


@router.get("/{party_id}/notes", response_model=list[PartyNoteRead])
def list_notes(party_id: str, db: Session = Depends(get_db)) -> list[PartyNoteRead]:
    try:
        rows = _ws(db, party_id).list_notes()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyNoteRead.model_validate(r) for r in rows]


@router.post("/{party_id}/notes", response_model=PartyNoteRead, status_code=201)
def create_note(
    party_id: str,
    payload: PartyNoteCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> PartyNoteRead:
    try:
        row = _ws(db, party_id).add_note(**payload.model_dump(), created_by=user.id)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    return PartyNoteRead.model_validate(row)


@router.patch("/{party_id}/notes/{note_id}", response_model=PartyNoteRead)
def update_note(
    party_id: str,
    note_id: str,
    payload: PartyNoteUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyNoteRead:
    try:
        row = _ws(db, party_id).update_note(note_id, **payload.model_dump(exclude_unset=True))
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    db.commit()
    return PartyNoteRead.model_validate(row)


@router.delete("/{party_id}/notes/{note_id}", status_code=204)
def delete_note(
    party_id: str,
    note_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).delete_note(note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    db.commit()


# ── Users ─────────────────────────────────────────────────────────────────────


@router.get("/{party_id}/users", response_model=list[PartyUserRead])
def list_party_users(party_id: str, db: Session = Depends(get_db)) -> list[PartyUserRead]:
    try:
        rows = _ws(db, party_id).list_users()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [PartyUserRead.model_validate(r) for r in rows]


@router.post("/{party_id}/users", response_model=PartyUserRead, status_code=201)
def link_party_user(
    party_id: str,
    payload: PartyUserLink,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> PartyUserRead:
    try:
        user = _ws(db, party_id).link_user(payload.user_id)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    db.refresh(user)
    return PartyUserRead.model_validate(user)


@router.delete("/{party_id}/users/{user_id}", status_code=204)
def unlink_party_user(
    party_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).unlink_user(user_id):
        raise HTTPException(status_code=404, detail="User not linked to party")
    db.commit()


# ── Collaboration (reusable) ──────────────────────────────────────────────────


@router.get("/{party_id}/activity", response_model=CollabActivityListResponse)
def list_activity(
    party_id: str,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> CollabActivityListResponse:
    try:
        rows, total = _ws(db, party_id).list_activity(limit=limit, offset=offset)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return CollabActivityListResponse(
        data=[activity_to_read(r) for r in rows],
        meta={"count": total, "limit": limit, "offset": offset},
    )


@router.get("/{party_id}/comments", response_model=list[CollabCommentRead])
def list_comments(party_id: str, db: Session = Depends(get_db)) -> list[CollabCommentRead]:
    try:
        rows = _ws(db, party_id).list_comments()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [comment_to_read(r) for r in rows]


@router.post("/{party_id}/comments", response_model=CollabCommentRead, status_code=201)
def create_comment(
    party_id: str,
    payload: CollabCommentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> CollabCommentRead:
    try:
        row = _ws(db, party_id).add_comment(payload.comment, user_id=user.id, visibility=payload.visibility)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    db.refresh(row)
    return comment_to_read(row)


@router.get("/{party_id}/labels", response_model=list[CollabLabelRead])
def list_labels(party_id: str, db: Session = Depends(get_db)) -> list[CollabLabelRead]:
    try:
        rows = _ws(db, party_id).list_labels()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [CollabLabelRead.model_validate(r) for r in rows]


@router.post("/{party_id}/labels", response_model=CollabLabelRead, status_code=201)
def add_label(
    party_id: str,
    payload: CollabLabelCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> CollabLabelRead:
    try:
        row = _ws(db, party_id).add_label(payload.label, applied_by=user.id)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    db.refresh(row)
    return CollabLabelRead.model_validate(row)


@router.delete("/{party_id}/labels/{label}", status_code=204)
def remove_label(
    party_id: str,
    label: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_write_access),
) -> None:
    if not _ws(db, party_id).remove_label(label):
        raise HTTPException(status_code=404, detail="Label not found")
    db.commit()


@router.get("/{party_id}/files", response_model=list[CollabFileRead])
def list_files(
    party_id: str,
    db: Session = Depends(get_db),
    file_type: Optional[str] = Query(default=None),
) -> list[CollabFileRead]:
    try:
        rows = _ws(db, party_id).list_files(file_type=file_type)
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    return [CollabFileRead.model_validate(r) for r in rows]


@router.post("/{party_id}/files", response_model=CollabFileRead, status_code=201)
def add_file(
    party_id: str,
    payload: CollabFileCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> CollabFileRead:
    try:
        row = _ws(db, party_id).add_file(
            filename=payload.filename,
            storage_ref=payload.storage_ref,
            file_type=payload.file_type,
            mime_type=payload.mime_type,
            size_bytes=payload.size_bytes,
            uploaded_by=user.id,
        )
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    db.refresh(row)
    return CollabFileRead.model_validate(row)


@router.get("/{party_id}/ownership", response_model=CollabOwnershipRead)
def get_ownership(party_id: str, db: Session = Depends(get_db)) -> CollabOwnershipRead:
    try:
        row = _ws(db, party_id).get_ownership()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Ownership record not found")
    return CollabOwnershipRead.model_validate(row)


@router.patch("/{party_id}/ownership", response_model=CollabOwnershipRead)
def update_ownership(
    party_id: str,
    payload: CollabOwnershipUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> CollabOwnershipRead:
    try:
        svc = _ws(db, party_id)
        row = svc.update_ownership(assigned_to=payload.assigned_to, source=payload.source)
        if payload.department is not None:
            row.department = payload.department
            db.flush()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    db.commit()
    db.refresh(row)
    return CollabOwnershipRead.model_validate(row)


@router.get("/{party_id}/approval", response_model=CollabApprovalRead)
def get_approval(party_id: str, db: Session = Depends(get_db)) -> CollabApprovalRead:
    try:
        row = _ws(db, party_id).get_approval()
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Approval state not found")
    return CollabApprovalRead.model_validate(row)


@router.patch("/{party_id}/approval", response_model=CollabApprovalRead)
def update_approval(
    party_id: str,
    payload: CollabApprovalUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> CollabApprovalRead:
    try:
        row = _ws(db, party_id).update_approval(
            payload.status,
            actor_id=user.id,
            rejection_reason=payload.rejection_reason,
        )
    except PartyWorkspaceError as exc:
        raise _handle_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return CollabApprovalRead.model_validate(row)
