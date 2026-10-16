"""SQLAlchemy implementation of PartyRoleRepository."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.party_role import PartyRole
from app.services.parties.interfaces import PartyRoleRecord


def party_role_to_record(row: PartyRole) -> PartyRoleRecord:
    return PartyRoleRecord(
        id=row.id,
        party_id=row.party_id,
        role=row.role,
        created_at=row.created_at,
    )


class SqlAlchemyPartyRoleRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_roles(self, party_id: str) -> list[PartyRoleRecord]:
        rows = (
            self._db.query(PartyRole)
            .filter(PartyRole.party_id == party_id)
            .order_by(PartyRole.role)
            .all()
        )
        return [party_role_to_record(row) for row in rows]

    def has_role(self, party_id: str, role: str) -> bool:
        return (
            self._db.query(PartyRole.id)
            .filter(PartyRole.party_id == party_id, PartyRole.role == role)
            .first()
            is not None
        )

    def add_role(self, party_id: str, role: str) -> PartyRoleRecord:
        existing = (
            self._db.query(PartyRole)
            .filter(PartyRole.party_id == party_id, PartyRole.role == role)
            .first()
        )
        if existing:
            return party_role_to_record(existing)
        row = PartyRole(
            id=str(uuid.uuid4()),
            party_id=party_id,
            role=role,
        )
        self._db.add(row)
        self._db.flush()
        return party_role_to_record(row)

    def remove_role(self, party_id: str, role: str) -> bool:
        row = (
            self._db.query(PartyRole)
            .filter(PartyRole.party_id == party_id, PartyRole.role == role)
            .first()
        )
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True
