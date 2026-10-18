"""Stock transfer between warehouses from chat (docs/AI/ai.md, step 3.3): "Dhaka theke Chittagong e 20 ta SSD pathao".

The ERP's transfer has three steps and so do the tools:

* `transfer_stock`          - WRITE, two-step. Prepares a DRAFT transfer for ONE item (`POST /inventory/stock-transfers`); nothing moves.
* `ship_stock_transfer`     - FINANCIAL, two-step (two_step.SPECS). Stock leaves the source warehouse, the transfer is in transit.
* `receive_stock_transfer`  - FINANCIAL, two-step. Receives everything still in transit at the destination.

Serial- / batch-tracked items are refused (they need numbers - use the Inventory screen). The ERP's own checks (stock available, warehouses
active) always apply; the preview checks availability first so the user is told before confirming.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post
from app.services.ai.tools.inventory_resolve import InventoryResolver

BASE = "/api/v1/inventory/stock-transfers"
NOTE_CREATE = (
    "Nothing was created. Show the user the item, both warehouses, the quantity and the stock at each, and ask them to confirm; call this tool "
    "again with the same arguments and confirm=true ONLY after they explicitly agree. It prepares a DRAFT transfer - stock moves when it is shipped."
)
NOTE_SHIP = (
    "Nothing was shipped. Show the user the lines that will leave the source warehouse and ask them to confirm; call this tool again with the "
    "same arguments and confirm=true ONLY after they explicitly agree. Shipping moves stock."
)
NOTE_RECEIVE = (
    "Nothing was received. Show the user what will be received at the destination and ask them to confirm; call this tool again with the same "
    "arguments and confirm=true ONLY after they explicitly agree."
)


def build_stock_transfer_tools(
    bearer_token: str, *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    rv = InventoryResolver(db, company_id) if db is not None else None  # type: ignore[arg-type]

    def transfer_stock(inp: dict) -> dict:
        item_q = str(inp.get("item") or "").strip()
        if not item_q:
            return {"error": "item is required (name or SKU)."}
        try:
            qty = int(inp.get("quantity"))
        except (TypeError, ValueError):
            return {"error": "quantity must be a whole number."}
        if qty <= 0:
            return {"error": "quantity must be at least 1."}
        item = rv.find_item(item_q)
        if "ok" not in item:
            return item
        src = rv.warehouse(str(inp.get("from_warehouse") or "").strip() or None)
        if "ok" not in src:
            return src
        dst_name = str(inp.get("to_warehouse") or "").strip()
        if not dst_name:
            return {"error": "to_warehouse is required - ask which warehouse the stock goes to."}
        dst = rv.warehouse(dst_name)
        if "ok" not in dst:
            return dst
        it, w1, w2 = item["ok"], src["ok"], dst["ok"]
        if w1["id"] == w2["id"]:
            return {"error": "The source and the destination are the same warehouse."}
        tracked = rv.tracked_by(it["id"])
        if tracked:
            return {"error": f"{it['name']} is tracked by {tracked} numbers - transfer it in the Inventory screen (numbers are needed)."}
        on_hand, reserved = rv.stock(it["id"], w1["id"])
        available = on_hand - reserved
        if qty > available:
            return {"error": f"Only {available} available in {w1['name']} (on hand {on_hand}, reserved {reserved}) - cannot move {qty}."}
        d_on_hand, _ = rv.stock(it["id"], w2["id"])
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Create stock transfer (draft)", "item": it["name"], "sku": it.get("sku"), "quantity": qty,
                    "from": w1["name"], "from_stock_now": on_hand, "from_stock_after": on_hand - qty,
                    "to": w2["name"], "to_stock_now": d_on_hand, "to_stock_after": d_on_hand + qty,
                    "note": "A draft - stock moves when the transfer is shipped, and arrives when it is received.",
                },
                "note": NOTE_CREATE,
            }
        payload = {"from_warehouse_id": w1["id"], "to_warehouse_id": w2["id"], "notes": str(inp.get("notes") or "").strip() or None,
                   "lines": [{"item_id": it["id"], "quantity": qty}]}
        try:
            res = internal_post(BASE, bearer_token=bearer_token, json=payload)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        d = res.get("data", {})
        return {
            "status": "created_draft", "transfer_id": d.get("id"), "transfer_number": d.get("transfer_number"), "transfer_status": d.get("status"),
            "item": it["name"], "quantity": qty, "from": w1["name"], "to": w2["name"],
            "message": "A DRAFT transfer was created - stock has NOT moved. Ship it with ship_stock_transfer.",
        }

    def _transfer_id(ref: str) -> str | None:
        with rv.conn() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                text("select id from inventory_stock_transfers where company_id = :c and (id = :q or lower(transfer_number) = lower(:q)) limit 1"),
                {"c": company_id, "q": ref.strip()},
            ).first()
        return row[0] if row else None

    def ship_stock_transfer(inp: dict) -> dict:
        ref = str(inp.get("transfer") or "").strip()
        tid = _transfer_id(ref)
        if not tid:
            return {"error": f"No transfer matches '{ref}'. Use the transfer number."}
        try:
            t = (internal_get(f"{BASE}/{tid}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        if t.get("status") != "draft":
            return {"error": f"Transfer {t.get('transfer_number')} is {t.get('status')} - only a draft can be shipped."}
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Ship stock transfer (stock leaves the source warehouse)", "transfer": t.get("transfer_number"),
                    "from": t.get("from_warehouse_name"), "to": t.get("to_warehouse_name"),
                    "lines": [{"item": l.get("name"), "sku": l.get("sku"), "quantity": l.get("quantity"), "available_now": l.get("available_qty")} for l in t.get("lines") or []],
                },
                "note": NOTE_SHIP,
            }
        try:
            res = internal_post(f"{BASE}/{tid}/ship", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        d = res.get("data", {})
        return {"status": "shipped", "transfer_number": d.get("transfer_number"), "before": {"status": t.get("status")}, "after": {"status": d.get("status")}}

    def receive_stock_transfer(inp: dict) -> dict:
        ref = str(inp.get("transfer") or "").strip()
        tid = _transfer_id(ref)
        if not tid:
            return {"error": f"No transfer matches '{ref}'. Use the transfer number."}
        try:
            t = (internal_get(f"{BASE}/{tid}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        if t.get("status") not in ("in_transit", "partial_received"):
            return {"error": f"Transfer {t.get('transfer_number')} is {t.get('status')} - only an in-transit transfer can be received."}
        lines = [l for l in t.get("lines") or [] if int(l.get("remaining_qty") or 0) > 0]
        if not lines:
            return {"error": f"Nothing left to receive on {t.get('transfer_number')}."}
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Receive stock transfer (stock arrives at the destination)", "transfer": t.get("transfer_number"),
                    "from": t.get("from_warehouse_name"), "to": t.get("to_warehouse_name"),
                    "lines": [{"item": l.get("name"), "sku": l.get("sku"), "receive": l.get("remaining_qty")} for l in lines],
                },
                "note": NOTE_RECEIVE,
            }
        try:
            res = internal_post(f"{BASE}/{tid}/receive", bearer_token=bearer_token,
                                json={"lines": [{"line_id": l["id"], "quantity": int(l["remaining_qty"])} for l in lines]})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        d = res.get("data", {})
        return {"status": "received", "transfer_number": d.get("transfer_number"), "before": {"status": t.get("status")}, "after": {"status": d.get("status")}}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="transfer_stock",
                description=(
                    "Prepare a DRAFT stock transfer of ONE item from one warehouse to another ('Dhaka theke Chittagong e 20 ta SSD pathao', "
                    "'warehouse change koro'). Stock does not move until ship_stock_transfer. Call WITHOUT confirm first: it shows the stock at "
                    "both warehouses before and after."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "item": {"type": "string", "description": "Item name or SKU"},
                        "quantity": {"type": "integer", "description": "How many to move"},
                        "from_warehouse": {"type": "string", "description": "Source warehouse name / code; omit for the main warehouse"},
                        "to_warehouse": {"type": "string", "description": "Destination warehouse name / code"},
                        "notes": {"type": "string"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = create the draft - ONLY after the user confirmed."},
                    },
                    "required": ["item", "quantity", "to_warehouse"],
                },
            ),
            handler=transfer_stock, risk_tier=RiskTier.WRITE, module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="ship_stock_transfer",
                description="Ship a DRAFT stock transfer (by its number): the stock leaves the source warehouse and the transfer is in transit.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "transfer": {"type": "string", "description": "Transfer number or id"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = ship - ONLY after the user confirmed."},
                    },
                    "required": ["transfer"],
                },
            ),
            handler=ship_stock_transfer, risk_tier=RiskTier.FINANCIAL, module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="receive_stock_transfer",
                description="Receive an in-transit stock transfer (by its number): everything still in transit arrives at the destination warehouse.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "transfer": {"type": "string", "description": "Transfer number or id"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = receive - ONLY after the user confirmed."},
                    },
                    "required": ["transfer"],
                },
            ),
            handler=receive_stock_transfer, risk_tier=RiskTier.FINANCIAL, module="inventory",
        ),
    ]
