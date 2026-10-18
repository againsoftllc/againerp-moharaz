"""Deliveries from chat (docs/AI/ai.md, step 3.2): "SO-00001 deliver koro", "SO-00001 er 5 ta Vivobook pathiye dao".

The ERP separates the two steps, and so do the tools:

* `create_sales_delivery` - WRITE, two-step. For a confirmed / processing order it prepares a DRAFT delivery of everything still undelivered
  (or only the lines the user names). Stock does not move yet. Through `POST /sales/orders/{id}/deliveries` with the user's token.
* `post_sales_delivery`   - FINANCIAL, two-step. Posts the draft: stock leaves the warehouse and the order's delivery status moves
  (`POST /sales/deliveries/{id}/post`). The preview lists the lines about to leave.

Nothing bypasses the ERP's own checks (order status, remaining quantity, stock).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get, internal_post

NOTE_CREATE = (
    "Nothing was created. Show the user what will be delivered (items and quantities) and ask them to confirm; call this tool again with "
    "the same arguments and confirm=true ONLY after they explicitly agree. It prepares a DRAFT delivery - stock moves when it is posted."
)
NOTE_POST = (
    "Nothing was posted. Show the user the lines that will leave the warehouse and ask them to confirm; call this tool again with the same "
    "arguments and confirm=true ONLY after they explicitly agree. Posting moves stock."
)


def build_delivery_tools(
    bearer_token: str, *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    def _one(table: str, number_col: str, ref: str) -> Optional[str]:
        if db is None or not ref:
            return None
        with db.get_bind().connect() as conn:
            row = conn.execute(
                text(f'select id from "{table}" where company_id = :c and (id = :q or lower("{number_col}") = lower(:q)) limit 1'),
                {"c": company_id, "q": ref.strip()},
            ).first()
        return row[0] if row else None

    def create_sales_delivery(inp: dict) -> dict:
        ref = str(inp.get("order") or "").strip()
        oid = _one("sales_orders", "order_number", ref)
        if not oid:
            return {"error": f"No sales order matches '{ref}'. Check the number (e.g. SO-00001)."}
        try:
            o = (internal_get(f"/api/v1/sales/orders/{oid}", bearer_token=bearer_token) or {}).get("data", {})
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        if o.get("status") not in ("confirmed", "processing"):
            return {"error": f"Order {o.get('order_number')} is {o.get('status')} - only confirmed or processing orders can be delivered. Confirm it first."}
        wanted = inp.get("lines") or []
        plan, problems = [], []
        for line in o.get("lines") or []:
            remaining = int(line.get("quantity_ordered") or 0) - int(line.get("quantity_delivered") or 0)
            if remaining <= 0:
                continue
            qty = remaining
            if wanted:
                hit = next((w for w in wanted if str(w.get("item") or w.get("sku") or "").strip().lower() in (str(line.get("sku") or "").lower(), str(line.get("name") or "").lower())
                            or (w.get("item") and str(w["item"]).strip().lower() in str(line.get("name") or "").lower())), None)
                if not hit:
                    continue
                qty = int(hit.get("quantity") or remaining)
                if qty > remaining:
                    problems.append(f"{line.get('name')}: only {remaining} left to deliver, not {qty}")
                    continue
            plan.append({"sales_order_line_id": line["id"], "quantity_delivered": qty, "_name": line.get("name"), "_sku": line.get("sku"), "_remaining": remaining})
        if problems:
            return {"error": "; ".join(problems)}
        if not plan:
            return {"error": f"Nothing left to deliver on order {o.get('order_number')}" + (" for those items." if wanted else ".")}
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Create delivery (draft)", "order": o.get("order_number"), "customer": o.get("customer_name"),
                    "lines": [{"item": p["_name"], "sku": p["_sku"], "deliver": p["quantity_delivered"], "left_to_deliver": p["_remaining"]} for p in plan],
                    "note": "A draft - stock moves only when the delivery is posted.",
                },
                "note": NOTE_CREATE,
            }
        payload = {"lines": [{"sales_order_line_id": p["sales_order_line_id"], "quantity_delivered": p["quantity_delivered"]} for p in plan],
                   "delivered_by": getattr(user, "name", None), "notes": str(inp.get("notes") or "").strip() or None}
        try:
            res = internal_post(f"/api/v1/sales/orders/{oid}/deliveries", bearer_token=bearer_token, json=payload)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        d = res.get("data", {})
        return {
            "status": "created_draft", "delivery_id": d.get("id"), "delivery_number": d.get("delivery_number"), "delivery_status": d.get("status"),
            "order": o.get("order_number"), "lines": len(plan),
            "message": "A DRAFT delivery was created - stock has NOT moved. Post it with post_sales_delivery.",
        }

    def post_sales_delivery(inp: dict) -> dict:
        ref = str(inp.get("delivery") or "").strip()
        did = _one("sales_deliveries", "delivery_number", ref)
        if not did:
            return {"error": f"No delivery matches '{ref}'. Use the delivery number (or find it with search_records)."}
        with db.get_bind().connect() as conn:  # type: ignore[union-attr]
            head = conn.execute(text(
                "select d.delivery_number, d.status, o.order_number, o.delivery_status from sales_deliveries d join sales_orders o on o.id = d.sales_order_id "
                "where d.id = :d"), {"d": did}).first()
            lines = conn.execute(text(
                "select ol.name, ol.sku, dl.quantity_delivered from sales_delivery_lines dl join sales_order_lines ol on ol.id = dl.sales_order_line_id "
                "where dl.sales_delivery_id = :d order by ol.name"), {"d": did}).all()
        if head[1] != "draft":
            return {"error": f"Delivery {head[0]} is {head[1]} - only a draft can be posted."}
        if inp.get("confirm") is not True:
            return {
                "status": "preview",
                "preview": {
                    "action": "Post delivery (stock leaves the warehouse)", "delivery": head[0], "order": head[2],
                    "lines": [{"item": n, "sku": s, "quantity": q} for n, s, q in lines],
                },
                "note": NOTE_POST,
            }
        try:
            res = internal_post(f"/api/v1/sales/deliveries/{did}/post", bearer_token=bearer_token)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        d = res.get("data", {})
        return {
            "status": "posted", "delivery": head[0], "delivery_status": d.get("status"),
            "before": {"delivery_status": head[1], "order_delivery_status": head[3]},
            "after": {"delivery_status": d.get("status")},
        }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_sales_delivery",
                description=(
                    "Prepare a DRAFT delivery for a confirmed / processing sales order - everything still undelivered, or only the lines named in "
                    "`lines`. Use for 'SO-00001 deliver koro', 'SO-00001 er 5 ta Vivobook pathao'. Stock does not move until post_sales_delivery. "
                    "NOTE: in this ERP confirming an order already delivers the goods, deducts stock and issues the invoice, so a normally confirmed "
                    "order has nothing left to deliver - this is for orders with undelivered quantity (partial / POS). "
                    "Call WITHOUT confirm first: it lists what would be delivered."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "order": {"type": "string", "description": "Sales order number (e.g. SO-00001) or id"},
                        "lines": {
                            "type": "array", "description": "Optional: only these items. Omit to deliver everything left.",
                            "items": {"type": "object", "properties": {"item": {"type": "string", "description": "Item name or SKU"}, "quantity": {"type": "integer"}}},
                        },
                        "notes": {"type": "string"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = create the draft - ONLY after the user confirmed."},
                    },
                    "required": ["order"],
                },
            ),
            handler=create_sales_delivery, risk_tier=RiskTier.WRITE, module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="post_sales_delivery",
                description=(
                    "Post a DRAFT delivery (by its number, e.g. DEL-00001): stock leaves the warehouse and the order's delivery status moves. "
                    "Call WITHOUT confirm first: it lists the lines that will leave."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "delivery": {"type": "string", "description": "Delivery number or id"},
                        "confirm": {"type": "boolean", "description": "false/omitted = preview only. true = post - ONLY after the user confirmed."},
                    },
                    "required": ["delivery"],
                },
            ),
            handler=post_sales_delivery, risk_tier=RiskTier.FINANCIAL, module="sales",
        ),
    ]
