from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.finance import FinanceAccount, FinanceJournalEntry, FinancePaymentAccount
from app.models.finance_master import FinanceBank, FinanceBankBranch, FinanceOpeningBatch
from app.schemas.finance_master import (
    BankBranchRead,
    BankBranchSave,
    BankListResponse,
    BankRead,
    BankResponse,
    BankSave,
    OpeningBatchListResponse,
    OpeningBatchRead,
    OpeningBatchResponse,
    OpeningBatchSave,
    OpeningLineRead,
)
from app.services.finance import master_service as masters
from app.services.finance.finance_service import FinanceService

router = APIRouter(prefix="/finance", tags=["finance-masters"])
ZERO = Decimal("0")


def _actor(user: AuthUser) -> str:
    return getattr(user, "email", None) or str(user.id)


def _branch_read(row: FinanceBankBranch) -> BankBranchRead:
    return BankBranchRead(
        id=row.id, bank_id=row.bank_id, name=row.name, routing_number=row.routing_number, address=row.address, phone=row.phone,
        is_active=row.is_active,
    )


def _bank_reads(db: Session, company_id: str, banks: list[FinanceBank]) -> list[BankRead]:
    by_bank: dict[str, list[FinanceBankBranch]] = {}
    for branch in masters.branches(db, [b.id for b in banks]):
        by_bank.setdefault(branch.bank_id, []).append(branch)
    branch_bank = {br.id: br.bank_id for rows in by_bank.values() for br in rows}
    accounts: dict[str, int] = {}
    for (branch_id,) in db.query(FinancePaymentAccount.bank_branch_id).filter(
        FinancePaymentAccount.company_id == company_id, FinancePaymentAccount.bank_branch_id.isnot(None)
    ):
        bank_id = branch_bank.get(branch_id)
        if bank_id:
            accounts[bank_id] = accounts.get(bank_id, 0) + 1
    return [
        BankRead(
            id=b.id, name=b.name, short_name=b.short_name, swift_code=b.swift_code, is_active=b.is_active,
            branches=[_branch_read(br) for br in by_bank.get(b.id, [])], account_count=accounts.get(b.id, 0),
        )
        for b in banks
    ]


# ── banks and branches ───────────────────────────────────────────────────────


@router.get("/banks", response_model=BankListResponse)
def list_banks(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> BankListResponse:
    rows = masters.list_banks(db, company_id)
    db.commit()
    return BankListResponse(data=_bank_reads(db, company_id, rows))


@router.post("/banks", response_model=BankResponse, status_code=201)
def create_bank(
    payload: BankSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> BankResponse:
    masters.ensure_banks(db, company_id)
    bank = masters.save_bank(db, company_id, **payload.model_dump(exclude_unset=True))
    db.commit()
    return BankResponse(data=_bank_reads(db, company_id, [bank])[0])


@router.patch("/banks/{bank_id}", response_model=BankResponse)
def update_bank(
    bank_id: str,
    payload: BankSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> BankResponse:
    bank = masters.save_bank(db, company_id, bank=masters.get_bank(db, bank_id, company_id), **payload.model_dump(exclude_unset=True))
    db.commit()
    return BankResponse(data=_bank_reads(db, company_id, [bank])[0])


@router.post("/banks/{bank_id}/branches", response_model=BankResponse, status_code=201)
def create_branch(
    bank_id: str,
    payload: BankBranchSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> BankResponse:
    masters.save_branch(db, company_id, bank_id=bank_id, **payload.model_dump(exclude_unset=True))
    db.commit()
    return BankResponse(data=_bank_reads(db, company_id, [masters.get_bank(db, bank_id, company_id)])[0])


@router.patch("/bank-branches/{branch_id}", response_model=BankResponse)
def update_branch(
    branch_id: str,
    payload: BankBranchSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> BankResponse:
    branch = masters.get_branch(db, branch_id, company_id)
    masters.save_branch(db, company_id, bank_id=branch.bank_id, branch=branch, **payload.model_dump(exclude_unset=True))
    db.commit()
    return BankResponse(data=_bank_reads(db, company_id, [masters.get_bank(db, branch.bank_id, company_id)])[0])


# ── opening balances ─────────────────────────────────────────────────────────


def _batch_read(db: Session, batch: FinanceOpeningBatch) -> OpeningBatchRead:
    lines = masters.batch_lines(db, batch.id)
    accounts = {a.id: a for a in db.query(FinanceAccount).filter(FinanceAccount.id.in_([l.account_id for l in lines])).all()} if lines else {}
    total_dr = sum((l.debit for l in lines), ZERO)
    total_cr = sum((l.credit for l in lines), ZERO)
    entry = db.get(FinanceJournalEntry, batch.journal_entry_id) if batch.journal_entry_id else None
    return OpeningBatchRead(
        id=batch.id,
        as_of_date=batch.as_of_date,
        note=batch.note,
        status=batch.status,
        total_debit=total_dr,
        total_credit=total_cr,
        difference=total_dr - total_cr,
        journal_entry_id=batch.journal_entry_id,
        journal_entry_number=entry.entry_number if entry else None,
        created_by=batch.created_by,
        finalized_by=batch.finalized_by,
        finalized_at=batch.finalized_at,
        created_at=batch.created_at,
        lines=[
            OpeningLineRead(
                id=l.id,
                account_id=l.account_id,
                account_code=accounts[l.account_id].code if l.account_id in accounts else None,
                account_name=accounts[l.account_id].name if l.account_id in accounts else None,
                debit=l.debit,
                credit=l.credit,
                cost_center_id=l.cost_center_id,
                description=l.description,
            )
            for l in lines
        ],
    )


@router.get("/opening-balances", response_model=OpeningBatchListResponse)
def list_opening_batches(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> OpeningBatchListResponse:
    rows = (
        db.query(FinanceOpeningBatch)
        .filter(FinanceOpeningBatch.company_id == company_id)
        .order_by(FinanceOpeningBatch.as_of_date.desc(), FinanceOpeningBatch.created_at.desc())
        .all()
    )
    return OpeningBatchListResponse(
        data=[_batch_read(db, row) for row in rows], restricted=masters.opening_restricted_codes(db, company_id)
    )


@router.post("/opening-balances", response_model=OpeningBatchResponse, status_code=201)
def create_opening_batch(
    payload: OpeningBatchSave,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> OpeningBatchResponse:
    batch = masters.save_batch(
        db, company_id, batch=None, as_of_date=payload.as_of_date, note=payload.note,
        lines=[l.model_dump() for l in payload.lines], actor=_actor(user),
    )
    db.commit()
    return OpeningBatchResponse(data=_batch_read(db, batch))


@router.put("/opening-balances/{batch_id}", response_model=OpeningBatchResponse)
def update_opening_batch(
    batch_id: str,
    payload: OpeningBatchSave,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OpeningBatchResponse:
    batch = masters.save_batch(
        db, company_id, batch=masters.get_batch(db, batch_id, company_id), as_of_date=payload.as_of_date, note=payload.note,
        lines=[l.model_dump() for l in payload.lines], actor=_actor(user),
    )
    db.commit()
    return OpeningBatchResponse(data=_batch_read(db, batch))


@router.delete("/opening-balances/{batch_id}", status_code=204)
def delete_opening_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    masters.delete_batch(db, masters.get_batch(db, batch_id, company_id))
    db.commit()


@router.post("/opening-balances/{batch_id}/finalize", response_model=OpeningBatchResponse)
def finalize_opening_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "approve")),
    company_id: str = Depends(get_current_company_id),
) -> OpeningBatchResponse:
    """Post the batch (one journal on its date; the difference to Opening Balance Equity) and lock it for good."""
    batch = masters.finalize_batch(db, FinanceService(db), masters.get_batch(db, batch_id, company_id), actor=_actor(user))
    db.commit()
    return OpeningBatchResponse(data=_batch_read(db, batch))
