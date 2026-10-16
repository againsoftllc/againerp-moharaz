"""SQLAlchemy repositories for Party Workspace profile data."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.party_address import PartyAddress
from app.models.party_bank_account import PartyBankAccount
from app.models.party_contact import PartyContact
from app.models.party_document import PartyDocument
from app.models.party_note import PartyNote
from app.services.parties.workspace_interfaces import (
    PartyAddressRecord,
    PartyBankAccountRecord,
    PartyContactRecord,
    PartyDocumentRecord,
    PartyNoteRecord,
)


def _contact_record(row: PartyContact) -> PartyContactRecord:
    return PartyContactRecord(
        id=row.id,
        party_id=row.party_id,
        company_id=row.company_id,
        contact_kind=row.contact_kind,
        label=row.label,
        value=row.value,
        is_primary=row.is_primary,
        sort_order=row.sort_order,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _address_record(row: PartyAddress) -> PartyAddressRecord:
    return PartyAddressRecord(
        id=row.id,
        party_id=row.party_id,
        company_id=row.company_id,
        address_type=row.address_type,
        label=row.label,
        line1=row.line1,
        line2=row.line2,
        city=row.city,
        region=row.region,
        postal_code=row.postal_code,
        country=row.country,
        is_primary=row.is_primary,
        sort_order=row.sort_order,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _document_record(row: PartyDocument) -> PartyDocumentRecord:
    return PartyDocumentRecord(
        id=row.id,
        party_id=row.party_id,
        company_id=row.company_id,
        document_type=row.document_type,
        document_number=row.document_number,
        issuer=row.issuer,
        issued_at=row.issued_at,
        expires_at=row.expires_at,
        storage_ref=row.storage_ref,
        notes=row.notes,
        is_verified=row.is_verified,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _bank_record(row: PartyBankAccount) -> PartyBankAccountRecord:
    return PartyBankAccountRecord(
        id=row.id,
        party_id=row.party_id,
        company_id=row.company_id,
        bank_name=row.bank_name,
        account_name=row.account_name,
        account_number=row.account_number,
        routing_number=row.routing_number,
        swift_code=row.swift_code,
        currency=row.currency,
        is_primary=row.is_primary,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _note_record(row: PartyNote) -> PartyNoteRecord:
    return PartyNoteRecord(
        id=row.id,
        party_id=row.party_id,
        company_id=row.company_id,
        note_type=row.note_type,
        title=row.title,
        body=row.body,
        created_by=row.created_by,
        is_pinned=row.is_pinned,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlAlchemyPartyContactRepository:
    def __init__(self, db: Session, company_id: str = "default") -> None:
        self._db = db
        self._company_id = company_id

    def list_contacts(
        self,
        party_id: str,
        *,
        contact_kind: Optional[str] = None,
    ) -> list[PartyContactRecord]:
        query = self._db.query(PartyContact).filter(
            PartyContact.party_id == party_id,
            PartyContact.company_id == self._company_id,
        )
        if contact_kind:
            query = query.filter(PartyContact.contact_kind == contact_kind)
        rows = query.order_by(PartyContact.sort_order, PartyContact.created_at).all()
        return [_contact_record(row) for row in rows]

    def add_contact(self, party_id: str, data: dict[str, Any]) -> PartyContactRecord:
        row = PartyContact(
            id=str(uuid.uuid4()),
            party_id=party_id,
            company_id=self._company_id,
            contact_kind=data["contact_kind"],
            label=data.get("label", ""),
            value=data["value"],
            is_primary=data.get("is_primary", False),
            sort_order=data.get("sort_order", 0),
        )
        self._db.add(row)
        self._db.flush()
        return _contact_record(row)

    def update_contact(self, contact_id: str, data: dict[str, Any]) -> Optional[PartyContactRecord]:
        row = self._db.get(PartyContact, contact_id)
        if not row:
            return None
        for key in ("contact_kind", "label", "value", "is_primary", "sort_order"):
            if key in data and data[key] is not None:
                setattr(row, key, data[key])
        self._db.flush()
        return _contact_record(row)

    def delete_contact(self, contact_id: str) -> bool:
        row = self._db.get(PartyContact, contact_id)
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True


class SqlAlchemyPartyAddressRepository:
    def __init__(self, db: Session, company_id: str = "default") -> None:
        self._db = db
        self._company_id = company_id

    def list_addresses(
        self,
        party_id: str,
        *,
        address_type: Optional[str] = None,
    ) -> list[PartyAddressRecord]:
        query = self._db.query(PartyAddress).filter(
            PartyAddress.party_id == party_id,
            PartyAddress.company_id == self._company_id,
        )
        if address_type:
            query = query.filter(PartyAddress.address_type == address_type)
        rows = query.order_by(PartyAddress.sort_order, PartyAddress.created_at).all()
        return [_address_record(row) for row in rows]

    def add_address(self, party_id: str, data: dict[str, Any]) -> PartyAddressRecord:
        row = PartyAddress(
            id=str(uuid.uuid4()),
            party_id=party_id,
            company_id=self._company_id,
            address_type=data["address_type"],
            label=data.get("label", ""),
            line1=data.get("line1", ""),
            line2=data.get("line2"),
            city=data.get("city", ""),
            region=data.get("region", ""),
            postal_code=data.get("postal_code", ""),
            country=data.get("country", "Bangladesh"),
            is_primary=data.get("is_primary", False),
            sort_order=data.get("sort_order", 0),
        )
        self._db.add(row)
        self._db.flush()
        return _address_record(row)

    def update_address(self, address_id: str, data: dict[str, Any]) -> Optional[PartyAddressRecord]:
        row = self._db.get(PartyAddress, address_id)
        if not row:
            return None
        for key in (
            "address_type",
            "label",
            "line1",
            "line2",
            "city",
            "region",
            "postal_code",
            "country",
            "is_primary",
            "sort_order",
        ):
            if key in data and data[key] is not None:
                setattr(row, key, data[key])
        self._db.flush()
        return _address_record(row)

    def delete_address(self, address_id: str) -> bool:
        row = self._db.get(PartyAddress, address_id)
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True


class SqlAlchemyPartyDocumentRepository:
    def __init__(self, db: Session, company_id: str = "default") -> None:
        self._db = db
        self._company_id = company_id

    def list_documents(
        self,
        party_id: str,
        *,
        document_type: Optional[str] = None,
    ) -> list[PartyDocumentRecord]:
        query = self._db.query(PartyDocument).filter(
            PartyDocument.party_id == party_id,
            PartyDocument.company_id == self._company_id,
        )
        if document_type:
            query = query.filter(PartyDocument.document_type == document_type)
        rows = query.order_by(PartyDocument.created_at.desc()).all()
        return [_document_record(row) for row in rows]

    def add_document(self, party_id: str, data: dict[str, Any]) -> PartyDocumentRecord:
        row = PartyDocument(
            id=str(uuid.uuid4()),
            party_id=party_id,
            company_id=self._company_id,
            document_type=data["document_type"],
            document_number=data.get("document_number"),
            issuer=data.get("issuer"),
            issued_at=data.get("issued_at"),
            expires_at=data.get("expires_at"),
            storage_ref=data.get("storage_ref"),
            notes=data.get("notes"),
            is_verified=data.get("is_verified", False),
        )
        self._db.add(row)
        self._db.flush()
        return _document_record(row)

    def update_document(self, document_id: str, data: dict[str, Any]) -> Optional[PartyDocumentRecord]:
        row = self._db.get(PartyDocument, document_id)
        if not row:
            return None
        for key in (
            "document_type",
            "document_number",
            "issuer",
            "issued_at",
            "expires_at",
            "storage_ref",
            "notes",
            "is_verified",
        ):
            if key in data and data[key] is not None:
                setattr(row, key, data[key])
        self._db.flush()
        return _document_record(row)

    def delete_document(self, document_id: str) -> bool:
        row = self._db.get(PartyDocument, document_id)
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True


class SqlAlchemyPartyBankAccountRepository:
    def __init__(self, db: Session, company_id: str = "default") -> None:
        self._db = db
        self._company_id = company_id

    def list_bank_accounts(self, party_id: str) -> list[PartyBankAccountRecord]:
        rows = (
            self._db.query(PartyBankAccount)
            .filter(
                PartyBankAccount.party_id == party_id,
                PartyBankAccount.company_id == self._company_id,
            )
            .order_by(PartyBankAccount.is_primary.desc(), PartyBankAccount.created_at)
            .all()
        )
        return [_bank_record(row) for row in rows]

    def add_bank_account(self, party_id: str, data: dict[str, Any]) -> PartyBankAccountRecord:
        row = PartyBankAccount(
            id=str(uuid.uuid4()),
            party_id=party_id,
            company_id=self._company_id,
            bank_name=data["bank_name"],
            account_name=data["account_name"],
            account_number=data["account_number"],
            routing_number=data.get("routing_number"),
            swift_code=data.get("swift_code"),
            currency=data.get("currency", "BDT"),
            is_primary=data.get("is_primary", False),
            is_active=data.get("is_active", True),
        )
        self._db.add(row)
        self._db.flush()
        return _bank_record(row)

    def update_bank_account(self, account_id: str, data: dict[str, Any]) -> Optional[PartyBankAccountRecord]:
        row = self._db.get(PartyBankAccount, account_id)
        if not row:
            return None
        for key in (
            "bank_name",
            "account_name",
            "account_number",
            "routing_number",
            "swift_code",
            "currency",
            "is_primary",
            "is_active",
        ):
            if key in data and data[key] is not None:
                setattr(row, key, data[key])
        self._db.flush()
        return _bank_record(row)

    def delete_bank_account(self, account_id: str) -> bool:
        row = self._db.get(PartyBankAccount, account_id)
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True


class SqlAlchemyPartyNoteRepository:
    def __init__(self, db: Session, company_id: str = "default") -> None:
        self._db = db
        self._company_id = company_id

    def list_notes(self, party_id: str) -> list[PartyNoteRecord]:
        rows = (
            self._db.query(PartyNote)
            .filter(
                PartyNote.party_id == party_id,
                PartyNote.company_id == self._company_id,
            )
            .order_by(PartyNote.is_pinned.desc(), PartyNote.created_at.desc())
            .all()
        )
        return [_note_record(row) for row in rows]

    def add_note(self, party_id: str, data: dict[str, Any]) -> PartyNoteRecord:
        row = PartyNote(
            id=str(uuid.uuid4()),
            party_id=party_id,
            company_id=self._company_id,
            note_type=data.get("note_type", "general"),
            title=data.get("title"),
            body=data["body"],
            created_by=data.get("created_by"),
            is_pinned=data.get("is_pinned", False),
        )
        self._db.add(row)
        self._db.flush()
        return _note_record(row)

    def update_note(self, note_id: str, data: dict[str, Any]) -> Optional[PartyNoteRecord]:
        row = self._db.get(PartyNote, note_id)
        if not row:
            return None
        for key in ("note_type", "title", "body", "is_pinned"):
            if key in data and data[key] is not None:
                setattr(row, key, data[key])
        self._db.flush()
        return _note_record(row)

    def delete_note(self, note_id: str) -> bool:
        row = self._db.get(PartyNote, note_id)
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True
