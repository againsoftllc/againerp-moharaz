"""First WRITE/FINANCIAL-tier tools — STEP 24, gives STEP 15's approval gate a real
consumer instead of the synthetic proof tool it was built and tested against.

Mirrors the real ERP's own two-step expense workflow (app/routers/finance_expenses.py)
exactly rather than collapsing it into one AI action: `create_expense` is always safe (the
real /expenses endpoint itself applies no limit check at creation — nothing is committed
yet), `approve_expense` is the point money is actually committed, so it's the one gated by
approval_gate.check_or_create_approval() — same split, same reasoning, as the human path.

Both call the ERP's own /api/v1/finance/* endpoints via internal_api, forwarding the
caller's real bearer token (see internal_api.py's docstring — the non-negotiable "AI
permission never exceeds the calling user's permission" rule, unchanged from STEP 05).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.services.ai.approval_gate import check_or_create_approval
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post


def build_finance_tools(
    bearer_token: str,
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only when building for tool_catalog() metadata
    (registry.py) — safe, since that path never invokes a handler."""

    def create_expense(inp: dict) -> dict:
        try:
            categories = internal_get("/api/v1/finance/expense-categories", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        rows = categories.get("data", [])
        wanted = str(inp["category"]).strip().lower()
        match = next((c for c in rows if str(c.get("name", "")).strip().lower() == wanted), None)
        if not match:
            available = ", ".join(str(c.get("name")) for c in rows) or "none configured"
            return {"error": f"Unknown expense category '{inp['category']}'. Available: {available}"}

        try:
            created = internal_post(
                "/api/v1/finance/expenses",
                bearer_token=bearer_token,
                json={
                    "category_id": match["id"],
                    "payee": inp["payee"],
                    "description": inp.get("description", ""),
                    "expense_date": inp.get("expense_date") or date.today().isoformat(),
                    "amount": inp["amount"],
                },
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        expense = created.get("data", {})
        return {
            "status": "drafted",
            "expense_id": expense.get("id"),
            "note": "Created as a draft, not yet approved or paid — call approve_expense to move it forward.",
        }

    def approve_expense(inp: dict) -> dict:
        expense_id = inp["expense_id"]
        try:
            existing = internal_get(f"/api/v1/finance/expenses/{expense_id}", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        expense = existing.get("data", {})
        amount = expense.get("amount")

        decision = check_or_create_approval(
            db,  # type: ignore[arg-type]
            company_id=company_id,  # type: ignore[arg-type]
            user=user,
            tool_name="approve_expense",
            document_type="finance.expense",
            amount=amount,
            summary=f"Approve expense {expense_id}: {expense.get('payee')} — {amount}",
            risk="financial",
            entity=expense_id,
        )
        if not decision.allowed:
            return {
                "status": "pending_approval",
                "expense_id": expense_id,
                "approval_id": decision.approval_id,
                "message": (
                    f"{amount} exceeds your approval limit of {decision.limit}. "
                    "The expense stays a draft — routed for human approval."
                ),
            }

        try:
            approved = internal_post(
                f"/api/v1/finance/expenses/{expense_id}/approve",
                bearer_token=bearer_token,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {"status": "approved", "expense_id": expense_id, "data": approved.get("data", {})}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_expense",
                description=(
                    "Draft a new expense record. Always safe — nothing is committed until "
                    "approve_expense is called separately. Category must match an existing "
                    "expense category name exactly."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "description": "Existing expense category name"},
                        "payee": {"type": "string"},
                        "amount": {"type": "number"},
                        "description": {"type": "string"},
                        "expense_date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                    },
                    "required": ["category", "payee", "amount"],
                },
            ),
            handler=create_expense,
            risk_tier=RiskTier.WRITE,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="approve_expense",
                description=(
                    "Approve a drafted expense, committing it. If the amount exceeds your "
                    "approval limit, it is routed to a human for approval instead of being "
                    "approved outright."
                ),
                input_schema={
                    "type": "object",
                    "properties": {"expense_id": {"type": "string"}},
                    "required": ["expense_id"],
                },
            ),
            handler=approve_expense,
            risk_tier=RiskTier.FINANCIAL,
            module="finance",
        ),
    ]
