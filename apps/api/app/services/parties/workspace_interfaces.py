"""Party Workspace — datatypes and repository protocols."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class PartyContactRecord:
    id: str
    party_id: str
    company_id: str
    contact_kind: str
    label: str
    value: str
    is_primary: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class PartyAddressRecord:
    id: str
    party_id: str
    company_id: str
    address_type: str
    label: str
    line1: str
    line2: Optional[str]
    city: str
    region: str
    postal_code: str
    country: str
    is_primary: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class PartyDocumentRecord:
    id: str
    party_id: str
    company_id: str
    document_type: str
    document_number: Optional[str]
    issuer: Optional[str]
    issued_at: Optional[date]
    expires_at: Optional[date]
    storage_ref: Optional[str]
    notes: Optional[str]
    is_verified: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class PartyBankAccountRecord:
    id: str
    party_id: str
    company_id: str
    bank_name: str
    account_name: str
    account_number: str
    routing_number: Optional[str]
    swift_code: Optional[str]
    currency: str
    is_primary: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class PartyNoteRecord:
    id: str
    party_id: str
    company_id: str
    note_type: str
    title: Optional[str]
    body: str
    created_by: Optional[str]
    is_pinned: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class PartyWorkspaceSummary:
    party_id: str
    contact_count: int
    address_count: int
    document_count: int
    bank_account_count: int
    note_count: int
    user_count: int
    comment_count: int
    file_count: int
    label_count: int
    pending_ai_notes: int
    approval_status: Optional[str]
    assigned_to: Optional[str]


@runtime_checkable
class PartyContactRepository(Protocol):
    def list_contacts(self, party_id: str, *, contact_kind: Optional[str] = None) -> list[PartyContactRecord]: ...
    def add_contact(self, party_id: str, data: dict[str, Any]) -> PartyContactRecord: ...
    def update_contact(self, contact_id: str, data: dict[str, Any]) -> Optional[PartyContactRecord]: ...
    def delete_contact(self, contact_id: str) -> bool: ...


@runtime_checkable
class PartyAddressRepository(Protocol):
    def list_addresses(self, party_id: str, *, address_type: Optional[str] = None) -> list[PartyAddressRecord]: ...
    def add_address(self, party_id: str, data: dict[str, Any]) -> PartyAddressRecord: ...
    def update_address(self, address_id: str, data: dict[str, Any]) -> Optional[PartyAddressRecord]: ...
    def delete_address(self, address_id: str) -> bool: ...


@runtime_checkable
class PartyDocumentRepository(Protocol):
    def list_documents(self, party_id: str, *, document_type: Optional[str] = None) -> list[PartyDocumentRecord]: ...
    def add_document(self, party_id: str, data: dict[str, Any]) -> PartyDocumentRecord: ...
    def update_document(self, document_id: str, data: dict[str, Any]) -> Optional[PartyDocumentRecord]: ...
    def delete_document(self, document_id: str) -> bool: ...


@runtime_checkable
class PartyBankAccountRepository(Protocol):
    def list_bank_accounts(self, party_id: str) -> list[PartyBankAccountRecord]: ...
    def add_bank_account(self, party_id: str, data: dict[str, Any]) -> PartyBankAccountRecord: ...
    def update_bank_account(self, account_id: str, data: dict[str, Any]) -> Optional[PartyBankAccountRecord]: ...
    def delete_bank_account(self, account_id: str) -> bool: ...


@runtime_checkable
class PartyNoteRepository(Protocol):
    def list_notes(self, party_id: str) -> list[PartyNoteRecord]: ...
    def add_note(self, party_id: str, data: dict[str, Any]) -> PartyNoteRecord: ...
    def update_note(self, note_id: str, data: dict[str, Any]) -> Optional[PartyNoteRecord]: ...
    def delete_note(self, note_id: str) -> bool: ...


@runtime_checkable
class PartyModuleService(Protocol):
    module_key: str

    def has_extension(self, party_id: str) -> bool: ...

    def ensure_extension(self, party_id: str, *, company_id: str = "default") -> None: ...

    def get_summary(self, party_id: str) -> dict[str, Any]: ...
