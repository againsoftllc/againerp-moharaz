"""Stock adjustment from chat (docs/AI/ai.md, step 3.3): "Mouse 10 ta komiye dao", "Vivobook er stock 12 koro".

Two tools, because the ERP itself separates them (a stock adjustment is a DRAFT until someone APPLIES it, and applying posts the stock movement):

* `adjust_stock`        - WRITE, two-step. Finds the item and warehouse, reads the CURRENT stock, shows `current -> new`, and on confirm
                          creates a DRAFT adjustment through the real API (`POST /api/v1/inventory/stock-adjustments`, inventory create right).
* `apply_stock_adjustment` - FINANCIAL, two-step (see two_step.SPECS). Shows the draft's lines, and on confirm applies it through
                          `POST .../{id}/apply` (inventory write right) - that is the point where stock really changes.

The AI prepares, a person with the right releases: the draft can also be applied or cancelled in the Inventory screen. Serial- or batch-tracked
items are refused (they need serial / batch numbers - do those in the Inventory screen). Nothing here bypasses the ERP's own checks.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_post
from app.services.ai.tools.inventory_resolve import InventoryResolver
from app.services.inventory.constants import ADJUSTMENT_REASONS

CONFIRM_NOTE = (
    "Nothing was created. Show the user the item, the warehouse, the current stock and the new stock, and ask them to confirm; call this "
    "tool again with the same arguments and confirm=true ONLY after they explicitly agree. It creates a DRAFT adjustment - stock does not "
    "change until it is applied (apply_stock_adjustment)."
)
_DECREASE_ONLY = {"damaged", "lost", "broken", "expired"}


def build_stock_adjust_tools(
    bearer_token: str, *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    rv = InventoryResolver(db, company_id)  # type: ignore[arg-type]
    _conn, _find_item, _warehouse = rv.conn, rv.find_item, rv.warehouse

    def adjust_stock(inp: dict) -> dict:
        reason = str(inp.get("reason") or "").strip()
        if reason not in ADJUSTMENT_REASONS:
            return {"error": f"reason must be one of: {', '.join(ADJUSTMENT_REASONS)}. Ask the user why the stock changes (counted, damaged, lost, found ...)."}
        details = str(inp.get("reason_details") or "").strip()
        if reason == "other" and not details:
            return {"error": "reason_details is required when the reason is 'other'."}
        item_q = str(inp.get("item") or "").strip()
        if not item_q:
            return {"error": "item is required (name or SKU)."}
        new_q, change = inp.get("new_quantity"), inp.get("quantity_change")
        if (new_q is None) == (change is None):
            return {"error": "Give exactly one of new_quantity (the counted stock) or quantity_change (+ to add, - to remove)."}
        item = _find_item(item_q)
        if "ok" not in item:
            return item
        wh = _warehouse(str(inp.get("warehouse") or "").strip() or None)
        if "ok" not in wh:
            return wh
        it, w = item["ok"], wh["ok"]
        with _conn() as conn:
            tracked = conn.execute(
                text("select coalesce(track_serial, false), coalesce(track_batch, false) from inventory_items where company_id = :c and item_id = :i limit 1"),
                {"c": company_id, "i": it["id"]},
            ).first()
            stock = conn.execute(
                text("select coalesce(on_hand, 0), coalesce(reserved, 0) from inventory_stock_levels where company_id = :c and item_id = :i and warehouse_id = :w limit 1"),
                {"c": company_id, "i": it["id"], "w": w["id"]},
            ).first()
        if tracked and (tracked[0] or tracked[1]):
            return {"error": f"{it['name']} is tracked by {'serial' if tracked[0] else 'batch'} numbers - adjust it in the Inventory screen (numbers are needed)."}
        on_hand, reserved = (int(stock[0]), int(stock[1])) if stock else (0, 0)
        try:
            physical = int(new_q) if new_q is not None else on_hand + int(change)
        except (TypeError, ValueError):
            return {"error": "new_quantity / quantity_change must be whole numbers."}
        if physical < 0:
            return {"error": f"That would make the stock negative ({physical}). Current stock is {on_hand}."}
        diff = physical - on_hand
        if diff == 0:
            return {"error": f"Stock is already {on_hand} - nothing to adjust."}
        if reason in _DECREASE_ONLY and diff > 0:
            return {"error": f"'{ADJUSTMENT_REASONS[reason]}' can only decrease stock; to add stock use reason 'found' or 'physical_count'."}
        if reason == "found" and diff < 0:
            return {"error": "'Found' can only increase stock."}
        notes = str(inp.get("notes") or "").strip() or None

        if inp.get("confirm") is not True:
            warning = f"{reserved} are reserved for open orders - the new stock is below that." if physical < reserved else None
            return {
                "status": "preview",
                "preview": {
                    "action": "Create stock adjustment (draft)",
                    "item": it["name"], "sku": it.get("sku"), "warehouse": w["name"],
                    "current_stock": on_hand, "change": diff, "new_stock": physical,
                    "reason": ADJUSTMENT_REASONS[reason], **({"reason_details": details} if details else {}),
                    **({"warning": warning} if warning else {}),
                    "note": "A draft - stock changes only when it is applied.",
                },
                "note": CONFIRM_NOTE,
            }
        payload = {
            "warehouse_id": w["id"], "reason": reason, "reason_details": details or None, "notes": notes,
            "lines": [{"item_id": it["id"], "physical_qty": physical}],
        }
        try:
            res = internal_post("/api/v1/inventory/stock-adjustments", bearer_token=bearer_token, json=payload)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        data = res.get("data", {})
        return {
            "status": "created_draft",
            "adjustment_id": data.get("id"),
            "adjustment_number": data.get("adjustment_number"),
            "adjustment_status": data.get("status"),
            "item": it["name"], "warehouse": w["name"], "from": on_hand, "to": physical,
            "message": "A DRAFT adjustment was created - stock has NOT changed yet. Apply it with apply_stock_adjustment (or in the Inventory screen).",
            "path": "/inventory/stock-adjustments",
        }

    def apply_stock_adjustment(inp: dict) -> dict:
        # reached only through the two-step wrapper (two_step.SPECS), i.e. after the user confirmed the preview
        adjustment_id = str(inp.get("adjustment_id") or "").strip()
        try:
            res = internal_post(f"/api/v1/inventory/stock-adjustments/{adjustment_id}/apply", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        data = res.get("data", {})
        return {"status": "applied", "adjustment_number": data.get("adjustment_number"), "adjustment_status": data.get("status"), "lines": len(data.get("lines") or [])}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="adjust_stock",
                description=(
                    "Change the stock of ONE item in a warehouse by creating a DRAFT stock adjustment (stock does not change until it is "
                    "applied). Use for 'Mouse 10 ta komiye dao', 'Vivobook er stock 12 koro', 'count er por stock thik koro'. Give the item (name "
                    "or SKU), the warehouse (default: the main one), EITHER new_quantity ('stock 12 koro', '12 ta ache', a count = the target stock) OR quantity_change ('10 ta komao' = -10, '5 ta barao' = +5), and the "
                    "reason (ask the user if unclear). NOT for moving stock between warehouses (a transfer) - there is no transfer tool yet: say so. "
                    "Call WITHOUT confirm first: it returns the current stock and the new stock to show."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "item": {"type": "string", "description": "Item name or SKU"},
                        "warehouse": {"type": "string", "description": "Warehouse name or code; omit for the main warehouse"},
                        "new_quantity": {"type": "integer", "description": "The counted / target stock (>= 0)"},
                        "quantity_change": {"type": "integer", "description": "+ adds, - removes (use instead of new_quantity)"},
                        "reason": {"type": "string", "enum": list(ADJUSTMENT_REASONS), "description": "Why the stock changes"},
                        "reason_details": {"type": "string", "description": "Required when reason is 'other'"},
                        "notes": {"type": "string"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = create the draft - ONLY after the user confirmed the preview."},
                    },
                    "required": ["item", "reason"],
                },
            ),
            handler=adjust_stock,
            risk_tier=RiskTier.WRITE,
            module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="apply_stock_adjustment",
                description=(
                    "Apply a DRAFT stock adjustment (by its id, from adjust_stock or a search) - this is when stock really changes and the stock "
                    "movement is posted. Needs the inventory write right."
                ),
                input_schema={
                    "type": "object",
                    "properties": {"adjustment_id": {"type": "string", "description": "The draft adjustment's id (not its number)"}},
                    "required": ["adjustment_id"],
                },
            ),
            handler=apply_stock_adjustment,
            risk_tier=RiskTier.FINANCIAL,
            module="inventory",
        ),
    ]
