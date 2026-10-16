"""SQLAlchemy implementation of PartyRepository."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from app.models.party import Party
from app.models.party_role import PartyRole
from app.services.parties.interfaces import PartyCreateInput, PartyRecord, PartyUpdateInput
from app.services.parties.party_role_repository import SqlAlchemyPartyRoleRepository


def party_to_record(row: Party) -> PartyRecord:
    roles = tuple(sorted(role.role for role in row.roles)) if row.roles else ()
    return PartyRecord(
        id=row.id,
        company_id=row.company_id,
        type=row.type,
        display_name=row.display_name,
        legal_name=row.legal_name,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
        roles=roles,
    )


class SqlAlchemyPartyRepository:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._roles = SqlAlchemyPartyRoleRepository(db)

    def get_by_id(self, party_id: str) -> Optional[PartyRecord]:
        row = (
            self._db.query(Party)
            .options(selectinload(Party.roles))
            .filter(Party.id == party_id)
            .first()
        )
        return party_to_record(row) if row else None

    def list_parties(
        self,
        *,
        company_id: str = "default",
        party_type: Optional[str] = None,
        status: Optional[str] = None,
        role: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PartyRecord]:
        query = (
            self._db.query(Party)
            .options(selectinload(Party.roles))
            .filter(Party.company_id == company_id)
        )
        if party_type:
            query = query.filter(Party.type == party_type)
        if status:
            query = query.filter(Party.status == status)
        if role:
            query = query.join(PartyRole).filter(PartyRole.role == role)
        rows = (
            query.order_by(Party.updated_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return [party_to_record(row) for row in rows]

    def create(self, data: PartyCreateInput) -> PartyRecord:
        row = Party(
            id=data.id or str(uuid.uuid4()),
            company_id=data.company_id,
            type=data.type,
            display_name=data.display_name,
            legal_name=data.legal_name or data.display_name,
            status=data.status,
        )
        self._db.add(row)
        self._db.flush()
        for role in data.roles:
            self._roles.add_role(row.id, role)
        self._db.flush()
        return self.get_by_id(row.id) or party_to_record(row)

    def update(self, party_id: str, data: PartyUpdateInput) -> Optional[PartyRecord]:
        row = (
            self._db.query(Party)
            .options(selectinload(Party.roles))
            .filter(Party.id == party_id)
            .first()
        )
        if not row:
            return None
        updates = {
            "type": data.type,
            "display_name": data.display_name,
            "legal_name": data.legal_name,
            "status": data.status,
        }
        for key, value in updates.items():
            if value is not None:
                setattr(row, key, value)
        self._db.flush()
        return party_to_record(row)
