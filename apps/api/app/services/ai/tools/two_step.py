"""Make the one-step financial tools two-step: preview first, commit only on `confirm=true` (docs/AI/ai.md, finding 1).

`confirm_sales_order`, `confirm_purchase_order` and `approve_expense` used to commit as soon as the model called them - and the first
evaluation run (scripts/run_ai_eval.py) showed the model calling `confirm_sales_order` even for "SO-05761 er details dekhao". Now the
first call only READS the document and returns a preview (what would be committed); `confirm=true` is then accepted only through the
confirm guard (`confirm_guard.apply_confirm_guard`): the user's latest message must approve exactly that preview.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.services.ai.orchestrator import OrchestratorTool
from app.services.ai.tools.internal_api import InternalApiError, internal_get

CONFIRM_NOTE = (
    "Nothing was committed. Show the user these details (names, amount, current status) and ask them to confirm; call this "
    "tool again with confirm=true ONLY after they explicitly agree. The id must be the record's id from a search, not its number."
)

# tool -> (id argument, API path to read, label, fields shown in the preview)
SPECS: dict[str, tuple[str, str, str, tuple[str, ...]]] = {
    "confirm_sales_order": ("order_id", "/api/v1/sales/orders/{id}", "Confirm sales order (the goods are delivered, stock is deducted and the invoice is issued)",
                            ("order_number", "customer_name", "status", "order_date", "subtotal", "tax_total", "discount_total", "total")),
    "issue_sales_invoice": ("order_id", "/api/v1/sales/orders/{id}", "Issue invoice for sales order",
                            ("order_number", "customer_name", "status", "invoice_number", "subtotal", "tax_total", "total")),
    "cancel_sales_order": ("order_id", "/api/v1/sales/orders/{id}", "Cancel sales order",
                           ("order_number", "customer_name", "status", "delivery_status", "invoice_number", "total")),
    "confirm_purchase_order": ("order_id", "/api/v1/purchase/orders/{id}", "Confirm purchase order",
                               ("po_number", "supplier_name", "status", "order_date", "expected_date", "total")),
    "apply_stock_adjustment": ("adjustment_id", "/api/v1/inventory/stock-adjustments/{id}", "Apply stock adjustment",
                              ("adjustment_number", "warehouse_name", "adjustment_type", "reason_label", "status", "item_count", "lines")),
    "approve_expense": ("expense_id", "/api/v1/finance/expenses/{id}", "Approve expense",
                        ("expense_number", "payee", "category_name", "status", "expense_date", "amount", "total")),
}


def require_preview(tools: list[OrchestratorTool], bearer_token: str) -> list[OrchestratorTool]:
    out: list[OrchestratorTool] = []
    for tool in tools:
        spec = SPECS.get(tool.definition.name)
        if spec is None or "confirm" in (tool.definition.input_schema.get("properties") or {}):
            out.append(tool)
            continue
        id_arg, path, label, fields = spec
        original = tool.handler

        def handler(inp: dict, _o=original, _id=id_arg, _path=path, _label=label, _fields=fields) -> Any:
            inp = dict(inp or {})
            if inp.get("confirm") is True:
                inp.pop("confirm", None)
                before: dict = {}
                try:  # the record as it is right before the commit - kept in the audit log with the call
                    was = (internal_get(_path.format(id=str(inp.get(_id) or '').strip()), bearer_token=bearer_token) or {}).get("data", {}) or {}
                    before = {k: was.get(k) for k in _fields if k != "lines" and was.get(k) not in (None, "")}
                except InternalApiError:
                    pass
                res = _o(inp)
                if isinstance(res, dict) and "error" not in res:
                    now = res.get("data") if isinstance(res.get("data"), dict) else {}
                    res.setdefault("before", before)
                    res.setdefault("after", {k: now.get(k) for k in _fields if k != "lines" and now.get(k) not in (None, "")} or {"status": res.get("status")})
                return res
            record_id = str(inp.get(_id) or "").strip()
            if not record_id:
                return {"error": f"{_id} is required - find the record first (search_records) and use its id."}
            try:
                data = (internal_get(_path.format(id=record_id), bearer_token=bearer_token) or {}).get("data", {}) or {}
            except InternalApiError as exc:
                return {"error": f"Could not read that record ({exc.detail}). Use the id from a search, not the number.", "status_code": exc.status_code}
            shown = {k: data.get(k) for k in _fields if data.get(k) not in (None, "")}
            return {"status": "preview", "preview": {"action": _label, "id": record_id, **shown}, "note": CONFIRM_NOTE}

        schema = dict(tool.definition.input_schema)
        props = dict(schema.get("properties") or {})
        props["confirm"] = {
            "type": "boolean",
            "description": "false/omitted = preview only (nothing committed). true = commit - ONLY after the user explicitly confirmed the preview.",
        }
        schema["properties"] = props
        desc = tool.definition.description + (
            " TWO-STEP: call it first WITHOUT confirm to get a preview of what would be committed, show it, and call again "
            "with confirm=true only after the user agrees. Never use it to look at a record - use search_records / "
            "query_database for that."
        )
        out.append(replace(tool, definition=replace(tool.definition, description=desc, input_schema=schema), handler=handler))
    return out
