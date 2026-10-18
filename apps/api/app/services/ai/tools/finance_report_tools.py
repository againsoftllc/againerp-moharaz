"""Read-only finance report tools — lets the AI answer "who owes us", "how are we doing",
"what did we sell this month" from the same Odoo-style reports the Finance module renders.

Every tool forwards the caller's bearer token into /api/v1/finance/reports/* (internal_api),
so a user who cannot open the Finance reports cannot read them through the AI either. All
tools are RiskTier.READ: they never change anything.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.ai.tools.internal_api import InternalApiError, internal_get


def _num(value: Any) -> float:
    try:
        return float(Decimal(str(value)))
    except Exception:
        return 0.0


_PERIODS = ("this_month", "last_month", "this_quarter", "last_30_days", "last_90_days", "this_year", "fiscal_year")
# words a small model copies from the user's sentence into the argument -> the tool value they mean
_PERIOD_ALIASES = {
    "gotomas": "last_month", "gato mas": "last_month", "goto mas": "last_month", "গত মাস": "last_month", "গতমাস": "last_month",
    "previous_month": "last_month", "last month": "last_month", "lastmonth": "last_month",
    "ei mas": "this_month", "eimas": "this_month", "এই মাস": "this_month", "current_month": "this_month", "this month": "this_month", "month": "this_month",
    "ei bochor": "this_year", "এই বছর": "this_year", "this year": "this_year", "year": "this_year", "ytd": "this_year",
    "last 30 days": "last_30_days", "30_days": "last_30_days", "last 90 days": "last_90_days", "90_days": "last_90_days",
    "quarter": "this_quarter", "this quarter": "this_quarter", "fy": "fiscal_year", "fiscal year": "fiscal_year",
}


def _period(name: Optional[str], today: Optional[date] = None) -> tuple[date, date]:
    """Named period → (from, to). Fiscal year starts in July (company default)."""
    today = today or date.today()
    name = _PERIOD_ALIASES.get((name or "this_month").strip().lower(), (name or "this_month").strip().lower())
    if name not in _PERIODS:
        # never silently report the wrong period (it used to fall through to the fiscal year)
        raise ValueError(f"period must be one of {', '.join(_PERIODS)} (or give date_from and date_to as YYYY-MM-DD), not {name!r}")
    first_of_month = today.replace(day=1)
    if name == "this_month":
        return first_of_month, today
    if name == "last_month":
        end = first_of_month - timedelta(days=1)
        return end.replace(day=1), end
    if name == "this_quarter":
        qm = (today.month - 1) // 3 * 3 + 1
        return today.replace(month=qm, day=1), today
    if name == "last_30_days":
        return today - timedelta(days=29), today
    if name == "last_90_days":
        return today - timedelta(days=89), today
    if name == "this_year":
        return today.replace(month=1, day=1), today
    # fiscal year (July start)
    fy_start = date(today.year if today.month >= 7 else today.year - 1, 7, 1)
    return fy_start, today


def build_finance_report_tools(bearer_token: str) -> list[OrchestratorTool]:
    def _get(path: str, params: Optional[dict] = None) -> dict | None:
        try:
            return internal_get(path, bearer_token=bearer_token, params=params)
        except InternalApiError as exc:
            return {"error": exc.detail, "status_code": exc.status_code}

    # ---------------------------------------------------------------- overdue AR / AP
    def _aged(kind: str, inp: dict) -> dict:
        as_of = inp.get("as_of") or date.today().isoformat()
        limit = min(int(inp.get("limit", 15)), 50)
        data = _get(f"/api/v1/finance/reports/aged-{kind}", {"as_of": as_of, "period_length": 30, "based_on": "due_date"})
        if not data or "error" in data:
            return data or {"error": "no data"}
        cols = {c["key"]: c["label"] for c in data["filters"]["columns"]}
        partners = []
        for p in data["rows"]:
            buckets = {k: _num(v) for k, v in (p.get("buckets") or {}).items()}
            total = _num(p.get("total"))
            overdue = round(total - buckets.get("at_date", 0.0), 2)
            if overdue <= 0 and not inp.get("include_not_due"):
                continue
            lines = sorted((p.get("lines") or []), key=lambda l: -_num(l.get("outstanding")))
            partners.append(
                {
                    "partner": p.get("partner_name"),
                    "partner_id": p.get("partner_id"),
                    "overdue": overdue,
                    "not_due": buckets.get("at_date", 0.0),
                    "total_outstanding": total,
                    "buckets": {cols.get(k, k): v for k, v in buckets.items() if v},
                    "oldest_days_overdue": max((int(l.get("days_overdue") or 0) for l in lines), default=0),
                    "documents": [
                        {
                            "reference": l.get("reference"),
                            "invoice_date": l.get("invoice_date"),
                            "due_date": l.get("due_date"),
                            "days_overdue": l.get("days_overdue"),
                            "outstanding": _num(l.get("outstanding")),
                        }
                        for l in lines[:5]
                    ],
                }
            )
        partners.sort(key=lambda r: -r["overdue"])
        totals = data.get("totals", {})
        return {
            "as_of": as_of,
            "kind": kind,
            "partners_with_overdue": len(partners),
            "total_overdue": _num(totals.get("overdue")),
            "total_outstanding": _num(totals.get("total")),
            "not_yet_due": _num(totals.get("not_due")),
            "top": partners[:limit],
            "truncated": len(partners) > limit,
            "currency": "BDT",
        }

    def get_overdue_receivables(inp: dict) -> dict:
        return _aged("receivable", inp)

    def get_overdue_payables(inp: dict) -> dict:
        return _aged("payable", inp)

    # ---------------------------------------------------------------- executive summary
    def get_financial_summary(inp: dict) -> dict:
        start, end = _period(inp.get("period"))
        if inp.get("date_from") and inp.get("date_to"):
            start, end = date.fromisoformat(inp["date_from"]), date.fromisoformat(inp["date_to"])
        params = {"date_from": start.isoformat(), "date_to": end.isoformat()}
        if inp.get("compare_with_previous_period"):
            params["comparison"] = "previous_period"
        data = _get("/api/v1/finance/reports/executive-summary", params)
        if not data or "error" in data:
            return data or {"error": "no data"}
        out: dict[str, Any] = {"period": {"from": start.isoformat(), "to": end.isoformat()}, "currency": "BDT", "sections": {}}
        for section in data["rows"]:
            lines = {}
            for line in section.get("children", []):
                entry: dict[str, Any] = {"value": None if line.get("amount") is None else _num(line["amount"]), "format": line.get("format", "money")}
                if "compare" in line:
                    entry["previous_period"] = None if line.get("compare") is None else _num(line["compare"])
                    entry["change_pct"] = None if line.get("variance_pct") is None else _num(line["variance_pct"])
                lines[line["label"]] = entry
            out["sections"][section["label"]] = lines
        return out

    # ---------------------------------------------------------------- sales this vs last month
    def get_sales_summary(inp: dict) -> dict:
        """Sales *orders* (what the Sales module shows), not the finance invoice ledger — those can
        differ when orders are not yet invoiced or when the receivable ledger was reseeded."""
        period = inp.get("period") or "this_month"
        start, end = _period(period)
        if inp.get("date_from") and inp.get("date_to"):
            start, end = date.fromisoformat(inp["date_from"]), date.fromisoformat(inp["date_to"])
        span = (end - start).days
        prev_end = start - timedelta(days=1)
        prev_start = _period("last_month", start)[0] if period in ("this_month", "last_month") and not inp.get("date_from") else prev_end - timedelta(days=span)
        limit = min(int(inp.get("limit", 5)), 20)
        cur = _get("/api/v1/sales/reports/summary", {"date_from": start.isoformat(), "date_to": end.isoformat(), "limit": limit})
        prev = _get("/api/v1/sales/reports/summary", {"date_from": prev_start.isoformat(), "date_to": prev_end.isoformat(), "limit": limit})
        if not cur or "error" in cur:
            return cur or {"error": "no data"}
        current = cur.get("data", {})
        previous = prev.get("data") if prev and "error" not in prev else None
        change = None
        if previous and _num(previous.get("total")):
            change = round((_num(current.get("total")) - _num(previous.get("total"))) / _num(previous.get("total")) * 100, 2)
        return {
            "currency": "BDT",
            "basis": "sales orders by order date (confirmed / processing / completed count as revenue; drafts and cancelled listed separately)",
            "current": current,
            "previous": previous,
            "change_pct_total": change,
        }

    # ---------------------------------------------------------------- top suppliers
    def get_top_suppliers(inp: dict) -> dict:
        start, end = _period(inp.get("period") or "fiscal_year")
        limit = min(int(inp.get("limit", 5)), 25)
        data = _get("/api/v1/finance/reports/partner-ledger", {"date_from": start.isoformat(), "date_to": end.isoformat(), "ledger_type": "payable"})
        if not data or "error" in data:
            return data or {"error": "no data"}
        rows = []
        for p in data["rows"]:
            bills = sum(_num(l.get("credit")) for l in p.get("lines", []) if l.get("journal") == "BILL")
            paid = sum(_num(l.get("debit")) for l in p.get("lines", []) if l.get("journal") == "PAY")
            if bills <= 0 and paid <= 0:
                continue
            rows.append(
                {
                    "supplier": p.get("partner_name"),
                    "supplier_id": p.get("partner_id"),
                    "purchases_billed": round(bills, 2),
                    "paid": round(paid, 2),
                    "balance_owed": round(-_num(p.get("balance")), 2),
                    "bills": sum(1 for l in p.get("lines", []) if l.get("journal") == "BILL"),
                }
            )
        rows.sort(key=lambda r: -r["purchases_billed"])
        return {"period": {"from": start.isoformat(), "to": end.isoformat()}, "currency": "BDT", "count": len(rows), "top": rows[:limit]}

    # ---------------------------------------------------------------- top selling products
    def get_top_selling_products(inp: dict) -> dict:
        """Ranks by units sold from sales order lines — get_sales_summary only ranks by
        customer, so this was previously answered wrong (customers returned for a product
        question) or not at all. Mirrors get_top_suppliers's period/limit shape."""
        period = inp.get("period") or "this_month"
        start, end = _period(period)
        if inp.get("date_from") and inp.get("date_to"):
            start, end = date.fromisoformat(inp["date_from"]), date.fromisoformat(inp["date_to"])
        limit = min(int(inp.get("limit", 5)), 25)
        data = _get("/api/v1/sales/reports/top-products", {"date_from": start.isoformat(), "date_to": end.isoformat(), "limit": limit})
        if not data or "error" in data:
            return data or {"error": "no data"}
        out = data["data"]
        # rank + an explicit note: the list is already sorted by quantity_sold — without this,
        # the model tends to re-sort it by revenue in its reply (verified live), which quietly
        # answers a different question ("top revenue" vs "top selling") than the one asked.
        products = [{"rank": i, **p} for i, p in enumerate(out.get("top_products", []), start=1)]
        return {
            **out,
            "top_products": products,
            "note": "top_products is already ranked by quantity_sold, highest first — present it in this exact order, do not re-sort by revenue.",
            "currency": "BDT",
        }

    # ---------------------------------------------------------------- per-product profit
    def get_product_profit(inp: dict) -> dict:
        """Revenue − cost for one product over a period — there was no way to answer 'what's
        the profit on X' at all before this (only company-wide gross profit existed).
        Gated on finance read server-side (see the endpoint) — restricted to whoever can
        already open Finance reports, until a per-tool AI permission model exists."""
        product = str(inp.get("product") or "").strip()
        if not product:
            return {"error": "Which product? Give a name, SKU or id."}
        params: dict[str, Any] = {"product": product}
        if inp.get("date_from") and inp.get("date_to"):
            params["date_from"] = inp["date_from"]
            params["date_to"] = inp["date_to"]
        elif inp.get("days"):
            end = date.today()
            params["date_from"] = (end - timedelta(days=int(inp["days"]))).isoformat()
            params["date_to"] = end.isoformat()
        data = _get("/api/v1/finance/reports/product-profit", params)
        if not data or "error" in data:
            return data or {"error": "no data"}
        if data.get("unit_cost") in ("0.00", 0, None) and data.get("cost_source", "").startswith("none"):
            data["warning"] = "No cost price is recorded for this product (neither inventory stock cost nor catalog purchase price) — profit shown assumes zero cost and is not reliable. Tell the user to set a cost price."
        return data

    period_schema = {
        "type": "string",
        "enum": ["this_month", "last_month", "this_quarter", "last_30_days", "last_90_days", "this_year", "fiscal_year"],
        "description": "Named period; fiscal_year = current fiscal year to date (starts 1 July)",
    }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_overdue_receivables",
                description=(
                    "Customers with overdue (past due date) unpaid invoices as of a date, from the Aged "
                    "Receivable report: overdue amount per customer, aging buckets, oldest days overdue and "
                    "their largest open invoices. Use for 'who owes us', 'overdue invoices', 'collections' and, in Bangla, 'baki' / 'paona' / 'dhar' - money CUSTOMERS owe US (for one customer: 'Ryans er kache koto paona'). NOT for what we owe suppliers (that is get_overdue_payables)."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "as_of": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                        "limit": {"type": "integer", "description": "Max customers to return (default 15)"},
                        "include_not_due": {"type": "boolean", "description": "Also include customers whose balance is not yet due"},
                    },
                },
            ),
            handler=get_overdue_receivables,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_overdue_payables",
                description=(
                    "Suppliers we owe with overdue bills as of a date, from the Aged Payable report: "
                    "overdue amount per supplier, aging buckets and their largest open bills. Use for 'dena' - money WE owe suppliers. Never for money customers owe us (get_overdue_receivables)."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "as_of": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                        "limit": {"type": "integer"},
                        "include_not_due": {"type": "boolean"},
                    },
                },
            ),
            handler=get_overdue_payables,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_financial_summary",
                description=(
                    "Executive summary for a period: cash received/spent/closing bank balance, income, cost "
                    "of revenue, gross profit, expenses, net profit, receivables, payables, net assets, "
                    "margins, debtor/creditor days, current ratio. Use for 'how is the business doing', "
                    "profit, cash position, balance sheet questions."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "period": period_schema,
                        "date_from": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "date_to": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "compare_with_previous_period": {"type": "boolean"},
                    },
                },
            ),
            handler=get_financial_summary,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_sales_summary",
                description=(
                    "Sales orders for a period vs the previous one (same data as the Sales module): order "
                    "count, customers, subtotal/tax/discount/total, average order value, status breakdown, "
                    "invoiced vs not-yet-invoiced, top customers and % change. Use for 'sales this month vs "
                    "last month', revenue trend, best customers, how many orders."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "period": period_schema,
                        "date_from": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "date_to": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "limit": {"type": "integer", "description": "Top customers to return (default 5)"},
                    },
                },
            ),
            handler=get_sales_summary,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_top_suppliers",
                description=(
                    "Suppliers ranked by purchase value (bills) in a period, with amount paid and balance "
                    "still owed. Use for 'top suppliers', 'who do we buy most from', supplier spend. SUPPLIERS ONLY - for top CUSTOMERS use get_sales_summary (it ranks customers) or query_database."
                ),
                input_schema={
                    "type": "object",
                    "properties": {"period": period_schema, "limit": {"type": "integer", "description": "default 5"}},
                },
            ),
            handler=get_top_suppliers,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_top_selling_products",
                description=(
                    "Products ranked by units sold and revenue from sales order lines in a period. Use for "
                    "'top selling product', 'which product sells most', 'best sellers' — never answer this "
                    "from get_sales_summary, which only ranks by customer, not product."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "period": period_schema,
                        "date_from": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "date_to": {"type": "string", "description": "YYYY-MM-DD (overrides period)"},
                        "limit": {"type": "integer", "description": "default 5"},
                    },
                },
            ),
            handler=get_top_selling_products,
            risk_tier=RiskTier.READ,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="get_product_profit",
                description=(
                    "Gross profit (revenue minus cost) for ONE specific product over a period — revenue from its "
                    "sales order lines, cost from inventory stock cost or the catalog purchase price. Defaults to "
                    "the last 30 days if no period is given. Use for 'profit on X', 'margin on X', 'is X "
                    "profitable'. If the result has no cost price recorded, say so plainly instead of presenting "
                    "the profit number as reliable."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "product": {"type": "string", "description": "Product name, SKU or id"},
                        "days": {"type": "integer", "description": "Trailing days, e.g. 30 — default when no explicit dates are given"},
                        "date_from": {"type": "string", "description": "YYYY-MM-DD (overrides days)"},
                        "date_to": {"type": "string", "description": "YYYY-MM-DD (overrides days)"},
                    },
                    "required": ["product"],
                },
            ),
            handler=get_product_profit,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
    ]
