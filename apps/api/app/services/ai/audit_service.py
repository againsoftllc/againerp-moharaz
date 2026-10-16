"""AI audit logging — STEP 11.

Extends the pre-existing (unwired) `ai_audit_logs` table rather than adding a
rival one — see that model's docstring and master plan §24/§34. Two rows per
turn that used a tool: one `ai_chat` row (the overall interaction — what was
asked, how many tokens, how it ended) and one `ai_tool_call` row per tool
actually executed (name, input, output/error, latency, risk tier, module) —
gateway-level responsibility, not left to each tool to remember to log itself.

Never logs API keys, passwords, or raw tokens (§26) — there is nothing here
that could contain one: tool inputs/outputs are ERP data, not credentials.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog
from app.services.ai.orchestrator import OrchestratorStep

AGENT_LABEL = "ai_assistant"


def _json(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value, default=str)[:8000]  # bound row size against a huge tool result
    except TypeError:
        return str(value)[:8000]


def _step_failed(step: OrchestratorStep) -> bool:
    """True for both failure shapes a tool can produce.

    `OrchestratorStep.error` is set only when the handler *raised* (orchestrator-level
    failure, §9). But every customer_tools.py handler catches InternalApiError itself and
    returns `{"error": ..., "status_code": ...}` as normal-looking output instead — so Claude
    gets a readable denial to relay rather than a crash. That means the common case (a 403
    or 404 from the ERP's own API) never sets step.error at all; checking only that field
    would log a permission denial as "success". Found by testing the denial path directly,
    not assumed correct."""
    if step.error:
        return True
    return isinstance(step.output, dict) and "error" in step.output


def record_tool_call(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    user_label: str,
    conversation_id: str,
    provider_id: str,
    model_id: str,
    step: OrchestratorStep,
) -> None:
    failed = _step_failed(step)
    db.add(
        AiAuditLog(
            company_id=company_id,
            action="ai_tool_call",
            agent=AGENT_LABEL,
            user=user_label,
            user_id=user_id,
            conversation_id=conversation_id,
            provider_id=provider_id,
            model_id=model_id,
            tool_name=step.tool_name,
            tool_input_json=_json(step.tool_input),
            tool_output_json=_json(step.error) if step.error else _json(step.output),
            risk_tier=step.risk_tier.value if step.risk_tier else None,
            module=step.module,
            status="error" if failed else "success",
            latency_ms=step.latency_ms,
            summary=f"{step.tool_name}({', '.join(f'{k}={v!r}' for k, v in step.tool_input.items())})"[:500],
            tokens=0,
            logged_at=datetime.utcnow(),
        )
    )


def record_chat_turn(
    db: Session,
    *,
    company_id: str,
    user_id: str,
    user_label: str,
    conversation_id: str,
    provider_id: str,
    model_id: str,
    user_message: str,
    stop_reason: str,
    input_tokens: int,
    output_tokens: int,
    cache_creation_input_tokens: int = 0,
    cache_read_input_tokens: int = 0,
) -> None:
    db.add(
        AiAuditLog(
            company_id=company_id,
            action="ai_chat",
            agent=AGENT_LABEL,
            user=user_label,
            user_id=user_id,
            conversation_id=conversation_id,
            provider_id=provider_id,
            model_id=model_id,
            status="truncated" if stop_reason == "max_steps" else "success",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=cache_creation_input_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
            summary=user_message[:500],
            tokens=input_tokens + output_tokens,
            logged_at=datetime.utcnow(),
        )
    )
