"""remember — STEP 30. Writes directly to ai_memories via a DB session, not through
internal_api/a real ERP endpoint — there is no ERP business endpoint for this, it's
AI-OS-native state, same reasoning approval_gate.py already established for ai_approvals.
No bearer_token param (unlike customer/finance/sales/purchase tools) because this module
never makes an internal HTTP call at all.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.ai import memory_service
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition


def build_memory_tools(
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only when building for tool_catalog() metadata
    (registry.py) — safe, since that path never invokes a handler."""

    def remember(inp: dict) -> dict:
        scope = inp.get("scope", "personal")
        if scope not in ("personal", "company"):
            return {"error": "scope must be 'personal' or 'company'"}
        memory = memory_service.save_memory(
            db,  # type: ignore[arg-type]
            company_id=company_id,  # type: ignore[arg-type]
            user_id=user.id,  # type: ignore[union-attr]
            content=inp["fact"],
            scope=scope,
        )
        return {"status": "saved", "memory_id": memory.id, "scope": scope}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="remember",
                description=(
                    "Save a fact or preference to remember in future conversations. Use "
                    "only when the user explicitly asks you to remember something — never "
                    "on your own initiative. scope 'personal' (default) remembers it only "
                    "for this user; 'company' remembers it for everyone at this company."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "fact": {"type": "string", "description": "The fact or preference to remember, in plain text"},
                        "scope": {
                            "type": "string",
                            "enum": ["personal", "company"],
                            "description": "Default: personal",
                        },
                    },
                    "required": ["fact"],
                },
            ),
            handler=remember,
            risk_tier=RiskTier.WRITE,
            module="ai_memory",
        ),
    ]
