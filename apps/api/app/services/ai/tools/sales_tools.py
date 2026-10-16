"""Second real approval-gated tool — STEP 25. Same split as STEP 24's finance tools,
applied to a second document_type already recognized by approval_service.py's
APPROVAL_DOCUMENTS: `sales.order`, checked today at app/routers/sales.py's own
`POST /orders/{id}/confirm` (assert_can_approve(..., "sales.order", pending.total)).

Deliberately confirm-only, not create-from-scratch: assembling a correct multi-line sales
order (real SKUs, quantities, pricing rules) is a materially harder and riskier problem for
a model to get right unsupervised than confirming an order a human already built through
the normal UI — same reasoning STEP 24 used to keep create_expense simple and put the gate
only at the commit point. Confirming an order is that commit point here.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.ai.approval_gate import check_or_create_approval
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post


def build_sales_tools(
    bearer_token: str,
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only when building for tool_catalog() metadata
    (registry.py) — safe, since that path never invokes a handler."""

    def confirm_sales_order(inp: dict) -> dict:
        order_id = inp["order_id"]
        try:
            existing = internal_get(f"/api/v1/sales/orders/{order_id}", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        order = existing.get("data", {})
        amount = order.get("total")

        decision = check_or_create_approval(
            db,  # type: ignore[arg-type]
            company_id=company_id,  # type: ignore[arg-type]
            user=user,
            tool_name="confirm_sales_order",
            document_type="sales.order",
            amount=amount,
            summary=f"Confirm order {order.get('order_number', order_id)}: {order.get('customer_name')} — {amount}",
            risk="financial",
            entity=order_id,
        )
        if not decision.allowed:
            return {
                "status": "pending_approval",
                "order_id": order_id,
                "approval_id": decision.approval_id,
                "message": (
                    f"{amount} exceeds your approval limit of {decision.limit}. "
                    "The order stays unconfirmed — routed for human approval."
                ),
            }

        try:
            confirmed = internal_post(
                f"/api/v1/sales/orders/{order_id}/confirm",
                bearer_token=bearer_token,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {"status": "confirmed", "order_id": order_id, "data": confirmed.get("data", {})}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="confirm_sales_order",
                description=(
                    "Confirm an existing (already-created) sales order, committing it. If "
                    "the order total exceeds your approval limit, it is routed to a human "
                    "for approval instead of being confirmed outright. Does not create "
                    "orders from scratch — the order must already exist."
                ),
                input_schema={
                    "type": "object",
                    "properties": {"order_id": {"type": "string"}},
                    "required": ["order_id"],
                },
            ),
            handler=confirm_sales_order,
            risk_tier=RiskTier.FINANCIAL,
            module="sales",
        ),
    ]
