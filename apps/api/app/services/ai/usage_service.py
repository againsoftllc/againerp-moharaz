"""AI usage/cost aggregation — STEP 12.

Read-only queries over ai_audit_logs (STEP 11 already writes every field this
needs — provider_id, model_id, tool_name, input_tokens, output_tokens, status
per row). No new instrumentation, no billing/credits system — master plan §25
is explicit that this stays "an extensible usage event model", not a SaaS
billing engine. Every summary is scoped by company_id; a per-user view is
additionally scoped by user_id, so one tenant's usage is never visible to
another (same tenant-isolation discipline as every tool call, §12).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog
from app.services.ai.pricing import estimate_cost_usd


def _base_query(db: Session, *, company_id: str, user_id: Optional[str], since: Optional[datetime]):
    q = db.query(AiAuditLog).filter(AiAuditLog.company_id == company_id)
    if user_id:
        q = q.filter(AiAuditLog.user_id == user_id)
    if since:
        q = q.filter(AiAuditLog.logged_at >= since)
    return q


def usage_summary(
    db: Session,
    *,
    company_id: str,
    user_id: Optional[str] = None,
    since: Optional[datetime] = None,
) -> dict:
    rows = _base_query(db, company_id=company_id, user_id=user_id, since=since).all()

    total_cost = 0.0
    cost_is_partial = False  # true if any row's model has no known rate (§ pricing.py)
    by_provider: dict[str, dict] = {}
    by_model: dict[str, dict] = {}
    by_tool: dict[str, dict] = {}
    chat_turns = tool_calls = errors = 0
    total_input = total_output = 0
    total_cache_creation = total_cache_read = 0

    for row in rows:
        if row.action == "ai_chat":
            chat_turns += 1
        elif row.action == "ai_tool_call":
            tool_calls += 1
            if row.status == "error":
                errors += 1

        total_input += row.input_tokens or 0
        total_output += row.output_tokens or 0
        total_cache_creation += row.cache_creation_input_tokens or 0
        total_cache_read += row.cache_read_input_tokens or 0
        cost = estimate_cost_usd(
            row.model_id,
            row.input_tokens or 0,
            row.output_tokens or 0,
            cache_creation_tokens=row.cache_creation_input_tokens or 0,
            cache_read_tokens=row.cache_read_input_tokens or 0,
        )
        if cost is None and (row.input_tokens or row.output_tokens):
            cost_is_partial = True
        else:
            total_cost += cost or 0.0

        if row.provider_id:
            p = by_provider.setdefault(row.provider_id, {"input_tokens": 0, "output_tokens": 0, "calls": 0})
            p["input_tokens"] += row.input_tokens or 0
            p["output_tokens"] += row.output_tokens or 0
            p["calls"] += 1

        if row.model_id:
            m = by_model.setdefault(row.model_id, {"input_tokens": 0, "output_tokens": 0, "calls": 0, "estimated_cost_usd": 0.0})
            m["input_tokens"] += row.input_tokens or 0
            m["output_tokens"] += row.output_tokens or 0
            m["calls"] += 1
            m["estimated_cost_usd"] = round(m["estimated_cost_usd"] + (cost or 0.0), 6)

        if row.action == "ai_tool_call" and row.tool_name:
            t = by_tool.setdefault(row.tool_name, {"calls": 0, "errors": 0})
            t["calls"] += 1
            if row.status == "error":
                t["errors"] += 1

    return {
        "chat_turns": chat_turns,
        "tool_calls": tool_calls,
        "tool_errors": errors,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_cache_creation_tokens": total_cache_creation,
        "total_cache_read_tokens": total_cache_read,
        "estimated_cost_usd": round(total_cost, 6),
        "estimated_cost_is_partial": cost_is_partial,
        "by_provider": by_provider,
        "by_model": by_model,
        "by_tool": by_tool,
    }
