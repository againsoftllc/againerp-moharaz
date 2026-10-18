"""Planning forecasts — the second set of deterministic projections (see forecast_tools.py).

- forecast_item_demand   — per-item demand for the coming month(s) + a supplier-grouped
                           reorder plan (what to order, from whom, how much, by when).
- forecast_collections   — when receivables will *actually* be collected, using each
                           customer's historical payment delay, plus a late-payer risk list.
- forecast_expenses_profit — category-wise expense projection and an expected profit line
                           (sales forecast × historical gross margin − expenses).
- forecast_pipeline      — CRM pipeline: weighted value, stage conversion rates, expected
                           closes this month / quarter, lead-source conversion.
- detect_dead_stock      — slow / dead stock with locked capital, and overstock (cover far
                           beyond the horizon) with clearance suggestions.

All figures are computed here from the ERP's own tables; the assistant only explains them
and must present them as estimates with the returned method and caveats.
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
from app.services.ai.tools.forecast_tools import _can, _f, _linear_fit, _month_add

REVENUE_SQL = "('confirmed', 'processing', 'completed')"
OPEN_AR_SQL = "('paid', 'cancelled', 'void')"
WON_STAGES = ("won", "closed_won")
LOST_STAGES = ("lost", "closed_lost")


def _quarter_end(d: date) -> date:
    q_end_month = ((d.month - 1) // 3 + 1) * 3
    return date(d.year, q_end_month, calendar.monthrange(d.year, q_end_month)[1])


def _project_next(series: list[float]) -> tuple[float, str]:
    """Next-period value from a short monthly series: trend if ≥6 points, else moving average."""
    pts = [v for v in series]
    while pts and pts[0] == 0:
        pts.pop(0)
    if not pts:
        return 0.0, "no history"
    if len(pts) >= 6:
        slope, intercept = _linear_fit(pts)
        return max(0.0, intercept + slope * len(pts)), "linear trend"
    last = pts[-3:]
    return sum(last) / len(last), f"{len(last)}-month moving average"


def build_planning_tools(*, db: Session | None, company_id: str | None, user: Any | None) -> list[OrchestratorTool]:
    def _conn():
        return db.get_bind().connect()  # type: ignore[union-attr]

    # ------------------------------------------------------------ item demand

    def forecast_item_demand(inp: dict) -> dict:
        if not _can(db, user, "inventory") and not _can(db, user, "purchase"):
            return {"error": "Item demand forecast needs inventory or purchase read permission."}
        lookback = max(3, min(int(inp.get("lookback_months") or 12), 24))
        limit = max(1, min(int(inp.get("limit") or 25), 100))
        default_lead = max(0, min(int(inp.get("lead_time_days") or 14), 120))
        safety_days = max(0, min(int(inp.get("safety_days") or 7), 60))
        item_query = str(inp.get("item_query") or "").strip().lower()
        today = date.today()
        this_month = today.replace(day=1)
        start = _month_add(this_month, -lookback)
        with _conn() as conn:
            rows = conn.execute(
                text(
                    f"""
                    select l.item_id, max(l.sku), max(l.name), date_trunc('month', o.order_date)::date as m,
                           coalesce(sum(l.quantity_ordered), 0) as qty, coalesce(sum(l.line_total), 0) as revenue
                    from sales_order_lines l join sales_orders o on o.id = l.sales_order_id
                    where o.company_id = :c and o.status in {REVENUE_SQL} and o.deleted_at is null
                      and o.order_date >= :s and l.item_id is not null
                    group by l.item_id, 4
                    """
                ),
                {"c": company_id, "s": start},
            ).all()
            stock = conn.execute(
                text(
                    """
                    select item_id, coalesce(sum(on_hand), 0), coalesce(sum(reserved), 0), coalesce(sum(incoming), 0), max(unit_cost)
                    from inventory_stock_levels where company_id = :c and item_id is not null group by item_id
                    """
                ),
                {"c": company_id},
            ).all()
            supplier_rows = conn.execute(
                text(
                    """
                    select distinct on (l.item_id) l.item_id, l.supplier_id, s.name, s.lead_time_days, l.unit_cost
                    from purchase_order_lines l
                    join purchase_orders o on o.id = l.purchase_order_id
                    left join commerce_suppliers s on s.id = coalesce(l.supplier_id, o.supplier_id)
                    where o.company_id = :c and l.item_id is not null
                    order by l.item_id, o.order_date desc
                    """
                ),
                {"c": company_id},
            ).all()
        months = [_month_add(start, i) for i in range(lookback)]
        per_item: dict[str, dict] = {}
        for item_id, sku, name, m, qty, revenue in rows:
            rec = per_item.setdefault(item_id, {"sku": sku, "name": name, "by_month": {}, "revenue": 0.0})
            rec["by_month"][m] = _f(qty)
            rec["revenue"] += _f(revenue)
        stock_map = {r[0]: r for r in stock}
        sup_map = {r[0]: r for r in supplier_rows}
        items = []
        for item_id, rec in per_item.items():
            if item_query and item_query not in f"{rec['sku']} {rec['name']}".lower():
                continue
            series = [rec["by_month"].get(m, 0.0) for m in months]
            nxt, method = _project_next(series)
            _, on_hand, reserved, incoming, unit_cost = stock_map.get(item_id, (item_id, 0, 0, 0, 0))
            sup = sup_map.get(item_id)
            lead = int(sup[3]) if sup and sup[3] else default_lead
            daily = nxt / 30 if nxt else 0.0
            available = _f(on_hand) - _f(reserved)
            cover_needed = daily * (lead + safety_days)
            reorder = max(0.0, cover_needed + nxt - available - _f(incoming)) if daily > 0 else 0.0
            items.append(
                {
                    "item_id": item_id,
                    "sku": rec["sku"],
                    "name": rec["name"],
                    "sold_last_3_months": [round(v, 1) for v in series[-3:]],
                    "forecast_next_month_qty": round(nxt, 1),
                    "method": method,
                    "available": round(available, 1),
                    "incoming": _f(incoming),
                    "days_of_cover": round(available / daily, 1) if daily > 0 else None,
                    "supplier": sup[2] if sup else None,
                    "supplier_id": sup[1] if sup else None,
                    "lead_time_days": lead,
                    "last_unit_cost": _f(sup[4]) if sup and sup[4] is not None else _f(unit_cost),
                    "suggested_order_qty": int(round(reorder)),
                    "order_by": (today + timedelta(days=max(0, int((available / daily) - lead)))).isoformat() if daily > 0 else None,
                    "revenue_in_window": round(rec["revenue"], 2),
                }
            )
        items.sort(key=lambda i: -i["forecast_next_month_qty"])
        top = items[:limit]
        plan: dict[str, dict] = {}
        for i in items:
            if i["suggested_order_qty"] <= 0:
                continue
            key = i["supplier"] or "Unassigned supplier (no purchase history)"
            entry = plan.setdefault(key, {"supplier_id": i["supplier_id"], "lines": [], "estimated_cost": 0.0})
            entry["lines"].append({"sku": i["sku"], "name": i["name"], "qty": i["suggested_order_qty"], "order_by": i["order_by"], "unit_cost": i["last_unit_cost"]})
            entry["estimated_cost"] += i["suggested_order_qty"] * i["last_unit_cost"]
        for e in plan.values():
            e["estimated_cost"] = round(e["estimated_cost"], 2)
            e["lines"].sort(key=lambda l: (l["order_by"] or "9999"))
            e["lines"] = e["lines"][:limit]
        return {
            "as_of": today.isoformat(),
            "lookback_months": lookback,
            "basis": "monthly sold quantity per item from confirmed/processing/completed sales order lines; next month = trend (≥6 months) or moving average; reorder = (lead time + safety) days of demand + next month demand − available − incoming",
            "items_forecast": len(items),
            "top_items": top,
            "reorder_plan_by_supplier": plan,
            "caveats": [
                "Item-level demand is noisy; treat single-item forecasts as guidance, totals as more reliable.",
                "Supplier = the supplier on the item's most recent purchase order; lead time from the supplier record or the default.",
            ],
        }

    # ------------------------------------------------------------ collections

    def forecast_collections(inp: dict) -> dict:
        if not _can(db, user, "finance"):
            return {"error": "Collection forecast needs finance read permission."}
        weeks = max(1, min(int(inp.get("weeks") or 8), 26))
        history_days = max(30, min(int(inp.get("history_days") or 365), 1095))
        today = date.today()
        with _conn() as conn:
            paid = conn.execute(
                text(
                    """
                    select customer_id, avg(greatest(0, (updated_at::date - due_date::date))) as avg_delay,
                           count(*) as paid_count,
                           sum(case when updated_at::date > due_date::date then 1 else 0 end) as late_count
                    from finance_receivables
                    where company_id = :c and status = 'paid' and due_date is not null and updated_at >= :s
                    group by customer_id
                    """
                ),
                {"c": company_id, "s": datetime.utcnow() - timedelta(days=history_days)},
            ).all()
            open_rows = conn.execute(
                text(
                    f"""
                    select r.customer_id, c.name, r.invoice_number, r.due_date::date, r.balance
                    from finance_receivables r left join commerce_customers c on c.id = r.customer_id
                    where r.company_id = :c and r.balance > 0 and coalesce(r.status, '') not in {OPEN_AR_SQL}
                    """
                ),
                {"c": company_id},
            ).all()
        max_delay = max(30, min(int(inp.get("max_delay_days") or 120), 365))
        # Cap historical delay: a receivable paid years after its due date (migrated/opening
        # balances) must not push every expected date past the horizon.
        delay_map = {r[0]: (min(_f(r[1]), float(max_delay)), int(r[2]), int(r[3])) for r in paid}
        all_delays = [d[0] for d in delay_map.values()]
        company_delay = median(all_delays) if all_delays else 0.0
        buckets = [{"week": w + 1, "from": (today + timedelta(days=7 * w)).isoformat(), "to": (today + timedelta(days=7 * w + 6)).isoformat(), "expected_in": 0.0, "by_due_date": 0.0} for w in range(weeks)]
        beyond = 0.0
        customers: dict[str, dict] = {}
        for cust_id, name, inv, due, bal in open_rows:
            amt = _f(bal)
            delay, paid_count, late_count = delay_map.get(cust_id, (company_delay, 0, 0))
            expected = (due or today) + timedelta(days=int(round(delay)))
            if expected < today:
                expected = today + timedelta(days=7)  # already late: assume it lands next week
            idx = (expected - today).days // 7
            if idx < weeks:
                buckets[idx]["expected_in"] += amt
            else:
                beyond += amt
            if due and due >= today:
                didx = (due - today).days // 7
                if didx < weeks:
                    buckets[didx]["by_due_date"] += amt
            c = customers.setdefault(cust_id, {"customer": name, "open_balance": 0.0, "overdue_balance": 0.0, "open_invoices": 0, "avg_delay_days": round(delay, 1), "paid_invoices": paid_count, "late_paid_invoices": late_count})
            c["open_balance"] += amt
            c["open_invoices"] += 1
            if due and due < today:
                c["overdue_balance"] += amt
        for b in buckets:
            b["expected_in"] = round(b["expected_in"], 2)
            b["by_due_date"] = round(b["by_due_date"], 2)
        risk = []
        for c in customers.values():
            late_ratio = (c["late_paid_invoices"] / c["paid_invoices"]) if c["paid_invoices"] else None
            score = 0
            if c["overdue_balance"] > 0:
                score += 2
            if c["avg_delay_days"] > 30:
                score += 2
            elif c["avg_delay_days"] > 7:
                score += 1
            if late_ratio is not None and late_ratio > 0.5:
                score += 1
            level = "high" if score >= 4 else "medium" if score >= 2 else "low"
            risk.append({**c, "open_balance": round(c["open_balance"], 2), "overdue_balance": round(c["overdue_balance"], 2), "late_ratio": round(late_ratio, 2) if late_ratio is not None else None, "risk": level})
        risk.sort(key=lambda r: (-{"high": 2, "medium": 1, "low": 0}[r["risk"]], -r["open_balance"]))
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "basis": "expected date = due date + the customer's median historical delay (paid invoices: paid date − due date); customers without history use the company median; amounts already past their expected date are assumed to arrive next week",
            "company_median_delay_days": round(company_delay, 1),
            "customers_with_history": len(delay_map),
            "weekly": buckets,
            "expected_total_in_horizon": round(sum(b["expected_in"] for b in buckets), 2),
            "beyond_horizon": round(beyond, 2),
            "late_payer_risk": risk[:20],
            "caveats": [
                f"Delay history uses the receivable's last update date as the payment date and is capped at {max_delay} days per customer.",
                "Risk score is a heuristic (overdue now, average delay, late ratio) — not a credit rating.",
            ],
        }

    # ------------------------------------------------------ expenses + profit

    def forecast_expenses_profit(inp: dict) -> dict:
        if not _can(db, user, "finance"):
            return {"error": "Expense/profit forecast needs finance read permission."}
        lookback = max(3, min(int(inp.get("lookback_months") or 12), 24))
        horizon = max(1, min(int(inp.get("horizon_months") or 3), 6))
        today = date.today()
        this_month = today.replace(day=1)
        start = _month_add(this_month, -lookback)
        months = [_month_add(start, i) for i in range(lookback)]
        with _conn() as conn:
            exp_rows = conn.execute(
                text(
                    """
                    select coalesce(cat.name, 'Uncategorised'), date_trunc('month', e.expense_date)::date, coalesce(sum(e.total), 0)
                    from finance_expenses e left join finance_expense_categories cat on cat.id = e.category_id
                    where e.company_id = :c and e.expense_date >= :s and e.expense_date < :e
                      and coalesce(e.status, '') not in ('rejected', 'cancelled', 'draft')
                    group by 1, 2
                    """
                ),
                {"c": company_id, "s": start, "e": this_month},
            ).all()
            sales_rows = conn.execute(
                text(
                    f"""
                    select date_trunc('month', o.order_date)::date, coalesce(sum(o.total), 0)
                    from sales_orders o where o.company_id = :c and o.status in {REVENUE_SQL} and o.deleted_at is null
                      and o.order_date >= :s and o.order_date < :e group by 1
                    """
                ),
                {"c": company_id, "s": start, "e": this_month},
            ).all()
            margin_rows = conn.execute(
                text(
                    f"""
                    select coalesce(sum(l.line_total), 0) as revenue,
                           coalesce(sum(l.quantity_ordered * coalesce(sl.unit_cost, cp.purchase_price, 0)), 0) as cogs
                    from sales_order_lines l
                    join sales_orders o on o.id = l.sales_order_id
                    left join (select item_id, max(unit_cost) as unit_cost from inventory_stock_levels where company_id = :c group by item_id) sl on sl.item_id = l.item_id
                    left join catalog_products cp on cp.item_id = l.item_id and cp.company_id = :c
                    where o.company_id = :c and o.status in {REVENUE_SQL} and o.deleted_at is null and o.order_date >= :m
                    """
                ),
                {"c": company_id, "m": _month_add(this_month, -3)},
            ).one()
        by_cat: dict[str, dict[date, float]] = {}
        for cat, m, total in exp_rows:
            by_cat.setdefault(cat, {})[m] = _f(total)
        categories = []
        total_next = 0.0
        for cat, series_map in by_cat.items():
            series = [series_map.get(m, 0.0) for m in months]
            nxt, method = _project_next(series)
            total_next += nxt
            categories.append({"category": cat, "last_3_months": [round(v, 2) for v in series[-3:]], "avg_monthly": round(sum(series) / max(1, len([v for v in series if v])), 2) if any(series) else 0.0, "forecast_next_month": round(nxt, 2), "method": method})
        categories.sort(key=lambda c: -c["forecast_next_month"])
        sales_map = {r[0]: _f(r[1]) for r in sales_rows}
        sales_series = [sales_map.get(m, 0.0) for m in months]
        sales_next, sales_method = _project_next(sales_series)
        revenue, cogs = _f(margin_rows[0]), _f(margin_rows[1])
        gross_margin = ((revenue - cogs) / revenue) if revenue else None
        exp_hist_total = [sum(by_cat[c].get(m, 0.0) for c in by_cat) for m in months]
        projection = []
        for k in range(horizon):
            m = _month_add(this_month, k)
            s = max(0.0, sales_next)  # flat beyond next month unless trend continues; keep simple & explicit
            gp = s * gross_margin if gross_margin is not None else None
            projection.append({"month": m.strftime("%Y-%m"), "sales": round(s, 2), "gross_profit": round(gp, 2) if gp is not None else None, "expenses": round(total_next, 2), "net_profit": round(gp - total_next, 2) if gp is not None else None})
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "basis": "expenses by category from finance_expenses (approved/paid), projected per category; sales projected from order totals; gross margin = (revenue − qty × unit cost) over the last 3 months of sales lines",
            "expense_history_last_6": [{"month": m.strftime("%Y-%m"), "total": round(v, 2)} for m, v in zip(months[-6:], exp_hist_total[-6:])],
            "expense_forecast_next_month": round(total_next, 2),
            "categories": categories[:15],
            "sales_forecast_next_month": round(sales_next, 2),
            "sales_method": sales_method,
            "gross_margin_pct": round(gross_margin * 100, 1) if gross_margin is not None else None,
            "profit_projection": projection,
            "caveats": [
                "Net profit here = gross profit − recorded expenses; payroll/depreciation are included only if booked as expenses.",
                "Months beyond next month repeat the next-month estimate (no compounding trend) to stay conservative.",
                "Categories with no history in the window are absent, not zero-forecast.",
            ],
        }

    # --------------------------------------------------------------- pipeline

    def forecast_pipeline(inp: dict) -> dict:
        if not _can(db, user, "crm"):
            return {"error": "Pipeline forecast needs CRM read permission."}
        history_days = max(30, min(int(inp.get("history_days") or 365), 1095))
        today = date.today()
        month_end = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
        q_end = _quarter_end(today)
        with _conn() as conn:
            open_deals = conn.execute(
                text(
                    """
                    select id, title, stage, coalesce(value, 0), coalesce(probability, 0), expected_close_date::date, contact_company, owner_id
                    from crm_deals where company_id = :c and lower(coalesce(stage, '')) not in ('won', 'lost', 'closed_won', 'closed_lost')
                    """
                ),
                {"c": company_id},
            ).all()
            closed = conn.execute(
                text(
                    """
                    select lower(stage), count(*), coalesce(sum(value), 0),
                           avg(extract(epoch from (coalesce(closed_at, updated_at) - created_at)) / 86400.0)
                    from crm_deals where company_id = :c and lower(coalesce(stage, '')) in ('won', 'lost', 'closed_won', 'closed_lost')
                      and coalesce(closed_at, updated_at) >= :s
                    group by 1
                    """
                ),
                {"c": company_id, "s": datetime.utcnow() - timedelta(days=history_days)},
            ).all()
            leads = conn.execute(
                text(
                    """
                    select coalesce(source, 'unknown'), count(*), sum(case when converted_deal_id is not null then 1 else 0 end),
                           sum(case when lower(coalesce(status, '')) in ('lost', 'unqualified') then 1 else 0 end)
                    from crm_leads where company_id = :c and created_at >= :s group by 1
                    """
                ),
                {"c": company_id, "s": datetime.utcnow() - timedelta(days=history_days)},
            ).all()
        won = sum(int(r[1]) for r in closed if r[0] in WON_STAGES)
        lost = sum(int(r[1]) for r in closed if r[0] in LOST_STAGES)
        won_value = sum(_f(r[2]) for r in closed if r[0] in WON_STAGES)
        win_rate = (won / (won + lost)) if (won + lost) else None
        cycle = [_f(r[3]) for r in closed if r[0] in WON_STAGES and r[3] is not None]
        avg_cycle_days = round(sum(cycle) / len(cycle), 1) if cycle else None
        stage_defaults = {"new": 0.1, "qualified": 0.25, "proposal": 0.5, "negotiation": 0.75}
        by_stage: dict[str, dict] = {}
        weighted_total = 0.0
        exp_month = 0.0
        exp_quarter = 0.0
        deals_out = []
        for _id, title, stage, value, prob, ecd, company, owner in open_deals:
            st = (stage or "unknown").lower()
            p = _f(prob) / 100.0 if _f(prob) > 1 else _f(prob)
            if p <= 0:
                p = stage_defaults.get(st, win_rate or 0.3)
            w = _f(value) * p
            weighted_total += w
            s = by_stage.setdefault(st, {"deals": 0, "value": 0.0, "weighted": 0.0})
            s["deals"] += 1
            s["value"] += _f(value)
            s["weighted"] += w
            if ecd and ecd <= month_end:
                exp_month += w
            if ecd and ecd <= q_end:
                exp_quarter += w
            deals_out.append({"title": title, "company": company, "stage": st, "value": _f(value), "probability": round(p, 2), "weighted": round(w, 2), "expected_close": ecd.isoformat() if ecd else None, "overdue": bool(ecd and ecd < today)})
        deals_out.sort(key=lambda d: -d["weighted"])
        lead_sources = []
        for src, n, conv, lst in leads:
            lead_sources.append({"source": src, "leads": int(n), "converted_to_deal": int(conv or 0), "lost": int(lst or 0), "conversion_rate": round((int(conv or 0) / int(n)), 2) if n else 0.0})
        lead_sources.sort(key=lambda s: -s["leads"])
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "basis": "weighted value = deal value × probability (deal's own probability, else stage default, else historical win rate); expected closes use expected_close_date",
            "open_deals": len(open_deals),
            "open_value": round(sum(_f(r[3]) for r in open_deals), 2),
            "weighted_pipeline": round(weighted_total, 2),
            "expected_close_this_month": round(exp_month, 2),
            "expected_close_this_quarter": round(exp_quarter, 2),
            "by_stage": {k: {"deals": v["deals"], "value": round(v["value"], 2), "weighted": round(v["weighted"], 2)} for k, v in by_stage.items()},
            "history": {"won": won, "lost": lost, "win_rate": round(win_rate, 2) if win_rate is not None else None, "won_value": round(won_value, 2), "avg_sales_cycle_days": avg_cycle_days, "window_days": history_days},
            "top_deals": deals_out[:15],
            "overdue_deals": [d for d in deals_out if d["overdue"]][:10],
            "lead_sources": lead_sources[:10],
            "caveats": ["Probabilities are the team's own estimates or stage defaults, so the weighted figure is only as good as pipeline hygiene."],
        }

    # ------------------------------------------------------------- dead stock

    def detect_dead_stock(inp: dict) -> dict:
        if not _can(db, user, "inventory"):
            return {"error": "Dead-stock analysis needs inventory read permission."}
        dead_days = max(30, min(int(inp.get("dead_days") or 180), 730))
        slow_days = max(14, min(int(inp.get("slow_days") or 90), dead_days))
        overstock_days = max(60, min(int(inp.get("overstock_days") or 180), 730))
        limit = max(1, min(int(inp.get("limit") or 20), 100))
        today = date.today()
        since_dead = datetime.utcnow() - timedelta(days=dead_days)
        since_slow = datetime.utcnow() - timedelta(days=slow_days)
        with _conn() as conn:
            stock = conn.execute(
                text(
                    """
                    select item_id, max(sku), max(name), coalesce(sum(on_hand), 0), coalesce(sum(reserved), 0), max(unit_cost)
                    from inventory_stock_levels where company_id = :c and item_id is not null group by item_id having coalesce(sum(on_hand), 0) > 0
                    """
                ),
                {"c": company_id},
            ).all()
            last_sale = conn.execute(
                text(
                    f"""
                    select l.item_id, max(o.order_date)::date,
                           coalesce(sum(case when o.order_date >= :slow then l.quantity_ordered else 0 end), 0) as qty_slow,
                           coalesce(sum(case when o.order_date >= :dead then l.quantity_ordered else 0 end), 0) as qty_dead
                    from sales_order_lines l join sales_orders o on o.id = l.sales_order_id
                    where o.company_id = :c and o.status in {REVENUE_SQL} and o.deleted_at is null and l.item_id is not null
                    group by l.item_id
                    """
                ),
                {"c": company_id, "slow": since_slow, "dead": since_dead},
            ).all()
        sale_map = {r[0]: (r[1], _f(r[2]), _f(r[3])) for r in last_sale}
        dead, slow, over = [], [], []
        total_value = 0.0
        for item_id, sku, name, on_hand, reserved, unit_cost in stock:
            value = _f(on_hand) * _f(unit_cost)
            total_value += value
            last, qty_slow, qty_dead = sale_map.get(item_id, (None, 0.0, 0.0))
            days_since = (today - last).days if last else None
            rec = {"sku": sku, "name": name, "on_hand": _f(on_hand), "stock_value": round(value, 2), "last_sold": last.isoformat() if last else None, "days_since_last_sale": days_since, "sold_last_window": qty_slow}
            if qty_dead == 0:
                dead.append(rec)
            elif qty_slow == 0:
                slow.append(rec)
            else:
                daily = qty_slow / slow_days
                cover = (_f(on_hand) - _f(reserved)) / daily if daily > 0 else None
                if cover is not None and cover > overstock_days:
                    excess_qty = (_f(on_hand) - _f(reserved)) - daily * overstock_days
                    over.append({**rec, "days_of_cover": round(cover, 0), "excess_qty": int(excess_qty), "excess_value": round(excess_qty * _f(unit_cost), 2)})
        dead.sort(key=lambda r: -r["stock_value"])
        slow.sort(key=lambda r: -r["stock_value"])
        over.sort(key=lambda r: -r["excess_value"])
        dead_value = sum(r["stock_value"] for r in dead)
        slow_value = sum(r["stock_value"] for r in slow)
        over_value = sum(r["excess_value"] for r in over)
        return {
            "as_of": today.isoformat(),
            "currency": "BDT",
            "thresholds": {"dead_days": dead_days, "slow_days": slow_days, "overstock_days": overstock_days},
            "basis": "dead = in stock, no confirmed sale in dead_days; slow = sold in dead_days but not in slow_days; overstock = cover (available ÷ daily sales over slow_days) beyond overstock_days",
            "total_stock_value": round(total_value, 2),
            "summary": {
                "dead_items": len(dead), "dead_value": round(dead_value, 2), "dead_pct_of_stock_value": round(dead_value / total_value * 100, 1) if total_value else 0.0,
                "slow_items": len(slow), "slow_value": round(slow_value, 2),
                "overstock_items": len(over), "excess_value": round(over_value, 2),
            },
            "dead_stock": dead[:limit],
            "slow_movers": slow[:limit],
            "overstock": over[:limit],
            "suggestions": [
                "Dead stock: bundle with fast movers, discount/clearance, or return to supplier where terms allow.",
                "Slow movers: stop reordering, review pricing/listing visibility.",
                "Overstock: pause purchase orders for these SKUs until cover falls below the horizon.",
            ],
        }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_item_demand",
                description=(
                    "Per-item demand forecast for next month from monthly sold quantities, plus a supplier-grouped reorder "
                    "plan (what to order, from which supplier, how much, order-by date, estimated cost). Use for 'what should "
                    "we buy', 'purchase plan', 'demand for item X', 'which products will sell'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "lookback_months": {"type": "integer", "description": "History months (3-24, default 12)"},
                        "item_query": {"type": "string", "description": "Optional SKU/name filter"},
                        "lead_time_days": {"type": "integer", "description": "Default lead time when the supplier has none (default 14)"},
                        "safety_days": {"type": "integer", "description": "Safety stock in days (default 7)"},
                        "limit": {"type": "integer", "description": "Max items / lines (default 25)"},
                    },
                },
            ),
            handler=forecast_item_demand,
            risk_tier=RiskTier.READ,
            module="inventory",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_collections",
                description=(
                    "When receivables will actually be collected (week by week) using each customer's historical payment "
                    "delay, versus by due date; plus a late-payer risk list (overdue balance, average delay, late ratio). "
                    "Use for 'when will customers pay', 'collection forecast', 'which customers pay late / risky'."
                ),
                input_schema={"type": "object", "properties": {"weeks": {"type": "integer", "description": "Horizon (1-26, default 8)"}, "history_days": {"type": "integer", "description": "Payment history window (default 365)"}}},
            ),
            handler=forecast_collections,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_expenses_profit",
                description=(
                    "Category-wise expense forecast for next month and an expected profit projection (sales forecast × "
                    "historical gross margin − expenses) for the coming months. Use for 'expected expenses', 'profit next "
                    "month', 'margin', 'will we be profitable'."
                ),
                input_schema={"type": "object", "properties": {"lookback_months": {"type": "integer", "description": "History (3-24, default 12)"}, "horizon_months": {"type": "integer", "description": "Months to project (1-6, default 3)"}}},
            ),
            handler=forecast_expenses_profit,
            risk_tier=RiskTier.READ,
            module="finance",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="forecast_pipeline",
                description=(
                    "CRM pipeline forecast: open deals by stage, weighted value (value × probability), expected closes this "
                    "month and quarter, historical win rate and sales cycle, overdue deals, lead conversion by source. Use for "
                    "'pipeline', 'expected deals to close', 'win rate', 'lead conversion'. It is a FORECAST of open deals: for counting or listing "
                    "deals that ALREADY closed / were won / were lost ('ei hoptay koto gulo deal close hoyeche') use query_database on crm_deals."
                ),
                input_schema={"type": "object", "properties": {"history_days": {"type": "integer", "description": "Window for win rate / conversion (default 365)"}}},
            ),
            handler=forecast_pipeline,
            risk_tier=RiskTier.READ,
            module="crm",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="detect_dead_stock",
                description=(
                    "Dead stock (no sales in a long window), slow movers and overstock (cover far beyond the horizon) with "
                    "the capital locked in each and clearance suggestions. Use for 'dead stock', 'slow moving', 'overstock', "
                    "'money stuck in inventory'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "dead_days": {"type": "integer", "description": "No sale in this many days = dead (default 180)"},
                        "slow_days": {"type": "integer", "description": "No sale in this many days = slow (default 90)"},
                        "overstock_days": {"type": "integer", "description": "Cover beyond this = overstock (default 180)"},
                        "limit": {"type": "integer", "description": "Max items per list (default 20)"},
                    },
                },
            ),
            handler=detect_dead_stock,
            risk_tier=RiskTier.READ,
            module="inventory",
        ),
    ]
