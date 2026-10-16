"""Party domain service — core CRUD and role management."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.services.parties.constants import PARTY_ROLES, PARTY_STATUSES, PARTY_TYPES
from app.services.parties.interfaces import (
    PartyCreateInput,
    PartyRecord,
    PartyRoleRecord,
    PartyUpdateInput,
)
from app.services.parties.party_repository import SqlAlchemyPartyRepository
from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository
from app.services.parties.party_workspace_hooks import on_party_created, on_party_updated


class PartyValidationError(ValueError):
    pass


class PartyService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = SqlAlchemyPartyRepository(db)
        self._roles = SqlAlchemyPartyRoleRepository(db)

    def get(self, party_id: str, *, company_id: Optional[str] = None) -> Optional[PartyRecord]:
        record = self._repo.get_by_id(party_id)
        if record is not None and company_id is not None and record.company_id != company_id:
            return None
        return record

    def list(
        self,
        *,
        company_id: str = "default",
        party_type: Optional[str] = None,
        status: Optional[str] = None,
        role: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PartyRecord]:
        return self._repo.list_parties(
            company_id=company_id,
            party_type=party_type,
            status=status,
            role=role,
            limit=limit,
            offset=offset,
        )

    def create(self, data: PartyCreateInput) -> PartyRecord:
        self._validate_type(data.type)
        self._validate_status(data.status)
        for role in data.roles:
            self._validate_role(role)
        record = self._repo.create(data)
        on_party_created(
            self._db,
            record.id,
            company_id=data.company_id,
            source="user",
        )
        return record

    def update(
        self,
        party_id: str,
        data: PartyUpdateInput,
        *,
        company_id: Optional[str] = None,
    ) -> Optional[PartyRecord]:
        if company_id is not None:
            existing = self._repo.get_by_id(party_id)
            if existing is None or existing.company_id != company_id:
                return None
        if data.type is not None:
            self._validate_type(data.type)
        if data.status is not None:
            self._validate_status(data.status)
        updated = self._repo.update(party_id, data)
        if updated:
            on_party_updated(self._db, party_id, changes=data.__dict__)
        return updated

    def list_roles(self, party_id: str, *, company_id: Optional[str] = None) -> list[PartyRoleRecord]:
        if company_id is not None:
            existing = self._repo.get_by_id(party_id)
            if existing is None or existing.company_id != company_id:
                return []
        return self._roles.list_roles(party_id)

    def add_role(self, party_id: str, role: str, *, company_id: Optional[str] = None) -> PartyRoleRecord:
        existing = self._repo.get_by_id(party_id)
        if not existing or (company_id is not None and existing.company_id != company_id):
            raise PartyValidationError("Party not found")
        self._validate_role(role)
        return self._roles.add_role(party_id, role)

    def remove_role(self, party_id: str, role: str, *, company_id: Optional[str] = None) -> bool:
        if company_id is not None:
            existing = self._repo.get_by_id(party_id)
            if existing is None or existing.company_id != company_id:
                return False
        return self._roles.remove_role(party_id, role)

    @staticmethod
    def _validate_type(party_type: str) -> None:
        if party_type not in PARTY_TYPES:
            raise PartyValidationError(f"Invalid party type: {party_type}")

    @staticmethod
    def _validate_status(status: str) -> None:
        if status not in PARTY_STATUSES:
            raise PartyValidationError(f"Invalid party status: {status}")

    @staticmethod
    def _validate_role(role: str) -> None:
        if role not in PARTY_ROLES:
            raise PartyValidationError(f"Invalid party role: {role}")
