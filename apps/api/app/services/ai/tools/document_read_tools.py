"""Read one sales order / sales invoice / purchase order by its NUMBER (docs/AI/ai.md, step "read tools").

"INV-0007 er balance koto?" and "SO-05761 er details dekhao" had no tool: the model called get_customer_orders or confirm_sales_order.
These read the document through the real API with the user's own token (RBAC applies) and return what an admin asks about: status, who,
the money (total / paid / balance), and the lines. The number or the id both work. Read-only.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get

MAX_LINES = 30


def _pick(d: dict, keys: tuple[str, ...]) -> dict:
    return {k: d.get(k) for k in keys if d.get(k) not in (None, "")}


def _lines(rows: list, name_keys: tuple[str, ...]) -> list[dict]:
    out = []
    for r in (rows or [])[:MAX_LINES]:
        out.append(_pick(r, name_keys))
    return out


def build_document_read_tools(
    bearer_token: str, *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    def _resolve(table: str, number_col: str, ref: str) -> Optional[str]:
        if db is None or not ref:
            return None
        with db.get_bind().connect() as conn:
            row = conn.execute(
                text(f'select id from "{table}" where company_id = :c and (id = :q or lower("{number_col}") = lower(:q)) limit 1'),
                {"c": company_id, "q": ref.strip()},
            ).first()
        return row[0] if row else None

    def get_sales_order(inp: dict) -> dict:
        ref = str(inp.get("order") or "").strip()
        oid = _resolve("sales_orders", "order_number", ref)
        if not oid:
            return {"error": f"No sales order matches '{ref}'. Check the number (e.g. SO-00001)."}
        try:
            o = (internal_get(f"/api/v1/sales/orders/{oid}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {
            "order": _pick(o, ("id", "order_number", "customer_name", "status", "delivery_status", "order_date", "invoice_number", "subtotal", "tax_total", "discount_total", "total", "sales_rep", "warehouse_name")),
            "lines": _lines(o.get("lines"), ("name", "sku", "quantity_ordered", "quantity_delivered", "quantity_returned", "unit_price", "line_total")),
        }

    def get_sales_invoice(inp: dict) -> dict:
        ref = str(inp.get("invoice") or "").strip()
        iid = _resolve("sales_invoices", "invoice_number", ref)
        if not iid:
            return {"error": f"No sales invoice matches '{ref}'. Check the invoice number."}
        try:
            inv = (internal_get(f"/api/v1/sales/invoices/{iid}", bearer_token=bearer_token) or {}).get("data", {})
            pays = (internal_get(f"/api/v1/sales/invoices/{iid}/payments", bearer_token=bearer_token) or {}).get("data", [])
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {
            "invoice": _pick(inv, ("id", "invoice_number", "customer_name", "status", "bill_date", "due_date", "subtotal", "tax_total", "total", "amount_paid", "balance")),
            "lines": _lines(inv.get("lines"), ("description", "name", "quantity", "unit_price", "line_total")),
            "payments": _lines(pays if isinstance(pays, list) else [], ("payment_number", "payment_date", "amount", "payment_method", "reference")),
        }

    def get_purchase_order(inp: dict) -> dict:
        ref = str(inp.get("order") or "").strip()
        oid = _resolve("purchase_orders", "po_number", ref)
        if not oid:
            return {"error": f"No purchase order matches '{ref}'. Check the number (e.g. PO-2026-0001)."}
        try:
            o = (internal_get(f"/api/v1/purchase/orders/{oid}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return {
            "order": _pick(o, ("id", "po_number", "supplier_name", "status", "order_date", "expected_date", "subtotal", "tax_total", "total", "buyer_name", "warehouse_name")),
            "lines": _lines(o.get("lines"), ("name", "sku", "quantity_ordered", "quantity_received", "quantity_returned", "unit_cost", "line_total")),
        }

    ref_schema = lambda key, label, example: {  # noqa: E731
        "type": "object",
        "properties": {key: {"type": "string", "description": f"{label} number (e.g. {example}) or id"}},
        "required": [key],
    }
    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_sales_order",
                description="Read ONE sales order by its number: status, delivery status, customer, totals and its lines. Use for 'SO-05761 er details dekhao', 'order er status'. Read-only.",
                input_schema=ref_schema("order", "Sales order", "SO-00001"),
            ),
            handler=get_sales_order, risk_tier=RiskTier.READ, module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_sales_invoice",
                description="Read ONE sales invoice by its number: status, due date, total, amount paid, BALANCE, lines and payments. Use for 'INV-0007 er balance koto?', 'invoice paid hoyeche?'. Read-only.",
                input_schema=ref_schema("invoice", "Invoice", "INV-00001"),
            ),
            handler=get_sales_invoice, risk_tier=RiskTier.READ, module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_purchase_order",
                description="Read ONE purchase order by its number: status, supplier, totals, lines with received quantities. Use for 'PO-2026-0001 er status'. Read-only.",
                input_schema=ref_schema("order", "Purchase order", "PO-2026-0001"),
            ),
            handler=get_purchase_order, risk_tier=RiskTier.READ, module="purchase",
        ),
    ]
