"""Read-only customer tools — first slice of the ERP Tool Gateway (STEP 05).

Deliberately read-only and exactly three tools: enough to prove the full
path (Claude -> orchestrator -> tool -> real authenticated API -> Postgres
-> back to Claude) end to end before any write/approval-tier tool exists,
per the master plan's "do not over-engineer" instruction and its own
tool list (§10, §12 of the source spec) — the rest of that list is not
implemented here.

Every handler calls the existing `/api/v1/commerce/customers*` endpoints
(app/routers/commerce_customers.py) through internal_api — see that
module's docstring for why direct function calls were rejected. RBAC,
company scoping, and 404-vs-cross-tenant handling are therefore identical
to a human calling the same endpoint; nothing here re-implements them.
"""

from __future__ import annotations

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get


def build_customer_tools(bearer_token: str) -> list[OrchestratorTool]:
    """Tools bound to one authenticated request's token — a fresh set is built
    per AI gateway call, never cached across users."""

    def search_customer(inp: dict) -> dict:
        try:
            data = internal_get(
                "/api/v1/commerce/customers",
                bearer_token=bearer_token,
                params={"search": inp["query"], "limit": min(int(inp.get("limit", 10)), 25)},
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        rows = data.get("data", [])
        # Trim to what a search result needs — full records come from get_customer.
        return {
            "count": len(rows),
            "customers": [
                {"id": r.get("id"), "name": r.get("name"), "phone": r.get("phone"), "email": r.get("email")}
                for r in rows
            ],
        }

    def get_customer(inp: dict) -> dict:
        try:
            data = internal_get(
                f"/api/v1/commerce/customers/{inp['customer_id']}",
                bearer_token=bearer_token,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return data.get("data", {})

    def get_customer_orders(inp: dict) -> dict:
        try:
            data = internal_get(
                f"/api/v1/commerce/customers/{inp['customer_id']}/orders",
                bearer_token=bearer_token,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        rows = data.get("data", [])
        limit = int(inp.get("limit", 5))
        return {"count": len(rows), "orders": rows[:limit]}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="search_customer",
                description=(
                    "Search customers by name, phone, email, or customer code. "
                    "Returns a short list — use get_customer for full details on one."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Name, phone, email, or customer code to search for"},
                        "limit": {"type": "integer", "description": "Max results, default 10, max 25"},
                    },
                    "required": ["query"],
                },
            ),
            handler=search_customer,
            risk_tier=RiskTier.READ,
            module="customers",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_customer",
                description="Get full details for one customer by id.",
                input_schema={
                    "type": "object",
                    "properties": {"customer_id": {"type": "string"}},
                    "required": ["customer_id"],
                },
            ),
            handler=get_customer,
            risk_tier=RiskTier.READ,
            module="customers",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_customer_orders",
                description="Get a customer's recent orders by customer id.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "customer_id": {"type": "string"},
                        "limit": {"type": "integer", "description": "Max orders to return, default 5"},
                    },
                    "required": ["customer_id"],
                },
            ),
            handler=get_customer_orders,
            risk_tier=RiskTier.READ,
            module="customers",
        ),
    ]
