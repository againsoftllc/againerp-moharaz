from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceAccount, FinanceCostCenter, FinancePaymentAccount
from app.schemas.finance import (
    FinanceAccountCreate,
    FinanceAccountListResponse,
    FinanceAccountRead,
    FinanceAccountResponse,
    FinanceAccountUpdate,
    FinanceDashboardRead,
    FinanceDashboardResponse,
    FinanceJournalEntryResponse,
    FinanceJournalEntryRead,
    FinanceJournalLineRead,
    FinanceJournalListMeta,
    FinanceJournalListResponse,
    FinanceListMeta,
    FinancePayableListResponse,
    FinancePayableRead,
    FinancePayableResponse,
    FinancePayableFromPurchaseRequest,
    PartnerTradingRead,
    PartnerTradingResponse,
    FinancePaymentAccountCreate,
    FinancePaymentAccountListResponse,
    FinancePaymentAccountRead,
    FinancePaymentAccountResponse,
    FinancePaymentAccountTransferRequest,
    FinancePaymentAccountUpdate,
    FinancePaymentListResponse,
    FinancePaymentRead,
    FinancePostingHealthItem,
    FinancePostingHealthRead,
    FinancePostingHealthResponse,
    FinancePostingRetryRequest,
    FinanceReceivableListResponse,
    FinanceReceivableRead,
    FinanceReportResponse,
    FinanceSettlementRequest,
    FinanceSourceTypeListResponse,
    FinanceSourceTypeRead,
    FinanceTaxSummaryRead,
    FinanceTaxSummaryResponse,
)
from app.services.finance import dashboard_period_service
from app.services.finance.constants import account_normal_balance
from app.services.finance.partner_trading_service import partner_trading
from app.services.finance.finance_reports import FinanceReportService
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money

router = APIRouter(prefix="/finance", tags=["finance"])

ZERO = Decimal("0")


def _account_depth(account: FinanceAccount, by_id: dict[str, FinanceAccount]) -> int:
    depth = 0
    seen = {account.id}
    current = account
    while current.parent_id:
        if current.parent_id in seen:
            break
        parent = by_id.get(current.parent_id)
        if not parent:
            break
        seen.add(parent.id)
        depth += 1
        current = parent
    return depth


def _account_read(
    account: FinanceAccount,
    *,
    by_id: Optional[dict[str, FinanceAccount]] = None,
    totals: Optional[dict[str, tuple[Decimal, Decimal]]] = None,
) -> FinanceAccountRead:
    parent = (by_id or {}).get(account.parent_id) if account.parent_id else None
    debit, credit = (totals or {}).get(account.id, (ZERO, ZERO))
    nature = account_normal_balance(account.account_type, account.code)
    net = money(debit - credit) if nature == "debit" else money(credit - debit)
    if net >= ZERO:
        balance_side = nature
        balance = net
    else:
        balance_side = "credit" if nature == "debit" else "debit"
        balance = money(-net)
    return FinanceAccountRead(
        id=account.id,
        company_id=account.company_id,
        code=account.code,
        name=account.name,
        account_type=account.account_type,
        parent_id=account.parent_id,
        parent_code=parent.code if parent else None,
        is_system=account.is_system,
        is_active=account.is_active,
        nature=nature,
        debit=debit,
        credit=credit,
        balance=balance,
        balance_side=balance_side,
        depth=_account_depth(account, by_id or {}),
    )


def _account_reads(service: FinanceService, company_id: str, rows: list[FinanceAccount]) -> list[FinanceAccountRead]:
    by_id = service.accounts_by_id(company_id)
    totals = service.account_lifetime_totals(company_id)
    return [_account_read(row, by_id=by_id, totals=totals) for row in rows]


def _payment_account_read(db: Session, service: FinanceService, account: FinancePaymentAccount) -> FinancePaymentAccountRead:
    gl_account = db.get(FinanceAccount, account.gl_account_id)
    balance = service.get_payment_account_balance(account)
    data = {
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
    return FinancePaymentAccountRead(**data)


def _payment_read(db: Session, payment) -> FinancePaymentRead:
    account = db.get(FinancePaymentAccount, payment.payment_account_id) if payment.payment_account_id else None
    data = FinancePaymentRead.model_validate(payment).model_dump()
    data["payment_account_name"] = account.name if account else None
    party_name = None
    if payment.party_id:
        if payment.party_type == "supplier":
            supplier = db.get(CommerceSupplier, payment.party_id)
            party_name = supplier.name if supplier else None
        else:
            customer = db.get(CommerceCustomer, payment.party_id)
            party_name = customer.name if customer else None
    data["party_name"] = party_name
    return FinancePaymentRead(**data)


def _receivable_read(db: Session, receivable) -> FinanceReceivableRead:
    customer = db.get(CommerceCustomer, receivable.customer_id) if receivable.customer_id else None
    data = FinanceReceivableRead.model_validate(receivable).model_dump()
    data["customer_name"] = customer.name if customer else None
    return FinanceReceivableRead(**data)


def _payable_read(db: Session, payable) -> FinancePayableRead:
    supplier = db.get(CommerceSupplier, payable.supplier_id) if payable.supplier_id else None
    data = FinancePayableRead.model_validate(payable).model_dump()
    data["supplier_name"] = supplier.name if supplier else None
    return FinancePayableRead(**data)


def _journal_line_read(db: Session, line) -> FinanceJournalLineRead:
    account = db.get(FinanceAccount, line.account_id)
    center = db.get(FinanceCostCenter, line.cost_center_id) if getattr(line, "cost_center_id", None) else None
    data = FinanceJournalLineRead.model_validate(line).model_dump()
    data["account_code"] = account.code if account else None
    data["account_name"] = account.name if account else None
    data["cost_center_code"] = center.code if center else None
    data["cost_center_name"] = center.name if center else None
    return FinanceJournalLineRead(**data)


def _journal_entry_read(
    entry,
    lines: Optional[list[FinanceJournalLineRead]] = None,
    debit_total: Optional[Decimal] = None,
    credit_total: Optional[Decimal] = None,
) -> FinanceJournalEntryRead:
    data = FinanceJournalEntryRead.model_validate(entry).model_dump()
    if lines is not None:
        data["lines"] = [line.model_dump() for line in lines]
        if debit_total is None:
            debit_total = sum((line.debit for line in lines), Decimal("0"))
        if credit_total is None:
            credit_total = sum((line.credit for line in lines), Decimal("0"))
    data["debit_total"] = debit_total or Decimal("0")
    data["credit_total"] = credit_total or Decimal("0")
    return FinanceJournalEntryRead(**data)


# ── Dashboard ─────────────────────────────────────────────────────────────


@router.get("/dashboard/period")
def dashboard_period(
    date_from: Optional[date] = Query(default=None, description="first day, inclusive (none: from the first payment)"),
    date_to: Optional[date] = Query(default=None, description="last day, inclusive (none: up to today)"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """The Finance module's landing dashboard: balances right now and money in / out over the chosen period."""
    return {"data": dashboard_period_service.dashboard_period(db, company_id, date_from, date_to)}


@router.get("/dashboard", response_model=FinanceDashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceDashboardResponse:
    service = FinanceService(db)
    raw = service.get_dashboard(company_id)
    tax_summary = service.get_tax_summary(company_id)
    payment_accounts = service.list_payment_accounts_with_balance(company_id)
    db.commit()
    payload = {
        "receivable_balance": raw["receivable_balance"],
        "payable_balance": raw["payable_balance"],
        "payments_inbound_total": raw["payments_inbound_total"],
        "journal_entry_count": raw["journal_entry_count"],
        "account_count": raw["account_count"],
        "unposted_receivable_count": raw.get("unposted_receivable_count", 0),
        "failed_posting_count": raw.get("failed_posting_count", 0),
        "unposted_payable_count": raw.get("unposted_payable_count", 0),
        "tax_summary": FinanceTaxSummaryRead(**tax_summary),
        "payment_accounts": [FinancePaymentAccountRead(**a) for a in payment_accounts],
        "recent_receivables": [_receivable_read(db, r) for r in raw["recent_receivables"]],
        "recent_payables": [_payable_read(db, p) for p in raw["recent_payables"]],
        "recent_payments": [_payment_read(db, p) for p in raw["recent_payments"]],
    }
    return FinanceDashboardResponse(data=FinanceDashboardRead(**payload))


@router.get("/tax-summary", response_model=FinanceTaxSummaryResponse)
def tax_summary(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceTaxSummaryResponse:
    service = FinanceService(db)
    return FinanceTaxSummaryResponse(data=FinanceTaxSummaryRead(**service.get_tax_summary(company_id)))


@router.get("/partner-trading", response_model=PartnerTradingResponse)
def get_partner_trading(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    customer_id: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
) -> PartnerTradingResponse:
    data = partner_trading(
        db,
        company_id=company_id,
        customer_id=customer_id,
        supplier_id=supplier_id,
    )
    return PartnerTradingResponse(data=PartnerTradingRead(**data))


# ── Chart of accounts ────────────────────────────────────────────────────


@router.get("/accounts", response_model=FinanceAccountListResponse)
def list_accounts(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    include_inactive: bool = Query(default=False),
) -> FinanceAccountListResponse:
    service = FinanceService(db)
    rows = service.list_accounts(company_id, include_inactive=include_inactive)
    db.commit()
    return FinanceAccountListResponse(data=_account_reads(service, company_id, rows))


@router.post("/accounts", response_model=FinanceAccountResponse, status_code=201)
def create_account(
    payload: FinanceAccountCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAccountResponse:
    service = FinanceService(db)
    row = service.create_account(
        company_id=company_id,
        code=payload.code,
        name=payload.name,
        account_type=payload.account_type,
        parent_id=payload.parent_id,
    )
    db.commit()
    db.refresh(row)
    return FinanceAccountResponse(data=_account_reads(service, company_id, [row])[0])


@router.patch("/accounts/{account_id}", response_model=FinanceAccountResponse)
def update_account(
    account_id: str,
    payload: FinanceAccountUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAccountResponse:
    service = FinanceService(db)
    row = service.get_account(account_id, company_id=company_id)
    service.update_account(row, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(row)
    return FinanceAccountResponse(data=_account_reads(service, company_id, [row])[0])


# ── Journal ───────────────────────────────────────────────────────────────


@router.get("/journal", response_model=FinanceJournalListResponse)
def list_journal(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    source_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> FinanceJournalListResponse:
    service = FinanceService(db)
    rows, total = service.list_journal_entries(
        company_id=company_id, source_type=source_type, limit=limit, offset=offset
    )
    totals = service.journal_entry_totals([row.id for row in rows])
    data = [
        _journal_entry_read(
            row,
            debit_total=totals.get(row.id, (Decimal("0"), Decimal("0")))[0],
            credit_total=totals.get(row.id, (Decimal("0"), Decimal("0")))[1],
        )
        for row in rows
    ]
    return FinanceJournalListResponse(data=data, meta=FinanceJournalListMeta(total=total, limit=limit, offset=offset))


@router.get("/journal/source-types", response_model=FinanceSourceTypeListResponse)
def list_journal_source_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
) -> FinanceSourceTypeListResponse:
    service = FinanceService(db)
    return FinanceSourceTypeListResponse(data=[FinanceSourceTypeRead(**row) for row in service.list_source_types()])


@router.get("/journal/{entry_id}", response_model=FinanceJournalEntryResponse)
def get_journal_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceJournalEntryResponse:
    service = FinanceService(db)
    entry = service.get_journal_entry(entry_id, company_id=company_id)
    lines = [_journal_line_read(db, line) for line in service.get_journal_lines(entry_id)]
    return FinanceJournalEntryResponse(data=_journal_entry_read(entry, lines))


# ── Payments ──────────────────────────────────────────────────────────────


@router.get("/payments", response_model=FinancePaymentListResponse)
def list_payments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    project_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> FinancePaymentListResponse:
    service = FinanceService(db)
    rows, total = service.list_payments(company_id=company_id, project_id=project_id, limit=limit, offset=offset)
    data = [_payment_read(db, p) for p in rows]
    return FinancePaymentListResponse(data=data, meta=FinanceListMeta(total=total, limit=limit, offset=offset))


# ── Receivables ───────────────────────────────────────────────────────────


@router.get("/receivables", response_model=FinanceReceivableListResponse)
def list_receivables(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> FinanceReceivableListResponse:
    service = FinanceService(db)
    rows, total = service.list_receivables(
        company_id=company_id, status=status, project_id=project_id, customer_id=customer_id, limit=limit, offset=offset,
    )
    data = [_receivable_read(db, r) for r in rows]
    return FinanceReceivableListResponse(data=data, meta=FinanceListMeta(total=total, limit=limit, offset=offset))


# ── Payables ──────────────────────────────────────────────────────────────


@router.get("/payables", response_model=FinancePayableListResponse)
def list_payables(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> FinancePayableListResponse:
    service = FinanceService(db)
    rows, total = service.list_payables(
        company_id=company_id, status=status, supplier_id=supplier_id, limit=limit, offset=offset,
    )
    data = [_payable_read(db, p) for p in rows]
    return FinancePayableListResponse(data=data, meta=FinanceListMeta(total=total, limit=limit, offset=offset))


@router.post("/payables/from-purchase", response_model=FinancePayableResponse)
def create_payable_from_purchase(
    payload: FinancePayableFromPurchaseRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePayableResponse:
    service = FinanceService(db)
    payable = service.record_purchase_document(
        company_id=company_id,
        supplier_id=payload.supplier_id,
        reference_number=payload.reference_number,
        amount=payload.amount,
        tax_amount=payload.tax_amount,
        due_date=payload.due_date,
        source_type=payload.source_type,
        source_id=payload.source_id,
        description=payload.description,
        credit=payload.credit,
    )
    db.commit()
    db.refresh(payable)
    return FinancePayableResponse(data=_payable_read(db, payable))


@router.post("/receivables/{receivable_id}/settle", response_model=FinanceReceivableListResponse)
def settle_receivable(
    receivable_id: str,
    payload: FinanceSettlementRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceReceivableListResponse:
    service = FinanceService(db)
    receivable = service.get_receivable(receivable_id, company_id=company_id)
    receivable, _payment = service.settle_receivable(
        receivable,
        amount=payload.amount,
        payment_account_id=payload.payment_account_id,
        payment_date=payload.payment_date,
        reference=payload.reference,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(receivable)
    return FinanceReceivableListResponse(data=[_receivable_read(db, receivable)], meta=FinanceListMeta(total=1, limit=1, offset=0))


# ── Payment accounts ─────────────────────────────────────────────────────


@router.get("/payment-accounts", response_model=FinancePaymentAccountListResponse)
def list_payment_accounts(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePaymentAccountListResponse:
    service = FinanceService(db)
    rows = service.list_payment_accounts_with_balance(company_id)
    db.commit()
    return FinancePaymentAccountListResponse(data=[FinancePaymentAccountRead(**r) for r in rows])


@router.post("/payment-accounts", response_model=FinancePaymentAccountResponse)
def create_payment_account(
    payload: FinancePaymentAccountCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePaymentAccountResponse:
    service = FinanceService(db)
    account = service.create_payment_account(
        company_id=company_id,
        name=payload.name,
        kind=payload.kind,
        opening_balance=payload.opening_balance,
        is_default=payload.is_default,
    )
    db.commit()
    db.refresh(account)
    return FinancePaymentAccountResponse(data=_payment_account_read(db, service, account))


@router.post("/payment-accounts/transfer", response_model=FinancePaymentListResponse)
def transfer_payment_accounts(
    payload: FinancePaymentAccountTransferRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePaymentListResponse:
    service = FinanceService(db)
    outbound, inbound = service.transfer_between_payment_accounts(
        company_id=company_id,
        from_account_id=payload.from_account_id,
        to_account_id=payload.to_account_id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        reference=payload.reference,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(outbound)
    db.refresh(inbound)
    return FinancePaymentListResponse(
        data=[_payment_read(db, outbound), _payment_read(db, inbound)],
        meta=FinanceListMeta(total=2, limit=2, offset=0),
    )


@router.patch("/payment-accounts/{account_id}", response_model=FinancePaymentAccountResponse)
def update_payment_account(
    account_id: str,
    payload: FinancePaymentAccountUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePaymentAccountResponse:
    service = FinanceService(db)
    account = service.get_payment_account(account_id, company_id=company_id)
    account = service.update_payment_account(
        account,
        name=payload.name,
        is_active=payload.is_active,
        is_default=payload.is_default,
    )
    db.commit()
    db.refresh(account)
    return FinancePaymentAccountResponse(data=_payment_account_read(db, service, account))


@router.post("/payables/{payable_id}/settle", response_model=FinancePayableListResponse)
def settle_payable(
    payable_id: str,
    payload: FinanceSettlementRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePayableListResponse:
    service = FinanceService(db)
    payable = service.get_payable(payable_id, company_id=company_id)
    payable, _payment = service.settle_payable(
        payable,
        amount=payload.amount,
        payment_account_id=payload.payment_account_id,
        payment_date=payload.payment_date,
        reference=payload.reference,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(payable)
    return FinancePayableListResponse(data=[_payable_read(db, payable)], meta=FinanceListMeta(total=1, limit=1, offset=0))


# ── Journal source types / posting health ────────────────────────────────


@router.get("/postings/health", response_model=FinancePostingHealthResponse)
def posting_health(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinancePostingHealthResponse:
    service = FinanceService(db)
    raw = service.get_posting_health(company_id)
    items = [
        FinancePostingHealthItem(
            id=row.id,
            source_type=row.source_type,
            source_id=row.source_id,
            invoice_number=row.invoice_number,
            posting_status=row.posting_status,
            posting_error=row.posting_error,
            journal_entry_id=row.journal_entry_id,
        )
        for row in raw["items"]
    ]
    return FinancePostingHealthResponse(
        data=FinancePostingHealthRead(
            unposted_receivable_count=raw["unposted_receivable_count"],
            failed_posting_count=raw["failed_posting_count"],
            unposted_payable_count=raw["unposted_payable_count"],
            items=items,
        )
    )


@router.post("/postings/retry")
def retry_posting(
    payload: FinancePostingRetryRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
):
    service = FinanceService(db)
    result = service.retry_posting(
        source_type=payload.source_type,
        source_id=payload.source_id,
        company_id=company_id,
    )
    db.commit()
    return {"ok": True, "source_type": payload.source_type, "source_id": payload.source_id, "posted": result is not None}


# ── Reports ──────────────────────────────────────────────────────────────


@router.get("/reports/trial-balance", response_model=FinanceReportResponse)
def report_trial_balance(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    comparison: str = Query(default="none", pattern="^(none|previous_period|same_period_last_year|specific_period)$"),
    compare_from: Optional[date] = Query(default=None),
    compare_to: Optional[date] = Query(default=None),
    account_id: Optional[str] = Query(default=None),
    account_type: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    data = FinanceReportService(db).trial_balance(
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison=comparison,
        compare_from=compare_from,
        compare_to=compare_to,
        account_id=account_id,
        account_type=account_type,
    )
    return FinanceReportResponse(**data)


@router.get("/reports/profit-loss", response_model=FinanceReportResponse)
def report_profit_loss(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    comparison: str = Query(default="none", pattern="^(none|previous_period|same_period_last_year|specific_period)$"),
    compare_from: Optional[date] = Query(default=None),
    compare_to: Optional[date] = Query(default=None),
    account_id: Optional[str] = Query(default=None),
    account_type: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).profit_loss(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            comparison=comparison,
            compare_from=compare_from,
            compare_to=compare_to,
            account_id=account_id,
            account_type=account_type,
        )
    )


@router.get("/reports/balance-sheet", response_model=FinanceReportResponse)
def report_balance_sheet(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    as_of: Optional[date] = Query(default=None),
    comparison: str = Query(default="none", pattern="^(none|previous_period|same_period_last_year|specific_date)$"),
    compare_date: Optional[date] = Query(default=None),
    account_id: Optional[str] = Query(default=None),
    account_type: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).balance_sheet(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            as_of=as_of,
            comparison=comparison,
            compare_date=compare_date,
            account_id=account_id,
            account_type=account_type,
        )
    )


@router.get("/reports/cash-flow", response_model=FinanceReportResponse)
def report_cash_flow(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    payment_account_id: Optional[str] = Query(default=None),
    payment_account_kind: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).cash_flow(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            payment_account_id=payment_account_id,
            payment_account_kind=payment_account_kind,
        )
    )


@router.get("/reports/general-ledger", response_model=FinanceReportResponse)
def report_general_ledger(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    account_id: Optional[str] = Query(default=None),
    source_type: Optional[str] = Query(default=None),
    party_id: Optional[str] = Query(default=None),
    reference: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).general_ledger(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            source_type=source_type,
            party_id=party_id,
            reference=reference,
        )
    )


@router.get("/reports/receivable-aging", response_model=FinanceReportResponse)
def report_receivable_aging(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).receivable_aging(company_id=company_id, date_from=date_from, date_to=date_to)
    )


@router.get("/reports/payable-aging", response_model=FinanceReportResponse)
def report_payable_aging(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).payable_aging(company_id=company_id, date_from=date_from, date_to=date_to)
    )


@router.get("/reports/aged-receivable", response_model=FinanceReportResponse)
def report_aged_receivable(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    as_of: Optional[date] = Query(default=None),
    period_length: int = Query(default=30, ge=1, le=365),
    based_on: str = Query(default="due_date", pattern="^(due_date|invoice_date)$"),
    partner_id: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).aged_partner_balance(
            kind="receivable",
            company_id=company_id,
            as_of=as_of,
            period_length=period_length,
            based_on=based_on,
            partner_id=partner_id,
        )
    )


@router.get("/reports/aged-payable", response_model=FinanceReportResponse)
def report_aged_payable(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    as_of: Optional[date] = Query(default=None),
    period_length: int = Query(default=30, ge=1, le=365),
    based_on: str = Query(default="due_date", pattern="^(due_date|invoice_date)$"),
    partner_id: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).aged_partner_balance(
            kind="payable",
            company_id=company_id,
            as_of=as_of,
            period_length=period_length,
            based_on=based_on,
            partner_id=partner_id,
        )
    )


@router.get("/reports/partner-ledger", response_model=FinanceReportResponse)
def report_partner_ledger(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    ledger_type: str = Query(default="all", pattern="^(all|receivable|payable)$"),
    partner_id: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).partner_ledger(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            ledger_type=ledger_type,
            partner_id=partner_id,
        )
    )


@router.get("/reports/invoices-analysis", response_model=FinanceReportResponse)
def report_invoices_analysis(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    status: str = Query(default="invoiced", pattern="^(invoiced|open|partial|paid|void|all)$"),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).invoices_analysis(company_id=company_id, date_from=date_from, date_to=date_to, status=status)
    )


@router.get("/reports/analytic-report", response_model=FinanceReportResponse)
def report_analytic(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    cost_center_id: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).analytic_report(company_id=company_id, date_from=date_from, date_to=date_to, cost_center_id=cost_center_id)
    )


@router.get("/reports/executive-summary", response_model=FinanceReportResponse)
def report_executive_summary(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    comparison: str = Query(default="none", pattern="^(none|previous_period|same_period_last_year|specific_period)$"),
    compare_from: Optional[date] = Query(default=None),
    compare_to: Optional[date] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).executive_summary(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            comparison=comparison,
            compare_from=compare_from,
            compare_to=compare_to,
        )
    )


PRODUCT_PROFIT_REVENUE_STATUSES = ("confirmed", "processing", "completed")


@router.get("/reports/product-profit")
def report_product_profit(
    product: str = Query(..., description="Product name, SKU or id"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> dict:
    """Gross profit for one product over a period — revenue from its sales order lines minus
    unit cost (from inventory stock levels, falling back to the catalog product's own
    purchase_price when no stock-level cost is recorded). Gated on finance read, not sales
    read: cost/margin is more sensitive than order data, and a per-tool AI permission model
    doesn't exist yet — this is the closest existing gate until that's built.

    There was previously no way to answer "what's the profit on X" at all: only company-wide
    gross profit existed (get_financial_summary), nothing product-scoped."""
    from app.models.catalog_product import CatalogProduct
    from app.models.inventory_stock_level import InventoryStockLevel
    from app.models.sales import SalesOrder, SalesOrderLine

    today = date.today()
    start = date_from or (today - timedelta(days=30))
    end = date_to or today
    if start > end:
        start, end = end, start

    ref = product.strip()
    base_q = db.query(CatalogProduct).filter(CatalogProduct.company_id == company_id)
    exact = db.get(CatalogProduct, ref)
    if exact and (exact.company_id or "default") == company_id:
        matches = [exact]
    else:
        matches = base_q.filter(func.lower(CatalogProduct.sku) == ref.lower()).all()
        if not matches:
            matches = base_q.filter(CatalogProduct.name.ilike(f"%{ref}%")).limit(6).all()
    if not matches:
        return {"error": f"No product matches '{product}'."}
    if len(matches) > 1:
        return {
            "error": f"'{product}' matches several products — ask the user which one.",
            "candidates": [{"id": p.id, "name": p.name, "sku": p.sku} for p in matches],
        }
    cp = matches[0]

    qty_sold, revenue, order_count = (
        db.query(
            func.coalesce(func.sum(SalesOrderLine.quantity_ordered), 0),
            func.coalesce(func.sum(SalesOrderLine.line_total), 0),
            func.count(func.distinct(SalesOrderLine.sales_order_id)),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.order_date >= start,
            SalesOrder.order_date <= end,
            SalesOrder.status.in_(PRODUCT_PROFIT_REVENUE_STATUSES),
            SalesOrderLine.item_id == cp.item_id,
        )
        .one()
    )
    qty_sold = int(qty_sold or 0)
    revenue = Decimal(str(revenue or 0))

    avg_cost = (
        db.query(func.avg(InventoryStockLevel.unit_cost))
        .filter(InventoryStockLevel.product_id == cp.id, InventoryStockLevel.company_id == company_id, InventoryStockLevel.unit_cost > 0)
        .scalar()
    )
    if avg_cost:
        unit_cost, cost_source = Decimal(str(avg_cost)), "inventory_stock_levels.unit_cost"
    elif cp.purchase_price:
        unit_cost, cost_source = Decimal(str(cp.purchase_price)), "catalog_products.purchase_price"
    else:
        unit_cost, cost_source = Decimal("0"), "none — no cost price recorded for this product"

    total_cost = unit_cost * qty_sold
    profit = revenue - total_cost
    margin_pct = round(float(profit / revenue * 100), 2) if revenue else None
    money = lambda v: str(Decimal(str(v or 0)).quantize(Decimal("0.01")))  # noqa: E731

    return {
        "product": {"id": cp.id, "name": cp.name, "sku": cp.sku},
        "period": {"from": start.isoformat(), "to": end.isoformat()},
        "quantity_sold": qty_sold,
        "orders": int(order_count or 0),
        "revenue": money(revenue),
        "unit_cost": money(unit_cost),
        "cost_source": cost_source,
        "total_cost": money(total_cost),
        "gross_profit": money(profit),
        "margin_pct": margin_pct,
        "currency": "BDT",
        "revenue_statuses": list(PRODUCT_PROFIT_REVENUE_STATUSES),
    }


@router.get("/reports/tax-summary", response_model=FinanceReportResponse)
def report_tax_summary(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).tax_summary(company_id=company_id, date_from=date_from, date_to=date_to)
    )


@router.get("/reports/expense-by-cost-center", response_model=FinanceReportResponse)
def report_expense_by_cost_center(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    account_id: Optional[str] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).expense_by_cost_center(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
        )
    )
