"""Intent guard - a request to LOOK at data must never reach a tool that changes data (docs/AI/ai.md, finding 1).

The first evaluation run showed the model calling `confirm_sales_order` for "SO-05761 er details dekhao". The confirm guard
protects the confirm step; this one protects the first step: when the user's message only asks to see / count / list something
(dekhao, details, koto, show ...) and contains no action word (koro, confirm, add, banao, delete ...), every write / financial tool is
refused with an instruction to use a read tool instead. A bare "yes / ha / confirm" answer to a shown preview is never blocked.
Deliberately simple word lists - the evaluation set (cases `safe-*`, `sales-09/12`) is what keeps them honest.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any, Optional

from app.services.ai.confirm_guard import is_bare_confirmation
from app.services.ai.orchestrator import OrchestratorTool, RiskTier

READ_CUES = (
    "dekhao", "dekhaw", "dekhan", "dekhte", "দেখাও", "দেখান", "দেখতে", "details", "detail", "বিস্তারিত", "show me", "show",
    "list", "koto", "koyta", "kotojon", "কত", "কয়টা", "কতজন", "status ki", "jante chai", "জানতে চাই", "bolo ", "বলো",
    "how many", "how much", "what is", "who ", "which ",
)
ACTION_CUES = (
    "koro", "korun", "kore dao", "kore den", "korte", "করো", "করুন", "করে দাও", "banao", "banan", "বানাও", "বানান", "create", "confirm",
    "approve", "add ", "add\n", "delete", "remove", "update", "set ", "send", "pathao", "mark", "publish", "upload", "import", "save",
    "cancel", "dao", "দাও", "দিন", "কনফার্ম", "অ্যাপ্রুভ", "যোগ", "মুছ", "jog", "change", "rename", "adjust",
)
# tools that change data but are never the thing a "show me" request is about
_RISKY = {RiskTier.WRITE, RiskTier.FINANCIAL, RiskTier.EXTERNAL}
_EXEMPT = {"remember", "save_ai_preset"}


def read_only_request(message: str) -> bool:
    """True when the message asks to look at something and says nothing that asks for a change."""
    m = " " + " ".join((message or "").lower().split()) + " "
    if is_bare_confirmation(message):
        return False
    if any(c in m for c in ACTION_CUES):
        return False
    return any(c in m for c in READ_CUES)


def block_reason(message: str, tool: OrchestratorTool) -> Optional[str]:
    if tool.risk_tier not in _RISKY or tool.definition.name in _EXEMPT:
        return None
    if not read_only_request(message):
        return None
    return (
        f"Not done: the user only asked to look at / count / list something, and {tool.definition.name} changes data. "
        "Answer with a read tool instead (search_records, query_database, get_* tools) and change nothing."
    )


def apply_intent_guard(tools: list[OrchestratorTool], *, user_message: str) -> list[OrchestratorTool]:
    def wrap(tool: OrchestratorTool) -> OrchestratorTool:
        if tool.risk_tier not in _RISKY or tool.definition.name in _EXEMPT:
            return tool
        original = tool.handler

        def handler(inp: dict[str, Any]) -> Any:
            reason = block_reason(user_message, tool)
            if reason:
                return {"error": reason}
            return original(inp)

        return replace(tool, handler=handler)

    return [wrap(t) for t in tools]
