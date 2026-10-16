"""Forecast tools — deterministic projections from the ERP's own history.

The model never "predicts" anything itself: every figure here is computed in Python from
sales orders, stock levels/consumption and AR/AP schedules, and returned with the method
and its caveats so the assistant can explain *how* the estimate was made. Three tools:

- forecast_sales      — month-by-month sales projection (trend + seasonality, or moving
                        average when history is short) plus a run-rate estimate for the
                        current month.
- predict_stockouts   — days of cover per item from recent consumption, which items run
                        out first, and a suggested reorder quantity.
- forecast_cash_flow  — week-by-week expected cash in (receivables due) and out (payables
                        due + average recurring expenses), net and cumulative.

Permission-scoped like everything else: sales / inventory / finance read respectively.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from statistics import median
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition

REVENUE_STATUSES = ("confirmed", "processing", "completed")


def _f(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _month_add(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def _can(db: Optional[Session], user: Any, module: str) -> bool:
    if db is None or user is None:
        return False
    role = str(getattr(user, "role", "") or "").lower()
    if role in ("admin", "system_manager"):
        return True
    try:
        from app.services import rbac

        return rbac.is_system_manager(db, user) or rbac.has_permission(db, user, module, "read")
    except Exception:
        return False


def _linear_fit(ys: list[float]) -> tuple[float, float]:
    """Least-squares slope/intercept over x = 0..n-1."""
    n = len(ys)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0)
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx if sxx else 0.0
    return slope, my - slope * mx


def build_forecast_tools(*, db: Session | None, company_id: str | None, user: Any | None) -> list[OrchestratorTool]:
    def _conn():
        return db.get_bind().connect()  # type: ignore[union-attr]

    # ------------------------------------------------------------------ sales

    def forecast_sales(inp: dict) -> dict:
        if not _can(db, user, "sales"):
            return {"error": "Sales forecast needs sales read permission."}
        horizon = max(1, min(int(inp.get("horizon_months") or 3), 12))
        lookback = max(3, min(int(inp.get("lookback_months") or 24), 36))
        today = date.today()
        this_month = today.replace(day=1)
        start = _month_add(this_month, -lookback)
        with _conn() as conn:
            rows = conn.execute(
                text(
                    """
                    select date_trunc('month', order_date)::date as m, count(*) as orders, coalesce(sum(total), 0) as total
                    from sales_orders
                    where company_id = :c and status in ('confirmed', 'processing', 'completed') and order_date >= :s and order_date < :e
                      and deleted_at is null
                    group by 1 order by 1
                    """
                ),
                {"c": company_id, "s": start, "e": this_month},
            ).all()
            mtd = conn.execute(
                text(
                    """
                    select count(*), coalesce(sum(total), 0) from sales_orders
                    where company_id = :c and status in ('confirmed', 'processing', 'completed') and order_date >= :s and deleted_at is null
                    """
                ),
                {"c": company_id, "s": this_month},
            ).one()
        by_month: dict[date, tuple[int, float]] = {r[0]: (int(r[1]), _f(r[2])) for r in rows}
        months = [_month_add(start, i) for i in range(lookback)]
        history = [{"month": m.strftime("%Y-%m"), "orders": by_month.get(m, (0, 0.0))[0], "total": round(by_month.get(m, (0, 0.0))[1], 2)} for m in months]
        # Trim leading months with no data at all (business may be younger than the lookback)
        while history and history[0]["total"] == 0 and history[0]["orders"] == 0:
            history.pop(0)
        totals = [h["total"] for h in history]
        n = len(totals)
        if n == 0:
            return {"error": "No completed/confirmed sales history to forecast from."}

        slope, intercept = _linear_fit(totals)
        seasonal = n >= 24
        # seasonality index = month's average / overall average, computed on full years only
        season_idx: dict[int, float] = {}
        if seasonal:
            overall = sum(totals) / n
            for mi in range(1, 13):
                vals = [h["total"] for h in history if int(h["month"][5:7]) == mi]
                if vals and overall:
                    season_idx[mi] = (sum(vals) / len(vals)) / overall
        residuals = [y - (intercept + slope * i) for i, y in enumerate(totals)]
        mad = median(abs(r) for r in residuals) if residuals else 0.0
        band = 1.5 * mad
        last3 = totals[-3:] if n >= 3 else totals
        moving_avg = sum(last3) / len(last3)
        method = "linear trend + monthly seasonality" if seasonal else ("linear trend" if n >= 6 else "3-month moving average")

        forecast = []
        for k in range(1, horizon + 1):
            target = _month_add(this_month, k - 1)  # this month is forecast[0]
            x = n - 1 + k  # continue the index beyond history (history ends the month before this one)
            if n >= 6:
                base = intercept + slope * (x)
            else:
                base = moving_avg
            if seasonal:
                base *= season_idx.get(target.month, 1.0)
            base = max(0.0, base)
            forecast.append(
                {
                    "month": target.strftime("%Y-%m"),
                    "forecast_total": round(base, 2),
                    "low": round(max(0.0, base - band), 2),
                    "high": round(base + band, 2),
                }
            )

        days_in_month = calendar.monthrange(today.year, today.month)[1]
        elapsed = today.day
        mtd_total = _f(mtd[1])
        run_rate = (mtd_total / elapsed) * days_in_month if elapsed else 0.0
        prev = totals[-1] if totals else 0.0
        trend_pct = ((totals[-1] - totals[-2]) / totals[-2] * 100) if n >= 2 and totals[-2] else None
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "basis": "sales_orders with status confirmed/processing/completed, by order_date",
            "method": method,
            "history_months": n,
            "history": history[-12:],
            "current_month": {
                "month": this_month.strftime("%Y-%m"),
                "month_to_date_total": round(mtd_total, 2),
                "month_to_date_orders": int(mtd[0]),
                "days_elapsed": elapsed,
                "days_in_month": days_in_month,
                "run_rate_projection": round(run_rate, 2),
                "trend_projection": forecast[0]["forecast_total"],
                "last_full_month_total": round(prev, 2),
            },
            "forecast": forecast,
            "monthly_trend_pct_last_vs_previous": round(trend_pct, 1) if trend_pct is not None else None,
            "avg_monthly_slope": round(slope, 2),
            "caveats": [
                "Statistical projection from past orders only; no market, promotion or seasonal-event input.",
                "low/high = trend ± 1.5 × median absolute deviation of past months (a rough band, not a confidence interval).",
                "Seasonality is applied only when at least 24 months of history exist." if not seasonal else "Seasonality index from the same calendar months in past years.",
            ],
        }

    # -------------------------------------------------------------- stockouts

    def predict_stockouts(inp: dict) -> dict:
        if not _can(db, user, "inventory"):
            return {"error": "Stock-out prediction needs inventory read permission."}
        window = max(14, min(int(inp.get("days_window") or 90), 365))
        limit = max(1, min(int(inp.get("limit") or 20), 100))
        lead_time = max(0, min(int(inp.get("lead_time_days") or 14), 120))
        safety_days = max(0, min(int(inp.get("safety_days") or 7), 60))
        threshold_days = max(1, min(int(inp.get("threshold_days") or 30), 365))
        item_query = str(inp.get("item_query") or "").strip()
        since = datetime.utcnow() - timedelta(days=window)
        with _conn() as conn:
            stock = conn.execute(
                text(
                    """
                    select item_id, max(sku) as sku, max(name) as name,
                           coalesce(sum(on_hand), 0) as on_hand, coalesce(sum(reserved), 0) as reserved,
                           coalesce(sum(incoming), 0) as incoming, max(reorder_level) as reorder_level,
                           max(unit_cost) as unit_cost
                    from inventory_stock_levels
                    where company_id = :c and item_id is not null
                    group by item_id
                    """
                ),
                {"c": company_id},
            ).all()
            sold = conn.execute(
                text(
                    """
                    select l.item_id, coalesce(sum(l.quantity_ordered), 0) as qty, count(distinct o.id) as orders
                    from sales_order_lines l join sales_orders o on o.id = l.sales_order_id
                    where o.company_id = :c and o.status in ('confirmed', 'processing', 'completed') and o.order_date >= :s and o.deleted_at is null
                      and l.item_id is not null
                    group by l.item_id
                    """
                ),
                {"c": company_id, "s": since},
            ).all()
            pos = conn.execute(
                text(
                    """
                    select item_id, coalesce(sum(abs(quantity)), 0) from inventory_stock_movements
                    where company_id = :c and movement_type in ('pos_sale', 'out') and created_at >= :s and item_id is not null
                    group by item_id
                    """
                ),
                {"c": company_id, "s": since},
            ).all()
        sold_map = {r[0]: (_f(r[1]), int(r[2])) for r in sold}
        pos_map = {r[0]: _f(r[1]) for r in pos}
        items = []
        for item_id, sku, name, on_hand, reserved, incoming, reorder_level, unit_cost in stock:
            if item_query and item_query.lower() not in f"{sku} {name}".lower():
                continue
            qty, orders = sold_map.get(item_id, (0.0, 0))
            consumed = qty + pos_map.get(item_id, 0.0)
            daily = consumed / window
            available = _f(on_hand) - _f(reserved)
            days_cover = (available / daily) if daily > 0 else None
            need = daily * (lead_time + safety_days)
            suggested = max(0.0, need - available - _f(incoming))
            items.append(
                {
                    "item_id": item_id,
                    "sku": sku,
                    "name": name,
                    "on_hand": _f(on_hand),
                    "reserved": _f(reserved),
                    "incoming": _f(incoming),
                    "reorder_level": _f(reorder_level),
                    "consumed_last_window": round(consumed, 2),
                    "orders_last_window": orders,
                    "avg_daily_consumption": round(daily, 3),
                    "days_of_cover": round(days_cover, 1) if days_cover is not None else None,
                    "estimated_stockout_date": (date.today() + timedelta(days=int(days_cover))).isoformat() if days_cover is not None else None,
                    "suggested_reorder_qty": int(round(suggested)) if daily > 0 else 0,
                    "stock_value": round(_f(on_hand) * _f(unit_cost), 2),
                }
            )
        moving = [i for i in items if i["avg_daily_consumption"] > 0]
        at_risk = sorted((i for i in moving if i["days_of_cover"] is not None and i["days_of_cover"] <= threshold_days), key=lambda i: i["days_of_cover"])
        already_out = [i for i in moving if i["on_hand"] - i["reserved"] <= 0]
        no_movement = len(items) - len(moving)
        return {
            "as_of": date.today().isoformat(),
            "window_days": window,
            "assumptions": {"lead_time_days": lead_time, "safety_days": safety_days, "threshold_days": threshold_days},
            "basis": "consumption = sales order line quantities (confirmed/processing/completed) + POS/out stock movements in the window; cover = (on_hand - reserved) / avg daily consumption",
            "items_tracked": len(items),
            "items_with_movement": len(moving),
            "items_without_movement": no_movement,
            "already_out_of_stock": [{k: i[k] for k in ("sku", "name", "on_hand", "avg_daily_consumption", "suggested_reorder_qty")} for i in already_out[:limit]],
            "at_risk": at_risk[:limit],
            "truncated": len(at_risk) > limit,
            "caveats": [
                "Assumes future demand ≈ average of the window; new products or seasonal items will be under/over-estimated.",
                "Items with no sales in the window get no estimate (days_of_cover null).",
            ],
        }

    # -------------------------------------------------------------- cash flow

    def forecast_cash_flow(inp: dict) -> dict:
        if not _can(db, user, "finance"):
            return {"error": "Cash-flow forecast needs finance read permission."}
        weeks = max(1, min(int(inp.get("weeks") or 8), 26))
        collection_rate = float(inp.get("collection_rate") or 1.0)
        collection_rate = max(0.0, min(collection_rate, 1.0))
        today = date.today()
        horizon_end = today + timedelta(days=7 * weeks)
        with _conn() as conn:
            ar = conn.execute(
                text(
                    """
                    select r.due_date::date, r.balance, r.invoice_number, c.name
                    from finance_receivables r left join commerce_customers c on c.id = r.customer_id
                    where r.company_id = :c and r.balance > 0 and coalesce(r.status, '') not in ('paid', 'cancelled', 'void')
                    """
                ),
                {"c": company_id},
            ).all()
            ap = conn.execute(
                text(
                    """
                    select p.due_date::date, p.balance, p.reference_number, s.name
                    from finance_payables p left join commerce_suppliers s on s.id = p.supplier_id
                    where p.company_id = :c and p.balance > 0 and coalesce(p.status, '') not in ('paid', 'cancelled', 'void')
                    """
                ),
                {"c": company_id},
            ).all()
            exp = conn.execute(
                text(
                    """
                    select coalesce(sum(total), 0), count(*) from finance_expenses
                    where company_id = :c and expense_date >= :s and coalesce(status, '') not in ('rejected', 'cancelled', 'draft')
                    """
                ),
                {"c": company_id, "s": today - timedelta(days=90)},
            ).one()
            cash = conn.execute(
                text(
                    """
                    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
                    from finance_payments where company_id = :c and is_transfer is not true
                    """
                ),
                {"c": company_id},
            ).scalar()
        weekly_expense = _f(exp[0]) / (90 / 7)
        buckets = []
        for w in range(weeks):
            ws = today + timedelta(days=7 * w)
            we = ws + timedelta(days=6)
            buckets.append({"week": w + 1, "from": ws.isoformat(), "to": we.isoformat(), "cash_in": 0.0, "cash_out": 0.0, "expected_expenses": round(weekly_expense, 2)})
        overdue_in = 0.0
        overdue_out = 0.0
        beyond_in = 0.0
        beyond_out = 0.0
        top_in: list[dict] = []
        top_out: list[dict] = []

        def _bucket(due: Optional[date]) -> Optional[int]:
            if due is None or due < today:
                return -1
            if due > horizon_end:
                return None
            return min((due - today).days // 7, weeks - 1)

        for due, bal, ref, who in ar:
            b = _bucket(due)
            amt = _f(bal)
            top_in.append({"due_date": due.isoformat() if due else None, "amount": amt, "invoice": ref, "customer": who})
            if b == -1:
                overdue_in += amt
            elif b is None:
                beyond_in += amt
            else:
                buckets[b]["cash_in"] += amt
        for due, bal, ref, who in ap:
            b = _bucket(due)
            amt = _f(bal)
            top_out.append({"due_date": due.isoformat() if due else None, "amount": amt, "reference": ref, "supplier": who})
            if b == -1:
                overdue_out += amt
            elif b is None:
                beyond_out += amt
            else:
                buckets[b]["cash_out"] += amt
        running = 0.0
        for bk in buckets:
            bk["cash_in"] = round(bk["cash_in"] * collection_rate, 2)
            bk["cash_out"] = round(bk["cash_out"], 2)
            bk["net"] = round(bk["cash_in"] - bk["cash_out"] - bk["expected_expenses"], 2)
            running += bk["net"]
            bk["cumulative_net"] = round(running, 2)
        top_in.sort(key=lambda x: -x["amount"])
        top_out.sort(key=lambda x: -x["amount"])
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "weeks": weeks,
            "collection_rate_applied": collection_rate,
            "basis": "receivables/payables with balance > 0 by due_date; expected_expenses = average weekly expenses of the last 90 days; overdue = due before today",
            "overdue": {"receivable_in": round(overdue_in, 2), "payable_out": round(overdue_out, 2)},
            "beyond_horizon": {"receivable_in": round(beyond_in, 2), "payable_out": round(beyond_out, 2)},
            "net_cash_movement_to_date": round(_f(cash), 2),
            "weekly": buckets,
            "totals": {
                "cash_in": round(sum(b["cash_in"] for b in buckets), 2),
                "cash_out": round(sum(b["cash_out"] for b in buckets), 2),
                "expected_expenses": round(sum(b["expected_expenses"] for b in buckets), 2),
                "net": round(running, 2),
            },
            "largest_receivables": top_in[:8],
            "largest_payables": top_out[:8],
            "caveats": [
                "Assumes customers pay on the due date (scale with collection_rate, e.g. 0.8 if 20% typically slips).",
                "Overdue amounts are shown separately, not assumed to arrive in any week.",
                "Payroll and other outflows not recorded as expenses/payables are not included.",
            ],
        }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_sales",
                description=(
                    "Project monthly sales for the next months from order history (trend + seasonality when ≥24 months, "
                    "else trend / moving average) and give a run-rate estimate for the current month, with a low/high band "
                    "and caveats. Use for 'how much will we sell', 'projection', 'expected sales', 'trend'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "horizon_months": {"type": "integer", "description": "Months to forecast including the current one (1-12, default 3)"},
                        "lookback_months": {"type": "integer", "description": "History to fit on (3-36, default 24)"},
                    },
                },
            ),
            handler=forecast_sales,
            risk_tier=RiskTier.READ,
            module="sales",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="predict_stockouts",
                description=(
                    "Which items will run out and when: days of cover per item from recent consumption, estimated "
                    "stock-out date, and a suggested reorder quantity (lead time + safety stock). Use for 'stock out', "
                    "'how long will stock last', 'what to reorder and how much'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_window": {"type": "integer", "description": "Consumption window in days (14-365, default 90)"},
                        "threshold_days": {"type": "integer", "description": "Report items with cover at or below this many days (default 30)"},
                        "lead_time_days": {"type": "integer", "description": "Supplier lead time for reorder suggestion (default 14)"},
                        "safety_days": {"type": "integer", "description": "Safety stock in days (default 7)"},
                        "item_query": {"type": "string", "description": "Optional SKU/name filter"},
                        "limit": {"type": "integer", "description": "Max items (default 20)"},
                    },
                },
            ),
            handler=predict_stockouts,
            risk_tier=RiskTier.READ,
            module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_cash_flow",
                description=(
                    "Week-by-week expected cash in (receivables due), cash out (payables due) and average recurring "
                    "expenses, with net and cumulative position, overdue amounts and the largest items. Use for "
                    "'cash flow next weeks', 'will we have cash', 'collections vs payments'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "weeks": {"type": "integer", "description": "Horizon in weeks (1-26, default 8)"},
                        "collection_rate": {"type": "number", "description": "Fraction of due receivables expected on time (0-1, default 1.0)"},
                    },
                },
            ),
            handler=forecast_cash_flow,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
    ]
