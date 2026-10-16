"""Third approval-gated tool — STEP 29, same pattern as STEP 24 (finance) and STEP 25
(sales) applied to a third real ERP module and APPROVAL_DOCUMENTS type: `purchase.order`,
checked today at app/routers/purchase_orders.py's own `POST /orders/{id}/confirm`
(assert_can_approve(..., "purchase.order", pending.total)).

Confirm-only, not create-from-scratch, for the same reason as STEP 25's sales tool:
assembling a correct multi-line purchase order is a harder, riskier problem for a model to
get right unsupervised than confirming one a human already built.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.ai.approval_gate import check_or_create_approval
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post


def build_purchase_tools(
    bearer_token: str,
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only when building for tool_catalog() metadata
    (registry.py) — safe, since that path never invokes a handler."""

    def confirm_purchase_order(inp: dict) -> dict:
        order_id = inp["order_id"]
        try:
            existing = internal_get(f"/api/v1/purchase/orders/{order_id}", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        order = existing.get("data", {})
        amount = order.get("total")

        decision = check_or_create_approval(
            db,  # type: ignore[arg-type]
            company_id=company_id,  # type: ignore[arg-type]
            user=user,
            tool_name="confirm_purchase_order",
            document_type="purchase.order",
            amount=amount,
            summary=f"Confirm PO {order.get('po_number', order_id)}: {order.get('supplier_name')} — {amount}",
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
                    "The purchase order stays unconfirmed — routed for human approval."
                ),
            }

        try:
            confirmed = internal_post(
                f"/api/v1/purchase/orders/{order_id}/confirm",
                bearer_token=bearer_token,
            )
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {"status": "confirmed", "order_id": order_id, "data": confirmed.get("data", {})}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="confirm_purchase_order",
                description=(
                    "Confirm an existing (already-created) purchase order, committing it. "
                    "If the order total exceeds your approval limit, it is routed to a "
                    "human for approval instead of being confirmed outright. Does not "
                    "create purchase orders from scratch — the order must already exist."
                ),
                input_schema={
                    "type": "object",
                    "properties": {"order_id": {"type": "string"}},
                    "required": ["order_id"],
                },
            ),
            handler=confirm_purchase_order,
            risk_tier=RiskTier.FINANCIAL,
            module="purchase",
        ),
    ]
