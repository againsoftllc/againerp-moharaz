"""Repository and module-extension interfaces for Universal Party platform."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class PartyRoleRecord:
    id: str
    party_id: str
    role: str
    created_at: datetime


@dataclass(frozen=True)
class PartyRecord:
    id: str
    company_id: str
    type: str
    display_name: str
    legal_name: str
    status: str
    created_at: datetime
    updated_at: datetime
    roles: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class PartyCreateInput:
    display_name: str
    type: str = "person"
    legal_name: str = ""
    status: str = "active"
    company_id: str = "default"
    roles: tuple[str, ...] = field(default_factory=tuple)
    id: Optional[str] = None


@dataclass(frozen=True)
class PartyUpdateInput:
    type: Optional[str] = None
    display_name: Optional[str] = None
    legal_name: Optional[str] = None
    status: Optional[str] = None


@runtime_checkable
class PartyRepository(Protocol):
    def get_by_id(self, party_id: str) -> Optional[PartyRecord]: ...

    def list_parties(
        self,
        *,
        company_id: str = "default",
        party_type: Optional[str] = None,
        status: Optional[str] = None,
        role: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PartyRecord]: ...

    def create(self, data: PartyCreateInput) -> PartyRecord: ...

    def update(self, party_id: str, data: PartyUpdateInput) -> Optional[PartyRecord]: ...


@runtime_checkable
class PartyRoleRepository(Protocol):
    def list_roles(self, party_id: str) -> list[PartyRoleRecord]: ...

    def has_role(self, party_id: str, role: str) -> bool: ...

    def add_role(self, party_id: str, role: str) -> PartyRoleRecord: ...

    def remove_role(self, party_id: str, role: str) -> bool: ...


@runtime_checkable
class ModulePartyExtensionRepository(Protocol):
    """Base contract for module extension tables keyed by party_id."""

    module_key: str

    def has_extension(self, party_id: str) -> bool: ...

    def ensure_extension(self, party_id: str, *, company_id: str = "default") -> None: ...


class CustomerPartyRepository(ModulePartyExtensionRepository, Protocol):
    ...


class SupplierPartyRepository(ModulePartyExtensionRepository, Protocol):
    ...


class EmployeePartyRepository(ModulePartyExtensionRepository, Protocol):
    ...
