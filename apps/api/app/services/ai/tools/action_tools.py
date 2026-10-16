"""Action tools — Aladin creates and moves ERP documents, with a human in the loop.

Every action here is two-step by design:

1. **Preview** (`confirm` absent/false): names are resolved to real records (customer,
   supplier, items, warehouse, assignee), prices/costs are filled from the ERP's own price
   data, totals are computed — and *nothing is written*. The model shows this preview and
   asks the user to confirm.
2. **Execute** (`confirm=true`, only after the user agreed in the conversation): the
   document is created through the ERP's public API with the caller's own bearer token, so
   the user's real permissions apply — the AI can never do more than the person could in
   the UI.

Creation always produces a *draft*. Committing money (confirming a sales / purchase order,
approving an expense) stays with the existing confirm_* / approve_* tools, which route to
`ai_approvals` when the amount exceeds the caller's approval limit (approval_gate.py). So
the flow is: preview → user confirms in chat → draft created → (optionally) confirm →
amount-based approval if needed.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_post

LEAD_STATUSES = ("new", "contacted", "interested", "qualified", "unqualified", "converted", "lost")
DEAL_STAGES = ("new", "qualified", "proposal", "negotiation", "won", "lost")
TASK_PRIORITIES = ("low", "medium", "high", "urgent")
FOLLOW_UP_TYPES = ("call", "email", "meeting", "whatsapp", "visit", "other")

CONFIRM_NOTE = "Nothing was created. Show this preview to the user and ask them to confirm; call again with confirm=true only after they explicitly agree."


def _f(v: Any) -> float:
    if v is None:
        return 0.0
    return float(v) if not isinstance(v, Decimal) else float(v)


def _money(v: float) -> str:
    return f"BDT {v:,.2f}"


def _parse_date(v: Any) -> Optional[str]:
    if not v:
        return None
    s = str(v).strip()
    try:
        return date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None


def _parse_datetime(v: Any) -> Optional[str]:
    if not v:
        return None
    s = str(v).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).isoformat()
    except ValueError:
        d = _parse_date(s)
        return f"{d}T10:00:00" if d else None


def build_action_tools(
    bearer_token: str,
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    """db/company_id/user are None only for tool_catalog() metadata — handlers are never
    invoked on that path."""

    def _conn():
        return db.get_bind().connect()  # type: ignore[union-attr]

    # ------------------------------------------------------------- resolvers

    def _lookup(table: str, q: str, cols: tuple[str, ...], label_col: str, extra: tuple[str, ...] = ()) -> dict:
        """Resolve a name/code/id to exactly one row. Returns {"ok": row} or {"error"/"candidates"}."""
        q = (q or "").strip()
        if not q:
            return {"error": f"{table}: a name, code or id is required"}
        select_cols = ", ".join(f'"{c}"' for c in ("id", label_col, *extra))
        with _conn() as conn:
            row = conn.execute(text(f'select {select_cols} from "{table}" where company_id = :c and id = :q'), {"c": company_id, "q": q}).first()
            if row:
                return {"ok": dict(zip(("id", label_col, *extra), row))}
            exact = " or ".join(f'lower("{c}"::text) = lower(:q)' for c in cols)
            rows = conn.execute(text(f'select {select_cols} from "{table}" where company_id = :c and ({exact}) limit 5'), {"c": company_id, "q": q}).all()
            if len(rows) == 1:
                return {"ok": dict(zip(("id", label_col, *extra), rows[0]))}
            if not rows:
                like = " or ".join(f'"{c}"::text ilike :q' for c in cols)
                rows = conn.execute(text(f'select {select_cols} from "{table}" where company_id = :c and ({like}) limit 6'), {"c": company_id, "q": f"%{q}%"}).all()
        if len(rows) == 1:
            return {"ok": dict(zip(("id", label_col, *extra), rows[0]))}
        if not rows:
            return {"error": f"No match for '{q}' in {table}."}
        return {"error": f"'{q}' is ambiguous — ask the user which one.", "candidates": [dict(zip(("id", label_col, *extra), r)) for r in rows]}

    def _customer(q: str) -> dict:
        return _lookup("commerce_customers", q, ("name", "customer_code", "phone", "email"), "name", ("customer_code",))

    def _supplier(q: str) -> dict:
        return _lookup("commerce_suppliers", q, ("name", "vendor_code", "email", "phone"), "name", ("vendor_code", "lead_time_days"))

    def _item(q: str) -> dict:
        r = _lookup("items", q, ("sku", "barcode", "name"), "name", ("sku",))
        if "ok" in r:
            return r
        # catalog products carry their own sku/name and point at the item
        with _conn() as conn:
            rows = conn.execute(
                text('select item_id, name, sku from catalog_products where company_id = :c and item_id is not null and (lower(sku) = lower(:q) or name ilike :like) limit 6'),
                {"c": company_id, "q": q, "like": f"%{q}%"},
            ).all()
        if len(rows) == 1:
            return {"ok": {"id": rows[0][0], "name": rows[0][1], "sku": rows[0][2]}}
        if len(rows) > 1:
            return {"error": f"'{q}' matches several products — ask the user which one.", "candidates": [{"id": r[0], "name": r[1], "sku": r[2]} for r in rows]}
        return r

    def _lead(q: str) -> dict:
        return _lookup("crm_leads", q, ("name", "company_name", "phone", "email"), "name", ("company_name", "status"))

    def _deal(q: str) -> dict:
        return _lookup("crm_deals", q, ("title", "contact_company", "contact_name"), "title", ("stage", "value"))

    def _assignee(q: str) -> Optional[dict]:
        if not q:
            return None
        with _conn() as conn:
            row = conn.execute(
                text("select id, name, email from auth_users where company_id = :c and is_active and (id = :q or lower(email) = lower(:q) or name ilike :like) limit 2"),
                {"c": company_id, "q": q, "like": f"%{q}%"},
            ).all()
        return {"id": row[0][0], "name": row[0][1]} if len(row) == 1 else None

    def _warehouse(q: Optional[str]) -> Optional[dict]:
        with _conn() as conn:
            if q:
                row = conn.execute(text("select id, name from inventory_warehouses where company_id = :c and (id = :q or lower(code) = lower(:q) or name ilike :like) limit 1"), {"c": company_id, "q": q, "like": f"%{q}%"}).first()
                if row:
                    return {"id": row[0], "name": row[1]}
            row = conn.execute(text("select id, name from inventory_warehouses where company_id = :c and is_active order by is_default desc, sort_order nulls last, created_at limit 1"), {"c": company_id}).first()
        return {"id": row[0], "name": row[1]} if row else None

    def _sale_price(customer_id: str, item_id: str) -> float:
        with _conn() as conn:
            row = conn.execute(
                text("select unit_price from customer_item_prices where company_id = :c and customer_id = :cu and item_id = :i and is_active and (valid_to is null or valid_to >= current_date) order by valid_from desc nulls last limit 1"),
                {"c": company_id, "cu": customer_id, "i": item_id},
            ).first()
            if row and row[0] is not None:
                return _f(row[0])
            row = conn.execute(text("select coalesce(nullif(last_selling_price, 0), price) from catalog_products where company_id = :c and item_id = :i limit 1"), {"c": company_id, "i": item_id}).first()
        return _f(row[0]) if row else 0.0

    def _purchase_cost(supplier_id: Optional[str], item_id: str) -> float:
        with _conn() as conn:
            row = conn.execute(
                text(
                    "select l.unit_cost from purchase_order_lines l join purchase_orders o on o.id = l.purchase_order_id "
                    "where o.company_id = :c and l.item_id = :i and (cast(:s as text) is null or coalesce(l.supplier_id, o.supplier_id) = cast(:s as text)) order by o.order_date desc limit 1"
                ),
                {"c": company_id, "i": item_id, "s": supplier_id},
            ).first()
            if row and row[0] is not None:
                return _f(row[0])
            row = conn.execute(text("select coalesce(nullif(purchase_price, 0), 0) from catalog_products where company_id = :c and item_id = :i limit 1"), {"c": company_id, "i": item_id}).first()
            if row and _f(row[0]) > 0:
                return _f(row[0])
            row = conn.execute(text("select max(unit_cost) from inventory_stock_levels where company_id = :c and item_id = :i"), {"c": company_id, "i": item_id}).first()
        return _f(row[0]) if row else 0.0

    def _approval_limit(document_type: str) -> Optional[float]:
        try:
            from app.services.core.approval_service import _role_slugs, effective_limit

            limit = effective_limit(db, company_id, _role_slugs(db, user), document_type)  # type: ignore[arg-type]
            return _f(limit) if limit is not None else None
        except Exception:
            return None

    def _resolve_lines(lines: list, *, party_id: Optional[str], price_fn, price_key: str) -> tuple[list[dict], list[dict], list[str]]:
        """→ (api_lines, preview_lines, problems)"""
        api_lines: list[dict] = []
        preview: list[dict] = []
        problems: list[str] = []
        for i, raw in enumerate(lines or [], start=1):
            if not isinstance(raw, dict):
                problems.append(f"line {i}: must be an object")
                continue
            ref = str(raw.get("item") or raw.get("sku") or raw.get("name") or "").strip()
            qty = int(raw.get("quantity") or raw.get("qty") or 0)
            if qty <= 0:
                problems.append(f"line {i} ({ref or '?'}): quantity must be at least 1")
                continue
            res = _item(ref)
            if "ok" not in res:
                problems.append(f"line {i}: {res['error']}" + (f" Candidates: {res['candidates']}" if res.get("candidates") else ""))
                continue
            item = res["ok"]
            price_in = raw.get("unit_price") if price_key == "unit_price" else raw.get("unit_cost")
            price = _f(price_in) if price_in not in (None, "") else price_fn(party_id, item["id"])
            source = "given" if price_in not in (None, "") else ("ERP price data" if price > 0 else "unknown — ask the user")
            discount = _f(raw.get("discount_amount") or 0)
            line_total = qty * price - discount
            api_line = {"item_id": item["id"], price_key: round(price, 2), "discount_amount": round(discount, 2)}
            api_line["quantity" if price_key == "unit_price" else "quantity_ordered"] = qty
            if raw.get("notes"):
                api_line["notes"] = str(raw["notes"])[:500]
            api_lines.append(api_line)
            preview.append({"sku": item.get("sku"), "name": item["name"], "quantity": qty, price_key: round(price, 2), "price_source": source, "discount": round(discount, 2), "line_total": round(line_total, 2)})
            if price <= 0:
                problems.append(f"line {i} ({item.get('sku') or item['name']}): no price on file — ask the user for the {price_key.replace('_', ' ')}")
        return api_lines, preview, problems

    def _post(path: str, payload: dict) -> dict:
        try:
            res = internal_post(path, bearer_token=bearer_token, json=payload)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}
        return res.get("data", res) if isinstance(res, dict) else {"raw": res}

    # ----------------------------------------------------------- sales docs

    def _sales_doc(inp: dict, *, kind: str) -> dict:
        cust = _customer(str(inp.get("customer") or ""))
        if "ok" not in cust:
            return {"status": "needs_input", **cust}
        customer = cust["ok"]
        api_lines, preview, problems = _resolve_lines(inp.get("lines") or [], party_id=customer["id"], price_fn=_sale_price, price_key="unit_price")
        if not api_lines and not problems:
            problems.append("at least one line (item + quantity) is required")
        total = round(sum(l["line_total"] for l in preview), 2)
        warehouse = _warehouse(inp.get("warehouse"))
        payload: dict = {"customer_id": customer["id"], "lines": api_lines, "notes": (inp.get("notes") or None)}
        if warehouse:
            payload["warehouse_id"] = warehouse["id"]
        if kind == "quotation":
            if _parse_date(inp.get("valid_until")):
                payload["valid_until"] = _parse_date(inp.get("valid_until"))
            path, label, doc_type = "/api/v1/sales/quotations", "Quotation", None
        else:
            if _parse_date(inp.get("expected_date")):
                payload["expected_date"] = _parse_date(inp.get("expected_date"))
            path, label, doc_type = "/api/v1/sales/orders", "Sales order", "sales.order"
        summary = {
            "action": f"Create {label.lower()} (draft)",
            "customer": {"id": customer["id"], "name": customer["name"], "code": customer.get("customer_code")},
            "warehouse": warehouse,
            "lines": preview,
            "total": total,
            "total_display": _money(total),
            "notes": inp.get("notes"),
        }
        if doc_type:
            lim = _approval_limit(doc_type)
            summary["confirm_later"] = "Confirming this order afterwards" + (f" needs approval above your limit of {_money(lim)}." if lim is not None and total > lim else " is within your approval limit." if lim is not None else " — no approval limit set for your role.")
        if problems:
            return {"status": "needs_input", "problems": problems, "preview": summary}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        created = _post(path, payload)
        if "error" in created:
            return created
        number = created.get("quotation_number") or created.get("order_number") or created.get("id")
        return {
            "status": "created",
            "document": label,
            "id": created.get("id"),
            "number": number,
            "state": created.get("status", "draft"),
            "total": _f(created.get("total") or total),
            "customer": customer["name"],
            "path": f"/sales?open={created.get('id')}" + ("&filter=quotations" if kind == "quotation" else ""),
            "doc_link": f"doc://{'sales_quotation' if kind == 'quotation' else 'sales_order'}/{created.get('id')}",
            "next": ("Ask if the user wants it confirmed now (confirm_sales_order) — that is the commit point." if kind == "order" else "The quotation is a draft; the team can send or convert it from Sales → Orders."),
        }

    def create_sales_quotation(inp: dict) -> dict:
        return _sales_doc(inp, kind="quotation")

    def create_sales_order(inp: dict) -> dict:
        return _sales_doc(inp, kind="order")

    # -------------------------------------------------------- purchase order

    def create_purchase_order(inp: dict) -> dict:
        sup = _supplier(str(inp.get("supplier") or ""))
        if "ok" not in sup:
            return {"status": "needs_input", **sup}
        supplier = sup["ok"]
        api_lines, preview, problems = _resolve_lines(inp.get("lines") or [], party_id=supplier["id"], price_fn=_purchase_cost, price_key="unit_cost")
        if not api_lines and not problems:
            problems.append("at least one line (item + quantity) is required")
        warehouse = _warehouse(inp.get("warehouse"))
        if not warehouse:
            problems.append("no active warehouse found — create one under Inventory → Warehouses")
        total = round(sum(l["line_total"] for l in preview), 2)
        payload: dict = {"supplier_id": supplier["id"], "warehouse_id": warehouse["id"] if warehouse else "", "company_id": company_id, "lines": api_lines, "notes": inp.get("notes") or None}
        if _parse_date(inp.get("expected_date")):
            payload["expected_date"] = _parse_date(inp.get("expected_date"))
        lim = _approval_limit("purchase.order")
        summary = {
            "action": "Create purchase order (draft)",
            "supplier": {"id": supplier["id"], "name": supplier["name"], "code": supplier.get("vendor_code"), "lead_time_days": supplier.get("lead_time_days")},
            "warehouse": warehouse,
            "lines": preview,
            "total": total,
            "total_display": _money(total),
            "expected_date": payload.get("expected_date"),
            "confirm_later": "Confirming this PO afterwards" + (f" needs approval above your limit of {_money(lim)}." if lim is not None and total > lim else " is within your approval limit." if lim is not None else " — no approval limit set for your role."),
        }
        if problems:
            return {"status": "needs_input", "problems": problems, "preview": summary}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        created = _post("/api/v1/purchase/orders", payload)
        if "error" in created:
            return created
        return {
            "status": "created",
            "document": "Purchase order",
            "id": created.get("id"),
            "number": created.get("po_number") or created.get("id"),
            "state": created.get("status", "draft"),
            "total": _f(created.get("total") or total),
            "supplier": supplier["name"],
            "path": f"/purchase/orders?open={created.get('id')}",
            "doc_link": f"doc://purchase_order/{created.get('id')}",
            "next": "Ask if the user wants it confirmed now (confirm_purchase_order) — that is the commit point.",
        }

    # ------------------------------------------------------------------ CRM

    def create_crm_task(inp: dict) -> dict:
        title = str(inp.get("title") or "").strip()
        if not title:
            return {"status": "needs_input", "error": "title is required"}
        priority = str(inp.get("priority") or "medium").lower()
        if priority not in TASK_PRIORITIES:
            return {"status": "needs_input", "error": f"priority must be one of {TASK_PRIORITIES}"}
        assignee = _assignee(str(inp.get("assignee") or ""))
        if inp.get("assignee") and not assignee:
            return {"status": "needs_input", "error": f"Could not find a single user matching '{inp.get('assignee')}' — ask for the exact name or email."}
        related = None
        if inp.get("related_customer"):
            c = _customer(str(inp["related_customer"]))
            if "ok" not in c:
                return {"status": "needs_input", **c}
            related = {"related_type": "customer", "related_id": c["ok"]["id"], "label": c["ok"]["name"]}
        elif inp.get("related_lead"):
            l = _lead(str(inp["related_lead"]))
            if "ok" not in l:
                return {"status": "needs_input", **l}
            related = {"related_type": "lead", "related_id": l["ok"]["id"], "label": l["ok"]["name"]}
        payload = {
            "company_id": company_id,
            "title": title[:200],
            "description": inp.get("description") or None,
            "priority": priority,
            "due_date": _parse_date(inp.get("due_date")),
            "assignee_id": assignee["id"] if assignee else None,
            **({"related_type": related["related_type"], "related_id": related["related_id"]} if related else {}),
        }
        summary = {"action": "Create task", "title": title, "priority": priority, "due_date": payload["due_date"], "assignee": assignee, "related_to": related and related["label"], "description": inp.get("description")}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        created = _post("/api/v1/crm/tasks", payload)
        if "error" in created:
            return created
        return {"status": "created", "document": "Task", "id": created.get("id"), "title": created.get("title", title), "doc_link": f"doc://task/{created.get('id')}", "path": f"/crm/tasks?open={created.get('id')}"}

    def create_crm_lead(inp: dict) -> dict:
        name = str(inp.get("name") or "").strip()
        if not name:
            return {"status": "needs_input", "error": "name is required"}
        payload = {
            "company_id": company_id,
            "name": name[:120],
            "company_name": inp.get("company_name") or None,
            "phone": inp.get("phone") or None,
            "email": inp.get("email") or None,
            "source": str(inp.get("source") or "other"),
            "estimated_value": _f(inp.get("estimated_value")) if inp.get("estimated_value") not in (None, "") else None,
            "notes": inp.get("notes") or None,
            "next_follow_up_at": _parse_datetime(inp.get("follow_up_at")),
            "next_follow_up_type": inp.get("follow_up_type") or ("call" if inp.get("follow_up_at") else None),
            "next_follow_up_note": inp.get("follow_up_note") or None,
        }
        summary = {"action": "Create lead", **{k: v for k, v in payload.items() if k != "company_id" and v not in (None, "")}}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        created = _post("/api/v1/crm/leads", payload)
        if "error" in created:
            return created
        return {"status": "created", "document": "Lead", "id": created.get("id"), "name": created.get("name", name), "lead_status": created.get("status"), "doc_link": f"doc://lead/{created.get('id')}", "path": f"/crm/leads?open={created.get('id')}"}

    def update_lead_status(inp: dict) -> dict:
        res = _lead(str(inp.get("lead") or ""))
        if "ok" not in res:
            return {"status": "needs_input", **res}
        lead = res["ok"]
        status = str(inp.get("status") or "").lower().strip()
        if status not in LEAD_STATUSES:
            return {"status": "needs_input", "error": f"status must be one of {LEAD_STATUSES}"}
        payload = {"status": status, "lost_reason": inp.get("lost_reason") or None, "lost_note": inp.get("lost_note") or None}
        summary = {"action": "Change lead status", "lead": {"id": lead["id"], "name": lead["name"], "company": lead.get("company_name")}, "from": lead.get("status"), "to": status, "lost_reason": payload["lost_reason"]}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        updated = _post(f"/api/v1/crm/leads/{lead['id']}/status", payload)
        if "error" in updated:
            return updated
        return {"status": "updated", "document": "Lead", "id": lead["id"], "name": lead["name"], "lead_status": updated.get("status", status), "doc_link": f"doc://lead/{lead['id']}", "path": f"/crm/leads?open={lead['id']}"}

    def schedule_lead_follow_up(inp: dict) -> dict:
        res = _lead(str(inp.get("lead") or ""))
        if "ok" not in res:
            return {"status": "needs_input", **res}
        lead = res["ok"]
        at = _parse_datetime(inp.get("at"))
        if not at:
            return {"status": "needs_input", "error": "at (date/time, e.g. 2026-09-20 11:00) is required"}
        ftype = str(inp.get("type") or "call").lower()
        if ftype not in FOLLOW_UP_TYPES:
            ftype = "other"
        payload = {"at": at, "type": ftype, "note": inp.get("note") or None}
        summary = {"action": "Schedule follow-up", "lead": {"id": lead["id"], "name": lead["name"], "company": lead.get("company_name")}, **payload}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        updated = _post(f"/api/v1/crm/leads/{lead['id']}/follow-up", payload)
        if "error" in updated:
            return updated
        return {"status": "scheduled", "document": "Lead follow-up", "id": lead["id"], "name": lead["name"], "at": at, "type": ftype, "doc_link": f"doc://lead/{lead['id']}", "path": f"/crm/leads?open={lead['id']}"}

    def update_deal_stage(inp: dict) -> dict:
        res = _deal(str(inp.get("deal") or ""))
        if "ok" not in res:
            return {"status": "needs_input", **res}
        deal = res["ok"]
        stage = str(inp.get("stage") or "").lower().strip()
        if stage not in DEAL_STAGES:
            return {"status": "needs_input", "error": f"stage must be one of {DEAL_STAGES}"}
        payload = {"stage": stage, "lost_reason": inp.get("lost_reason") or None}
        summary = {"action": "Move deal stage", "deal": {"id": deal["id"], "title": deal["title"], "value": _f(deal.get("value"))}, "from": deal.get("stage"), "to": stage, "lost_reason": payload["lost_reason"]}
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        updated = _post(f"/api/v1/crm/deals/{deal['id']}/stage", payload)
        if "error" in updated:
            return updated
        return {"status": "updated", "document": "Deal", "id": deal["id"], "title": deal["title"], "stage": updated.get("stage", stage), "doc_link": f"doc://deal/{deal['id']}", "path": f"/crm/deals?open={deal['id']}"}

    # -------------------------------------------------------------- catalog

    line_schema = {
        "type": "array",
        "minItems": 1,
        "items": {
            "type": "object",
            "properties": {
                "item": {"type": "string", "description": "SKU, barcode or product name"},
                "quantity": {"type": "integer", "minimum": 1},
                "unit_price": {"type": "number", "description": "Optional — defaults to the customer's price or the product's selling price"},
                "discount_amount": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["item", "quantity"],
        },
    }
    po_line_schema = {
        "type": "array",
        "minItems": 1,
        "items": {
            "type": "object",
            "properties": {
                "item": {"type": "string", "description": "SKU, barcode or product name"},
                "quantity": {"type": "integer", "minimum": 1},
                "unit_cost": {"type": "number", "description": "Optional — defaults to the last purchase cost from this supplier, else the product's purchase price"},
                "discount_amount": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["item", "quantity"],
        },
    }
    confirm_prop = {"type": "boolean", "description": "false/omitted = preview only (nothing written). true = create — ONLY after the user has explicitly confirmed the preview in this conversation."}

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_sales_quotation",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Create a sales quotation (draft) for a customer with one or more item lines. Two-step: first call without confirm to get a priced preview, show it, then call with confirm=true after the user agrees.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "customer": {"type": "string", "description": "Customer name, code, phone, email or id"},
                        "lines": line_schema,
                        "valid_until": {"type": "string", "description": "YYYY-MM-DD"},
                        "warehouse": {"type": "string"},
                        "notes": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["customer", "lines"],
                },
            ),
            handler=create_sales_quotation,
            risk_tier=RiskTier.WRITE,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_sales_order",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Create a sales order (draft, not yet confirmed) for a customer with item lines. Two-step preview → confirm=true. Confirming the order afterwards is a separate step (confirm_sales_order) with amount-based approval.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "customer": {"type": "string"},
                        "lines": line_schema,
                        "expected_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "warehouse": {"type": "string"},
                        "notes": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["customer", "lines"],
                },
            ),
            handler=create_sales_order,
            risk_tier=RiskTier.WRITE,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_purchase_order",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Create a purchase order (draft) to a supplier with item lines; costs default from purchase history. Two-step preview → confirm=true. Confirming it afterwards is confirm_purchase_order (amount-based approval).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "supplier": {"type": "string", "description": "Supplier name, code, email or id"},
                        "lines": po_line_schema,
                        "expected_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "warehouse": {"type": "string", "description": "Optional — defaults to the default warehouse"},
                        "notes": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["supplier", "lines"],
                },
            ),
            handler=create_purchase_order,
            risk_tier=RiskTier.WRITE,
            module="purchase",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_crm_task",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Create a CRM task / follow-up reminder (title, due date, priority, assignee, optionally linked to a customer or lead). Two-step preview → confirm=true.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "priority": {"type": "string", "enum": list(TASK_PRIORITIES)},
                        "assignee": {"type": "string", "description": "User name or email"},
                        "related_customer": {"type": "string"},
                        "related_lead": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["title"],
                },
            ),
            handler=create_crm_task,
            risk_tier=RiskTier.WRITE,
            module="crm",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="create_crm_lead",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Create a CRM lead (name, company, phone/email, source, estimated value, optional first follow-up). Two-step preview → confirm=true.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "company_name": {"type": "string"},
                        "phone": {"type": "string"},
                        "email": {"type": "string"},
                        "source": {"type": "string", "description": "e.g. website, referral, facebook, call, other"},
                        "estimated_value": {"type": "number"},
                        "notes": {"type": "string"},
                        "follow_up_at": {"type": "string", "description": "YYYY-MM-DD or ISO datetime"},
                        "follow_up_type": {"type": "string", "enum": list(FOLLOW_UP_TYPES)},
                        "follow_up_note": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["name"],
                },
            ),
            handler=create_crm_lead,
            risk_tier=RiskTier.WRITE,
            module="crm",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="update_lead_status",
                description=f"Move a CRM lead to a new status ({', '.join(LEAD_STATUSES)}). Two-step preview → confirm=true.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "lead": {"type": "string", "description": "Lead name, company, phone, email or id"},
                        "status": {"type": "string", "enum": list(LEAD_STATUSES)},
                        "lost_reason": {"type": "string"},
                        "lost_note": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["lead", "status"],
                },
            ),
            handler=update_lead_status,
            risk_tier=RiskTier.WRITE,
            module="crm",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="schedule_lead_follow_up",
                description="CALL THIS FIRST (without confirm) the moment the user asks — it returns the preview; nothing is written until confirm=true. Schedule the next follow-up (call/email/meeting/visit) on a CRM lead at a date/time with a note. Two-step preview → confirm=true.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "lead": {"type": "string"},
                        "at": {"type": "string", "description": "YYYY-MM-DD or ISO datetime"},
                        "type": {"type": "string", "enum": list(FOLLOW_UP_TYPES)},
                        "note": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["lead", "at"],
                },
            ),
            handler=schedule_lead_follow_up,
            risk_tier=RiskTier.WRITE,
            module="crm",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="update_deal_stage",
                description=f"Move a CRM deal to another stage ({', '.join(DEAL_STAGES)}). Two-step preview → confirm=true.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "deal": {"type": "string", "description": "Deal title, company or id"},
                        "stage": {"type": "string", "enum": list(DEAL_STAGES)},
                        "lost_reason": {"type": "string"},
                        "confirm": confirm_prop,
                    },
                    "required": ["deal", "stage"],
                },
            ),
            handler=update_deal_stage,
            risk_tier=RiskTier.WRITE,
            module="crm",
        ),
    ]
