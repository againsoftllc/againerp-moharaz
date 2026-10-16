"""Party Workspace facade — profile data + collaboration + module registry."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.party_address import PartyAddress
from app.models.party_bank_account import PartyBankAccount
from app.models.party_contact import PartyContact
from app.models.party_document import PartyDocument
from app.models.party_note import PartyNote
from app.services.collaboration.collaboration_service import CollaborationService
from app.services.collaboration.constants import ENTITY_TYPE_PARTY
from app.services.parties.module_registry import get_party_module, list_party_modules
from app.services.parties.party_service import PartyService
from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository
from app.services.parties.workspace_constants import (
    ADDRESS_TYPES,
    CONTACT_KINDS,
    DOCUMENT_TYPES,
    NOTE_TYPES,
)
from app.services.parties.workspace_interfaces import PartyWorkspaceSummary
from app.services.parties.workspace_repositories import (
    SqlAlchemyPartyAddressRepository,
    SqlAlchemyPartyBankAccountRepository,
    SqlAlchemyPartyContactRepository,
    SqlAlchemyPartyDocumentRepository,
    SqlAlchemyPartyNoteRepository,
)


class PartyWorkspaceError(ValueError):
    pass


class PartyWorkspaceService:
    """Reusable workspace for Customer, Supplier, Employee, and all future modules."""

    entity_type = ENTITY_TYPE_PARTY

    def __init__(self, db: Session, party_id: str, company_id: str = "default") -> None:
        self.db = db
        self.party_id = party_id
        self.company_id = company_id
        self._collab = CollaborationService(db, company_id=company_id)
        self._contacts = SqlAlchemyPartyContactRepository(db, company_id)
        self._addresses = SqlAlchemyPartyAddressRepository(db, company_id)
        self._documents = SqlAlchemyPartyDocumentRepository(db, company_id)
        self._bank_accounts = SqlAlchemyPartyBankAccountRepository(db, company_id)
        self._notes = SqlAlchemyPartyNoteRepository(db, company_id)

    def _ensure_party(self) -> None:
        if not PartyService(self.db).get(self.party_id):
            raise PartyWorkspaceError("Party not found")

    # ── Contacts ─────────────────────────────────────────────────────────────

    def list_contacts(self, *, contact_kind: Optional[str] = None):
        self._ensure_party()
        return self._contacts.list_contacts(self.party_id, contact_kind=contact_kind)

    def add_contact(
        self,
        *,
        contact_kind: str,
        value: str,
        label: str = "",
        is_primary: bool = False,
        sort_order: int = 0,
    ):
        self._ensure_party()
        if contact_kind not in CONTACT_KINDS:
            raise PartyWorkspaceError(f"Invalid contact kind: {contact_kind}")
        row = self._contacts.add_contact(
            self.party_id,
            {
                "contact_kind": contact_kind,
                "value": value,
                "label": label,
                "is_primary": is_primary,
                "sort_order": sort_order,
            },
        )
        self._collab.record_activity(
            self.entity_type,
            self.party_id,
            "contact_added",
            details={"contact_kind": contact_kind, "value": value},
        )
        return row

    def update_contact(self, contact_id: str, **fields):
        row = self._contacts.update_contact(contact_id, fields)
        if row and row.party_id == self.party_id:
            self._collab.record_activity(
                self.entity_type,
                self.party_id,
                "contact_updated",
                details={"contact_id": contact_id},
            )
        return row

    def delete_contact(self, contact_id: str) -> bool:
        row = self.db.get(PartyContact, contact_id)
        if not row or row.party_id != self.party_id:
            return False
        deleted = self._contacts.delete_contact(contact_id)
        if deleted:
            self._collab.record_activity(
                self.entity_type,
                self.party_id,
                "contact_removed",
                details={"contact_id": contact_id},
            )
        return deleted

    # ── Addresses ────────────────────────────────────────────────────────────

    def list_addresses(self, *, address_type: Optional[str] = None):
        self._ensure_party()
        return self._addresses.list_addresses(self.party_id, address_type=address_type)

    def add_address(
        self,
        *,
        address_type: str,
        label: str = "",
        line1: str = "",
        line2: Optional[str] = None,
        city: str = "",
        region: str = "",
        postal_code: str = "",
        country: str = "Bangladesh",
        is_primary: bool = False,
        sort_order: int = 0,
    ):
        self._ensure_party()
        if address_type not in ADDRESS_TYPES:
            raise PartyWorkspaceError(f"Invalid address type: {address_type}")
        row = self._addresses.add_address(
            self.party_id,
            {
                "address_type": address_type,
                "label": label,
                "line1": line1,
                "line2": line2,
                "city": city,
                "region": region,
                "postal_code": postal_code,
                "country": country,
                "is_primary": is_primary,
                "sort_order": sort_order,
            },
        )
        self._collab.record_activity(
            self.entity_type,
            self.party_id,
            "address_added",
            details={"address_type": address_type},
        )
        return row

    def update_address(self, address_id: str, **fields):
        row = self._addresses.update_address(address_id, fields)
        if row and row.party_id == self.party_id:
            self._collab.record_activity(
                self.entity_type,
                self.party_id,
                "address_updated",
                details={"address_id": address_id},
            )
        return row

    def delete_address(self, address_id: str) -> bool:
        row = self.db.get(PartyAddress, address_id)
        if not row or row.party_id != self.party_id:
            return False
        return self._addresses.delete_address(address_id)

    # ── Documents ────────────────────────────────────────────────────────────

    def list_documents(self, *, document_type: Optional[str] = None):
        self._ensure_party()
        return self._documents.list_documents(self.party_id, document_type=document_type)

    def add_document(
        self,
        *,
        document_type: str,
        document_number: Optional[str] = None,
        issuer: Optional[str] = None,
        issued_at: Optional[date] = None,
        expires_at: Optional[date] = None,
        storage_ref: Optional[str] = None,
        notes: Optional[str] = None,
        is_verified: bool = False,
    ):
        self._ensure_party()
        if document_type not in DOCUMENT_TYPES:
            raise PartyWorkspaceError(f"Invalid document type: {document_type}")
        row = self._documents.add_document(
            self.party_id,
            {
                "document_type": document_type,
                "document_number": document_number,
                "issuer": issuer,
                "issued_at": issued_at,
                "expires_at": expires_at,
                "storage_ref": storage_ref,
                "notes": notes,
                "is_verified": is_verified,
            },
        )
        self._collab.record_activity(
            self.entity_type,
            self.party_id,
            "document_added",
            details={"document_type": document_type},
        )
        return row

    def update_document(self, document_id: str, **fields):
        return self._documents.update_document(document_id, fields)

    def delete_document(self, document_id: str) -> bool:
        row = self.db.get(PartyDocument, document_id)
        if not row or row.party_id != self.party_id:
            return False
        return self._documents.delete_document(document_id)

    # ── Bank accounts ────────────────────────────────────────────────────────

    def list_bank_accounts(self):
        self._ensure_party()
        return self._bank_accounts.list_bank_accounts(self.party_id)

    def add_bank_account(
        self,
        *,
        bank_name: str,
        account_name: str,
        account_number: str,
        routing_number: Optional[str] = None,
        swift_code: Optional[str] = None,
        currency: str = "BDT",
        is_primary: bool = False,
        is_active: bool = True,
    ):
        self._ensure_party()
        row = self._bank_accounts.add_bank_account(
            self.party_id,
            {
                "bank_name": bank_name,
                "account_name": account_name,
                "account_number": account_number,
                "routing_number": routing_number,
                "swift_code": swift_code,
                "currency": currency,
                "is_primary": is_primary,
                "is_active": is_active,
            },
        )
        self._collab.record_activity(
            self.entity_type,
            self.party_id,
            "bank_account_added",
            details={"bank_name": bank_name},
        )
        return row

    def update_bank_account(self, account_id: str, **fields):
        return self._bank_accounts.update_bank_account(account_id, fields)

    def delete_bank_account(self, account_id: str) -> bool:
        row = self.db.get(PartyBankAccount, account_id)
        if not row or row.party_id != self.party_id:
            return False
        return self._bank_accounts.delete_bank_account(account_id)

    # ── Notes ────────────────────────────────────────────────────────────────

    def list_notes(self):
        self._ensure_party()
        return self._notes.list_notes(self.party_id)

    def add_note(
        self,
        *,
        body: str,
        note_type: str = "general",
        title: Optional[str] = None,
        created_by: Optional[str] = None,
        is_pinned: bool = False,
    ):
        self._ensure_party()
        if note_type not in NOTE_TYPES:
            raise PartyWorkspaceError(f"Invalid note type: {note_type}")
        return self._notes.add_note(
            self.party_id,
            {
                "body": body,
                "note_type": note_type,
                "title": title,
                "created_by": created_by,
                "is_pinned": is_pinned,
            },
        )

    def update_note(self, note_id: str, **fields):
        return self._notes.update_note(note_id, fields)

    def delete_note(self, note_id: str) -> bool:
        row = self.db.get(PartyNote, note_id)
        if not row or row.party_id != self.party_id:
            return False
        return self._notes.delete_note(note_id)

    # ── User ↔ Party link ────────────────────────────────────────────────────

    def list_users(self) -> list[AuthUser]:
        self._ensure_party()
        return (
            self.db.query(AuthUser)
            .filter(AuthUser.party_id == self.party_id, AuthUser.company_id == self.company_id)
            .order_by(AuthUser.name)
            .all()
        )

    def link_user(self, user_id: str) -> AuthUser:
        """Link auth user to this party. One user belongs to one party."""
        self._ensure_party()
        user = self.db.get(AuthUser, user_id)
        if not user:
            raise PartyWorkspaceError("User not found")
        if user.party_id and user.party_id != self.party_id:
            raise PartyWorkspaceError("User already linked to another party")
        user.party_id = self.party_id
        roles = SqlAlchemyPartyRoleRepository(self.db)
        roles.add_role(self.party_id, "user")
        self._collab.record_activity(
            self.entity_type,
            self.party_id,
            "user_linked",
            performed_by=user_id,
            details={"user_id": user_id},
        )
        self.db.flush()
        return user

    def unlink_user(self, user_id: str) -> bool:
        user = self.db.get(AuthUser, user_id)
        if not user or user.party_id != self.party_id:
            return False
        user.party_id = None
        self.db.flush()
        return True

    # ── Collaboration delegation ───────────────────────────────────────────────

    def get_ownership(self):
        return self._collab.get_ownership(self.entity_type, self.party_id)

    def update_ownership(self, **fields):
        return self._collab.ensure_ownership(
            self.entity_type,
            self.party_id,
            created_by=fields.get("created_by"),
            assigned_to=fields.get("assigned_to"),
            source=fields.get("source", "user"),
        )

    def list_activity(self, *, limit: int = 50, offset: int = 0):
        return self._collab.list_activity(self.entity_type, self.party_id, limit=limit, offset=offset)

    def list_comments(self):
        return self._collab.list_comments(self.entity_type, self.party_id)

    def add_comment(self, comment: str, *, user_id: Optional[str] = None, visibility: str = "internal"):
        return self._collab.add_comment(
            self.entity_type,
            self.party_id,
            comment,
            user_id=user_id,
            visibility=visibility,
        )

    def list_labels(self):
        return self._collab.list_labels(self.entity_type, self.party_id)

    def add_label(self, label: str, *, applied_by: Optional[str] = None):
        return self._collab.add_label(self.entity_type, self.party_id, label, applied_by=applied_by)

    def remove_label(self, label: str) -> bool:
        return self._collab.remove_label(self.entity_type, self.party_id, label)

    def list_files(self, *, file_type: Optional[str] = None):
        return self._collab.list_files(self.entity_type, self.party_id, file_type=file_type)

    def add_file(self, **fields):
        return self._collab.add_file(self.entity_type, self.party_id, **fields)

    def get_approval(self):
        return self._collab.get_approval(self.entity_type, self.party_id)

    def update_approval(self, status: str, *, actor_id: Optional[str] = None, rejection_reason: Optional[str] = None):
        return self._collab.update_approval(
            self.entity_type,
            self.party_id,
            status,
            actor_id=actor_id,
            rejection_reason=rejection_reason,
        )

    def list_ai_notes(self, *, status: Optional[str] = None):
        return self._collab.list_ai_notes(self.entity_type, self.party_id, status=status)

    # ── Module registry ────────────────────────────────────────────────────────

    def list_modules(self) -> list[str]:
        return list_party_modules()

    def get_module_summary(self, module_key: str) -> dict[str, Any]:
        self._ensure_party()
        return get_party_module(module_key).get_summary(self.party_id)

    def ensure_module(self, module_key: str) -> None:
        self._ensure_party()
        get_party_module(module_key).ensure_extension(self.party_id, company_id=self.company_id)

    # ── Workspace summary ─────────────────────────────────────────────────────

    def get_summary(self) -> PartyWorkspaceSummary:
        self._ensure_party()
        collab = self._collab.get_workspace_summary(self.entity_type, self.party_id)
        approval = collab.get("approval")
        ownership = collab.get("ownership")
        user_count = (
            self.db.query(AuthUser)
            .filter(AuthUser.party_id == self.party_id, AuthUser.company_id == self.company_id)
            .count()
        )
        return PartyWorkspaceSummary(
            party_id=self.party_id,
            contact_count=len(self._contacts.list_contacts(self.party_id)),
            address_count=len(self._addresses.list_addresses(self.party_id)),
            document_count=len(self._documents.list_documents(self.party_id)),
            bank_account_count=len(self._bank_accounts.list_bank_accounts(self.party_id)),
            note_count=len(self._notes.list_notes(self.party_id)),
            user_count=user_count,
            comment_count=collab["comment_count"],
            file_count=collab["file_count"],
            label_count=len(collab["labels"]),
            pending_ai_notes=collab["pending_ai_notes"],
            approval_status=approval.status if approval else None,
            assigned_to=ownership.assigned_to if ownership else None,
        )
