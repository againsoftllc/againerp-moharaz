"""Shared finance transaction engine — foundation only, extends Purchase/Sales/POS."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case, func, or_, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.finance import (
    FinanceAccount,
    FinanceAllocationRule,
    FinanceAllocationRuleLine,
    FinanceCostCenter,
    FinanceExpense,
    FinanceExpenseCategory,
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.models.pos import PosCart, PosCashMovement, PosPayment, PosReturn
from app.models.purchase_order import PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine
from app.models.sales import SalesInvoice, SalesOrder
from app.models.commerce_supplier import CommerceSupplier
from app.services.finance.allocation import (
    AllocationError,
    AllocationInputLine,
    OverrideLine,
    allocate,
    apply_override,
    build_expense_payment_lines,
    result_lines_from_snapshot,
    snapshot_dict,
)
from app.services.finance.constants import (
    ACCOUNT_TYPES,
    ALLOCATION_METHODS,
    DEFAULT_ACCOUNTS,
    DEFAULT_COST_CENTERS,
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_PAYMENT_ACCOUNTS,
    EXPENSE_ACCOUNT_CODE,
    PAYABLE_STATUSES,
    PAYMENT_ACCOUNT_KIND_TO_GL_CODE,
    PAYMENT_METHOD_TO_ACCOUNT_KIND,
    RECEIVABLE_STATUSES,
    SOURCE_TYPE_LABELS,
    SOURCE_TYPES,
)
from app.services.finance.posting import build_ar_invoice_lines, build_payment_transfer_lines, money
from app.services.core.sequence_service import next_number as allocate_number
from app.services.finance.period_service import assert_period_open

logger = logging.getLogger(__name__)
_UNSET = object()


def ensure_finance_payment_account_columns() -> None:
    """Additive column bootstrap — existing ensure_* pattern, no new ledger tables."""
    statements = [
        "ALTER TABLE finance_payments ADD COLUMN IF NOT EXISTS payment_account_id VARCHAR(36)",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS payment_account_id VARCHAR(36)",
        "ALTER TABLE finance_payments ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE",
        "ALTER TABLE finance_receivables ADD COLUMN IF NOT EXISTS posting_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE finance_receivables ADD COLUMN IF NOT EXISTS posting_error TEXT",
        "ALTER TABLE finance_payables ADD COLUMN IF NOT EXISTS posting_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE finance_payables ADD COLUMN IF NOT EXISTS posting_error TEXT",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
        conn.execute(
            text(
                "UPDATE finance_receivables SET posting_status = 'posted' "
                "WHERE journal_entry_id IS NOT NULL AND (posting_status IS NULL OR posting_status = 'pending')"
            )
        )
        conn.execute(
            text(
                "UPDATE finance_payables SET posting_status = 'posted' "
                "WHERE journal_entry_id IS NOT NULL AND (posting_status IS NULL OR posting_status = 'pending')"
            )
        )


def ensure_finance_project_link_columns() -> None:
    """Optional CRM-project link on payments/receivables/expenses — additive, no new tables."""
    statements = [
        "ALTER TABLE finance_payments ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES crm_projects(id) ON DELETE SET NULL",
        "ALTER TABLE finance_receivables ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES crm_projects(id) ON DELETE SET NULL",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES crm_projects(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_finance_payments_project_id ON finance_payments (project_id)",
        "CREATE INDEX IF NOT EXISTS ix_finance_receivables_project_id ON finance_receivables (project_id)",
        "CREATE INDEX IF NOT EXISTS ix_finance_expenses_project_id ON finance_expenses (project_id)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_finance_expense_party_link_column() -> None:
    """Optional Customer/Supplier/Vendor party link on expenses — additive, no new tables."""
    statements = [
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS party_id VARCHAR(36) REFERENCES parties(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_finance_expenses_party_id ON finance_expenses (party_id)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_finance_expense_allocation_columns() -> None:
    """Additive columns for cost-center allocation — no Alembic."""
    statements = [
        "ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS cost_center_id VARCHAR(36)",
        "CREATE INDEX IF NOT EXISTS ix_finance_journal_lines_cost_center_id ON finance_journal_lines (cost_center_id)",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS account_id VARCHAR(36)",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS allocation_rule_id VARCHAR(36)",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS allocation_method VARCHAR(20)",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS allocation_json TEXT",
        "ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS allocation_overridden BOOLEAN DEFAULT FALSE",
        "CREATE INDEX IF NOT EXISTS ix_finance_expenses_account_id ON finance_expenses (account_id)",
        "CREATE INDEX IF NOT EXISTS ix_finance_expenses_allocation_rule_id ON finance_expenses (allocation_rule_id)",
        "UPDATE finance_expenses SET allocation_overridden = FALSE WHERE allocation_overridden IS NULL",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


class FinanceService:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Chart of accounts ────────────────────────────────────────────────────

    def ensure_accounts(self, company_id: str = "default") -> list[FinanceAccount]:
        existing = {
            row.code: row
            for row in self._db.query(FinanceAccount).filter(FinanceAccount.company_id == company_id).all()
        }
        created: list[FinanceAccount] = []
        for spec in DEFAULT_ACCOUNTS:
            if spec["code"] in existing:
                continue
            account = FinanceAccount(
                company_id=company_id,
                code=spec["code"],
                name=spec["name"],
                account_type=spec["account_type"],
                is_system=True,
            )
            self._db.add(account)
            created.append(account)
        if created:
            self._db.flush()
            for account in created:
                existing[account.code] = account
        for spec in DEFAULT_ACCOUNTS:
            parent_code = spec.get("parent_code")
            if not parent_code:
                continue
            child = existing.get(spec["code"])
            parent = existing.get(parent_code)
            if child and parent and child.parent_id != parent.id:
                child.parent_id = parent.id
        self._db.flush()
        return list(existing.values())

    def list_accounts(self, company_id: str = "default", *, include_inactive: bool = False) -> list[FinanceAccount]:
        self.ensure_accounts(company_id)
        query = self._db.query(FinanceAccount).filter(FinanceAccount.company_id == company_id)
        if not include_inactive:
            query = query.filter(FinanceAccount.is_active.is_(True))
        return self._sort_accounts_tree(query.all())

    def _sort_accounts_tree(self, rows: list[FinanceAccount]) -> list[FinanceAccount]:
        by_parent: dict[Optional[str], list[FinanceAccount]] = {}
        ids = {row.id for row in rows}
        for row in rows:
            parent_key = row.parent_id if row.parent_id in ids else None
            by_parent.setdefault(parent_key, []).append(row)
        for children in by_parent.values():
            children.sort(key=lambda row: row.code)
        ordered: list[FinanceAccount] = []

        def walk(parent_key: Optional[str]) -> None:
            for child in by_parent.get(parent_key, []):
                ordered.append(child)
                walk(child.id)

        walk(None)
        return ordered

    def accounts_by_id(self, company_id: str = "default") -> dict[str, FinanceAccount]:
        rows = self._db.query(FinanceAccount).filter(FinanceAccount.company_id == company_id).all()
        return {row.id: row for row in rows}

    def account_lifetime_totals(self, company_id: str = "default") -> dict[str, tuple[Decimal, Decimal]]:
        rows = (
            self._db.query(
                FinanceJournalLine.account_id,
                func.coalesce(func.sum(FinanceJournalLine.debit), 0),
                func.coalesce(func.sum(FinanceJournalLine.credit), 0),
            )
            .join(FinanceJournalEntry, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
            .filter(
                FinanceJournalEntry.company_id == company_id,
                FinanceJournalEntry.status == "posted",
            )
            .group_by(FinanceJournalLine.account_id)
            .all()
        )
        return {account_id: (money(debit), money(credit)) for account_id, debit, credit in rows}

    def get_account(self, account_id: str, *, company_id: str = "default") -> FinanceAccount:
        row = self._db.get(FinanceAccount, account_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Account not found")
        return row

    def create_account(
        self,
        *,
        company_id: str = "default",
        code: str,
        name: str,
        account_type: str,
        parent_id: Optional[str] = None,
    ) -> FinanceAccount:
        self.ensure_accounts(company_id)
        code_n = code.strip()
        name_n = name.strip()
        type_n = (account_type or "").strip().lower()
        if not code_n:
            raise HTTPException(status_code=400, detail="Account code is required")
        if type_n not in ACCOUNT_TYPES:
            raise HTTPException(status_code=400, detail="Invalid account type")
        existing = (
            self._db.query(FinanceAccount)
            .filter(FinanceAccount.company_id == company_id, FinanceAccount.code == code_n)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Account code already exists")
        row = FinanceAccount(
            company_id=company_id,
            code=code_n,
            name=name_n,
            account_type=type_n,
            is_system=False,
        )
        self._db.add(row)
        self._db.flush()
        if parent_id:
            self._set_account_parent(row, parent_id)
        self._db.flush()
        return row

    def update_account(
        self,
        row: FinanceAccount,
        *,
        name: Optional[str] = None,
        account_type: Optional[str] = None,
        parent_id: object = _UNSET,
        is_active: Optional[bool] = None,
    ) -> FinanceAccount:
        if name is not None:
            row.name = name.strip()
        if account_type is not None:
            type_n = account_type.strip().lower()
            if type_n not in ACCOUNT_TYPES:
                raise HTTPException(status_code=400, detail="Invalid account type")
            if row.is_system and type_n != row.account_type:
                raise HTTPException(status_code=400, detail="System account type cannot be changed")
            if type_n != row.account_type:
                posted = (
                    self._db.query(FinanceJournalLine.id)
                    .join(FinanceJournalEntry, FinanceJournalLine.journal_entry_id == FinanceJournalEntry.id)
                    .filter(
                        FinanceJournalLine.account_id == row.id,
                        FinanceJournalEntry.status == "posted",
                    )
                    .first()
                )
                if posted:
                    raise HTTPException(status_code=400, detail="Cannot change type of an account with posted activity")
                row.account_type = type_n
        if parent_id is not _UNSET:
            self._set_account_parent(row, parent_id if isinstance(parent_id, str) and parent_id else None)
        if is_active is not None:
            if row.is_system and not is_active:
                raise HTTPException(status_code=400, detail="System accounts cannot be deactivated")
            row.is_active = is_active
        self._db.flush()
        return row

    def _set_account_parent(self, row: FinanceAccount, parent_id: Optional[str]) -> None:
        if not parent_id:
            row.parent_id = None
            return
        if parent_id == row.id:
            raise HTTPException(status_code=400, detail="Account cannot be its own parent")
        parent = self._db.get(FinanceAccount, parent_id)
        if not parent or parent.company_id != row.company_id:
            raise HTTPException(status_code=400, detail="Parent account not found")
        if parent.account_type != row.account_type:
            raise HTTPException(status_code=400, detail="Parent must be the same account type")
        if self._account_is_descendant(row.id, parent_id, row.company_id):
            raise HTTPException(status_code=400, detail="Parent cannot be a child of this account")
        row.parent_id = parent.id

    def _account_is_descendant(self, ancestor_id: str, candidate_id: str, company_id: str) -> bool:
        by_id = self.accounts_by_id(company_id)
        seen: set[str] = set()
        current = by_id.get(candidate_id)
        while current and current.parent_id:
            if current.parent_id in seen:
                return False
            if current.parent_id == ancestor_id:
                return True
            seen.add(current.parent_id)
            current = by_id.get(current.parent_id)
        return False

    def _account_by_code(self, company_id: str, code: str) -> FinanceAccount:
        self.ensure_accounts(company_id)
        account = (
            self._db.query(FinanceAccount)
            .filter(FinanceAccount.company_id == company_id, FinanceAccount.code == code)
            .first()
        )
        if not account:
            raise HTTPException(status_code=500, detail=f"Finance account {code} not configured")
        return account

    def _expense_account(self, company_id: str, account_id: Optional[str]) -> FinanceAccount:
        if account_id:
            account = self._db.get(FinanceAccount, account_id)
            if not account or account.company_id != company_id:
                raise HTTPException(status_code=400, detail="Expense account not found")
            if account.account_type != "expense":
                raise HTTPException(status_code=400, detail="GL account must be an expense account")
            return account
        return self._account_by_code(company_id, EXPENSE_ACCOUNT_CODE)

    # ── Cost centers ─────────────────────────────────────────────────────────

    def ensure_cost_centers(self, company_id: str = "default") -> list[FinanceCostCenter]:
        existing = {
            row.code: row
            for row in self._db.query(FinanceCostCenter).filter(FinanceCostCenter.company_id == company_id).all()
        }
        created: list[FinanceCostCenter] = []
        for spec in DEFAULT_COST_CENTERS:
            if spec["code"] in existing:
                continue
            row = FinanceCostCenter(
                company_id=company_id,
                code=spec["code"],
                name=spec["name"],
                kind=spec.get("kind") or "concern",
            )
            self._db.add(row)
            created.append(row)
        if created:
            self._db.flush()
        return list(existing.values()) + created

    def list_cost_centers(self, company_id: str = "default", *, include_inactive: bool = False) -> list[FinanceCostCenter]:
        self.ensure_cost_centers(company_id)
        query = self._db.query(FinanceCostCenter).filter(FinanceCostCenter.company_id == company_id)
        if not include_inactive:
            query = query.filter(FinanceCostCenter.is_active.is_(True))
        return query.order_by(FinanceCostCenter.code).all()

    def get_cost_center(self, cost_center_id: str, *, company_id: str = "default") -> FinanceCostCenter:
        row = self._db.get(FinanceCostCenter, cost_center_id)
        if row and row.company_id == company_id:
            return row
        code = (cost_center_id or "").strip().upper()
        row = (
            self._db.query(FinanceCostCenter)
            .filter(FinanceCostCenter.company_id == company_id, FinanceCostCenter.code == code)
            .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Cost center not found")
        return row

    def create_cost_center(
        self,
        *,
        company_id: str = "default",
        code: str,
        name: str,
        kind: str = "concern",
        branch_id: Optional[str] = None,
        department_id: Optional[str] = None,
    ) -> FinanceCostCenter:
        self.ensure_cost_centers(company_id)
        code_n = code.strip().upper()
        existing = (
            self._db.query(FinanceCostCenter)
            .filter(FinanceCostCenter.company_id == company_id, FinanceCostCenter.code == code_n)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Cost center code already exists")
        row = FinanceCostCenter(
            company_id=company_id,
            code=code_n,
            name=name.strip(),
            kind=kind or "concern",
            branch_id=branch_id,
            department_id=department_id,
        )
        self._db.add(row)
        self._db.flush()
        return row

    def update_cost_center(
        self,
        row: FinanceCostCenter,
        *,
        name: Optional[str] = None,
        kind: Optional[str] = None,
        branch_id: Optional[str] = None,
        department_id: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> FinanceCostCenter:
        if name is not None:
            row.name = name.strip()
        if kind is not None:
            row.kind = kind
        if branch_id is not None:
            row.branch_id = branch_id or None
        if department_id is not None:
            row.department_id = department_id or None
        if is_active is not None:
            row.is_active = is_active
        self._db.flush()
        return row

    # ── Allocation rules ─────────────────────────────────────────────────────

    def list_allocation_rules(
        self, company_id: str = "default", *, include_inactive: bool = False
    ) -> list[FinanceAllocationRule]:
        query = self._db.query(FinanceAllocationRule).filter(FinanceAllocationRule.company_id == company_id)
        if not include_inactive:
            query = query.filter(FinanceAllocationRule.is_active.is_(True))
        return query.order_by(FinanceAllocationRule.name).all()

    def get_allocation_rule(self, rule_id: str, *, company_id: str = "default") -> FinanceAllocationRule:
        row = self._db.get(FinanceAllocationRule, rule_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Allocation rule not found")
        return row

    def list_allocation_rule_lines(self, rule_id: str) -> list[FinanceAllocationRuleLine]:
        return (
            self._db.query(FinanceAllocationRuleLine)
            .filter(FinanceAllocationRuleLine.rule_id == rule_id)
            .order_by(FinanceAllocationRuleLine.id)
            .all()
        )

    def _replace_rule_lines(self, rule: FinanceAllocationRule, lines: list[dict]) -> None:
        self._db.query(FinanceAllocationRuleLine).filter(FinanceAllocationRuleLine.rule_id == rule.id).delete()
        seen: set[str] = set()
        for spec in lines:
            cc_id = spec["cost_center_id"]
            if cc_id in seen:
                raise HTTPException(status_code=400, detail="Duplicate cost center on allocation lines")
            seen.add(cc_id)
            center = self.get_cost_center(cc_id, company_id=rule.company_id)
            self._db.add(
                FinanceAllocationRuleLine(
                    rule_id=rule.id,
                    cost_center_id=center.id,
                    basis_value=spec.get("basis_value") or Decimal("0"),
                    percentage=spec.get("percentage") or Decimal("0"),
                    fixed_amount=spec.get("fixed_amount") or Decimal("0"),
                )
            )
        self._db.flush()

    def create_allocation_rule(
        self,
        *,
        company_id: str,
        name: str,
        method: str,
        lines: list[dict],
        account_id: Optional[str] = None,
        unit_label: str = "",
        is_active: bool = True,
        effective_from: Optional[date] = None,
        effective_to: Optional[date] = None,
        notes: Optional[str] = None,
    ) -> FinanceAllocationRule:
        if method not in ALLOCATION_METHODS:
            raise HTTPException(status_code=400, detail="Unknown allocation method")
        if account_id:
            self._expense_account(company_id, account_id)
        rule = FinanceAllocationRule(
            company_id=company_id,
            name=name.strip(),
            account_id=account_id,
            method=method,
            unit_label=unit_label or "",
            is_active=is_active,
            effective_from=effective_from,
            effective_to=effective_to,
            notes=notes,
        )
        self._db.add(rule)
        self._db.flush()
        self._replace_rule_lines(rule, lines)
        return rule

    def update_allocation_rule(self, rule: FinanceAllocationRule, **patch) -> FinanceAllocationRule:
        lines = patch.pop("lines", None)
        if patch.get("method") and patch["method"] not in ALLOCATION_METHODS:
            raise HTTPException(status_code=400, detail="Unknown allocation method")
        if patch.get("account_id"):
            self._expense_account(rule.company_id, patch["account_id"])
        for key, value in patch.items():
            setattr(rule, key, value)
        if lines is not None:
            self._replace_rule_lines(rule, lines)
        self._db.flush()
        return rule

    def delete_allocation_rule(self, rule: FinanceAllocationRule) -> None:
        used = (
            self._db.query(FinanceExpense.id)
            .filter(FinanceExpense.allocation_rule_id == rule.id)
            .first()
        )
        if used:
            raise HTTPException(status_code=400, detail="Allocation rule is used by an expense")
        self._db.query(FinanceAllocationRuleLine).filter(FinanceAllocationRuleLine.rule_id == rule.id).delete()
        self._db.delete(rule)
        self._db.flush()

    def _input_lines_for_rule(self, rule: FinanceAllocationRule) -> list[AllocationInputLine]:
        rows = self.list_allocation_rule_lines(rule.id)
        result: list[AllocationInputLine] = []
        for row in rows:
            center = self._db.get(FinanceCostCenter, row.cost_center_id)
            if not center:
                raise HTTPException(status_code=400, detail="Cost center on rule is missing")
            result.append(
                AllocationInputLine(
                    cost_center_id=center.id,
                    cost_center_code=center.code,
                    cost_center_name=center.name,
                    is_active=center.is_active,
                    basis_value=row.basis_value or Decimal("0"),
                    percentage=row.percentage or Decimal("0"),
                    fixed_amount=row.fixed_amount or Decimal("0"),
                )
            )
        return result

    def preview_allocation(
        self,
        rule: FinanceAllocationRule,
        amount: Decimal,
        override_lines: Optional[list[dict]] = None,
    ) -> dict:
        try:
            computed = allocate(
                amount,
                rule.method,
                self._input_lines_for_rule(rule),
                rule_active=rule.is_active,
            )
            overridden = False
            if override_lines:
                computed = apply_override(
                    computed,
                    [OverrideLine(cost_center_id=r["cost_center_id"], amount=r["amount"], basis_value=r.get("basis_value")) for r in override_lines],
                    amount,
                )
                overridden = True
        except AllocationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return snapshot_dict(
            rule_id=rule.id,
            rule_name=rule.name,
            method=rule.method,
            unit_label=rule.unit_label or "",
            amount=amount,
            overridden=overridden,
            lines=computed,
        )

    def _apply_expense_allocation(
        self,
        expense: FinanceExpense,
        *,
        allocation_rule_id: Optional[str],
        account_id: Optional[str],
        override_lines: Optional[list[dict]] = None,
    ) -> None:
        expense.account_id = account_id
        if not allocation_rule_id:
            expense.allocation_rule_id = None
            expense.allocation_method = None
            expense.allocation_json = None
            expense.allocation_overridden = False
            return
        rule = self.get_allocation_rule(allocation_rule_id, company_id=expense.company_id)
        snapshot = self.preview_allocation(rule, expense.amount, override_lines)
        expense.allocation_rule_id = rule.id
        expense.allocation_method = rule.method
        expense.allocation_overridden = bool(snapshot.get("overridden"))
        expense.allocation_json = json.dumps(snapshot)
        if not expense.account_id and rule.account_id:
            expense.account_id = rule.account_id

    # ── Payment accounts (cash/bank/mobile wallet — where the money is) ───────

    def ensure_payment_accounts(self, company_id: str = "default") -> list[FinancePaymentAccount]:
        self.ensure_accounts(company_id)
        existing = {
            row.name: row
            for row in self._db.query(FinancePaymentAccount)
            .filter(FinancePaymentAccount.company_id == company_id)
            .all()
        }
        created: list[FinancePaymentAccount] = []
        for spec in DEFAULT_PAYMENT_ACCOUNTS:
            if spec["name"] in existing:
                continue
            gl_account = self._account_by_code(company_id, spec["gl_code"])
            account = FinancePaymentAccount(
                company_id=company_id,
                name=spec["name"],
                kind=spec["kind"],
                gl_account_id=gl_account.id,
                opening_balance=Decimal("0"),
                is_default=spec["is_default"],
            )
            self._db.add(account)
            created.append(account)
        if created:
            self._db.flush()
        return list(existing.values()) + created

    def _payment_account_gl_code(self, account: FinancePaymentAccount) -> str:
        gl_account = self._db.get(FinanceAccount, account.gl_account_id)
        if not gl_account:
            raise HTTPException(status_code=500, detail="Payment account is missing its GL link")
        return gl_account.code

    def get_payment_account(self, account_id: str, *, company_id: str = "default") -> FinancePaymentAccount:
        account = self._db.get(FinancePaymentAccount, account_id)
        if not account or account.company_id != company_id:
            raise HTTPException(status_code=404, detail="Payment account not found")
        return account

    def get_default_payment_account(self, company_id: str = "default") -> FinancePaymentAccount:
        self.ensure_payment_accounts(company_id)
        account = (
            self._db.query(FinancePaymentAccount)
            .filter(
                FinancePaymentAccount.company_id == company_id,
                FinancePaymentAccount.is_default.is_(True),
                FinancePaymentAccount.is_active.is_(True),
            )
            .first()
        )
        if account:
            return account
        account = (
            self._db.query(FinancePaymentAccount)
            .filter(FinancePaymentAccount.company_id == company_id, FinancePaymentAccount.is_active.is_(True))
            .order_by(FinancePaymentAccount.created_at)
            .first()
        )
        if not account:
            raise HTTPException(status_code=500, detail="No payment account configured")
        return account

    def _resolve_payment_account(
        self,
        company_id: str,
        payment_account_id: Optional[str] = None,
        *,
        method_hint: Optional[str] = None,
    ) -> FinancePaymentAccount:
        if payment_account_id:
            return self.get_payment_account(payment_account_id, company_id=company_id)
        self.ensure_payment_accounts(company_id)
        if method_hint:
            kind = PAYMENT_METHOD_TO_ACCOUNT_KIND.get(method_hint.lower())
            if kind:
                account = (
                    self._db.query(FinancePaymentAccount)
                    .filter(
                        FinancePaymentAccount.company_id == company_id,
                        FinancePaymentAccount.kind == kind,
                        FinancePaymentAccount.is_active.is_(True),
                    )
                    .first()
                )
                if account:
                    return account
        return self.get_default_payment_account(company_id)

    def list_payment_accounts_with_balance(self, company_id: str = "default") -> list[dict]:
        accounts = self.ensure_payment_accounts(company_id)
        accounts = sorted(accounts, key=lambda a: (not a.is_default, a.name))
        movement_rows = (
            self._db.query(
                FinancePayment.payment_account_id,
                func.coalesce(
                    func.sum(
                        case(
                            (FinancePayment.direction == "inbound", FinancePayment.amount),
                            else_=-FinancePayment.amount,
                        )
                    ),
                    0,
                ),
            )
            .filter(FinancePayment.company_id == company_id, FinancePayment.payment_account_id.isnot(None))
            .group_by(FinancePayment.payment_account_id)
            .all()
        )
        movements = {account_id: Decimal(str(total)) for account_id, total in movement_rows}
        gl_accounts = {a.id: a for a in self._db.query(FinanceAccount).filter(FinanceAccount.company_id == company_id).all()}

        result = []
        for account in accounts:
            gl_account = gl_accounts.get(account.gl_account_id)
            balance = account.opening_balance + movements.get(account.id, Decimal("0"))
            result.append(
                {
                    "id": account.id,
                    "company_id": account.company_id,
                    "name": account.name,
                    "kind": account.kind,
                    "gl_account_id": account.gl_account_id,
                    "gl_account_code": gl_account.code if gl_account else None,
                    "gl_account_name": gl_account.name if gl_account else None,
                    "opening_balance": account.opening_balance,
                    "balance": balance,
                    "is_active": account.is_active,
                    "is_default": account.is_default,
                    "created_at": account.created_at,
                }
            )
        return result

    def get_payment_account_balance(self, account: FinancePaymentAccount) -> Decimal:
        movement = (
            self._db.query(
                func.coalesce(
                    func.sum(
                        case(
                            (FinancePayment.direction == "inbound", FinancePayment.amount),
                            else_=-FinancePayment.amount,
                        )
                    ),
                    0,
                )
            )
            .filter(FinancePayment.company_id == account.company_id, FinancePayment.payment_account_id == account.id)
            .scalar()
        )
        return account.opening_balance + Decimal(str(movement or 0))

    def create_payment_account(
        self,
        *,
        company_id: str = "default",
        name: str,
        kind: str = "cash",
        opening_balance: Decimal = Decimal("0"),
        is_default: bool = False,
    ) -> FinancePaymentAccount:
        existing = (
            self._db.query(FinancePaymentAccount)
            .filter(FinancePaymentAccount.company_id == company_id, FinancePaymentAccount.name == name)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="A payment account with this name already exists")
        gl_code = PAYMENT_ACCOUNT_KIND_TO_GL_CODE.get(kind, "1000")
        gl_account = self._account_by_code(company_id, gl_code)
        if is_default:
            self._db.query(FinancePaymentAccount).filter(
                FinancePaymentAccount.company_id == company_id, FinancePaymentAccount.is_default.is_(True)
            ).update({"is_default": False})
        account = FinancePaymentAccount(
            company_id=company_id,
            name=name,
            kind=kind,
            gl_account_id=gl_account.id,
            opening_balance=opening_balance,
            is_default=is_default,
        )
        self._db.add(account)
        self._db.flush()
        return account

    def update_payment_account(
        self,
        account: FinancePaymentAccount,
        *,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
    ) -> FinancePaymentAccount:
        if name is not None:
            account.name = name
        if is_active is not None:
            account.is_active = is_active
        if is_default:
            self._db.query(FinancePaymentAccount).filter(
                FinancePaymentAccount.company_id == account.company_id,
                FinancePaymentAccount.id != account.id,
                FinancePaymentAccount.is_default.is_(True),
            ).update({"is_default": False})
            account.is_default = True
        elif is_default is False:
            account.is_default = False
        self._db.flush()
        return account

    def transfer_between_payment_accounts(
        self,
        *,
        company_id: str,
        from_account_id: str,
        to_account_id: str,
        amount: Decimal,
        payment_date: Optional[date] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> tuple[FinancePayment, FinancePayment]:
        if from_account_id == to_account_id:
            raise HTTPException(status_code=400, detail="Choose two different payment accounts")

        from_account = self.get_payment_account(from_account_id, company_id=company_id)
        to_account = self.get_payment_account(to_account_id, company_id=company_id)
        if not from_account.is_active:
            raise HTTPException(status_code=400, detail=f"{from_account.name} is inactive")
        if not to_account.is_active:
            raise HTTPException(status_code=400, detail=f"{to_account.name} is inactive")

        amt = money(amount)
        if amt <= money(0):
            raise HTTPException(status_code=400, detail="Transfer amount must be greater than zero")

        available = money(self.get_payment_account_balance(from_account))
        if available < amt:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance in {from_account.name} ({available} available)",
            )

        pay_date = payment_date or date.today()
        transfer_id = str(uuid.uuid4())
        description = f"Transfer {from_account.name} → {to_account.name}"
        note = (notes or "").strip() or None
        if note:
            description = f"{description} — {note}"[:255]
        ref = (reference or "").strip() or None

        entry = self._post_journal(
            company_id=company_id,
            entry_date=pay_date,
            description=description,
            source_type="payment_transfer",
            source_id=transfer_id,
            lines=build_payment_transfer_lines(
                amount=amt,
                from_gl_code=self._payment_account_gl_code(from_account),
                to_gl_code=self._payment_account_gl_code(to_account),
                description=description,
            ),
        )

        outbound = FinancePayment(
            company_id=company_id,
            payment_number=self._next_payment_number(company_id),
            payment_date=pay_date,
            amount=amt,
            payment_method=from_account.kind,
            payment_account_id=from_account.id,
            direction="outbound",
            source_type="payment_transfer",
            source_id=transfer_id,
            is_transfer=True,
            reference=ref,
            notes=note,
            journal_entry_id=entry.id,
        )
        self._db.add(outbound)
        self._db.flush()

        inbound = FinancePayment(
            company_id=company_id,
            payment_number=self._next_payment_number(company_id),
            payment_date=pay_date,
            amount=amt,
            payment_method=to_account.kind,
            payment_account_id=to_account.id,
            direction="inbound",
            source_type="payment_transfer",
            source_id=transfer_id,
            is_transfer=True,
            reference=ref,
            notes=note,
            journal_entry_id=entry.id,
        )
        self._db.add(inbound)
        self._db.flush()
        return outbound, inbound

    # ── Journal ──────────────────────────────────────────────────────────────

    def list_journal_entries(
        self,
        *,
        company_id: str = "default",
        source_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[FinanceJournalEntry], int]:
        query = self._db.query(FinanceJournalEntry).filter(FinanceJournalEntry.company_id == company_id)
        if source_type:
            query = query.filter(FinanceJournalEntry.source_type == source_type)
        total = query.count()
        rows = query.order_by(FinanceJournalEntry.entry_date.desc(), FinanceJournalEntry.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def journal_entry_totals(self, entry_ids: list[str]) -> dict[str, tuple[Decimal, Decimal]]:
        if not entry_ids:
            return {}
        rows = (
            self._db.query(
                FinanceJournalLine.journal_entry_id,
                func.coalesce(func.sum(FinanceJournalLine.debit), 0),
                func.coalesce(func.sum(FinanceJournalLine.credit), 0),
            )
            .filter(FinanceJournalLine.journal_entry_id.in_(entry_ids))
            .group_by(FinanceJournalLine.journal_entry_id)
            .all()
        )
        return {entry_id: (money(debit), money(credit)) for entry_id, debit, credit in rows}

    def get_journal_entry(self, entry_id: str, *, company_id: str = "default") -> FinanceJournalEntry:
        entry = self._db.get(FinanceJournalEntry, entry_id)
        if not entry or entry.company_id != company_id:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        return entry

    def get_journal_lines(self, entry_id: str) -> list[FinanceJournalLine]:
        return (
            self._db.query(FinanceJournalLine)
            .filter(FinanceJournalLine.journal_entry_id == entry_id)
            .order_by(FinanceJournalLine.debit.desc(), FinanceJournalLine.credit.asc(), FinanceJournalLine.id)
            .all()
        )

    def _post_journal(
        self,
        *,
        company_id: str,
        entry_date: date,
        description: str,
        source_type: str,
        source_id: str,
        lines: list[tuple],
    ) -> FinanceJournalEntry:
        existing = (
            self._db.query(FinanceJournalEntry)
            .filter(
                FinanceJournalEntry.company_id == company_id,
                FinanceJournalEntry.source_type == source_type,
                FinanceJournalEntry.source_id == source_id,
            )
            .first()
        )
        if existing:
            return existing

        # Every posting in the ERP funnels through here, so period control is
        # enforced once instead of per module.
        assert_period_open(self._db, company_id, entry_date, what=source_type.replace("_", " "))

        entry = FinanceJournalEntry(
            company_id=company_id,
            entry_number=self._next_journal_number(company_id),
            entry_date=entry_date,
            description=description,
            source_type=source_type,
            source_id=source_id,
            status="posted",
        )
        self._db.add(entry)
        self._db.flush()

        for spec in lines:
            account_code, debit, credit, desc, party_type, party_id, tax_amount = spec[:7]
            cost_center_id = spec[7] if len(spec) > 7 else None
            if money(debit) == money(0) and money(credit) == money(0):
                continue
            account = self._account_by_code(company_id, account_code)
            self._db.add(
                FinanceJournalLine(
                    journal_entry_id=entry.id,
                    account_id=account.id,
                    debit=debit,
                    credit=credit,
                    description=desc,
                    party_type=party_type,
                    party_id=party_id,
                    tax_amount=tax_amount,
                    cost_center_id=cost_center_id,
                ),
            )
        self._db.flush()
        return entry

    def list_source_types(self) -> list[dict]:
        return [{"value": value, "label": SOURCE_TYPE_LABELS.get(value, value)} for value in SOURCE_TYPES]

    def _receivable_by_source(
        self, company_id: str, source_type: str, source_id: str
    ) -> Optional[FinanceReceivable]:
        return (
            self._db.query(FinanceReceivable)
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.source_type == source_type,
                FinanceReceivable.source_id == source_id,
            )
            .first()
        )

    def _mark_receivable_posted(self, receivable: FinanceReceivable, entry: FinanceJournalEntry) -> FinanceReceivable:
        receivable.journal_entry_id = entry.id
        receivable.posting_status = "posted"
        receivable.posting_error = None
        self._db.flush()
        return receivable

    def mark_receivable_failed(self, receivable: FinanceReceivable, error: str) -> FinanceReceivable:
        receivable.posting_status = "failed"
        receivable.posting_error = (error or "Finance posting failed")[:2000]
        self._db.flush()
        return receivable

    def _ensure_ar_journal(
        self,
        receivable: FinanceReceivable,
        *,
        entry_date: date,
        description: str,
        tax: Decimal,
        revenue_description: str = "Sales revenue",
    ) -> FinanceReceivable:
        if receivable.journal_entry_id:
            if receivable.posting_status != "posted":
                receivable.posting_status = "posted"
                receivable.posting_error = None
                self._db.flush()
            return receivable

        lines = build_ar_invoice_lines(
            total=receivable.amount,
            tax=tax,
            customer_id=receivable.customer_id,
            revenue_description=revenue_description,
        )
        entry = self._post_journal(
            company_id=receivable.company_id,
            entry_date=entry_date,
            description=description,
            source_type=receivable.source_type,
            source_id=receivable.source_id,
            lines=lines,
        )
        return self._mark_receivable_posted(receivable, entry)

    def resync_sales_receivable(self, order_id: str) -> Optional[FinanceReceivable]:
        """After an invoiced order is edited, move its receivable — and the AR
        journal, via an adjusting entry — to the order's new total. Payments
        already applied stay applied; any surplus is re-spread by FIFO."""
        order = self._db.get(SalesOrder, order_id)
        if order is None:
            return None
        receivable = self._receivable_by_source(order.company_id, "sales_order", order.id)
        if receivable is None or receivable.status == "void":
            return None
        new_total = money(order.total)
        new_tax = money(order.tax_total)
        old_total = money(receivable.amount)
        old_tax = money(receivable.tax_amount)
        if new_total == old_total and new_tax == old_tax:
            return receivable

        receivable.amount = new_total
        receivable.tax_amount = new_tax
        paid = money(receivable.amount_paid)
        receivable.balance = max(new_total - paid, Decimal("0"))
        receivable.status = "paid" if receivable.balance <= 0 else ("partial" if paid > 0 else "open")
        self._db.flush()

        delta_total = new_total - old_total
        delta_tax = new_tax - old_tax
        delta_net = delta_total - delta_tax
        if receivable.journal_entry_id and delta_total != 0:
            customer_id = receivable.customer_id

            def leg(code: str, signed: Decimal, desc: str, tax: Decimal = Decimal("0")) -> tuple:
                amount = money(abs(signed))
                if signed > 0:
                    return (code, amount, Decimal("0"), desc, "customer", customer_id, tax)
                return (code, Decimal("0"), amount, desc, "customer", customer_id, tax)

            lines = [leg("1100", delta_total, "Accounts receivable adjustment")]
            if delta_net != 0:
                lines.append(leg("4000", -delta_net, "Sales revenue adjustment"))
            if delta_tax != 0:
                lines.append(leg("2210", -delta_tax, "Output tax adjustment", money(abs(delta_tax))))
            self.try_post(
                lambda: self._post_journal(
                    company_id=receivable.company_id,
                    entry_date=date.today(),
                    description=f"Invoice {receivable.invoice_number} adjusted to {new_total}",
                    source_type="receivable_adjustment",
                    source_id=str(uuid.uuid4()),
                    lines=lines,
                ),
                source_type="receivable_adjustment",
                source_id=receivable.id,
                company_id=receivable.company_id,
            )
        if order.customer_id:
            from app.services.customer.customer_ledger_service import apply_unapplied_payments

            apply_unapplied_payments(self._db, order.customer_id)
        return receivable

    def void_sales_receivable(self, order_id: str) -> Optional[FinanceReceivable]:
        """Cancelling an invoiced order: the receivable stops billing the
        customer (amount/balance 0, status void) and the AR posting is reversed
        with a mirror entry. Payments already received stay posted, so they
        show on the customer ledger as advance and settle the next open
        invoice by FIFO. Idempotent — the reversal is keyed by receivable id."""
        order = self._db.get(SalesOrder, order_id)
        if order is None:
            return None
        receivable = self._receivable_by_source(order.company_id, "sales_order", order.id)
        if receivable is None or receivable.status == "void":
            return receivable
        total = money(receivable.amount)
        tax = money(receivable.tax_amount)
        net = money(total - tax)

        receivable.amount = Decimal("0")
        receivable.amount_paid = Decimal("0")
        receivable.balance = Decimal("0")
        receivable.tax_amount = Decimal("0")
        receivable.status = "void"
        self._db.flush()

        if receivable.journal_entry_id and total != 0:
            customer_id = receivable.customer_id
            invoice_no = receivable.invoice_number
            lines = [
                ("1100", Decimal("0"), total, f"Invoice {invoice_no} voided", "customer", customer_id, Decimal("0")),
            ]
            if net != 0:
                lines.append(("4000", net, Decimal("0"), "Sales revenue reversal", "customer", customer_id, Decimal("0")))
            if tax != 0:
                lines.append(("2210", tax, Decimal("0"), "Output tax reversal", "customer", customer_id, tax))
            self.try_post(
                lambda: self._post_journal(
                    company_id=receivable.company_id,
                    entry_date=date.today(),
                    description=f"Invoice {invoice_no} voided",
                    source_type="receivable_void",
                    source_id=receivable.id,
                    lines=lines,
                ),
                source_type="receivable_void",
                source_id=receivable.id,
                company_id=receivable.company_id,
            )
        if order.customer_id:
            from app.services.customer.customer_ledger_service import apply_unapplied_payments

            apply_unapplied_payments(self._db, order.customer_id)
        return receivable

    def record_service_invoice(self, job_id: str) -> FinanceReceivable:
        from app.models.service_job import ServiceJob

        job = self._db.get(ServiceJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Service job not found")
        receivable = self._receivable_by_source(job.company_id, "service_job", job.id)
        if not receivable:
            raise HTTPException(status_code=400, detail="Service job has not been billed")
        entry_date = (job.completed_at or job.created_at or datetime.utcnow()).date()
        tax = money(receivable.tax_amount)
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"Service invoice {receivable.invoice_number}",
            tax=tax,
            revenue_description="Service revenue",
        )

    def record_rma_invoice(self, ticket_id: str) -> FinanceReceivable:
        from app.models.rma import RmaTicket

        ticket = self._db.get(RmaTicket, ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="RMA ticket not found")
        receivable = self._receivable_by_source(ticket.company_id, "rma", ticket.id)
        if not receivable:
            raise HTTPException(status_code=400, detail="RMA has not been billed")
        entry_date = (ticket.created_at or datetime.utcnow()).date()
        tax = money(receivable.tax_amount or ticket.tax_total)
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"RMA invoice {receivable.invoice_number}",
            tax=tax,
            revenue_description="RMA charges",
        )

    def record_commerce_order(self, order_id: str) -> FinanceReceivable:
        from app.models.commerce_order import CommerceOrder

        order = self._db.get(CommerceOrder, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Commerce order not found")
        receivable = self._receivable_by_source(order.company_id, "commerce_order", order.id)
        if not receivable:
            raise HTTPException(status_code=400, detail="Commerce order has no receivable")
        entry_date = (order.created_at or datetime.utcnow()).date()
        tax = money(receivable.tax_amount or getattr(order, "tax_amount", 0))
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"Storefront order {receivable.invoice_number}",
            tax=tax,
            revenue_description="Storefront sales",
        )

    def retry_posting(self, *, source_type: str, source_id: str, company_id: str = "default"):
        """Idempotent retry — never creates a second journal for the same source."""
        dispatch = {
            "sales_order": lambda: self.record_sales_invoice(source_id),
            "sales_return": lambda: self.record_sales_credit_note(source_id),
            "service_job": lambda: self.record_service_invoice(source_id),
            "rma": lambda: self.record_rma_invoice(source_id),
            "commerce_order": lambda: self.record_commerce_order(source_id),
            "purchase_receipt": lambda: self.record_purchase_receipt(source_id),
        }
        if source_type == "pos_payment":
            payment = (
                self._db.query(PosPayment).filter(PosPayment.id == source_id).first()
                if source_id
                else None
            )
            cart_id = payment.pos_cart_id if payment else source_id
            return self.record_pos_payments(cart_id)
        fn = dispatch.get(source_type)
        if not fn:
            raise HTTPException(status_code=400, detail=f"No retry handler for source type {source_type}")
        return fn()

    def get_posting_health(self, company_id: str = "default") -> dict:
        unposted_ar = (
            self._db.query(func.count(FinanceReceivable.id))
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.journal_entry_id.is_(None),
                FinanceReceivable.status != "void",
            )
            .scalar()
            or 0
        )
        failed_ar = (
            self._db.query(func.count(FinanceReceivable.id))
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.posting_status == "failed",
            )
            .scalar()
            or 0
        )
        unposted_ap = (
            self._db.query(func.count(FinancePayable.id))
            .filter(
                FinancePayable.company_id == company_id,
                FinancePayable.journal_entry_id.is_(None),
                FinancePayable.status != "void",
            )
            .scalar()
            or 0
        )
        items = (
            self._db.query(FinanceReceivable)
            .filter(
                FinanceReceivable.company_id == company_id,
                FinanceReceivable.status != "void",
                or_(
                    FinanceReceivable.journal_entry_id.is_(None),
                    FinanceReceivable.posting_status == "failed",
                ),
            )
            .order_by(FinanceReceivable.created_at.desc())
            .limit(25)
            .all()
        )
        return {
            "unposted_receivable_count": int(unposted_ar),
            "failed_posting_count": int(failed_ar),
            "unposted_payable_count": int(unposted_ap),
            "items": items,
        }

    def try_post(self, fn, *, source_type: str, source_id: str, company_id: str = "default"):
        """Run a Finance posting inside a savepoint so operational commits still succeed."""
        try:
            with self._db.begin_nested():
                return fn()
        except Exception as exc:
            logger.exception("Finance posting failed for %s %s", source_type, source_id)
            try:
                with self._db.begin_nested():
                    rec = self._receivable_by_source(company_id, source_type, source_id)
                    if rec:
                        self.mark_receivable_failed(rec, str(exc))
                    else:
                        payable = (
                            self._db.query(FinancePayable)
                            .filter(
                                FinancePayable.company_id == company_id,
                                FinancePayable.source_type == source_type,
                                FinancePayable.source_id == source_id,
                            )
                            .first()
                        )
                        if payable:
                            payable.posting_status = "failed"
                            payable.posting_error = (str(exc) or "Finance posting failed")[:2000]
                            self._db.flush()
            except Exception:
                logger.exception(
                    "Could not record finance posting failure for %s %s", source_type, source_id
                )
            return None

    # ── Integration: Purchase ────────────────────────────────────────────────

    def record_purchase_receipt(self, receipt_id: str) -> FinancePayable:
        receipt = self._db.get(PurchaseReceipt, receipt_id)
        if not receipt or receipt.status != "posted":
            raise HTTPException(status_code=400, detail="Receipt must be posted")

        existing = (
            self._db.query(FinancePayable)
            .filter(
                FinancePayable.company_id == receipt.company_id,
                FinancePayable.source_type == "purchase_receipt",
                FinancePayable.source_id == receipt.id,
            )
            .first()
        )
        if existing and existing.journal_entry_id:
            return existing

        receipt_lines = (
            self._db.query(PurchaseReceiptLine)
            .filter(PurchaseReceiptLine.purchase_receipt_id == receipt.id)
            .all()
        )
        subtotal = Decimal("0")
        tax_total = Decimal("0")
        for rline in receipt_lines:
            po_line = self._db.get(PurchaseOrderLine, rline.purchase_order_line_id)
            if not po_line or rline.quantity_received <= 0:
                continue
            qty = Decimal(rline.quantity_received)
            ordered = Decimal(po_line.quantity_ordered or 1)
            discount_per_unit = po_line.discount_amount / ordered
            net_unit = po_line.unit_cost - discount_per_unit
            line_sub = net_unit * qty
            line_tax = line_sub * po_line.tax_rate / Decimal("100")
            subtotal += line_sub
            tax_total += line_tax

        total = subtotal + tax_total
        if total <= 0:
            raise HTTPException(status_code=400, detail="Receipt has no financial value")

        entry = self._post_journal(
            company_id=receipt.company_id,
            entry_date=receipt.receipt_date,
            description=f"GRN {receipt.receipt_number}",
            source_type="purchase_receipt",
            source_id=receipt.id,
            lines=[
                ("1200", subtotal, Decimal("0"), "Inventory received", "supplier", receipt.supplier_id, Decimal("0")),
                ("1310", tax_total, Decimal("0"), "Input tax", None, None, tax_total),
                ("2100", Decimal("0"), total, "Accounts payable", "supplier", receipt.supplier_id, Decimal("0")),
            ],
        )

        if existing:
            existing.journal_entry_id = entry.id
            existing.posting_status = "posted"
            existing.posting_error = None
            self._db.flush()
            return existing

        payable = FinancePayable(
            company_id=receipt.company_id,
            supplier_id=receipt.supplier_id,
            source_type="purchase_receipt",
            source_id=receipt.id,
            reference_number=receipt.receipt_number,
            amount=total,
            amount_paid=Decimal("0"),
            balance=total,
            tax_amount=tax_total,
            due_date=receipt.receipt_date + timedelta(days=30),
            status="open",
            journal_entry_id=entry.id,
            posting_status="posted",
        )
        self._db.add(payable)
        self._db.flush()
        from app.services.supplier.supplier_ledger_service import apply_unapplied_payments

        apply_unapplied_payments(self._db, receipt.supplier_id)
        return payable

    def correct_purchase_receipt(
        self,
        receipt: PurchaseReceipt,
        *,
        delta_value: Decimal,
        correction_id: str,
        description: str,
    ) -> FinancePayable:
        """Post a correcting entry for an admin quantity-correction on an already-
        posted receipt, instead of mutating the original GRN journal entry (posted
        entries stay immutable — see _post_journal's source-dedup). Adjusts the
        linked payable's amount/balance by the same delta so AP stays in sync.
        Tax is not re-derived here — the correction is principal-value only."""
        payable = (
            self._db.query(FinancePayable)
            .filter(
                FinancePayable.company_id == receipt.company_id,
                FinancePayable.source_type == "purchase_receipt",
                FinancePayable.source_id == receipt.id,
            )
            .first()
        )
        if not payable:
            raise HTTPException(status_code=400, detail="Receipt has not been posted to Finance")
        if delta_value == 0:
            return payable

        new_amount = money(payable.amount + delta_value)
        new_balance = money(payable.balance + delta_value)
        if new_amount < 0 or new_balance < 0:
            raise HTTPException(
                status_code=400,
                detail="Correction would take the payable negative — use a Purchase Return instead",
            )

        if delta_value > 0:
            lines = [
                ("1200", delta_value, Decimal("0"), description, "supplier", receipt.supplier_id, Decimal("0")),
                ("2100", Decimal("0"), delta_value, description, "supplier", receipt.supplier_id, Decimal("0")),
            ]
        else:
            amount = abs(delta_value)
            lines = [
                ("2100", amount, Decimal("0"), description, "supplier", receipt.supplier_id, Decimal("0")),
                ("1200", Decimal("0"), amount, description, "supplier", receipt.supplier_id, Decimal("0")),
            ]
        self._post_journal(
            company_id=receipt.company_id,
            entry_date=date.today(),
            description=description,
            source_type="purchase_receipt_correction",
            source_id=correction_id,
            lines=lines,
        )
        payable.amount = new_amount
        payable.balance = new_balance
        if payable.balance <= 0:
            payable.status = "paid"
        elif payable.amount_paid > 0:
            payable.status = "partial"
        else:
            payable.status = "open"
        self._db.flush()
        return payable

    def record_purchase_document(
        self,
        *,
        company_id: str,
        supplier_id: str,
        reference_number: str,
        amount: Decimal,
        tax_amount: Decimal,
        due_date: Optional[date],
        source_type: str,
        source_id: str,
        description: Optional[str] = None,
        credit: bool = False,
    ) -> FinancePayable:
        supplier = self._db.get(CommerceSupplier, supplier_id)
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")

        existing = (
            self._db.query(FinancePayable)
            .filter(
                FinancePayable.company_id == company_id,
                FinancePayable.source_type == source_type,
                FinancePayable.source_id == source_id,
            )
            .first()
        )
        if existing:
            return existing

        total = amount
        tax = tax_amount or Decimal("0")
        net = total - tax
        if net < 0:
            raise HTTPException(status_code=400, detail="Tax cannot exceed amount")

        desc = description or f"{source_type} {reference_number}"
        if credit:
            journal_lines: list[
                tuple[str, Decimal, Decimal, Optional[str], Optional[str], Optional[str], Decimal]
            ] = [
                ("2100", total, Decimal("0"), "AP credit", "supplier", supplier_id, Decimal("0")),
                ("1200", Decimal("0"), net, "Inventory returned", "supplier", supplier_id, Decimal("0")),
            ]
            if tax > 0:
                journal_lines.append(
                    ("1310", Decimal("0"), tax, "Input tax reverse", None, None, tax)
                )
            payable_amount = -total
        else:
            journal_lines = [
                ("5000", net, Decimal("0"), "Purchases", "supplier", supplier_id, Decimal("0")),
                ("2100", Decimal("0"), total, "Accounts payable", "supplier", supplier_id, Decimal("0")),
            ]
            if tax > 0:
                journal_lines.insert(
                    1,
                    ("1310", tax, Decimal("0"), "Input tax", None, None, tax),
                )
            payable_amount = total

        entry = self._post_journal(
            company_id=company_id,
            entry_date=due_date or date.today(),
            description=desc,
            source_type=source_type,
            source_id=source_id,
            lines=journal_lines,
        )

        payable = FinancePayable(
            company_id=company_id,
            supplier_id=supplier_id,
            source_type=source_type,
            source_id=source_id,
            reference_number=reference_number,
            amount=payable_amount,
            amount_paid=Decimal("0"),
            balance=payable_amount,
            tax_amount=tax if not credit else -tax,
            due_date=due_date,
            status="open",
            journal_entry_id=entry.id,
            posting_status="posted",
        )
        self._db.add(payable)
        self._db.flush()
        from app.services.supplier.supplier_ledger_service import apply_unapplied_payments

        apply_unapplied_payments(self._db, supplier_id)
        return payable

    # ── Integration: Sales ───────────────────────────────────────────────────

    def record_sales_invoice(self, order_id: str) -> FinanceReceivable:
        order = self._db.get(SalesOrder, order_id)
        if not order or not order.invoice_number:
            raise HTTPException(status_code=400, detail="Sales order must be invoiced")

        existing = (
            self._db.query(FinanceReceivable)
            .filter(
                FinanceReceivable.company_id == order.company_id,
                FinanceReceivable.source_type == "sales_order",
                FinanceReceivable.source_id == order.id,
            )
            .first()
        )
        tax_total = money(order.tax_total)
        total = money(order.total)
        entry_date = (order.invoiced_at or datetime.utcnow()).date()
        from app.models.company import Company
        from app.services.company_invoice import due_days_of

        company = self._db.get(Company, order.company_id)
        due = entry_date + timedelta(days=due_days_of(company))
        if existing:
            return self._ensure_ar_journal(
                existing,
                entry_date=entry_date,
                description=f"Invoice {order.invoice_number}",
                tax=tax_total,
            )

        receivable = FinanceReceivable(
            company_id=order.company_id,
            customer_id=order.customer_id,
            source_type="sales_order",
            source_id=order.id,
            invoice_number=order.invoice_number,
            amount=total,
            amount_paid=Decimal("0"),
            balance=total,
            tax_amount=tax_total,
            due_date=due,
            status="open",
            posting_status="pending",
        )
        self._db.add(receivable)
        self._db.flush()
        if order.customer_id:
            from app.services.customer.customer_ledger_service import apply_unapplied_payments

            apply_unapplied_payments(self._db, order.customer_id)
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"Invoice {order.invoice_number}",
            tax=tax_total,
        )

    def record_invoice_receivable(self, invoice: SalesInvoice) -> FinanceReceivable:
        existing = self._receivable_by_source(invoice.company_id, "sales_invoice", invoice.id)
        entry_date = invoice.bill_date or datetime.utcnow().date()
        tax_total = money(invoice.tax_total)
        if existing:
            existing.amount = money(invoice.total)
            existing.balance = max(existing.amount - existing.amount_paid, Decimal("0"))
            existing.tax_amount = tax_total
            existing.due_date = invoice.due_date
            existing.project_id = invoice.project_id
            self._db.flush()
            return self._ensure_ar_journal(
                existing,
                entry_date=entry_date,
                description=f"Invoice {invoice.invoice_number}",
                tax=tax_total,
            )

        receivable = FinanceReceivable(
            company_id=invoice.company_id,
            customer_id=invoice.customer_id,
            source_type="sales_invoice",
            source_id=invoice.id,
            invoice_number=invoice.invoice_number,
            amount=money(invoice.total),
            amount_paid=Decimal("0"),
            balance=money(invoice.total),
            tax_amount=tax_total,
            due_date=invoice.due_date,
            status="open",
            posting_status="pending",
            project_id=invoice.project_id,
        )
        self._db.add(receivable)
        self._db.flush()
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"Invoice {invoice.invoice_number}",
            tax=tax_total,
        )

    def record_invoice_payment(
        self,
        invoice: SalesInvoice,
        *,
        amount: Decimal,
        payment_account_id: Optional[str] = None,
        payment_date: Optional[date] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> tuple[FinanceReceivable, FinancePayment]:
        receivable = self._receivable_by_source(invoice.company_id, "sales_invoice", invoice.id)
        if not receivable:
            raise HTTPException(status_code=400, detail="Invoice has not been posted to Finance")
        if receivable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Invoice is already settled")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be positive")
        if amount > receivable.balance:
            raise HTTPException(status_code=400, detail="Payment amount exceeds outstanding balance")

        payment_account = self._resolve_payment_account(invoice.company_id, payment_account_id)
        gl_code = self._payment_account_gl_code(payment_account)
        pay_date = payment_date or date.today()
        journal_source_id = str(uuid.uuid4())

        entry = self._post_journal(
            company_id=invoice.company_id,
            entry_date=pay_date,
            description=f"Payment received — {invoice.invoice_number}",
            source_type="receivable_settlement",
            source_id=journal_source_id,
            lines=[
                (gl_code, amount, Decimal("0"), f"Payment for {invoice.invoice_number}", "customer", invoice.customer_id, Decimal("0")),
                ("1100", Decimal("0"), amount, "AR settlement", "customer", invoice.customer_id, Decimal("0")),
            ],
        )

        payment = FinancePayment(
            company_id=invoice.company_id,
            payment_number=self._next_payment_number(invoice.company_id),
            payment_date=pay_date,
            amount=amount,
            payment_method=payment_account.kind,
            payment_account_id=payment_account.id,
            direction="inbound",
            source_type="sales_invoice",
            source_id=invoice.id,
            party_type="customer",
            party_id=invoice.customer_id,
            project_id=invoice.project_id,
            journal_entry_id=entry.id,
            reference=reference,
            notes=notes,
        )
        self._db.add(payment)
        self._apply_payment_to_receivable(receivable, amount)
        self._db.flush()
        return receivable, payment

    def list_invoice_payments(self, invoice: SalesInvoice) -> list[FinancePayment]:
        return (
            self._db.query(FinancePayment)
            .filter(
                FinancePayment.company_id == invoice.company_id,
                FinancePayment.source_type == "sales_invoice",
                FinancePayment.source_id == invoice.id,
            )
            .order_by(FinancePayment.created_at.desc())
            .all()
        )

    def record_sales_credit_note(self, return_id: str) -> FinanceReceivable:
        from app.models.sales_return import SalesReturn

        ret = self._db.get(SalesReturn, return_id)
        if not ret:
            raise HTTPException(status_code=404, detail="Sales return not found")
        existing = (
            self._db.query(FinanceReceivable)
            .filter(
                FinanceReceivable.company_id == ret.company_id,
                FinanceReceivable.source_type == "sales_return",
                FinanceReceivable.source_id == ret.id,
            )
            .first()
        )
        if existing:
            return existing

        total = money(ret.credit_amount)
        tax = money(ret.tax_amount)
        net = money(total - tax)
        if total <= 0:
            raise HTTPException(status_code=400, detail="Credit note has no value")

        journal_lines: list[
            tuple[str, Decimal, Decimal, Optional[str], Optional[str], Optional[str], Decimal]
        ] = [
            ("4200", net, Decimal("0"), "Sales returns", "customer", ret.customer_id, Decimal("0")),
            ("1100", Decimal("0"), total, "AR credit memo", "customer", ret.customer_id, Decimal("0")),
        ]
        if tax > 0:
            journal_lines.insert(
                1,
                ("2210", tax, Decimal("0"), "Output tax reverse", "customer", ret.customer_id, tax),
            )

        entry = self._post_journal(
            company_id=ret.company_id,
            entry_date=ret.return_date,
            description=f"Credit note {ret.return_number}",
            source_type="sales_return",
            source_id=ret.id,
            lines=journal_lines,
        )

        receivable = FinanceReceivable(
            company_id=ret.company_id,
            customer_id=ret.customer_id,
            source_type="sales_return",
            source_id=ret.id,
            invoice_number=ret.return_number,
            amount=-total,
            amount_paid=Decimal("0"),
            balance=-total,
            tax_amount=-tax,
            due_date=ret.return_date,
            status="open",
            journal_entry_id=entry.id,
            posting_status="posted",
        )
        self._db.add(receivable)
        self._db.flush()
        if ret.customer_id:
            from app.services.customer.customer_ledger_service import apply_unapplied_payments

            apply_unapplied_payments(self._db, ret.customer_id)
        return receivable

    def record_customer_invoice(self, receivable_id: str) -> FinanceReceivable:
        receivable = self._db.get(FinanceReceivable, receivable_id)
        if not receivable:
            raise HTTPException(status_code=404, detail="Receivable not found")
        entry_date = receivable.due_date or (
            receivable.created_at.date() if receivable.created_at else date.today()
        )
        tax = money(receivable.tax_amount)
        return self._ensure_ar_journal(
            receivable,
            entry_date=entry_date,
            description=f"Invoice {receivable.invoice_number}",
            tax=tax,
            revenue_description="Service revenue",
        )

    # ── Integration: POS ─────────────────────────────────────────────────────

    def record_pos_payments(self, cart_id: str) -> list[FinancePayment]:
        cart = self._db.get(PosCart, cart_id)
        if not cart or cart.status != "completed" or not cart.sales_order_id:
            raise HTTPException(status_code=400, detail="Completed POS cart with sales order required")

        receivable = self.record_sales_invoice(cart.sales_order_id)
        pos_payments = (
            self._db.query(PosPayment)
            .filter(PosPayment.pos_cart_id == cart.id)
            .order_by(PosPayment.created_at)
            .all()
        )
        if not pos_payments:
            return []

        recorded: list[FinancePayment] = []
        for pp in pos_payments:
            source_key = pp.id
            existing = (
                self._db.query(FinancePayment)
                .filter(
                    FinancePayment.company_id == cart.company_id,
                    FinancePayment.source_type == "pos_payment",
                    FinancePayment.source_id == source_key,
                )
                .first()
            )
            if existing:
                recorded.append(existing)
                continue

            payment_account = self._resolve_payment_account(cart.company_id, method_hint=pp.payment_method)
            gl_code = self._payment_account_gl_code(payment_account)

            entry = self._post_journal(
                company_id=cart.company_id,
                entry_date=date.today(),
                description=f"POS payment {pp.payment_method}",
                source_type="pos_payment",
                source_id=source_key,
                lines=[
                    (gl_code, pp.amount, Decimal("0"), f"Cash/card {pp.payment_method}", "customer", cart.customer_id, Decimal("0")),
                    ("1100", Decimal("0"), pp.amount, "AR settlement", "customer", cart.customer_id, Decimal("0")),
                ],
            )

            payment = FinancePayment(
                company_id=cart.company_id,
                payment_number=self._next_payment_number(cart.company_id),
                payment_date=date.today(),
                amount=pp.amount,
                payment_method=pp.payment_method,
                payment_account_id=payment_account.id,
                direction="inbound",
                source_type="pos_payment",
                source_id=source_key,
                party_type="customer",
                party_id=cart.customer_id,
                journal_entry_id=entry.id,
                reference=pp.reference,
            )
            self._db.add(payment)
            self._apply_payment_to_receivable(receivable, pp.amount)
            recorded.append(payment)

        self._db.flush()
        return recorded

    def record_pos_return(self, return_id: str) -> Optional[FinancePayment]:
        ret = self._db.get(PosReturn, return_id)
        if not ret or ret.status != "posted" or ret.refund_total <= 0:
            raise HTTPException(status_code=400, detail="Posted POS return required")
        existing = (
            self._db.query(FinancePayment)
            .filter(
                FinancePayment.company_id == ret.company_id,
                FinancePayment.source_type == "pos_return",
                FinancePayment.source_id == ret.id,
            )
            .first()
        )
        if existing:
            return existing

        payment_account = self._resolve_payment_account(ret.company_id, method_hint=ret.refund_method)
        gl_code = self._payment_account_gl_code(payment_account)
        amount = money(ret.refund_total)
        entry = self._post_journal(
            company_id=ret.company_id,
            entry_date=date.today(),
            description=f"POS return {ret.return_number}",
            source_type="pos_return",
            source_id=ret.id,
            lines=[
                ("4000", amount, Decimal("0"), f"Sales return {ret.return_number}", None, None, Decimal("0")),
                (gl_code, Decimal("0"), amount, f"Refund {ret.refund_method}", None, None, Decimal("0")),
            ],
        )
        payment = FinancePayment(
            company_id=ret.company_id,
            payment_number=self._next_payment_number(ret.company_id),
            payment_date=date.today(),
            amount=amount,
            payment_method=ret.refund_method,
            payment_account_id=payment_account.id,
            direction="outbound",
            source_type="pos_return",
            source_id=ret.id,
            party_type="customer",
            party_id=None,
            journal_entry_id=entry.id,
            reference=ret.return_number,
        )
        self._db.add(payment)
        self._db.flush()
        return payment

    def record_pos_cash_movement(self, movement_id: str) -> Optional[FinanceJournalEntry]:
        row = self._db.get(PosCashMovement, movement_id)
        if not row or row.amount <= 0:
            raise HTTPException(status_code=400, detail="POS cash movement required")
        existing = (
            self._db.query(FinanceJournalEntry)
            .filter(
                FinanceJournalEntry.company_id == row.company_id,
                FinanceJournalEntry.source_type == "pos_cash_movement",
                FinanceJournalEntry.source_id == row.id,
            )
            .first()
        )
        if existing:
            return existing

        payment_account = self._resolve_payment_account(row.company_id, method_hint="cash")
        cash_gl = self._payment_account_gl_code(payment_account)
        amount = money(row.amount)
        if row.direction == "in":
            lines = [
                (cash_gl, amount, Decimal("0"), f"POS cash in ({row.reason})", None, None, Decimal("0")),
                ("3000", Decimal("0"), amount, "Drawer / owner deposit", None, None, Decimal("0")),
            ]
            description = f"POS cash in {row.reason}"
        else:
            lines = [
                ("6000", amount, Decimal("0"), f"POS cash out ({row.reason})", None, None, Decimal("0")),
                (cash_gl, Decimal("0"), amount, "Cash drawer withdrawal", None, None, Decimal("0")),
            ]
            description = f"POS cash out {row.reason}"
        return self._post_journal(
            company_id=row.company_id,
            entry_date=date.today(),
            description=description,
            source_type="pos_cash_movement",
            source_id=row.id,
            lines=lines,
        )

    def _apply_payment_to_receivable(self, receivable: FinanceReceivable, amount: Decimal) -> None:
        receivable.amount_paid += amount
        receivable.balance = max(receivable.amount - receivable.amount_paid, Decimal("0"))
        if receivable.balance <= 0:
            receivable.status = "paid"
        elif receivable.amount_paid > 0:
            receivable.status = "partial"

    def _apply_payment_to_payable(self, payable: FinancePayable, amount: Decimal) -> None:
        payable.amount_paid += amount
        payable.balance = max(payable.amount - payable.amount_paid, Decimal("0"))
        if payable.balance <= 0:
            payable.status = "paid"
        elif payable.amount_paid > 0:
            payable.status = "partial"

    def get_receivable(self, receivable_id: str, *, company_id: str = "default") -> FinanceReceivable:
        receivable = self._db.get(FinanceReceivable, receivable_id)
        if not receivable or receivable.company_id != company_id:
            raise HTTPException(status_code=404, detail="Receivable not found")
        return receivable

    def get_payable(self, payable_id: str, *, company_id: str = "default") -> FinancePayable:
        payable = self._db.get(FinancePayable, payable_id)
        if not payable or payable.company_id != company_id:
            raise HTTPException(status_code=404, detail="Payable not found")
        return payable

    def settle_receivable(
        self,
        receivable: FinanceReceivable,
        *,
        amount: Decimal,
        payment_account_id: Optional[str] = None,
        payment_date: Optional[date] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> tuple[FinanceReceivable, FinancePayment]:
        if receivable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Receivable is already settled")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be positive")
        if amount > receivable.balance:
            raise HTTPException(status_code=400, detail="Payment amount exceeds outstanding balance")

        payment_account = self._resolve_payment_account(receivable.company_id, payment_account_id)
        gl_code = self._payment_account_gl_code(payment_account)
        pay_date = payment_date or date.today()
        source_key = str(uuid.uuid4())

        entry = self._post_journal(
            company_id=receivable.company_id,
            entry_date=pay_date,
            description=f"Payment received — {receivable.invoice_number}",
            source_type="receivable_settlement",
            source_id=source_key,
            lines=[
                (gl_code, amount, Decimal("0"), f"Payment for {receivable.invoice_number}", "customer", receivable.customer_id, Decimal("0")),
                ("1100", Decimal("0"), amount, "AR settlement", "customer", receivable.customer_id, Decimal("0")),
            ],
        )

        payment = FinancePayment(
            company_id=receivable.company_id,
            payment_number=self._next_payment_number(receivable.company_id),
            payment_date=pay_date,
            amount=amount,
            payment_method=payment_account.kind,
            payment_account_id=payment_account.id,
            direction="inbound",
            source_type="receivable_settlement",
            source_id=source_key,
            party_type="customer",
            party_id=receivable.customer_id,
            journal_entry_id=entry.id,
            reference=reference,
            notes=notes,
        )
        self._db.add(payment)
        self._apply_payment_to_receivable(receivable, amount)
        self._db.flush()
        return receivable, payment

    def settle_payable(
        self,
        payable: FinancePayable,
        *,
        amount: Decimal,
        payment_account_id: Optional[str] = None,
        payment_date: Optional[date] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> tuple[FinancePayable, FinancePayment]:
        if payable.status not in ("open", "partial"):
            raise HTTPException(status_code=400, detail="Payable is already settled")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be positive")
        if amount > payable.balance:
            raise HTTPException(status_code=400, detail="Payment amount exceeds outstanding balance")

        payment_account = self._resolve_payment_account(payable.company_id, payment_account_id)
        gl_code = self._payment_account_gl_code(payment_account)
        pay_date = payment_date or date.today()
        source_key = str(uuid.uuid4())

        entry = self._post_journal(
            company_id=payable.company_id,
            entry_date=pay_date,
            description=f"Payment sent — {payable.reference_number}",
            source_type="payable_settlement",
            source_id=source_key,
            lines=[
                ("2100", amount, Decimal("0"), "AP settlement", "supplier", payable.supplier_id, Decimal("0")),
                (gl_code, Decimal("0"), amount, f"Payment for {payable.reference_number}", "supplier", payable.supplier_id, Decimal("0")),
            ],
        )

        payment = FinancePayment(
            company_id=payable.company_id,
            payment_number=self._next_payment_number(payable.company_id),
            payment_date=pay_date,
            amount=amount,
            payment_method=payment_account.kind,
            payment_account_id=payment_account.id,
            direction="outbound",
            source_type="payable_settlement",
            source_id=source_key,
            party_type="supplier",
            party_id=payable.supplier_id,
            journal_entry_id=entry.id,
            reference=reference,
            notes=notes,
        )
        self._db.add(payment)
        self._apply_payment_to_payable(payable, amount)
        self._db.flush()
        return payable, payment

    # ── Lists ────────────────────────────────────────────────────────────────

    def list_receivables(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[FinanceReceivable], int]:
        query = self._db.query(FinanceReceivable).filter(FinanceReceivable.company_id == company_id)
        if status:
            query = query.filter(FinanceReceivable.status == status)
        if project_id:
            query = query.filter(FinanceReceivable.project_id == project_id)
        if customer_id:
            query = query.filter(FinanceReceivable.customer_id == customer_id)
        total = query.count()
        rows = query.order_by(FinanceReceivable.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def list_payables(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[FinancePayable], int]:
        query = self._db.query(FinancePayable).filter(FinancePayable.company_id == company_id)
        if status:
            query = query.filter(FinancePayable.status == status)
        total = query.count()
        rows = query.order_by(FinancePayable.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def list_payments(
        self,
        *,
        company_id: str = "default",
        project_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[FinancePayment], int]:
        query = self._db.query(FinancePayment).filter(FinancePayment.company_id == company_id)
        if project_id:
            query = query.filter(FinancePayment.project_id == project_id)
        total = query.count()
        rows = query.order_by(FinancePayment.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    # ── Dashboard & tax ──────────────────────────────────────────────────────

    def get_dashboard(self, company_id: str = "default") -> dict:
        self.ensure_accounts(company_id)

        ar_open = (
            self._db.query(func.coalesce(func.sum(FinanceReceivable.balance), 0))
            .filter(FinanceReceivable.company_id == company_id, FinanceReceivable.status.in_(("open", "partial")))
            .scalar()
        )
        ap_open = (
            self._db.query(func.coalesce(func.sum(FinancePayable.balance), 0))
            .filter(FinancePayable.company_id == company_id, FinancePayable.status.in_(("open", "partial")))
            .scalar()
        )
        payments_in = (
            self._db.query(func.coalesce(func.sum(FinancePayment.amount), 0))
            .filter(FinancePayment.company_id == company_id, FinancePayment.direction == "inbound")
            .scalar()
        )
        journal_count = (
            self._db.query(func.count(FinanceJournalEntry.id))
            .filter(FinanceJournalEntry.company_id == company_id)
            .scalar()
        )

        recent_receivables, _ = self.list_receivables(company_id=company_id, limit=5)
        recent_payables, _ = self.list_payables(company_id=company_id, limit=5)
        recent_payments, _ = self.list_payments(company_id=company_id, limit=5)
        health = self.get_posting_health(company_id)

        return {
            "receivable_balance": ar_open,
            "payable_balance": ap_open,
            "payments_inbound_total": payments_in,
            "journal_entry_count": journal_count,
            "account_count": len(self.list_accounts(company_id)),
            "unposted_receivable_count": health["unposted_receivable_count"],
            "failed_posting_count": health["failed_posting_count"],
            "unposted_payable_count": health["unposted_payable_count"],
            "recent_receivables": recent_receivables,
            "recent_payables": recent_payables,
            "recent_payments": recent_payments,
        }

    def get_tax_summary(self, company_id: str = "default") -> dict:
        output_tax = (
            self._db.query(func.coalesce(func.sum(FinanceReceivable.tax_amount), 0))
            .filter(FinanceReceivable.company_id == company_id)
            .scalar()
        )
        input_tax = (
            self._db.query(func.coalesce(func.sum(FinancePayable.tax_amount), 0))
            .filter(FinancePayable.company_id == company_id)
            .scalar()
        )
        output_tax = Decimal(str(output_tax or 0))
        input_tax = Decimal(str(input_tax or 0))
        return {
            "output_tax_total": output_tax,
            "input_tax_total": input_tax,
            "net_tax_payable": output_tax - input_tax,
        }

    # ── Expense categories ──────────────────────────────────────────────────

    def ensure_expense_categories(self, company_id: str = "default") -> list[FinanceExpenseCategory]:
        existing = {
            row.name: row
            for row in self._db.query(FinanceExpenseCategory)
            .filter(FinanceExpenseCategory.company_id == company_id)
            .all()
        }
        created: list[FinanceExpenseCategory] = []
        for name in DEFAULT_EXPENSE_CATEGORIES:
            if name in existing:
                continue
            category = FinanceExpenseCategory(company_id=company_id, name=name)
            self._db.add(category)
            created.append(category)
        if created:
            self._db.flush()
        return list(existing.values()) + created

    def list_expense_categories(
        self, company_id: str = "default", *, include_inactive: bool = False
    ) -> list[FinanceExpenseCategory]:
        self.ensure_expense_categories(company_id)
        query = self._db.query(FinanceExpenseCategory).filter(FinanceExpenseCategory.company_id == company_id)
        if not include_inactive:
            query = query.filter(FinanceExpenseCategory.is_active.is_(True))
        return query.order_by(FinanceExpenseCategory.name).all()

    def get_expense_category(self, category_id: str, *, company_id: str = "default") -> FinanceExpenseCategory:
        category = self._db.get(FinanceExpenseCategory, category_id)
        if not category or category.company_id != company_id:
            raise HTTPException(status_code=404, detail="Expense category not found")
        return category

    def create_expense_category(self, *, company_id: str = "default", name: str) -> FinanceExpenseCategory:
        existing = (
            self._db.query(FinanceExpenseCategory)
            .filter(FinanceExpenseCategory.company_id == company_id, FinanceExpenseCategory.name == name)
            .first()
        )
        if existing:
            if not existing.is_active:
                existing.is_active = True
                self._db.flush()
            return existing
        category = FinanceExpenseCategory(company_id=company_id, name=name)
        self._db.add(category)
        self._db.flush()
        return category

    def update_expense_category(
        self,
        category: FinanceExpenseCategory,
        *,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> FinanceExpenseCategory:
        if name is not None:
            category.name = name
        if is_active is not None:
            category.is_active = is_active
        self._db.flush()
        return category

    # ── Expenses ─────────────────────────────────────────────────────────────

    def list_expenses(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        category_id: Optional[str] = None,
        project_id: Optional[str] = None,
        party_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[FinanceExpense], int]:
        query = self._db.query(FinanceExpense).filter(FinanceExpense.company_id == company_id)
        if status:
            query = query.filter(FinanceExpense.status == status)
        if category_id:
            query = query.filter(FinanceExpense.category_id == category_id)
        if project_id:
            query = query.filter(FinanceExpense.project_id == project_id)
        if party_id:
            query = query.filter(FinanceExpense.party_id == party_id)
        if search:
            like = f"%{search}%"
            query = query.filter(
                (FinanceExpense.payee.ilike(like))
                | (FinanceExpense.description.ilike(like))
                | (FinanceExpense.expense_number.ilike(like))
            )
        total = query.count()
        rows = (
            query.order_by(FinanceExpense.expense_date.desc(), FinanceExpense.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_expense(self, expense_id: str, *, company_id: str = "default") -> FinanceExpense:
        expense = self._db.get(FinanceExpense, expense_id)
        if not expense or expense.company_id != company_id:
            raise HTTPException(status_code=404, detail="Expense not found")
        return expense

    def create_expense(
        self,
        *,
        company_id: str = "default",
        category_id: str,
        payee: str,
        description: str = "",
        expense_date: date,
        amount: Decimal,
        tax_amount: Decimal = Decimal("0"),
        payment_method: str = "cash",
        payment_account_id: Optional[str] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[str] = None,
        account_id: Optional[str] = None,
        allocation_rule_id: Optional[str] = None,
        override_lines: Optional[list[dict]] = None,
        party_id: Optional[str] = None,
    ) -> FinanceExpense:
        self.get_expense_category(category_id, company_id=company_id)
        if payment_account_id:
            self.get_payment_account(payment_account_id, company_id=company_id)
        if account_id:
            self._expense_account(company_id, account_id)
        expense = FinanceExpense(
            company_id=company_id,
            expense_number=self._next_expense_number(company_id),
            category_id=category_id,
            payee=payee,
            description=description,
            expense_date=expense_date,
            amount=amount,
            tax_amount=tax_amount,
            total=amount + tax_amount,
            payment_method=payment_method,
            payment_account_id=payment_account_id,
            status="draft",
            reference=reference,
            notes=notes,
            created_by=created_by,
            party_id=party_id,
        )
        self._db.add(expense)
        self._db.flush()
        self._apply_expense_allocation(
            expense,
            allocation_rule_id=allocation_rule_id,
            account_id=account_id,
            override_lines=override_lines,
        )
        return expense

    def update_expense(self, expense: FinanceExpense, **patch) -> FinanceExpense:
        if expense.status not in ("draft", "approved"):
            raise HTTPException(status_code=400, detail="Only draft or approved expenses can be edited")
        if patch.get("category_id"):
            self.get_expense_category(patch["category_id"], company_id=expense.company_id)
        allocation_rule_id = patch.pop("allocation_rule_id", _UNSET)
        account_id = patch.pop("account_id", _UNSET)
        override_lines = patch.pop("override_lines", _UNSET)
        amount_in_patch = "amount" in patch
        for key, value in patch.items():
            if value is not None:
                setattr(expense, key, value)
        expense.total = expense.amount + expense.tax_amount
        alloc_touched = allocation_rule_id is not _UNSET or account_id is not _UNSET or override_lines is not _UNSET
        if alloc_touched or amount_in_patch:
            next_rule = expense.allocation_rule_id if allocation_rule_id is _UNSET else allocation_rule_id
            next_account = expense.account_id if account_id is _UNSET else account_id
            next_override = None if override_lines is _UNSET else override_lines
            self._apply_expense_allocation(
                expense,
                allocation_rule_id=next_rule,
                account_id=next_account,
                override_lines=next_override,
            )
        self._db.flush()
        return expense

    def approve_expense(self, expense: FinanceExpense, *, actor: Optional[str] = None) -> FinanceExpense:
        if expense.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft expenses can be approved")
        expense.status = "approved"
        expense.approved_by = actor
        expense.approved_at = datetime.utcnow()
        self._db.flush()
        return expense

    def reject_expense(
        self, expense: FinanceExpense, *, actor: Optional[str] = None, note: Optional[str] = None
    ) -> FinanceExpense:
        if expense.status not in ("draft", "approved"):
            raise HTTPException(status_code=400, detail="Only draft or approved expenses can be rejected")
        expense.status = "rejected"
        expense.approved_by = actor
        expense.approved_at = datetime.utcnow()
        if note:
            expense.notes = f"{expense.notes}\n{note}" if expense.notes else note
        self._db.flush()
        return expense

    def pay_expense(
        self,
        expense: FinanceExpense,
        *,
        payment_method: str = "cash",
        payment_account_id: Optional[str] = None,
        payment_date: Optional[date] = None,
        reference: Optional[str] = None,
    ) -> FinanceExpense:
        if expense.status != "approved":
            raise HTTPException(status_code=400, detail="Expense must be approved before it can be paid")

        payment_account = self._resolve_payment_account(
            expense.company_id,
            payment_account_id or expense.payment_account_id,
            method_hint=payment_method,
        )
        gl_code = self._payment_account_gl_code(payment_account)

        pay_date = payment_date or date.today()
        account = self._expense_account(expense.company_id, expense.account_id)
        allocated = None
        if expense.allocation_json:
            try:
                snapshot = json.loads(expense.allocation_json)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Expense allocation snapshot is invalid") from exc
            allocated = result_lines_from_snapshot(snapshot)
        try:
            journal_lines = build_expense_payment_lines(
                amount=expense.amount,
                tax_amount=expense.tax_amount,
                expense_account_code=account.code,
                payment_gl_code=gl_code,
                description=expense.description or expense.payee,
                payee=expense.payee,
                allocated=allocated,
            )
        except AllocationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        entry = self._post_journal(
            company_id=expense.company_id,
            entry_date=pay_date,
            description=f"Expense {expense.expense_number} — {expense.payee}",
            source_type="expense",
            source_id=expense.id,
            lines=journal_lines,
        )

        payment = FinancePayment(
            company_id=expense.company_id,
            payment_number=self._next_payment_number(expense.company_id),
            payment_date=pay_date,
            amount=expense.total,
            payment_method=payment_method,
            payment_account_id=payment_account.id,
            direction="outbound",
            source_type="expense",
            source_id=expense.id,
            reference=reference,
            journal_entry_id=entry.id,
        )
        self._db.add(payment)
        self._db.flush()

        expense.status = "paid"
        expense.payment_method = payment_method
        expense.payment_account_id = payment_account.id
        expense.journal_entry_id = entry.id
        expense.payment_id = payment.id
        expense.paid_at = datetime.utcnow()
        self._db.flush()
        return expense

    def delete_expense(self, expense: FinanceExpense) -> None:
        if expense.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft expenses can be deleted")
        self._db.delete(expense)
        self._db.flush()

    def get_expense_summary(self, company_id: str = "default") -> dict:
        today = date.today()
        month_start = today.replace(day=1)

        month_total = (
            self._db.query(func.coalesce(func.sum(FinanceExpense.total), 0))
            .filter(
                FinanceExpense.company_id == company_id,
                FinanceExpense.expense_date >= month_start,
                FinanceExpense.status != "rejected",
            )
            .scalar()
        )
        month_paid_total = (
            self._db.query(func.coalesce(func.sum(FinanceExpense.total), 0))
            .filter(
                FinanceExpense.company_id == company_id,
                FinanceExpense.expense_date >= month_start,
                FinanceExpense.status == "paid",
            )
            .scalar()
        )
        pending = (
            self._db.query(func.count(FinanceExpense.id), func.coalesce(func.sum(FinanceExpense.total), 0))
            .filter(FinanceExpense.company_id == company_id, FinanceExpense.status.in_(("draft", "approved")))
            .first()
        )
        by_category_rows = (
            self._db.query(
                FinanceExpenseCategory.id,
                FinanceExpenseCategory.name,
                func.coalesce(func.sum(FinanceExpense.total), 0),
            )
            .join(FinanceExpense, FinanceExpense.category_id == FinanceExpenseCategory.id)
            .filter(
                FinanceExpense.company_id == company_id,
                FinanceExpense.expense_date >= month_start,
                FinanceExpense.status != "rejected",
            )
            .group_by(FinanceExpenseCategory.id, FinanceExpenseCategory.name)
            .order_by(func.sum(FinanceExpense.total).desc())
            .all()
        )

        return {
            "month_total": Decimal(str(month_total or 0)),
            "month_paid_total": Decimal(str(month_paid_total or 0)),
            "pending_count": pending[0] if pending else 0,
            "pending_amount": Decimal(str(pending[1] if pending else 0)),
            "by_category": [
                {"category_id": cid, "category_name": name, "total": Decimal(str(total or 0))}
                for cid, name, total in by_category_rows
            ],
        }

    # ── Numbering ────────────────────────────────────────────────────────────

    def _next_expense_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "finance.expense",
            initial=lambda: (
                self._db.query(func.count(FinanceExpense.id))
                .filter(FinanceExpense.company_id == company_id)
                .scalar()
                or 0
            )
            + 1,
        )

    def _next_journal_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "finance.journal",
            initial=lambda: (
                self._db.query(func.count(FinanceJournalEntry.id))
                .filter(FinanceJournalEntry.company_id == company_id)
                .scalar()
                or 0
            )
            + 1,
        )

    def _next_payment_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "finance.payment",
            initial=lambda: (
                self._db.query(func.count(FinancePayment.id))
                .filter(FinancePayment.company_id == company_id)
                .scalar()
                or 0
            )
            + 1,
        )
