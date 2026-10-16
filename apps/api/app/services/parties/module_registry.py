"""Reusable module service stubs for Party Workspace."""

from __future__ import annotations

from typing import Any

from app.services.parties.workspace_constants import PARTY_MODULE_KEYS


class BasePartyModuleService:
    module_key: str = "base"

    def has_extension(self, party_id: str) -> bool:
        return False

    def ensure_extension(self, party_id: str, *, company_id: str = "default") -> None:
        return None

    def get_summary(self, party_id: str) -> dict[str, Any]:
        return {"module": self.module_key, "party_id": party_id, "ready": True}


class CrmPartyModuleService(BasePartyModuleService):
    module_key = "crm"


class HrPartyModuleService(BasePartyModuleService):
    module_key = "hr"


class PurchasePartyModuleService(BasePartyModuleService):
    module_key = "purchase"


class SalesPartyModuleService(BasePartyModuleService):
    module_key = "sales"


class ServicePartyModuleService(BasePartyModuleService):
    module_key = "service"


class ManufacturingPartyModuleService(BasePartyModuleService):
    module_key = "manufacturing"


class ProjectsPartyModuleService(BasePartyModuleService):
    module_key = "projects"


class AiPartyModuleService(BasePartyModuleService):
    module_key = "ai"


_MODULE_REGISTRY: dict[str, BasePartyModuleService] = {
    "crm": CrmPartyModuleService(),
    "hr": HrPartyModuleService(),
    "purchase": PurchasePartyModuleService(),
    "sales": SalesPartyModuleService(),
    "service": ServicePartyModuleService(),
    "manufacturing": ManufacturingPartyModuleService(),
    "projects": ProjectsPartyModuleService(),
    "ai": AiPartyModuleService(),
}


def get_party_module(module_key: str) -> BasePartyModuleService:
    if module_key not in PARTY_MODULE_KEYS:
        raise ValueError(f"Unknown party module: {module_key}")
    return _MODULE_REGISTRY[module_key]


def list_party_modules() -> list[str]:
    return sorted(PARTY_MODULE_KEYS)
