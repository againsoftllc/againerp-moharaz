"""The rest of the sales flow from chat (docs/AI/ai.md, step 3.2): invoice an order, cancel an order, record a customer's payment.

Existing: quotation / order creation (action_tools) and `confirm_sales_order`. Added here, all through the real sales API with the user's own
token (RBAC and the ERP's own checks apply) and all preview -> confirm:

* `issue_sales_invoice` - FINANCIAL; the preview is the order as it is now (two_step.SPECS), confirm = `POST /sales/orders/{id}/invoice`.
* `cancel_sales_order`  - FINANCIAL; same shape, `POST /sales/orders/{id}/cancel` with a reason.
* `record_customer_payment` - FINANCIAL; money received against an invoice. The preview shows the invoice, what is already paid, the balance
  and what the balance will be; confirm = `POST /sales/invoices/{id}/payments`.

Deliveries (create + post, which moves stock) are the next piece.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post

CONFIRM_NOTE = (
    "Nothing was recorded. Show the user the invoice, the amount and the balance before / after, and ask them to confirm; call this tool "
    "again with the same arguments and confirm=true ONLY after they explicitly agree."
)


def _money(v: Any) -> Optional[Decimal]:
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return None
    return d if d > 0 else None


def build_sales_flow_tools(
    bearer_token: str, *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    def issue_sales_invoice(inp: dict) -> dict:
        order_id = str(inp.get("order_id") or "").strip()
        try:
            res = internal_post(f"/api/v1/sales/orders/{order_id}/invoice", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        data = res.get("data", {})
        return {"status": "invoiced", "order_id": order_id, "invoice_number": data.get("invoice_number"), "data": data}

    def cancel_sales_order(inp: dict) -> dict:
        order_id = str(inp.get("order_id") or "").strip()
        reason = str(inp.get("reason") or "").strip()
        try:
            res = internal_post(f"/api/v1/sales/orders/{order_id}/cancel", bearer_token=bearer_token, json={"reason": reason} if reason else None)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {"status": "cancelled", "order_id": order_id, "data": res.get("data", {})}

    def _invoice_id(q: str) -> Optional[str]:
        if db is None or not q:
            return None
        with db.get_bind().connect() as conn:
            row = conn.execute(
                text("select id from sales_invoices where company_id = :c and (id = :q or lower(invoice_number) = lower(:q)) limit 1"),
                {"c": company_id, "q": q},
            ).first()
        return row[0] if row else None

    def record_customer_payment(inp: dict) -> dict:
        ref = str(inp.get("invoice") or "").strip()
        invoice_id = _invoice_id(ref)
        if not invoice_id:
            return {"error": f"No invoice matches '{ref}'. Use the invoice number (or find it with search_records)."}
        amount = _money(inp.get("amount"))
        if amount is None:
            return {"error": "amount must be a positive number (BDT)."}
        try:
            inv = (internal_get(f"/api/v1/sales/invoices/{invoice_id}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        total = Decimal(str(inv.get("total") or 0))
        paid = Decimal(str(inv.get("amount_paid") or 0))
        balance = Decimal(str(inv.get("balance") if inv.get("balance") is not None else total - paid))
        if inv.get("status") in ("cancelled", "void", "draft"):
            return {"error": f"Invoice {inv.get('invoice_number')} is {inv.get('status')} - a payment cannot be recorded against it."}
        if amount > balance:
            return {"error": f"The amount {amount} is more than the invoice balance {balance}. Ask the user for the right amount."}
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Record payment received",
                    "invoice": inv.get("invoice_number"), "customer": inv.get("customer_name"), "invoice_total": float(total),
                    "already_paid": float(paid), "balance_now": float(balance), "payment_amount": float(amount),
                    "balance_after": float(balance - amount),
                    **({"reference": inp.get("reference")} if inp.get("reference") else {}),
                },
                "note": CONFIRM_NOTE,
            }
        payload = {"amount": str(amount), "reference": inp.get("reference") or None, "payment_date": inp.get("payment_date") or None, "notes": inp.get("notes") or None}
        try:
            pay = internal_post(f"/api/v1/sales/invoices/{invoice_id}/payments", bearer_token=bearer_token, json=payload)
            after = (internal_get(f"/api/v1/sales/invoices/{invoice_id}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {
            "status": "recorded",
            "payment_number": pay.get("payment_number"),
            "invoice": inv.get("invoice_number"),
            "before": {"amount_paid": float(paid), "balance": float(balance), "status": inv.get("status")},
            "after": {"amount_paid": after.get("amount_paid"), "balance": after.get("balance"), "status": after.get("status")},
        }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="issue_sales_invoice",
                description=(
                    "Issue the invoice for a confirmed sales order (by the order's id, from search_records). Use for 'SO-05761 er invoice banao'. "
                    "Needs the sales write right."
                ),
                input_schema={"type": "object", "properties": {"order_id": {"type": "string", "description": "The order's id (not its number)"}}, "required": ["order_id"]},
            ),
            handler=issue_sales_invoice,
            risk_tier=RiskTier.FINANCIAL,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="cancel_sales_order",
                description="Cancel a sales order (by id). Releases reserved stock. Ask the user for the reason.",
                input_schema={
                    "type": "object",
                    "properties": {"order_id": {"type": "string", "description": "The order's id (not its number)"}, "reason": {"type": "string"}},
                    "required": ["order_id"],
                },
            ),
            handler=cancel_sales_order,
            risk_tier=RiskTier.FINANCIAL,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="record_customer_payment",
                description=(
                    "Record money received from a customer against a sales invoice ('INV-0007 e 5000 taka joma peyechi', 'Ryans 20000 dilo'). "
                    "Give the invoice number and the amount (BDT). It cannot exceed the invoice balance. Call WITHOUT confirm first: the "
                    "preview shows the balance before and after."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "invoice": {"type": "string", "description": "Invoice number (or id)"},
                        "amount": {"type": "number", "description": "Amount received, BDT"},
                        "reference": {"type": "string", "description": "Cheque / bKash / bank reference, if the user gave one"},
                        "payment_date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                        "notes": {"type": "string"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = record - ONLY after the user confirmed the preview."},
                    },
                    "required": ["invoice", "amount"],
                },
            ),
            handler=record_customer_payment,
            risk_tier=RiskTier.FINANCIAL,
            module="sales",
        ),
    ]
