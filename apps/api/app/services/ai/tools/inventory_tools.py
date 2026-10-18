"""Fourth tool module, read-only — STEP 28. Mirrors customer_tools.py's original
"read first, prove the pattern" shape (§10), not STEP 24/25's write+gate shape: inventory
adjustments here have no amount-based approval_limits document_type (they're quantity
changes, not money), so there is nothing for approval_gate.py to check — a plain READ tier
is the honest fit, not an approval gate applied where the ERP itself has no such concept.
"""

from __future__ import annotations

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get


def build_inventory_tools(bearer_token: str) -> list[OrchestratorTool]:
    def check_stock_level(inp: dict) -> dict:
        try:
            data = internal_get(
                "/api/v1/inventory/stock",
                bearer_token=bearer_token,
                params={"search": inp["query"], "limit": min(int(inp.get("limit", 10)), 25)},
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        rows = data.get("data", [])
        return {
            "count": len(rows),
            "stock": [
                {
                    "sku": r.get("sku"),
                    "name": r.get("name"),
                    "warehouse": r.get("warehouse_name"),
                    "on_hand": r.get("on_hand"),
                    "available": r.get("available"),
                    "min_qty": r.get("min_qty"),
                }
                for r in rows
            ],
        }

    def get_reorder_suggestions(inp: dict) -> dict:
        try:
            data = internal_get(
                "/api/v1/inventory/reports/reorder-suggestions",
                bearer_token=bearer_token,
                params={"warehouse_id": inp.get("warehouse_id")} if inp.get("warehouse_id") else None,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        rows = data.get("data", [])
        return {"count": len(rows), "suggestions": rows}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="check_stock_level",
                description=("Look up current stock on hand/available for a product by SKU or name, across warehouses. It answers 'how many do we have "
                "in stock' only - NOT how many products exist in the catalog (use query_database on catalog_products), and it cannot change "
                "stock (to change stock use adjust_stock)."),
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "SKU or product name to search for"},
                        "limit": {"type": "integer", "description": "Max results, default 10, max 25"},
                    },
                    "required": ["query"],
                },
            ),
            handler=check_stock_level,
            risk_tier=RiskTier.READ,
            module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_reorder_suggestions",
                description="List products currently below their reorder point (min stock level).",
                input_schema={
                    "type": "object",
                    "properties": {"warehouse_id": {"type": "string", "description": "Optional: limit to one warehouse"}},
                },
            ),
            handler=get_reorder_suggestions,
            risk_tier=RiskTier.READ,
            module="inventory",
        ),
    ]
