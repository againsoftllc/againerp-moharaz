"""Finance masters (OnerERP roadmap §14 Phase 2, item 6 and the bank part of item 8):

- **Banks and branches** (Bank → Branch with routing number → the company's own bank account). A bank payment account names its
  branch and account number, and each new bank account gets its own GL ledger under 1010 Bank.
- **Postable accounts**: an account marked as a group takes no postings; its children do.
- **Check balance** on a cash / bank account: money cannot go out of it beyond what it holds (OnerERP CheckAccountsBalance).
- **Opening balances**: GL openings entered as a draft batch; finalizing posts one journal (the difference to 3900 Opening
  Balance Equity) and locks the batch (OnerERP IsOpeningBalanceFinalized).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.finance import FinanceAccount, FinancePaymentAccount
from app.models.finance_master import FinanceBank, FinanceBankBranch, FinanceOpeningBatch, FinanceOpeningLine
from app.services.finance.posting import money

ZERO = Decimal("0")
OPENING_EQUITY_CODE = "3900"
OPENING_SOURCE_TYPE = "opening_balance"

# Banks operating in Bangladesh: the same list the cheque bank picker uses, so names match.
SEED_BANKS = (
    "Agrani Bank", "Ansar VDP Unnayan Bank", "BASIC Bank", "Bangladesh Development Bank (BDBL)", "Bangladesh Krishi Bank",
    "Janata Bank", "Probashi Kallyan Bank", "Rajshahi Krishi Unnayan Bank (RAKUB)", "Rupali Bank", "Sonali Bank",
    "AB Bank", "Bangladesh Commerce Bank", "Bank Asia", "BRAC Bank", "Citizens Bank", "City Bank", "Community Bank Bangladesh",
    "Dhaka Bank", "Dutch-Bangla Bank", "Eastern Bank", "IFIC Bank", "Jamuna Bank", "Meghna Bank", "Mercantile Bank",
    "Midland Bank", "Modhumoti Bank", "Mutual Trust Bank", "National Bank", "National Credit & Commerce Bank (NCC)",
    "NRB Bank", "NRB Commercial Bank", "NRB Global Bank", "One Bank", "Padma Bank", "Premier Bank", "Prime Bank",
    "Pubali Bank", "South Bangla Agriculture & Commerce Bank", "Southeast Bank", "Trust Bank", "Union Bank", "Uttara Bank",
    "Al-Arafah Islami Bank", "Bengal Commercial Bank", "EXIM Bank", "First Security Islami Bank", "Global Islamic Bank",
    "ICB Islamic Bank", "Islami Bank Bangladesh", "Shahjalal Islami Bank", "Social Islami Bank", "Standard Bank",
    "Bank Alfalah", "Citibank N.A.", "Commercial Bank of Ceylon", "Habib Bank", "HSBC", "National Bank of Pakistan",
    "Standard Chartered Bank", "State Bank of India", "Woori Bank",
)


def ensure_finance_master_columns() -> None:
    """Additive columns on existing finance tables (the project's ensure_* pattern)."""
    statements = [
        "ALTER TABLE finance_accounts ADD COLUMN IF NOT EXISTS is_postable BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE finance_payment_accounts ADD COLUMN IF NOT EXISTS check_balance BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE finance_payment_accounts ADD COLUMN IF NOT EXISTS bank_branch_id VARCHAR(36)",
        "ALTER TABLE finance_payment_accounts ADD COLUMN IF NOT EXISTS account_number VARCHAR(40)",
        "ALTER TABLE finance_payment_accounts ADD COLUMN IF NOT EXISTS account_title VARCHAR(120)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


# ── account levels ───────────────────────────────────────────────────────────


def account_levels(rows: list[FinanceAccount]) -> dict[str, int]:
    """Depth of each account in the chart (1 = top)."""
    by_id = {r.id: r for r in rows}
    levels: dict[str, int] = {}

    def level(row: FinanceAccount, seen: frozenset = frozenset()) -> int:
        if row.id in levels:
            return levels[row.id]
        parent = by_id.get(row.parent_id) if row.parent_id else None
        value = 1 if parent is None or parent.id in seen else level(parent, seen | {row.id}) + 1
        levels[row.id] = value
        return value

    for row in rows:
        level(row)
    return levels


def assert_postable(account: FinanceAccount) -> None:
    if getattr(account, "is_postable", True) is False:
        raise HTTPException(
            status_code=400, detail=f"{account.code} {account.name} is a group account; post to one of its accounts instead"
        )


def set_postable(account: FinanceAccount, postable: bool) -> None:
    if not postable and account.is_system:
        raise HTTPException(status_code=400, detail="A system account must stay postable: the ERP posts to it")
    account.is_postable = postable


# ── check balance ────────────────────────────────────────────────────────────


def assert_can_pay_out(finance, account: Optional[FinancePaymentAccount], amount: Decimal) -> None:
    """Refuse money out of an account marked "check balance" beyond what it holds. `finance` is a FinanceService."""
    if account is None or not getattr(account, "check_balance", False):
        return
    available = money(finance.get_payment_account_balance(account))
    if money(amount) > available:
        raise HTTPException(
            status_code=400,
            detail=f"{account.name} holds {available:,.2f}; it cannot pay out {money(amount):,.2f} (its balance may not go below zero)",
        )


# ── banks and branches ───────────────────────────────────────────────────────


def ensure_banks(db: Session, company_id: str) -> None:
    if db.query(FinanceBank.id).filter(FinanceBank.company_id == company_id).first():
        return
    for name in SEED_BANKS:
        db.add(FinanceBank(company_id=company_id, name=name))
    db.flush()


def list_banks(db: Session, company_id: str, *, include_inactive: bool = True) -> list[FinanceBank]:
    ensure_banks(db, company_id)
    query = db.query(FinanceBank).filter(FinanceBank.company_id == company_id)
    if not include_inactive:
        query = query.filter(FinanceBank.is_active.is_(True))
    return query.order_by(func.lower(FinanceBank.name)).all()


def get_bank(db: Session, bank_id: str, company_id: str) -> FinanceBank:
    row = db.get(FinanceBank, bank_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Bank not found")
    return row


def save_bank(db: Session, company_id: str, *, bank: Optional[FinanceBank] = None, **fields) -> FinanceBank:
    name = (fields.get("name") or (bank.name if bank else "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter the bank name")
    clash = db.query(FinanceBank.id).filter(
        FinanceBank.company_id == company_id,
        func.lower(FinanceBank.name) == name.lower(),
        FinanceBank.id != (bank.id if bank else ""),
    )
    if clash.first():
        raise HTTPException(status_code=400, detail=f"{name} already exists")
    if bank is None:
        bank = FinanceBank(company_id=company_id, name=name)
        db.add(bank)
    bank.name = name
    for key in ("short_name", "swift_code"):
        if key in fields:
            setattr(bank, key, (fields[key] or "").strip() or None)
    if fields.get("is_active") is not None:
        bank.is_active = bool(fields["is_active"])
    db.flush()
    return bank


def branches(db: Session, bank_ids: list[str]) -> list[FinanceBankBranch]:
    if not bank_ids:
        return []
    return (
        db.query(FinanceBankBranch)
        .filter(FinanceBankBranch.bank_id.in_(bank_ids))
        .order_by(func.lower(FinanceBankBranch.name))
        .all()
    )


def get_branch(db: Session, branch_id: str, company_id: str) -> FinanceBankBranch:
    row = db.get(FinanceBankBranch, branch_id)
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    get_bank(db, row.bank_id, company_id)
    return row


def save_branch(
    db: Session, company_id: str, *, bank_id: str, branch: Optional[FinanceBankBranch] = None, **fields
) -> FinanceBankBranch:
    bank = get_bank(db, bank_id, company_id)
    name = (fields.get("name") or (branch.name if branch else "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter the branch name")
    clash = db.query(FinanceBankBranch.id).filter(
        FinanceBankBranch.bank_id == bank.id,
        func.lower(FinanceBankBranch.name) == name.lower(),
        FinanceBankBranch.id != (branch.id if branch else ""),
    )
    if clash.first():
        raise HTTPException(status_code=400, detail=f"{bank.name} already has a {name} branch")
    if "routing_number" in fields:
        routing = (fields["routing_number"] or "").strip()
    else:
        routing = branch.routing_number if branch else ""
    if routing and not routing.isdigit():
        raise HTTPException(status_code=400, detail="The routing number is digits only")
    if branch is None:
        branch = FinanceBankBranch(bank_id=bank.id, name=name)
        db.add(branch)
    branch.name = name
    branch.routing_number = routing or None
    for key in ("address", "phone"):
        if key in fields:
            setattr(branch, key, (fields[key] or "").strip() or None)
    if fields.get("is_active") is not None:
        branch.is_active = bool(fields["is_active"])
    db.flush()
    return branch


def next_bank_ledger(db: Session, company_id: str, finance, label: str) -> FinanceAccount:
    """A new GL ledger under 1010 Bank for one bank account (1011, 1012, ...), so each account's balance shows in the books."""
    parent = finance._account_by_code(company_id, "1010")
    taken = {
        row[0]
        for row in db.query(FinanceAccount.code)
        .filter(FinanceAccount.company_id == company_id, FinanceAccount.code.like("10%"))
        .all()
    }
    for n in range(1011, 1020):
        if str(n) not in taken:
            return finance.create_account(
                company_id=company_id, code=str(n), name=label[:120], account_type="asset", parent_id=parent.id
            )
    raise HTTPException(status_code=400, detail="No free bank ledger code left under 1010 (1011-1019); add the GL account by hand")


def bank_label(db: Session, account: FinancePaymentAccount) -> Optional[str]:
    branch_id = getattr(account, "bank_branch_id", None)
    branch = db.get(FinanceBankBranch, branch_id) if branch_id else None
    if branch is None:
        return None
    bank = db.get(FinanceBank, branch.bank_id)
    return f"{bank.name if bank else ''} · {branch.name}"


# ── opening balances ─────────────────────────────────────────────────────────


def opening_restricted_codes(db: Session, company_id: str) -> dict[str, str]:
    """GL heads whose opening comes from somewhere else, and where."""
    from app.services.finance.constants import AP_CODE, AR_CODE

    out = {
        AR_CODE: "the customers (customer opening balance)",
        AP_CODE: "the suppliers (supplier opening balance)",
        OPENING_EQUITY_CODE: "the batch itself (the difference is posted there)",
    }
    for row in db.query(FinancePaymentAccount).filter(FinancePaymentAccount.company_id == company_id).all():
        gl = db.get(FinanceAccount, row.gl_account_id)
        if gl:
            out[gl.code] = "the cash / bank account (its opening balance)"
    return out


def get_batch(db: Session, batch_id: str, company_id: str) -> FinanceOpeningBatch:
    row = db.get(FinanceOpeningBatch, batch_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Opening balance batch not found")
    return row


def batch_lines(db: Session, batch_id: str) -> list[FinanceOpeningLine]:
    return (
        db.query(FinanceOpeningLine)
        .filter(FinanceOpeningLine.batch_id == batch_id)
        .order_by(FinanceOpeningLine.line_no)
        .all()
    )


def save_batch(
    db: Session,
    company_id: str,
    *,
    batch: Optional[FinanceOpeningBatch],
    as_of_date: date,
    note: Optional[str],
    lines: list[dict],
    actor: Optional[str],
) -> FinanceOpeningBatch:
    if batch is not None and batch.status != "draft":
        raise HTTPException(status_code=400, detail="A finalized opening batch cannot be changed")
    restricted = opening_restricted_codes(db, company_id)
    seen: set[str] = set()
    clean: list[dict] = []
    for index, line in enumerate(lines, start=1):
        dr, cr = money(line.get("debit")), money(line.get("credit"))
        if dr == 0 and cr == 0:
            continue
        if dr > 0 and cr > 0:
            raise HTTPException(status_code=400, detail=f"Line {index}: enter a debit or a credit, not both")
        account = db.get(FinanceAccount, line.get("account_id"))
        if not account or account.company_id != company_id:
            raise HTTPException(status_code=400, detail=f"Line {index}: account not found")
        if account.code in restricted:
            raise HTTPException(
                status_code=400, detail=f"Line {index}: {account.code} {account.name} takes its opening from {restricted[account.code]}"
            )
        assert_postable(account)
        if account.id in seen:
            raise HTTPException(status_code=400, detail=f"Line {index}: {account.code} {account.name} is listed twice")
        seen.add(account.id)
        clean.append(
            {
                "account_id": account.id,
                "debit": dr,
                "credit": cr,
                "cost_center_id": line.get("cost_center_id") or None,
                "description": (line.get("description") or "").strip() or None,
            }
        )
    if batch is None:
        batch = FinanceOpeningBatch(company_id=company_id, as_of_date=as_of_date, created_by=actor, status="draft")
        db.add(batch)
        db.flush()
    batch.as_of_date = as_of_date
    batch.note = (note or "").strip() or None
    db.query(FinanceOpeningLine).filter(FinanceOpeningLine.batch_id == batch.id).delete(synchronize_session=False)
    for index, line in enumerate(clean):
        db.add(FinanceOpeningLine(batch_id=batch.id, line_no=index, **line))
    db.flush()
    return batch


def delete_batch(db: Session, batch: FinanceOpeningBatch) -> None:
    if batch.status != "draft":
        raise HTTPException(status_code=400, detail="A finalized opening batch cannot be deleted; post a journal to correct it")
    db.query(FinanceOpeningLine).filter(FinanceOpeningLine.batch_id == batch.id).delete(synchronize_session=False)
    db.delete(batch)
    db.flush()


def ensure_opening_equity(finance, company_id: str) -> FinanceAccount:
    existing = (
        finance._db.query(FinanceAccount)
        .filter(FinanceAccount.company_id == company_id, FinanceAccount.code == OPENING_EQUITY_CODE)
        .first()
    )
    if existing:
        return existing
    return finance.create_account(company_id=company_id, code=OPENING_EQUITY_CODE, name="Opening Balance Equity", account_type="equity")


def finalize_batch(db: Session, finance, batch: FinanceOpeningBatch, *, actor: Optional[str]) -> FinanceOpeningBatch:
    """Post the batch as one journal on its date (the period must be open) and lock it."""
    if batch.status != "draft":
        raise HTTPException(status_code=400, detail="This opening batch is already finalized")
    lines = batch_lines(db, batch.id)
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one opening balance")
    specs = []
    total_dr = total_cr = ZERO
    for line in lines:
        account = db.get(FinanceAccount, line.account_id)
        assert_postable(account)
        specs.append(
            (account.code, line.debit, line.credit, line.description or "Opening balance", None, None, ZERO, line.cost_center_id)
        )
        total_dr += money(line.debit)
        total_cr += money(line.credit)
    difference = total_dr - total_cr
    if difference != 0:
        equity = ensure_opening_equity(finance, batch.company_id)
        specs.append(
            (
                equity.code,
                ZERO if difference > 0 else -difference,
                difference if difference > 0 else ZERO,
                "Opening balance difference",
                None,
                None,
                ZERO,
            )
        )
    entry = finance._post_journal(
        company_id=batch.company_id,
        entry_date=batch.as_of_date,
        description=f"Opening balances as of {batch.as_of_date.isoformat()}",
        source_type=OPENING_SOURCE_TYPE,
        source_id=batch.id,
        lines=specs,
    )
    batch.status = "finalized"
    batch.journal_entry_id = entry.id
    batch.finalized_by = actor
    batch.finalized_at = datetime.utcnow()
    db.flush()
    return batch
