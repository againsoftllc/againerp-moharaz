"""Risk tiers become policy (docs/AI/ai.md, step 1.4).

`RiskTier` used to be a label. Now every tool that changes data (WRITE / FINANCIAL / EXTERNAL) must be two-step - a preview first, the
change only with `confirm=true` after the user approved that preview (the confirm guard enforces the approval itself) - and a tool
that takes a list of lines may not take more than MAX_LINES in one call (no silent bulk writes). The only exemption is `remember`
(a one-line memory note), listed explicitly. `scripts/check_risk_policy.py` fails when a new tool breaks these rules.

Tools that already preview with real content (orders, quotations, product edits ...) keep their own preview; the rest get a generic one
that echoes the arguments ("this is what I would do"), so a costly or irreversible call can never be the first thing that happens.
"""
from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

from app.services.ai.orchestrator import OrchestratorTool, RiskTier

RISKY = {RiskTier.WRITE, RiskTier.FINANCIAL, RiskTier.EXTERNAL}
EXEMPT_ONE_STEP = {"remember"}
MAX_LINES = 50
BULK_ARGS = ("lines", "items")

ECHO_NOTE = (
    "Nothing was done. Show the user exactly what you are about to do (the arguments above) and ask them to confirm; call this tool "
    "again with the same arguments and confirm=true ONLY after they explicitly agree."
)


def has_confirm(tool: OrchestratorTool) -> bool:
    return "confirm" in ((tool.definition.input_schema or {}).get("properties") or {})


def violations(tools: list[OrchestratorTool]) -> list[str]:
    """Policy breaches in a tool list (used by the check script and the tests)."""
    out: list[str] = []
    for t in tools:
        if t.risk_tier in RISKY and t.definition.name not in EXEMPT_ONE_STEP and not has_confirm(t):
            out.append(f"{t.definition.name} ({t.risk_tier.value}) is one-step: it changes data without a preview / confirm")
    return out


def _echo_two_step(tool: OrchestratorTool) -> OrchestratorTool:
    original = tool.handler
    name = tool.definition.name

    def handler(inp: dict[str, Any]) -> Any:
        inp = dict(inp or {})
        if inp.get("confirm") is True:
            inp.pop("confirm", None)
            return original(inp)
        inp.pop("confirm", None)
        return {"status": "preview", "preview": {"action": name, "arguments": json.loads(json.dumps(inp, default=str))}, "note": ECHO_NOTE}

    schema = dict(tool.definition.input_schema)
    props = dict(schema.get("properties") or {})
    props["confirm"] = {
        "type": "boolean",
        "description": "false/omitted = preview only (nothing is done). true = do it - ONLY after the user explicitly confirmed the preview.",
    }
    schema["properties"] = props
    desc = tool.definition.description + " TWO-STEP: call it first WITHOUT confirm to get a preview, show it, and call again with confirm=true only after the user agrees."
    return replace(tool, definition=replace(tool.definition, description=desc, input_schema=schema), handler=handler)


def _bulk_limit(tool: OrchestratorTool) -> OrchestratorTool:
    arrays = [k for k in BULK_ARGS if (tool.definition.input_schema.get("properties") or {}).get(k, {}).get("type") == "array"]
    if not arrays or tool.risk_tier not in RISKY:
        return tool
    original = tool.handler

    def handler(inp: dict[str, Any]) -> Any:
        for k in arrays:
            n = len((inp or {}).get(k) or [])
            if n > MAX_LINES:
                return {"error": f"{k}: {n} entries in one call is too many - the limit is {MAX_LINES}. Split it into smaller batches, one preview each."}
        return original(inp)

    return replace(tool, handler=handler)


def apply_risk_policy(tools: list[OrchestratorTool]) -> list[OrchestratorTool]:
    out: list[OrchestratorTool] = []
    for t in tools:
        if t.risk_tier in RISKY and t.definition.name not in EXEMPT_ONE_STEP and not has_confirm(t):
            t = _echo_two_step(t)
        out.append(_bulk_limit(t))
    return out
