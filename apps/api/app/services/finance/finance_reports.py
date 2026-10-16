"""Finance reports — views over journal / payments / AR / AP. No extra ledgers."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import (
    FinanceAccount,
    FinanceCostCenter,
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinanceReceivable,
)
from app.services.finance.constants import (
    AGING_BUCKET_LABELS,
    BALANCE_SHEET_BUCKET_LABELS,
    CASH_FLOW_GROUP_LABELS,
    CASH_FLOW_GROUP_LINES,
    CASH_FLOW_LINE_LABELS,
    PNL_BUCKET_LABELS,
    INPUT_TAX_CODE,
    OUTPUT_TAX_CODE,
    RETAINED_EARNINGS_CODE,
    SOURCE_TYPE_LABELS,
    balance_sheet_bucket,
    cash_flow_line,
    profit_loss_bucket,
)
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import (
    aged_period_bucket,
    aged_period_columns,
    aging_bucket,
    balance_sheet_identity,
    cash_flow_identity,
    money,
    outstanding_identity,
    trial_balance_identity,
)

ZERO = Decimal("0")


def _period(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    today = date.today()
    start = date_from or date(today.year, 1, 1)
    end = date_to or today
    if start > end:
        start, end = end, start
    return start, end


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _envelope(*, filters: dict, date_from: date, date_to: date, rows, totals: dict, company_id: str, extra: Optional[dict] = None) -> dict:
    payload = {
        "filters": filters,
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "rows": rows,
        "totals": totals,
        "meta": {"company_id": company_id, "generated_at": _now_iso()},
    }
    if extra:
        payload.update(extra)
    return payload


def _document_date(created_at, due_date: Optional[date], fallback: date) -> date:
    """Best-effort invoice / bill date. Receivables and payables only store created_at; imported
    history was created on the import day but keeps its real due date, so a due date that precedes
    creation is the truer document date."""
    created = created_at.date() if created_at else fallback
    if due_date and due_date < created:
        return due_date
    return created


class FinanceReportService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._finance = FinanceService(db)

    def _accounts(self, company_id: str) -> list[FinanceAccount]:
        return self._finance.list_accounts(company_id)

    def _posted_lines_query(
        self,
        company_id: str,
        *,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        account_id: Optional[str] = None,
        account_type: Optional[str] = None,
        source_type: Optional[str] = None,
        party_id: Optional[str] = None,
        reference: Optional[str] = None,
        cumulative_to: Optional[date] = None,
    ):
        query = (
            self._db.query(FinanceJournalLine, FinanceJournalEntry, FinanceAccount)
            .join(FinanceJournalEntry, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
            .join(FinanceAccount, FinanceJournalLine.account_id == FinanceAccount.id)
            .filter(
                FinanceJournalEntry.company_id == company_id,
                FinanceJournalEntry.status == "posted",
            )
        )
        if cumulative_to is not None:
            query = query.filter(FinanceJournalEntry.entry_date <= cumulative_to)
        else:
            if date_from:
                query = query.filter(FinanceJournalEntry.entry_date >= date_from)
            if date_to:
                query = query.filter(FinanceJournalEntry.entry_date <= date_to)
        if account_id:
            query = query.filter(FinanceJournalLine.account_id == account_id)
        if account_type:
            query = query.filter(FinanceAccount.account_type == account_type)
        if source_type:
            query = query.filter(FinanceJournalEntry.source_type == source_type)
        if party_id:
            query = query.filter(FinanceJournalLine.party_id == party_id)
        if reference:
            like = f"%{reference}%"
            query = query.filter(
                or_(
                    FinanceJournalEntry.description.ilike(like),
                    FinanceJournalEntry.entry_number.ilike(like),
                )
            )
        return query

    def _account_period_totals(
        self,
        company_id: str,
        *,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        cumulative_to: Optional[date] = None,
        account_id: Optional[str] = None,
        account_type: Optional[str] = None,
        cost_center_id: Optional[str] = None,
    ) -> dict[str, tuple[Decimal, Decimal]]:
        query = (
            self._db.query(
                FinanceJournalLine.account_id,
                func.coalesce(func.sum(FinanceJournalLine.debit), 0),
                func.coalesce(func.sum(FinanceJournalLine.credit), 0),
            )
            .join(FinanceJournalEntry, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
            .join(FinanceAccount, FinanceJournalLine.account_id == FinanceAccount.id)
            .filter(
                FinanceJournalEntry.company_id == company_id,
                FinanceJournalEntry.status == "posted",
            )
        )
        if cumulative_to is not None:
            query = query.filter(FinanceJournalEntry.entry_date <= cumulative_to)
        else:
            if date_from:
                query = query.filter(FinanceJournalEntry.entry_date >= date_from)
            if date_to:
                query = query.filter(FinanceJournalEntry.entry_date <= date_to)
        if account_id:
            query = query.filter(FinanceJournalLine.account_id == account_id)
        if account_type:
            query = query.filter(FinanceAccount.account_type == account_type)
        if cost_center_id:
            query = query.filter(FinanceJournalLine.cost_center_id == cost_center_id)
        rows = query.group_by(FinanceJournalLine.account_id).all()
        return {account: (money(debit), money(credit)) for account, debit, credit in rows}

    def trial_balance(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        comparison: str = "none",
        compare_from: Optional[date] = None,
        compare_to: Optional[date] = None,
        account_id: Optional[str] = None,
        account_type: Optional[str] = None,
    ) -> dict:
        """Odoo-style Trial Balance: per account Initial Balance, period Debit / Credit, End Balance,
        optionally with a second period's Debit / Credit next to it."""
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)

        length = (end - start).days + 1
        cmp_from: Optional[date] = None
        cmp_to: Optional[date] = None
        if comparison == "previous_period":
            cmp_to = start - timedelta(days=1)
            cmp_from = cmp_to - timedelta(days=length - 1)
        elif comparison == "same_period_last_year":
            def _shift(d: date) -> date:
                try:
                    return d.replace(year=d.year - 1)
                except ValueError:
                    return d.replace(year=d.year - 1, day=28)
            cmp_from, cmp_to = _shift(start), _shift(end)
        elif comparison == "specific_period" and compare_from and compare_to:
            cmp_from, cmp_to = (compare_from, compare_to) if compare_from <= compare_to else (compare_to, compare_from)
        else:
            comparison = "none"

        period = self._account_period_totals(company_id, date_from=start, date_to=end, account_id=account_id, account_type=account_type)
        before = self._account_period_totals(company_id, cumulative_to=start - timedelta(days=1), account_id=account_id, account_type=account_type)
        compare = (
            self._account_period_totals(company_id, date_from=cmp_from, date_to=cmp_to, account_id=account_id, account_type=account_type)
            if cmp_from and cmp_to
            else {}
        )
        rows = []
        t_initial = t_debit = t_credit = t_end = t_cdebit = t_ccredit = ZERO
        for account in self._accounts(company_id):
            if account_id and account.id != account_id:
                continue
            if account_type and account.account_type != account_type:
                continue
            debit, credit = period.get(account.id, (ZERO, ZERO))
            b_debit, b_credit = before.get(account.id, (ZERO, ZERO))
            c_debit, c_credit = compare.get(account.id, (ZERO, ZERO))
            initial = money(b_debit - b_credit)
            if debit == ZERO and credit == ZERO and initial == ZERO and c_debit == ZERO and c_credit == ZERO:
                continue
            net = money(debit - credit)
            end_balance = money(initial + net)
            t_initial += initial
            t_debit += debit
            t_credit += credit
            t_end += end_balance
            t_cdebit += c_debit
            t_ccredit += c_credit
            row = {
                "account_id": account.id,
                "account_code": account.code,
                "account_name": account.name,
                "account_type": account.account_type,
                "initial_balance": initial,
                "debit": debit,
                "credit": credit,
                "net": net,
                "end_balance": end_balance,
            }
            if compare:
                row["compare_debit"] = c_debit
                row["compare_credit"] = c_credit
            rows.append(row)
        identity = trial_balance_identity(t_debit, t_credit)
        columns = [
            {"key": "initial_balance", "label": "Initial Balance", "group": "initial"},
            {"key": "debit", "label": "Debit", "group": "period"},
            {"key": "credit", "label": "Credit", "group": "period"},
        ]
        if cmp_from and cmp_to:
            columns += [
                {"key": "compare_debit", "label": "Debit", "group": "compare"},
                {"key": "compare_credit", "label": "Credit", "group": "compare"},
            ]
        columns.append({"key": "end_balance", "label": "End Balance", "group": "end"})
        totals = {
            "total_debit": identity["total_debit"],
            "total_credit": identity["total_credit"],
            "difference": identity["difference"],
            "initial_balance": money(t_initial),
            "end_balance": money(t_end),
        }
        if compare:
            totals["compare_debit"] = money(t_cdebit)
            totals["compare_credit"] = money(t_ccredit)
        return _envelope(
            filters={
                "account_id": account_id,
                "account_type": account_type,
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "comparison": comparison,
                "compare_from": cmp_from.isoformat() if cmp_from else None,
                "compare_to": cmp_to.isoformat() if cmp_to else None,
                "columns": columns,
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals=totals,
            company_id=company_id,
            extra={"integrity": {"ok": identity["ok"], "warning": None if identity["ok"] else "Trial Balance debit does not equal credit."}},
        )

    def _profit_loss_column(self, company_id: str, start: date, end: date) -> dict:
        """P&L bucket totals for one period: {bucket: {amount, accounts}} (costs shown positive)."""
        totals_by_id = self._account_period_totals(company_id, date_from=start, date_to=end)
        buckets: dict[str, dict] = {key: {"amount": ZERO, "accounts": []} for key in PNL_BUCKET_LABELS}
        for account in self._accounts(company_id):
            bucket = profit_loss_bucket(account.account_type, account.code)
            if bucket is None:
                continue
            debit, credit = totals_by_id.get(account.id, (ZERO, ZERO))
            if bucket in ("revenue", "other_income"):
                amount = money(credit - debit)
            else:
                amount = money(debit - credit)
            if amount == ZERO:
                continue
            buckets[bucket]["accounts"].append(
                {
                    "account_id": account.id,
                    "account_code": account.code,
                    "account_name": account.name,
                    "account_type": account.account_type,
                    "amount": amount,
                }
            )
            buckets[bucket]["amount"] = money(buckets[bucket]["amount"] + amount)
        b = {key: buckets[key]["amount"] for key in buckets}
        derived = {
            "gross_profit": money(b["revenue"] - b["costs_of_revenue"]),
        }
        derived["operating_income"] = money(derived["gross_profit"] - b["operating_expenses"])
        derived["net_profit"] = money(derived["operating_income"] + b["other_income"] - b["other_expenses"])
        derived["net_profit_left"] = money(derived["net_profit"] - b["allocations"])
        return {"from": start, "to": end, "buckets": buckets, "derived": derived}

    def profit_loss(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        comparison: str = "none",
        compare_from: Optional[date] = None,
        compare_to: Optional[date] = None,
        account_id: Optional[str] = None,
        account_type: Optional[str] = None,
    ) -> dict:
        """Odoo-style Profit and Loss for a period, optionally compared against a second period.

        Layout: Revenue, Costs of Revenue → Gross Profit; Operating Expenses → Operating Income
        (or Loss); Other Income, Other Expenses → Net Profit; Allocations and Withdrawals → Net
        Profit Left After Allocations and Withdrawals. Each line unfolds into its accounts.
        ``account_id`` / ``account_type`` are accepted for backwards compatibility and ignored.
        """
        del account_id, account_type
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        primary = self._profit_loss_column(company_id, start, end)

        length = (end - start).days + 1
        cmp_from: Optional[date] = None
        cmp_to: Optional[date] = None
        if comparison == "previous_period":
            cmp_to = start - timedelta(days=1)
            cmp_from = cmp_to - timedelta(days=length - 1)
        elif comparison == "same_period_last_year":
            def _shift(d: date) -> date:
                try:
                    return d.replace(year=d.year - 1)
                except ValueError:
                    return d.replace(year=d.year - 1, day=28)
            cmp_from, cmp_to = _shift(start), _shift(end)
        elif comparison == "specific_period" and compare_from and compare_to:
            cmp_from, cmp_to = (compare_from, compare_to) if compare_from <= compare_to else (compare_to, compare_from)
        else:
            comparison = "none"
        secondary = self._profit_loss_column(company_id, cmp_from, cmp_to) if cmp_from and cmp_to else None

        def line(key: str) -> dict:
            main = primary["buckets"][key]
            node = {
                "key": key,
                "label": PNL_BUCKET_LABELS[key],
                "kind": "line",
                "amount": main["amount"],
                "accounts": [dict(a) for a in main["accounts"]],
            }
            if secondary:
                other = secondary["buckets"][key]
                node["compare"] = other["amount"]
                by_code = {a["account_code"]: a["amount"] for a in other["accounts"]}
                seen = set()
                for acc in node["accounts"]:
                    acc["compare"] = by_code.get(acc["account_code"], ZERO)
                    seen.add(acc["account_code"])
                for acc in other["accounts"]:
                    if acc["account_code"] not in seen:
                        node["accounts"].append({**acc, "amount": ZERO, "compare": acc["amount"]})
            return node

        def band(key: str, label: str) -> dict:
            node = {"key": key, "label": label, "kind": "grand", "amount": primary["derived"][key]}
            if secondary:
                node["compare"] = secondary["derived"][key]
            return node

        rows = [
            line("revenue"),
            line("costs_of_revenue"),
            band("gross_profit", "Gross Profit"),
            line("operating_expenses"),
            band("operating_income", "Operating Income (or Loss)"),
            line("other_income"),
            line("other_expenses"),
            band("net_profit", "Net Profit"),
            line("allocations"),
            band("net_profit_left", "Net Profit Left After Allocations and Withdrawals"),
        ]

        def add_variance(node: dict) -> None:
            if secondary and "compare" in node:
                node["variance"] = money(node["amount"] - node["compare"])
                node["variance_pct"] = (
                    money((node["variance"] / node["compare"]) * 100) if node["compare"] != ZERO else None
                )
            for acc in node.get("accounts", []):
                add_variance(acc)

        for node in rows:
            add_variance(node)

        b = {key: primary["buckets"][key]["amount"] for key in PNL_BUCKET_LABELS}
        d = primary["derived"]
        columns = [{"key": "amount", "label": "Balance", "from": start.isoformat(), "to": end.isoformat()}]
        if secondary:
            columns[0]["label"] = f"{start.isoformat()} → {end.isoformat()}"
            columns.append({"key": "compare", "label": f"{cmp_from.isoformat()} → {cmp_to.isoformat()}", "from": cmp_from.isoformat(), "to": cmp_to.isoformat()})
            columns.append({"key": "variance_pct", "label": "%", "from": None, "to": None})
        totals = {
            # legacy keys kept for existing consumers
            "revenue": b["revenue"],
            "cogs": b["costs_of_revenue"],
            "gross_profit": d["gross_profit"],
            "operating_expenses": b["operating_expenses"],
            "net_profit": d["net_profit"],
            # Odoo layout
            "operating_income": d["operating_income"],
            "other_income": b["other_income"],
            "other_expenses": b["other_expenses"],
            "allocations": b["allocations"],
            "net_profit_left": d["net_profit_left"],
        }
        if secondary:
            totals["compare"] = {**{k: secondary["buckets"][k]["amount"] for k in PNL_BUCKET_LABELS}, **secondary["derived"]}
        return _envelope(
            filters={
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "comparison": comparison,
                "compare_from": cmp_from.isoformat() if cmp_from else None,
                "compare_to": cmp_to.isoformat() if cmp_to else None,
                "columns": columns,
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals=totals,
            company_id=company_id,
        )

    def _pnl_net(self, company_id: str, *, date_from: Optional[date], date_to: date) -> Decimal:
        totals = self._account_period_totals(company_id, date_from=date_from, date_to=date_to)
        accounts = {a.id: a for a in self._accounts(company_id)}
        net = ZERO
        for account_id, (debit, credit) in totals.items():
            account = accounts.get(account_id)
            if not account:
                continue
            if account.account_type == "revenue":
                net += credit - debit
            elif account.account_type == "expense":
                net -= debit - credit
        return money(net)

    def _fiscal_year_start(self, company_id: str, day: date) -> date:
        from app.services.finance.period_service import fiscal_start_month

        try:
            month = int(fiscal_start_month(self._db, company_id) or 1)
        except Exception:
            month = 1
        month = min(12, max(1, month))
        year = day.year if day.month >= month else day.year - 1
        return date(year, month, 1)

    def _balance_sheet_column(self, company_id: str, as_of: date) -> dict:
        """Bucket balances as of one date: {bucket: {amount, accounts: [...]}} plus earnings split."""
        totals_by_id = self._account_period_totals(company_id, cumulative_to=as_of)
        fy_start = self._fiscal_year_start(company_id, as_of)
        current_year_earnings = self._pnl_net(company_id, date_from=fy_start, date_to=as_of)
        prior_years_earnings = self._pnl_net(company_id, date_from=None, date_to=fy_start - timedelta(days=1))
        buckets: dict[str, dict] = {key: {"amount": ZERO, "accounts": []} for key in BALANCE_SHEET_BUCKET_LABELS}
        for account in self._accounts(company_id):
            bucket = balance_sheet_bucket(account.account_type, account.code)
            if bucket is None:
                continue
            debit, credit = totals_by_id.get(account.id, (ZERO, ZERO))
            amount = money(debit - credit) if account.account_type == "asset" else money(credit - debit)
            if account.code == RETAINED_EARNINGS_CODE:
                # Retained earnings account + every closed year's P&L that was never posted into it.
                amount = money(amount + prior_years_earnings)
                prior_years_earnings = ZERO
            if amount == ZERO and account.code != RETAINED_EARNINGS_CODE:
                continue
            buckets[bucket]["accounts"].append(
                {
                    "account_id": account.id,
                    "account_code": account.code,
                    "account_name": account.name,
                    "account_type": account.account_type,
                    "amount": amount,
                }
            )
            buckets[bucket]["amount"] = money(buckets[bucket]["amount"] + amount)
        if prior_years_earnings != ZERO:
            # No retained-earnings account in the chart — surface the prior years' result directly.
            buckets["previous_years_earnings"]["accounts"].append(
                {
                    "account_id": None,
                    "account_code": RETAINED_EARNINGS_CODE,
                    "account_name": "Previous years result",
                    "account_type": "equity",
                    "amount": prior_years_earnings,
                }
            )
            buckets["previous_years_earnings"]["amount"] = money(
                buckets["previous_years_earnings"]["amount"] + prior_years_earnings
            )
        buckets["current_year_earnings"]["amount"] = current_year_earnings
        buckets["current_year_earnings"]["accounts"].append(
            {
                "account_id": None,
                "account_code": "",
                "account_name": f"Net result {fy_start.isoformat()} → {as_of.isoformat()}",
                "account_type": "equity",
                "amount": current_year_earnings,
            }
        )
        return {"as_of": as_of, "fiscal_year_start": fy_start, "buckets": buckets}

    def balance_sheet(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        as_of: Optional[date] = None,
        comparison: str = "none",
        compare_date: Optional[date] = None,
        account_id: Optional[str] = None,
        account_type: Optional[str] = None,
    ) -> dict:
        """Odoo-style Balance Sheet as of a date, optionally compared against a second date.

        Layout: ASSETS (Current Assets → Bank and Cash / Receivables / Current Assets / Prepayments,
        Fixed Assets, Non-current Assets), LIABILITIES (Current Liabilities → Current Liabilities /
        Credit Card / Payables, Non-current Liabilities), EQUITY (& EARNINGS) (Equity, Earnings →
        Current Year Unallocated / Previous Years), then LIABILITIES + EQUITY. Each bucket unfolds
        into its accounts. ``date_from`` / ``account_id`` / ``account_type`` are accepted for
        backwards compatibility and ignored — a balance sheet is always the whole chart as of a date.
        """
        del date_from, account_id, account_type
        as_of_date = as_of or date_to or date.today()
        self._finance.ensure_accounts(company_id)
        primary = self._balance_sheet_column(company_id, as_of_date)
        fy_start = primary["fiscal_year_start"]

        compare_to: Optional[date] = None
        if comparison == "previous_period":
            compare_to = fy_start - timedelta(days=1)
        elif comparison == "same_period_last_year":
            try:
                compare_to = as_of_date.replace(year=as_of_date.year - 1)
            except ValueError:  # 29 Feb
                compare_to = as_of_date.replace(year=as_of_date.year - 1, day=28)
        elif comparison == "specific_date":
            compare_to = compare_date
        else:
            comparison = "none"
        secondary = self._balance_sheet_column(company_id, compare_to) if compare_to else None

        def bucket_node(key: str) -> dict:
            main = primary["buckets"][key]
            node = {
                "key": key,
                "label": BALANCE_SHEET_BUCKET_LABELS[key],
                "kind": "line",
                "amount": main["amount"],
                "accounts": [dict(a) for a in main["accounts"]],
            }
            if secondary:
                other = secondary["buckets"][key]
                node["compare"] = other["amount"]
                other_by_code = {a["account_code"]: a["amount"] for a in other["accounts"]}
                seen = set()
                for acc in node["accounts"]:
                    acc["compare"] = other_by_code.get(acc["account_code"], ZERO)
                    seen.add(acc["account_code"])
                for acc in other["accounts"]:
                    if acc["account_code"] not in seen:
                        node["accounts"].append({**acc, "amount": ZERO, "compare": acc["amount"]})
            return node

        def group_node(key: str, label: str, children: list[dict], total_label: str, kind: str = "group") -> dict:
            node = {
                "key": key,
                "label": label,
                "kind": kind,
                "children": children,
                "total_label": total_label,
                "amount": money(sum((c["amount"] for c in children), ZERO)),
            }
            if secondary:
                node["compare"] = money(sum((c.get("compare", ZERO) for c in children), ZERO))
            return node

        assets = group_node(
            "assets",
            "ASSETS",
            [
                group_node(
                    "current_assets_group",
                    "Current Assets",
                    [bucket_node("bank_cash"), bucket_node("receivables"), bucket_node("current_assets"), bucket_node("prepayments")],
                    "Total Current Assets",
                ),
                bucket_node("fixed_assets"),
                bucket_node("non_current_assets"),
            ],
            "Total ASSETS",
            kind="section",
        )
        liabilities = group_node(
            "liabilities",
            "LIABILITIES",
            [
                group_node(
                    "current_liabilities_group",
                    "Current Liabilities",
                    [bucket_node("current_liabilities"), bucket_node("credit_card"), bucket_node("payables")],
                    "Total Current Liabilities",
                ),
                bucket_node("non_current_liabilities"),
            ],
            "Total LIABILITIES",
            kind="section",
        )
        equity = group_node(
            "equity",
            "EQUITY (& EARNINGS)",
            [
                bucket_node("equity"),
                group_node(
                    "earnings",
                    "Earnings",
                    [bucket_node("current_year_earnings"), bucket_node("previous_years_earnings")],
                    "Total Earnings",
                ),
            ],
            "Total EQUITY (& EARNINGS)",
            kind="section",
        )
        grand = {
            "key": "liabilities_plus_equity",
            "label": "LIABILITIES + EQUITY",
            "kind": "grand",
            "amount": money(liabilities["amount"] + equity["amount"]),
        }
        if secondary:
            grand["compare"] = money(liabilities["compare"] + equity["compare"])

        def add_variance(node: dict) -> None:
            if secondary and "compare" in node:
                node["variance"] = money(node["amount"] - node["compare"])
                node["variance_pct"] = (
                    money((node["variance"] / node["compare"]) * 100) if node["compare"] != ZERO else None
                )
            for child in node.get("children", []):
                add_variance(child)
            for acc in node.get("accounts", []):
                add_variance(acc)

        rows = [assets, liabilities, equity, grand]
        for node in rows:
            add_variance(node)

        identity = balance_sheet_identity(assets["amount"], liabilities["amount"], equity["amount"])
        warning = None if identity["ok"] else "Balance Sheet equation does not hold: Assets ≠ Liabilities + Equity."
        columns = [
            {
                "key": "amount",
                "label": f"As of {as_of_date.isoformat()}" if compare_to else "Balance",
                "date": as_of_date.isoformat(),
            }
        ]
        if compare_to:
            columns.append({"key": "compare", "label": f"As of {compare_to.isoformat()}", "date": compare_to.isoformat()})
            columns.append({"key": "variance_pct", "label": "%", "date": None})
        totals = {
            "total_assets": identity["total_assets"],
            "total_liabilities": identity["total_liabilities"],
            "total_equity": identity["total_equity"],
            "liabilities_plus_equity": identity["liabilities_plus_equity"],
            "difference": identity["difference"],
            "current_earnings": primary["buckets"]["current_year_earnings"]["amount"],
            "previous_years_earnings": primary["buckets"]["previous_years_earnings"]["amount"],
        }
        if secondary:
            totals["compare"] = {
                "total_assets": assets["compare"],
                "total_liabilities": liabilities["compare"],
                "total_equity": equity["compare"],
                "liabilities_plus_equity": grand["compare"],
            }
        return _envelope(
            filters={
                "as_of": as_of_date.isoformat(),
                "comparison": comparison,
                "compare_date": compare_to.isoformat() if compare_to else None,
                "fiscal_year_start": fy_start.isoformat(),
                "columns": columns,
            },
            date_from=fy_start,
            date_to=as_of_date,
            rows=rows,
            totals=totals,
            company_id=company_id,
            extra={"integrity": {"ok": identity["ok"], "warning": warning}},
        )

    def cash_flow(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        payment_account_id: Optional[str] = None,
        payment_account_kind: Optional[str] = None,
    ) -> dict:
        """Odoo-style Cash Flow Statement over the payment ledger.

        Opening band, "Net increase in cash and cash equivalents" split into operating / investing /
        financing / unclassified activities (each unfolding into the counter accounts or payment
        sources behind it), closing band. Cash out is shown negative so the groups sum to the net
        movement. Transfers between own payment accounts cancel out unless the report is restricted
        to one account / kind, in which case they show under unclassified activities.
        """
        start, end = _period(date_from, date_to)
        accounts = self._finance.ensure_payment_accounts(company_id)
        restrict = bool(payment_account_id or payment_account_kind)
        if payment_account_id:
            accounts = [a for a in accounts if a.id == payment_account_id]
        if payment_account_kind:
            accounts = [a for a in accounts if a.kind == payment_account_kind]
        account_ids = [a.id for a in accounts]
        cash_gl_ids = {a.gl_account_id for a in self._finance.ensure_payment_accounts(company_id)}
        opening_seed = sum((money(a.opening_balance) for a in accounts), ZERO)

        def _sum(direction: str, *, before: Optional[date] = None, within: bool = False, transfers: Optional[bool] = None) -> Decimal:
            query = self._db.query(func.coalesce(func.sum(FinancePayment.amount), 0)).filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == direction,
            )
            if restrict:
                query = query.filter(FinancePayment.payment_account_id.in_(account_ids or ["__none__"]))
            if before is not None:
                query = query.filter(FinancePayment.payment_date < before)
            if within:
                query = query.filter(FinancePayment.payment_date >= start, FinancePayment.payment_date <= end)
            if transfers is True:
                query = query.filter(FinancePayment.is_transfer.is_(True))
            elif transfers is False:
                query = query.filter(FinancePayment.is_transfer.is_(False))
            return money(query.scalar())

        inbound_before = _sum("inbound", before=start)
        outbound_before = _sum("outbound", before=start)
        opening = money(opening_seed + inbound_before - outbound_before)
        cash_in = _sum("inbound", within=True, transfers=False)
        cash_out = _sum("outbound", within=True, transfers=False)
        transfer_in = _sum("inbound", within=True, transfers=True)
        transfer_out = _sum("outbound", within=True, transfers=True)

        def _through(direction: str, until: date) -> Decimal:
            query = self._db.query(func.coalesce(func.sum(FinancePayment.amount), 0)).filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == direction,
                FinancePayment.payment_date <= until,
            )
            if restrict:
                query = query.filter(FinancePayment.payment_account_id.in_(account_ids or ["__none__"]))
            return money(query.scalar())

        closing = money(opening_seed + _through("inbound", end) - _through("outbound", end))
        identity = cash_flow_identity(opening, cash_in, cash_out, transfer_in, transfer_out, closing)
        warning = None if identity["ok"] else "Cash Flow identity failed: Opening + Net ≠ Closing."

        # ---- classify every payment in the period ---------------------------------------------
        pay_query = self._db.query(FinancePayment).filter(
            FinancePayment.company_id == company_id,
            FinancePayment.payment_date >= start,
            FinancePayment.payment_date <= end,
        )
        if restrict:
            pay_query = pay_query.filter(FinancePayment.payment_account_id.in_(account_ids or ["__none__"]))
        else:
            pay_query = pay_query.filter(FinancePayment.is_transfer.is_(False))
        payments = pay_query.all()

        entry_ids = {p.journal_entry_id for p in payments if p.journal_entry_id}
        counter_by_entry: dict[str, FinanceAccount] = {}
        if entry_ids:
            lines = (
                self._db.query(FinanceJournalLine.journal_entry_id, FinanceAccount)
                .join(FinanceAccount, FinanceAccount.id == FinanceJournalLine.account_id)
                .filter(FinanceJournalLine.journal_entry_id.in_(list(entry_ids)))
                .order_by(FinanceJournalLine.journal_entry_id)
                .all()
            )
            for entry_id, account in lines:
                if account.id in cash_gl_ids or entry_id in counter_by_entry:
                    continue
                counter_by_entry[entry_id] = account

        line_totals: dict[str, Decimal] = {key: ZERO for key in CASH_FLOW_LINE_LABELS}
        line_breakdown: dict[str, dict[str, dict]] = {key: {} for key in CASH_FLOW_LINE_LABELS}
        for pay in payments:
            counter = counter_by_entry.get(pay.journal_entry_id) if pay.journal_entry_id else None
            if pay.is_transfer:
                key = "unclassified_in" if pay.direction == "inbound" else "unclassified_out"
            else:
                key = cash_flow_line(
                    pay.direction,
                    pay.source_type,
                    pay.party_type,
                    counter.code if counter else None,
                    counter.account_type if counter else None,
                )
            signed = money(pay.amount) if pay.direction == "inbound" else money(-pay.amount)
            line_totals[key] = money(line_totals[key] + signed)
            if counter:
                bkey, label, acc_id, code = counter.id, counter.name, counter.id, counter.code
            elif pay.is_transfer:
                bkey, label, acc_id, code = "transfer", "Transfers between own accounts", None, ""
            else:
                bkey = f"src:{pay.source_type}"
                pretty = SOURCE_TYPE_LABELS.get(pay.source_type) or (pay.source_type or "payment").replace("_", " ").capitalize()
                label = f"{pretty} (not posted to journal)"
                acc_id, code = None, ""
            slot = line_breakdown[key].setdefault(
                bkey, {"account_id": acc_id, "account_code": code, "account_name": label, "account_type": "", "amount": ZERO, "count": 0}
            )
            slot["amount"] = money(slot["amount"] + signed)
            slot["count"] += 1

        def line(key: str) -> dict:
            return {
                "key": key,
                "label": CASH_FLOW_LINE_LABELS[key],
                "kind": "line",
                "amount": line_totals[key],
                "accounts": sorted(line_breakdown[key].values(), key=lambda a: (a["account_code"] or "~", a["account_name"])),
            }

        groups = []
        for gkey, line_keys in CASH_FLOW_GROUP_LINES.items():
            children = [line(k) for k in line_keys]
            groups.append(
                {
                    "key": gkey,
                    "label": CASH_FLOW_GROUP_LABELS[gkey],
                    "kind": "group",
                    "amount": money(sum((c["amount"] for c in children), ZERO)),
                    "total_label": None,
                    "children": children,
                }
            )
        net_increase = money(sum((g["amount"] for g in groups), ZERO))
        rows = [
            {"key": "opening", "label": "Cash and cash equivalents, beginning of period", "kind": "grand", "amount": opening},
            {
                "key": "net_increase",
                "label": "Net increase in cash and cash equivalents",
                "kind": "section",
                "amount": net_increase,
                "show_amount": True,
                "total_label": None,
                "children": groups,
            },
            {"key": "closing", "label": "Cash and cash equivalents, closing balance", "kind": "grand", "amount": closing},
        ]
        return _envelope(
            filters={
                "payment_account_id": payment_account_id,
                "payment_account_kind": payment_account_kind,
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "columns": [{"key": "amount", "label": "Balance", "from": start.isoformat(), "to": end.isoformat()}],
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "opening": opening,
                "cash_in": cash_in,
                "cash_out": cash_out,
                "transfer_in": transfer_in,
                "transfer_out": transfer_out,
                "net_cash_flow": identity["net_cash_flow"],
                "net_increase": net_increase,
                "closing": closing,
                "difference": identity["difference"],
                "groups": {g["key"]: g["amount"] for g in groups},
            },
            company_id=company_id,
            extra={"integrity": {"ok": identity["ok"], "warning": warning}},
        )

    def general_ledger(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        account_id: Optional[str] = None,
        source_type: Optional[str] = None,
        party_id: Optional[str] = None,
        reference: Optional[str] = None,
    ) -> dict:
        """Odoo-style General Ledger: one row per account (Initial Balance, period Debit / Credit,
        Balance) unfolding into its posted journal lines with Date, Partner, Debit, Credit and a
        running Balance (debit − credit, signed like Odoo), plus a Total General Ledger row."""
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        accounts = self._accounts(company_id)
        if account_id:
            accounts = [a for a in accounts if a.id == account_id]
        filtered = bool(source_type or party_id or reference)
        opening = {} if filtered else self._account_period_totals(company_id, cumulative_to=start - timedelta(days=1), account_id=account_id)
        lines = (
            self._posted_lines_query(
                company_id,
                date_from=start,
                date_to=end,
                account_id=account_id,
                source_type=source_type,
                party_id=party_id,
                reference=reference,
            )
            .order_by(FinanceJournalEntry.entry_date, FinanceJournalEntry.created_at, FinanceJournalLine.id)
            .all()
        )
        by_account: dict[str, list] = {}
        customer_ids, supplier_ids = set(), set()
        for line, entry, _acc in lines:
            by_account.setdefault(line.account_id, []).append((line, entry))
            if line.party_id:
                (customer_ids if line.party_type == "customer" else supplier_ids).add(line.party_id)
        partner_names: dict[str, str] = {}
        if customer_ids:
            for row in self._db.query(CommerceCustomer.id, CommerceCustomer.name).filter(CommerceCustomer.id.in_(list(customer_ids))).all():
                partner_names[row[0]] = row[1]
        if supplier_ids:
            for row in self._db.query(CommerceSupplier.id, CommerceSupplier.name).filter(CommerceSupplier.id.in_(list(supplier_ids))).all():
                partner_names[row[0]] = row[1]

        rows = []
        total_debit = total_credit = total_balance = ZERO
        line_count = 0
        for account in accounts:
            o_debit, o_credit = opening.get(account.id, (ZERO, ZERO))
            initial = money(o_debit - o_credit)
            acc_lines = by_account.get(account.id, [])
            if initial == ZERO and not acc_lines:
                continue
            running = initial
            out_lines = []
            if initial != ZERO:
                out_lines.append(
                    {
                        "id": f"opening:{account.id}",
                        "date": None,
                        "entry_number": "",
                        "journal_entry_id": None,
                        "description": "Initial Balance",
                        "partner": "",
                        "source_type": None,
                        "source_label": "",
                        "debit": ZERO,
                        "credit": ZERO,
                        "balance": initial,
                        "is_opening": True,
                    }
                )
            debit_sum = credit_sum = ZERO
            for line, entry in acc_lines:
                debit = money(line.debit)
                credit = money(line.credit)
                running = money(running + debit - credit)
                debit_sum += debit
                credit_sum += credit
                out_lines.append(
                    {
                        "id": line.id,
                        "date": entry.entry_date.isoformat(),
                        "entry_number": entry.entry_number,
                        "journal_entry_id": entry.id,
                        "description": line.description or entry.description,
                        "partner": partner_names.get(line.party_id or "", "") if line.party_id else "",
                        "source_type": entry.source_type,
                        "source_label": SOURCE_TYPE_LABELS.get(entry.source_type, entry.source_type),
                        "debit": debit,
                        "credit": credit,
                        "balance": running,
                        "is_opening": False,
                    }
                )
            line_count += len(acc_lines)
            total_debit += debit_sum
            total_credit += credit_sum
            total_balance += running
            rows.append(
                {
                    "account_id": account.id,
                    "account_code": account.code,
                    "account_name": account.name,
                    "account_type": account.account_type,
                    "initial_balance": initial,
                    "debit": money(debit_sum),
                    "credit": money(credit_sum),
                    "balance": running,
                    "lines": out_lines,
                }
            )
        return _envelope(
            filters={
                "account_id": account_id,
                "source_type": source_type,
                "party_id": party_id,
                "reference": reference,
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "columns": [
                    {"key": "date", "label": "Date"},
                    {"key": "partner", "label": "Partner"},
                    {"key": "debit", "label": "Debit"},
                    {"key": "credit", "label": "Credit"},
                    {"key": "balance", "label": "Balance"},
                ],
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "total_debit": money(total_debit),
                "total_credit": money(total_credit),
                "balance": money(total_balance),
                "account_count": len(rows),
                "row_count": line_count,
            },
            company_id=company_id,
        )

    def partner_ledger(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        ledger_type: str = "all",
        partner_id: Optional[str] = None,
    ) -> dict:
        """Odoo-style Partner Ledger over the AR / AP sub-ledgers.

        One row per partner (customer on the receivable account, supplier on the payable account)
        with period Debit / Credit and closing Balance, unfolding into an Initial Balance line and the
        period's invoices, bills and payments with JRNL, Account, Ref, Due Date and a running
        balance. Customer: invoice = debit, receipt = credit. Supplier: bill = credit, payment =
        debit. Balance = debit − credit, so a customer who owes us is positive and a supplier we owe
        is negative, exactly like Odoo.
        """
        start, end = _period(date_from, date_to)
        if ledger_type not in ("all", "receivable", "payable"):
            ledger_type = "all"

        partners: dict[str, dict] = {}

        def slot(pid: str, kind: str) -> dict:
            key = f"{kind}:{pid}"
            row = partners.get(key)
            if row is None:
                row = {
                    "key": key,
                    "partner_id": pid,
                    "partner_name": None,
                    "partner_type": "customer" if kind == "receivable" else "supplier",
                    "account": "Receivable" if kind == "receivable" else "Payable",
                    "initial_balance": ZERO,
                    "debit": ZERO,
                    "credit": ZERO,
                    "balance": ZERO,
                    "_events": [],
                }
                partners[key] = row
            return row

        def add(pid: str, kind: str, when: date, debit: Decimal, credit: Decimal, line: Optional[dict]) -> None:
            row = slot(pid, kind)
            if when < start:
                row["initial_balance"] = money(row["initial_balance"] + debit - credit)
            elif when <= end and line is not None:
                row["_events"].append((when, line, debit, credit))

        # ---- customers: invoices (debit) and receipts (credit) ----------------------------------
        if ledger_type in ("all", "receivable"):
            q = self._db.query(FinanceReceivable).filter(FinanceReceivable.company_id == company_id, FinanceReceivable.status != "void")
            if partner_id:
                q = q.filter(FinanceReceivable.customer_id == partner_id)
            for rec in q.all():
                when = _document_date(rec.created_at, rec.due_date, start)
                amount = money(rec.amount)
                # Credit notes (sales returns) are stored as negative receivables.
                debit, credit = (amount, ZERO) if amount >= 0 else (ZERO, -amount)
                add(
                    rec.customer_id,
                    "receivable",
                    when,
                    debit,
                    credit,
                    {
                        "id": rec.id,
                        "date": when.isoformat(),
                        "journal": "INV" if amount >= 0 else "CN",
                        "account": "Receivable",
                        "reference": rec.invoice_number,
                        "label": SOURCE_TYPE_LABELS.get(rec.source_type, rec.source_type),
                        "due_date": rec.due_date.isoformat() if rec.due_date else None,
                        "status": rec.status,
                        "source_type": rec.source_type,
                        "source_id": rec.source_id,
                        "journal_entry_id": rec.journal_entry_id,
                    },
                )
            pq = self._db.query(FinancePayment).filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == "inbound",
                FinancePayment.party_type == "customer",
                FinancePayment.party_id.isnot(None),
            )
            if partner_id:
                pq = pq.filter(FinancePayment.party_id == partner_id)
            for pay in pq.all():
                add(
                    pay.party_id,
                    "receivable",
                    pay.payment_date,
                    ZERO,
                    money(pay.amount),
                    {
                        "id": pay.id,
                        "date": pay.payment_date.isoformat(),
                        "journal": "PAY",
                        "account": "Receivable",
                        "reference": pay.payment_number,
                        "label": pay.reference or SOURCE_TYPE_LABELS.get(pay.source_type, pay.source_type),
                        "due_date": None,
                        "status": None,
                        "source_type": pay.source_type,
                        "source_id": pay.source_id,
                        "journal_entry_id": pay.journal_entry_id,
                    },
                )

        # ---- suppliers: bills (credit) and payments (debit) -------------------------------------
        if ledger_type in ("all", "payable"):
            q = self._db.query(FinancePayable).filter(FinancePayable.company_id == company_id, FinancePayable.status != "void")
            if partner_id:
                q = q.filter(FinancePayable.supplier_id == partner_id)
            for pay_doc in q.all():
                when = _document_date(pay_doc.created_at, pay_doc.due_date, start)
                add(
                    pay_doc.supplier_id,
                    "payable",
                    when,
                    ZERO,
                    money(pay_doc.amount),
                    {
                        "id": pay_doc.id,
                        "date": when.isoformat(),
                        "journal": "BILL",
                        "account": "Payable",
                        "reference": pay_doc.reference_number,
                        "label": SOURCE_TYPE_LABELS.get(pay_doc.source_type, pay_doc.source_type),
                        "due_date": pay_doc.due_date.isoformat() if pay_doc.due_date else None,
                        "status": pay_doc.status,
                        "source_type": pay_doc.source_type,
                        "source_id": pay_doc.source_id,
                        "journal_entry_id": pay_doc.journal_entry_id,
                    },
                )
            pq = self._db.query(FinancePayment).filter(
                FinancePayment.company_id == company_id,
                FinancePayment.direction == "outbound",
                FinancePayment.party_type.in_(("supplier", "vendor")),
                FinancePayment.party_id.isnot(None),
            )
            if partner_id:
                pq = pq.filter(FinancePayment.party_id == partner_id)
            for pay in pq.all():
                add(
                    pay.party_id,
                    "payable",
                    pay.payment_date,
                    money(pay.amount),
                    ZERO,
                    {
                        "id": pay.id,
                        "date": pay.payment_date.isoformat(),
                        "journal": "PAY",
                        "account": "Payable",
                        "reference": pay.payment_number,
                        "label": pay.reference or SOURCE_TYPE_LABELS.get(pay.source_type, pay.source_type),
                        "due_date": None,
                        "status": None,
                        "source_type": pay.source_type,
                        "source_id": pay.source_id,
                        "journal_entry_id": pay.journal_entry_id,
                    },
                )

        # ---- names ------------------------------------------------------------------------------
        customer_ids = [r["partner_id"] for r in partners.values() if r["partner_type"] == "customer"]
        supplier_ids = [r["partner_id"] for r in partners.values() if r["partner_type"] == "supplier"]
        names: dict[str, str] = {}
        if customer_ids:
            for cid, name in self._db.query(CommerceCustomer.id, CommerceCustomer.name).filter(CommerceCustomer.id.in_(customer_ids)).all():
                names[f"receivable:{cid}"] = name
        if supplier_ids:
            for sid, name in self._db.query(CommerceSupplier.id, CommerceSupplier.name).filter(CommerceSupplier.id.in_(supplier_ids)).all():
                names[f"payable:{sid}"] = name

        rows = []
        t_debit = t_credit = t_balance = ZERO
        line_count = 0
        for key, row in partners.items():
            events = sorted(row.pop("_events"), key=lambda e: (e[0], e[1]["journal"] != "INV" and e[1]["journal"] != "BILL", e[1]["reference"] or ""))
            initial = row["initial_balance"]
            if initial == ZERO and not events:
                continue
            row["partner_name"] = names.get(key) or "Unknown partner"
            running = initial
            lines = []
            if initial != ZERO:
                lines.append(
                    {"id": f"opening:{key}", "date": None, "journal": "", "account": row["account"], "reference": "", "label": "Initial Balance",
                     "due_date": None, "status": None, "source_type": None, "source_id": None, "journal_entry_id": None,
                     "debit": ZERO, "credit": ZERO, "balance": initial, "is_opening": True}
                )
            debit_sum = credit_sum = ZERO
            for _when, line, debit, credit in events:
                running = money(running + debit - credit)
                debit_sum += debit
                credit_sum += credit
                lines.append({**line, "debit": debit, "credit": credit, "balance": running, "is_opening": False})
            row["debit"] = money(debit_sum)
            row["credit"] = money(credit_sum)
            row["balance"] = running
            row["lines"] = lines
            line_count += len(events)
            t_debit += debit_sum
            t_credit += credit_sum
            t_balance += running
            rows.append(row)
        rows.sort(key=lambda r: ((r["partner_name"] or "").lower(), r["account"]))
        return _envelope(
            filters={
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "ledger_type": ledger_type,
                "partner_id": partner_id,
                "columns": [
                    {"key": "journal", "label": "JRNL"},
                    {"key": "account", "label": "Account"},
                    {"key": "reference", "label": "Ref"},
                    {"key": "due_date", "label": "Due Date"},
                    {"key": "debit", "label": "Debit"},
                    {"key": "credit", "label": "Credit"},
                    {"key": "balance", "label": "Balance"},
                ],
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "total_debit": money(t_debit),
                "total_credit": money(t_credit),
                "balance": money(t_balance),
                "partner_count": len(rows),
                "row_count": line_count,
            },
            company_id=company_id,
        )

    def invoices_analysis(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status: str = "invoiced",
    ) -> dict:
        """Odoo-style Invoices Analysis facts: customer invoices (receivables) pre-aggregated by
        month × customer × status × source so the client can pivot / chart any measure.

        Measures per fact: untaxed, tax, total, amount_due, count. ``status``: invoiced (all but
        void), open (open + partial), paid, or a single status value.
        """
        start, end = _period(date_from, date_to)
        q = self._db.query(FinanceReceivable, CommerceCustomer).outerjoin(
            CommerceCustomer, CommerceCustomer.id == FinanceReceivable.customer_id
        ).filter(FinanceReceivable.company_id == company_id)
        if status == "invoiced":
            q = q.filter(FinanceReceivable.status != "void")
        elif status == "open":
            q = q.filter(FinanceReceivable.status.in_(("open", "partial")))
        elif status in ("paid", "partial", "void"):
            q = q.filter(FinanceReceivable.status == status)
        facts: dict[tuple, dict] = {}
        customers: dict[str, str] = {}
        for rec, customer in q.all():
            when = _document_date(rec.created_at, rec.due_date, start)
            if when < start or when > end:
                continue
            month = when.strftime("%Y-%m")
            key = (month, rec.customer_id, rec.status, rec.source_type)
            fact = facts.get(key)
            if fact is None:
                fact = {
                    "month": month,
                    "quarter": f"{when.year}-Q{(when.month - 1) // 3 + 1}",
                    "year": str(when.year),
                    "customer_id": rec.customer_id,
                    "customer_name": (customer.name if customer else None) or "Unknown customer",
                    "status": rec.status,
                    "source_type": rec.source_type,
                    "source_label": SOURCE_TYPE_LABELS.get(rec.source_type, rec.source_type),
                    "untaxed": ZERO,
                    "tax": ZERO,
                    "total": ZERO,
                    "amount_due": ZERO,
                    "count": 0,
                }
                facts[key] = fact
            total = money(rec.amount)
            tax = money(rec.tax_amount)
            fact["total"] = money(fact["total"] + total)
            fact["tax"] = money(fact["tax"] + tax)
            fact["untaxed"] = money(fact["untaxed"] + total - tax)
            fact["amount_due"] = money(fact["amount_due"] + money(rec.balance))
            fact["count"] += 1
            customers[rec.customer_id] = fact["customer_name"]
        rows = sorted(facts.values(), key=lambda f: (f["month"], f["customer_name"].lower(), f["status"], f["source_type"] or ""))
        totals = {
            "untaxed": money(sum((f["untaxed"] for f in rows), ZERO)),
            "tax": money(sum((f["tax"] for f in rows), ZERO)),
            "total": money(sum((f["total"] for f in rows), ZERO)),
            "amount_due": money(sum((f["amount_due"] for f in rows), ZERO)),
            "count": sum(f["count"] for f in rows),
            "customer_count": len(customers),
        }
        return _envelope(
            filters={
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "status": status,
                "measures": [
                    {"key": "untaxed", "label": "Untaxed Amount"},
                    {"key": "tax", "label": "Tax"},
                    {"key": "total", "label": "Total"},
                    {"key": "amount_due", "label": "Amount Due"},
                    {"key": "count", "label": "Count"},
                ],
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals=totals,
            company_id=company_id,
        )

    def analytic_report(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        cost_center_id: Optional[str] = None,
    ) -> dict:
        """Odoo-style Analytic Report: analytic plans (cost-center kinds) → analytic accounts
        (cost centers) with period Debit / Credit / Balance, unfolding into the posted journal
        lines tagged with that cost center (date, entry, partner, GL account, running balance)."""
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        self._finance.ensure_cost_centers(company_id)
        centers = {row.id: row for row in self._finance.list_cost_centers(company_id, include_inactive=True)}
        query = (
            self._posted_lines_query(company_id, date_from=start, date_to=end)
            .filter(FinanceJournalLine.cost_center_id.isnot(None))
            .order_by(FinanceJournalEntry.entry_date, FinanceJournalEntry.created_at, FinanceJournalLine.id)
        )
        if cost_center_id:
            query = query.filter(FinanceJournalLine.cost_center_id == cost_center_id)
        lines = query.all()
        by_center: dict[str, list] = {}
        customer_ids, supplier_ids = set(), set()
        for line, entry, account in lines:
            by_center.setdefault(line.cost_center_id, []).append((line, entry, account))
            if line.party_id:
                (customer_ids if line.party_type == "customer" else supplier_ids).add(line.party_id)
        names: dict[str, str] = {}
        if customer_ids:
            for cid, name in self._db.query(CommerceCustomer.id, CommerceCustomer.name).filter(CommerceCustomer.id.in_(list(customer_ids))).all():
                names[cid] = name
        if supplier_ids:
            for sid, name in self._db.query(CommerceSupplier.id, CommerceSupplier.name).filter(CommerceSupplier.id.in_(list(supplier_ids))).all():
                names[sid] = name

        rows = []
        t_debit = t_credit = ZERO
        line_count = 0
        for cc_id, items in by_center.items():
            center = centers.get(cc_id)
            plan = (center.kind if center else "other") or "other"
            running = ZERO
            debit_sum = credit_sum = ZERO
            out_lines = []
            for line, entry, account in items:
                debit = money(line.debit)
                credit = money(line.credit)
                running = money(running + debit - credit)
                debit_sum += debit
                credit_sum += credit
                out_lines.append(
                    {
                        "id": line.id,
                        "date": entry.entry_date.isoformat(),
                        "entry_number": entry.entry_number,
                        "journal_entry_id": entry.id,
                        "description": line.description or entry.description,
                        "partner": names.get(line.party_id, "") if line.party_id else "",
                        "gl_account": f"{account.code} {account.name}",
                        "source_type": entry.source_type,
                        "source_label": SOURCE_TYPE_LABELS.get(entry.source_type, entry.source_type),
                        "debit": debit,
                        "credit": credit,
                        "balance": running,
                        "is_opening": False,
                    }
                )
            line_count += len(items)
            t_debit += debit_sum
            t_credit += credit_sum
            rows.append(
                {
                    "plan_key": plan,
                    "plan_label": plan.replace("_", " ").title(),
                    "account_id": cc_id,
                    "account_code": center.code if center else "",
                    "account_name": center.name if center else "Unknown cost center",
                    "initial_balance": ZERO,
                    "debit": money(debit_sum),
                    "credit": money(credit_sum),
                    "balance": running,
                    "lines": out_lines,
                }
            )
        rows.sort(key=lambda r: (r["plan_label"], r["account_code"] or "", r["account_name"]))
        return _envelope(
            filters={
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "cost_center_id": cost_center_id,
                "columns": [
                    {"key": "date", "label": "Date"},
                    {"key": "partner", "label": "Partner"},
                    {"key": "gl_account", "label": "Account"},
                    {"key": "debit", "label": "Debit"},
                    {"key": "credit", "label": "Credit"},
                    {"key": "balance", "label": "Balance"},
                ],
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "total_debit": money(t_debit),
                "total_credit": money(t_credit),
                "balance": money(t_debit - t_credit),
                "account_count": len(rows),
                "row_count": line_count,
            },
            company_id=company_id,
        )

    def _executive_column(self, company_id: str, start: date, end: date) -> dict:
        """One period's executive-summary figures, composed from the cash flow, P&L and balance sheet."""
        cash = self.cash_flow(company_id=company_id, date_from=start, date_to=end)["totals"]
        pnl = self.profit_loss(company_id=company_id, date_from=start, date_to=end)["totals"]
        bs = self.balance_sheet(company_id=company_id, as_of=end)
        buckets: dict[str, Decimal] = {}
        current_assets = current_liabilities = ZERO
        for section in bs["rows"]:
            for child in section.get("children", []):
                if child["key"] == "current_assets_group":
                    current_assets = child["amount"]
                if child["key"] == "current_liabilities_group":
                    current_liabilities = child["amount"]
                for leaf in child.get("children", []):
                    buckets[leaf["key"]] = leaf["amount"]
        income = money(pnl["revenue"] + pnl["other_income"])
        cost_of_revenue = money(pnl["cogs"])
        gross_profit = money(pnl["gross_profit"] + pnl["other_income"])
        expenses = money(pnl["operating_expenses"] + pnl["other_expenses"])
        net_profit = money(pnl["net_profit"])
        receivables = money(buckets.get("receivables", ZERO))
        payables = money(buckets.get("payables", ZERO))
        net_assets = money(bs["totals"]["total_assets"] - bs["totals"]["total_liabilities"])
        days = Decimal((end - start).days + 1)
        cost_base = money(cost_of_revenue + expenses)

        def pct(part: Decimal, whole: Decimal) -> Optional[Decimal]:
            return money(part / whole * 100) if whole != ZERO else None

        return {
            "cash_received": money(cash["cash_in"]),
            "cash_spent": money(cash["cash_out"]),
            "cash_surplus": money(cash["cash_in"] - cash["cash_out"]),
            "closing_bank": money(cash["closing"]),
            "income": income,
            "cost_of_revenue": cost_of_revenue,
            "gross_profit": gross_profit,
            "expenses": expenses,
            "net_profit": net_profit,
            "receivables": receivables,
            "payables": payables,
            "net_assets": net_assets,
            "gross_margin": pct(gross_profit, income),
            "net_margin": pct(net_profit, income),
            "roi": pct(net_profit, net_assets),
            "debtor_days": money(receivables / (income / days)) if income != ZERO else None,
            "creditor_days": money(abs(payables) / (cost_base / days)) if cost_base != ZERO else None,
            "cash_forecast": money(cash["closing"] + receivables - abs(payables)),
            "current_ratio": money(current_assets / current_liabilities) if current_liabilities != ZERO else None,
        }

    def executive_summary(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        comparison: str = "none",
        compare_from: Optional[date] = None,
        compare_to: Optional[date] = None,
    ) -> dict:
        """Odoo-style Executive Summary: Cash, Profitability, Balance Sheet, Performance and Position
        sections for a period, optionally against a comparison period."""
        start, end = _period(date_from, date_to)
        length = (end - start).days + 1
        cmp_from: Optional[date] = None
        cmp_to: Optional[date] = None
        if comparison == "previous_period":
            cmp_to = start - timedelta(days=1)
            cmp_from = cmp_to - timedelta(days=length - 1)
        elif comparison == "same_period_last_year":
            def _shift(d: date) -> date:
                try:
                    return d.replace(year=d.year - 1)
                except ValueError:
                    return d.replace(year=d.year - 1, day=28)
            cmp_from, cmp_to = _shift(start), _shift(end)
        elif comparison == "specific_period" and compare_from and compare_to:
            cmp_from, cmp_to = (compare_from, compare_to) if compare_from <= compare_to else (compare_to, compare_from)
        else:
            comparison = "none"
        primary = self._executive_column(company_id, start, end)
        secondary = self._executive_column(company_id, cmp_from, cmp_to) if cmp_from and cmp_to else None

        layout = [
            ("cash", "Cash", [
                ("cash_received", "Cash received", "money"),
                ("cash_spent", "Cash spent", "money"),
                ("cash_surplus", "Cash surplus", "money"),
                ("closing_bank", "Closing bank balance", "money"),
            ]),
            ("profitability", "Profitability", [
                ("income", "Income", "money"),
                ("cost_of_revenue", "Cost of Revenue", "money"),
                ("gross_profit", "Gross profit", "money"),
                ("expenses", "Expenses", "money"),
                ("net_profit", "Net Profit", "money"),
            ]),
            ("balance_sheet", "Balance Sheet", [
                ("receivables", "Receivables", "money"),
                ("payables", "Payables", "money"),
                ("net_assets", "Net assets", "money"),
            ]),
            ("performance", "Performance", [
                ("gross_margin", "Gross profit margin (gross profit / income)", "percent"),
                ("net_margin", "Net profit margin (net profit / income)", "percent"),
                ("roi", "Return on investment (net profit / assets)", "percent"),
            ]),
            ("position", "Position", [
                ("debtor_days", "Average debtors days", "days"),
                ("creditor_days", "Average creditors days", "days"),
                ("cash_forecast", "Short term cash forecast", "money"),
                ("current_ratio", "Current assets to liabilities", "ratio"),
            ]),
        ]
        rows = []
        for skey, slabel, lines in layout:
            children = []
            for key, label, fmt in lines:
                node = {"key": key, "label": label, "kind": "line", "format": fmt, "amount": primary[key], "accounts": []}
                if secondary:
                    node["compare"] = secondary[key]
                    if node["amount"] is not None and node["compare"] is not None:
                        node["variance"] = money(node["amount"] - node["compare"])
                        node["variance_pct"] = money(node["variance"] / node["compare"] * 100) if node["compare"] != ZERO else None
                children.append(node)
            rows.append({"key": skey, "label": slabel, "kind": "section", "total_label": None, "children": children})
        columns = [{"key": "amount", "label": "Balance", "from": start.isoformat(), "to": end.isoformat()}]
        if secondary:
            columns[0]["label"] = f"{start.isoformat()} → {end.isoformat()}"
            columns.append({"key": "compare", "label": f"{cmp_from.isoformat()} → {cmp_to.isoformat()}", "from": cmp_from.isoformat(), "to": cmp_to.isoformat()})
            columns.append({"key": "variance_pct", "label": "%", "from": None, "to": None})
        return _envelope(
            filters={
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "comparison": comparison,
                "compare_from": cmp_from.isoformat() if cmp_from else None,
                "compare_to": cmp_to.isoformat() if cmp_to else None,
                "columns": columns,
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={k: v for k, v in primary.items()},
            company_id=company_id,
        )

    def receivable_aging(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        as_of: Optional[date] = None,
    ) -> dict:
        start, end = _period(date_from, date_to)
        as_of_date = as_of or end
        rows_out = []
        bucket_totals = {key: ZERO for key in AGING_BUCKET_LABELS}
        amount_total = ZERO
        paid_total = ZERO
        outstanding_total = ZERO
        query = (
            self._db.query(FinanceReceivable, CommerceCustomer)
            .outerjoin(CommerceCustomer, CommerceCustomer.id == FinanceReceivable.customer_id)
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.status.in_(("open", "partial")),
                FinanceReceivable.balance != 0,
            )
        )
        identity_ok = True
        for rec, customer in query.order_by(FinanceReceivable.due_date.nulls_last(), FinanceReceivable.created_at).all():
            created = rec.created_at.date() if rec.created_at else as_of_date
            bucket = aging_bucket(rec.due_date, as_of_date, created)
            amount = money(rec.amount)
            paid = money(rec.amount_paid)
            balance = money(rec.balance)
            ident = outstanding_identity(amount, paid, balance)
            if not ident["ok"]:
                identity_ok = False
            amount_total += amount
            paid_total += paid
            outstanding_total += balance
            bucket_totals[bucket] = money(bucket_totals[bucket] + balance)
            rows_out.append(
                {
                    "id": rec.id,
                    "customer_id": rec.customer_id,
                    "customer_name": customer.name if customer else None,
                    "invoice_number": rec.invoice_number,
                    "source_type": rec.source_type,
                    "source_id": rec.source_id,
                    "invoice_date": created.isoformat(),
                    "due_date": rec.due_date.isoformat() if rec.due_date else None,
                    "amount": amount,
                    "amount_paid": paid,
                    "outstanding": balance,
                    "aging_bucket": bucket,
                    "aging_label": AGING_BUCKET_LABELS.get(bucket, bucket),
                    "journal_entry_id": rec.journal_entry_id,
                }
            )
        warning = None if identity_ok else "AR outstanding does not equal amount − paid on one or more rows."
        return _envelope(
            filters={"as_of": as_of_date.isoformat()},
            date_from=start,
            date_to=end,
            rows=rows_out,
            totals={
                "amount": amount_total,
                "paid": paid_total,
                "outstanding": outstanding_total,
                "buckets": {key: bucket_totals[key] for key in AGING_BUCKET_LABELS},
            },
            company_id=company_id,
            extra={"integrity": {"ok": identity_ok, "warning": warning}},
        )

    def payable_aging(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        as_of: Optional[date] = None,
    ) -> dict:
        start, end = _period(date_from, date_to)
        as_of_date = as_of or end
        rows_out = []
        bucket_totals = {key: ZERO for key in AGING_BUCKET_LABELS}
        amount_total = ZERO
        paid_total = ZERO
        outstanding_total = ZERO
        query = (
            self._db.query(FinancePayable, CommerceSupplier)
            .outerjoin(CommerceSupplier, CommerceSupplier.id == FinancePayable.supplier_id)
            .filter(
                FinancePayable.company_id == company_id,
                FinancePayable.status.in_(("open", "partial")),
                FinancePayable.balance != 0,
            )
        )
        identity_ok = True
        for pay, supplier in query.order_by(FinancePayable.due_date.nulls_last(), FinancePayable.created_at).all():
            created = pay.created_at.date() if pay.created_at else as_of_date
            bucket = aging_bucket(pay.due_date, as_of_date, created)
            amount = money(pay.amount)
            paid = money(pay.amount_paid)
            balance = money(pay.balance)
            ident = outstanding_identity(amount, paid, balance)
            if not ident["ok"]:
                identity_ok = False
            amount_total += amount
            paid_total += paid
            outstanding_total += balance
            bucket_totals[bucket] = money(bucket_totals[bucket] + balance)
            rows_out.append(
                {
                    "id": pay.id,
                    "supplier_id": pay.supplier_id,
                    "supplier_name": supplier.name if supplier else None,
                    "reference_number": pay.reference_number,
                    "source_type": pay.source_type,
                    "source_id": pay.source_id,
                    "bill_date": created.isoformat(),
                    "due_date": pay.due_date.isoformat() if pay.due_date else None,
                    "amount": amount,
                    "amount_paid": paid,
                    "outstanding": balance,
                    "aging_bucket": bucket,
                    "aging_label": AGING_BUCKET_LABELS.get(bucket, bucket),
                    "journal_entry_id": pay.journal_entry_id,
                }
            )
        warning = None if identity_ok else "AP outstanding does not equal amount − paid on one or more rows."
        return _envelope(
            filters={"as_of": as_of_date.isoformat()},
            date_from=start,
            date_to=end,
            rows=rows_out,
            totals={
                "amount": amount_total,
                "paid": paid_total,
                "outstanding": outstanding_total,
                "buckets": {key: bucket_totals[key] for key in AGING_BUCKET_LABELS},
            },
            company_id=company_id,
            extra={"integrity": {"ok": identity_ok, "warning": warning}},
        )

    def aged_partner_balance(
        self,
        *,
        kind: str = "receivable",
        company_id: str = "default",
        as_of: Optional[date] = None,
        period_length: int = 30,
        based_on: str = "due_date",
        partner_id: Optional[str] = None,
    ) -> dict:
        """Odoo-style Aged Receivable / Aged Payable.

        One row per partner with the open balance split into At Date + four ``period_length``-day
        columns + Older, and the open documents nested under each partner. ``based_on`` picks the
        date the age is counted from: the due date (default) or the invoice/bill date. Documents
        dated after ``as_of`` are excluded; the balance shown is the current open balance.
        """
        if kind not in ("receivable", "payable"):
            raise ValueError("kind must be 'receivable' or 'payable'")
        if based_on not in ("due_date", "invoice_date"):
            raise ValueError("based_on must be 'due_date' or 'invoice_date'")
        as_of_date = as_of or date.today()
        n = max(1, min(int(period_length or 30), 365))
        columns = aged_period_columns(n)
        keys = [col["key"] for col in columns]

        if kind == "receivable":
            model, partner_model = FinanceReceivable, CommerceCustomer
            partner_col = FinanceReceivable.customer_id
        else:
            model, partner_model = FinancePayable, CommerceSupplier
            partner_col = FinancePayable.supplier_id

        query = (
            self._db.query(model, partner_model)
            .outerjoin(partner_model, partner_model.id == partner_col)
            .filter(
                model.company_id == company_id,
                model.status.in_(("open", "partial")),
                model.balance != 0,
            )
        )
        if partner_id:
            query = query.filter(partner_col == partner_id)

        partners: dict[str, dict] = {}
        grand = {key: ZERO for key in keys}
        grand_total = ZERO
        identity_ok = True
        for doc, partner in query.order_by(model.due_date.nulls_last(), model.created_at).all():
            doc_date = _document_date(doc.created_at, doc.due_date, as_of_date)
            if doc_date > as_of_date:
                continue
            base = doc.due_date if based_on == "due_date" else doc_date
            bucket = aged_period_bucket(base or doc_date, as_of_date, n)
            amount = money(doc.amount)
            paid = money(doc.amount_paid)
            balance = money(doc.balance)
            if not outstanding_identity(amount, paid, balance)["ok"]:
                identity_ok = False
            pid = doc.customer_id if kind == "receivable" else doc.supplier_id
            row = partners.get(pid)
            if row is None:
                row = {
                    "partner_id": pid,
                    "partner_name": (partner.name if partner else None) or "Unknown partner",
                    "buckets": {key: ZERO for key in keys},
                    "total": ZERO,
                    "lines": [],
                }
                partners[pid] = row
            row["buckets"][bucket] = money(row["buckets"][bucket] + balance)
            row["total"] = money(row["total"] + balance)
            grand[bucket] = money(grand[bucket] + balance)
            grand_total = money(grand_total + balance)
            row["lines"].append(
                {
                    "id": doc.id,
                    "reference": doc.invoice_number if kind == "receivable" else doc.reference_number,
                    "source_type": doc.source_type,
                    "source_id": doc.source_id,
                    "invoice_date": doc_date.isoformat(),
                    "due_date": doc.due_date.isoformat() if doc.due_date else None,
                    "days_overdue": max(0, (as_of_date - (base or doc_date)).days),
                    "amount": amount,
                    "amount_paid": paid,
                    "outstanding": balance,
                    "bucket": bucket,
                    "journal_entry_id": doc.journal_entry_id,
                }
            )

        rows_out = sorted(partners.values(), key=lambda r: (r["partner_name"] or "").lower())
        label = "AR" if kind == "receivable" else "AP"
        warning = None if identity_ok else f"{label} outstanding does not equal amount − paid on one or more rows."
        return _envelope(
            filters={
                "as_of": as_of_date.isoformat(),
                "period_length": n,
                "based_on": based_on,
                "partner_id": partner_id,
                "kind": kind,
                "columns": columns,
            },
            date_from=as_of_date,
            date_to=as_of_date,
            rows=rows_out,
            totals={
                "buckets": grand,
                "total": grand_total,
                "not_due": grand["at_date"],
                "overdue": money(grand_total - grand["at_date"]),
                "partner_count": len(rows_out),
                "document_count": sum(len(r["lines"]) for r in rows_out),
            },
            company_id=company_id,
            extra={"integrity": {"ok": identity_ok, "warning": warning}},
        )

    def tax_summary(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> dict:
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        output_account = self._finance._account_by_code(company_id, OUTPUT_TAX_CODE)
        input_account = self._finance._account_by_code(company_id, INPUT_TAX_CODE)

        def _tax_amount(account_id: str, *, output: bool) -> tuple[Decimal, list]:
            grouped = (
                self._db.query(
                    FinanceJournalEntry.source_type,
                    func.coalesce(func.sum(FinanceJournalLine.debit), 0),
                    func.coalesce(func.sum(FinanceJournalLine.credit), 0),
                )
                .join(FinanceJournalLine, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
                .filter(
                    FinanceJournalEntry.company_id == company_id,
                    FinanceJournalEntry.status == "posted",
                    FinanceJournalEntry.entry_date >= start,
                    FinanceJournalEntry.entry_date <= end,
                    FinanceJournalLine.account_id == account_id,
                )
                .group_by(FinanceJournalEntry.source_type)
                .all()
            )
            total = ZERO
            breakdown = []
            for source_type, debit, credit in grouped:
                amount = money(credit - debit) if output else money(debit - credit)
                if amount == ZERO:
                    continue
                total += amount
                breakdown.append(
                    {
                        "source_type": source_type,
                        "source_label": SOURCE_TYPE_LABELS.get(source_type, source_type),
                        "amount": amount,
                    }
                )
            return money(total), breakdown

        output_total, output_rows = _tax_amount(output_account.id, output=True)
        input_total, input_rows = _tax_amount(input_account.id, output=False)
        net = money(output_total - input_total)
        return _envelope(
            filters={},
            date_from=start,
            date_to=end,
            rows=[
                {"kind": "output_tax", "account_code": OUTPUT_TAX_CODE, "amount": output_total, "sources": output_rows},
                {"kind": "input_tax", "account_code": INPUT_TAX_CODE, "amount": input_total, "sources": input_rows},
            ],
            totals={
                "output_tax_total": output_total,
                "input_tax_total": input_total,
                "net_tax_payable": net,
            },
            company_id=company_id,
        )

    def expense_by_cost_center(
        self,
        *,
        company_id: str = "default",
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        account_id: Optional[str] = None,
    ) -> dict:
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        self._finance.ensure_cost_centers(company_id)
        query = (
            self._db.query(
                FinanceJournalLine.cost_center_id,
                FinanceJournalLine.account_id,
                func.coalesce(func.sum(FinanceJournalLine.debit), 0),
                func.coalesce(func.sum(FinanceJournalLine.credit), 0),
            )
            .join(FinanceJournalEntry, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
            .join(FinanceAccount, FinanceJournalLine.account_id == FinanceAccount.id)
            .filter(
                FinanceJournalEntry.company_id == company_id,
                FinanceJournalEntry.status == "posted",
                FinanceAccount.account_type == "expense",
                FinanceJournalEntry.entry_date >= start,
                FinanceJournalEntry.entry_date <= end,
            )
        )
        if account_id:
            query = query.filter(FinanceJournalLine.account_id == account_id)
        grouped = query.group_by(FinanceJournalLine.cost_center_id, FinanceJournalLine.account_id).all()
        accounts = {row.id: row for row in self._accounts(company_id)}
        centers = {row.id: row for row in self._finance.list_cost_centers(company_id, include_inactive=True)}
        rows = []
        total_debit = ZERO
        total_credit = ZERO
        for cost_center_id, acc_id, debit, credit in grouped:
            debit_m = money(debit)
            credit_m = money(credit)
            if debit_m == ZERO and credit_m == ZERO:
                continue
            account = accounts.get(acc_id)
            center = centers.get(cost_center_id) if cost_center_id else None
            total_debit += debit_m
            total_credit += credit_m
            rows.append(
                {
                    "cost_center_id": cost_center_id,
                    "cost_center_code": center.code if center else None,
                    "cost_center_name": center.name if center else "Unallocated",
                    "account_id": acc_id,
                    "account_code": account.code if account else None,
                    "account_name": account.name if account else None,
                    "debit": debit_m,
                    "credit": credit_m,
                    "net": money(debit_m - credit_m),
                }
            )
        rows.sort(key=lambda row: (row["cost_center_code"] or "zzz", row["account_code"] or ""))
        return _envelope(
            filters={"account_id": account_id},
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "total_debit": money(total_debit),
                "total_credit": money(total_credit),
                "net": money(total_debit - total_credit),
            },
            company_id=company_id,
        )

    def concern_accounts(
        self,
        *,
        company_id: str = "default",
        cost_center_id: str,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> dict:
        """Shared CoA with this concern's journal activity only (not a separate set of books)."""
        start, end = _period(date_from, date_to)
        self._finance.ensure_accounts(company_id)
        self._finance.ensure_cost_centers(company_id)
        center = self._finance.get_cost_center(cost_center_id, company_id=company_id)
        totals_by_id = self._account_period_totals(
            company_id, date_from=start, date_to=end, cost_center_id=center.id
        )
        rows = []
        total_debit = ZERO
        total_credit = ZERO
        for account in self._accounts(company_id):
            debit, credit = totals_by_id.get(account.id, (ZERO, ZERO))
            total_debit += debit
            total_credit += credit
            rows.append(
                {
                    "account_id": account.id,
                    "account_code": account.code,
                    "account_name": account.name,
                    "account_type": account.account_type,
                    "parent_id": account.parent_id,
                    "debit": debit,
                    "credit": credit,
                    "net": money(debit - credit),
                }
            )
        return _envelope(
            filters={
                "cost_center_id": center.id,
                "cost_center_code": center.code,
                "cost_center_name": center.name,
            },
            date_from=start,
            date_to=end,
            rows=rows,
            totals={
                "total_debit": money(total_debit),
                "total_credit": money(total_credit),
                "net": money(total_debit - total_credit),
            },
            company_id=company_id,
        )
