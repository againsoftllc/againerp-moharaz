from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.finance import FinanceAccount, FinanceAllocationRule, FinanceExpenseCategory, FinancePaymentAccount
from app.models.party import Party
from app.schemas.finance import (
    FinanceExpenseCategoryCreate,
    FinanceExpenseCategoryListResponse,
    FinanceExpenseCategoryRead,
    FinanceExpenseCategoryUpdate,
    FinanceExpenseCreate,
    FinanceExpenseListMeta,
    FinanceExpenseListResponse,
    FinanceExpensePayRequest,
    FinanceExpenseRead,
    FinanceExpenseRejectRequest,
    FinanceExpenseResponse,
    FinanceExpenseSummaryRead,
    FinanceExpenseSummaryResponse,
    FinanceExpenseUpdate,
)
from app.services.finance.finance_service import FinanceService
from app.services.core.approval_service import assert_can_approve

router = APIRouter(prefix="/finance", tags=["finance"])


def _category_read(category: FinanceExpenseCategory) -> FinanceExpenseCategoryRead:
    return FinanceExpenseCategoryRead.model_validate(category)


def _expense_read(db: Session, expense) -> FinanceExpenseRead:
    category = db.get(FinanceExpenseCategory, expense.category_id)
    account = db.get(FinancePaymentAccount, expense.payment_account_id) if expense.payment_account_id else None
    gl = db.get(FinanceAccount, expense.account_id) if getattr(expense, "account_id", None) else None
    rule = db.get(FinanceAllocationRule, expense.allocation_rule_id) if getattr(expense, "allocation_rule_id", None) else None
    party = db.get(Party, expense.party_id) if getattr(expense, "party_id", None) else None
    data = FinanceExpenseRead.model_validate(expense).model_dump()
    data["category_name"] = category.name if category else None
    data["payment_account_name"] = account.name if account else None
    data["account_code"] = gl.code if gl else None
    data["account_name"] = gl.name if gl else None
    data["allocation_rule_name"] = rule.name if rule else None
    data["party_name"] = party.display_name if party else None
    raw = getattr(expense, "allocation_json", None)
    if isinstance(raw, str) and raw:
        try:
            data["allocation_json"] = json.loads(raw)
        except json.JSONDecodeError:
            data["allocation_json"] = None
    else:
        data["allocation_json"] = raw
    return FinanceExpenseRead(**data)


# ── Categories ────────────────────────────────────────────────────────────


@router.get("/expense-categories", response_model=FinanceExpenseCategoryListResponse)
def list_expense_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    include_inactive: bool = Query(default=False),
) -> FinanceExpenseCategoryListResponse:
    service = FinanceService(db)
    rows = service.list_expense_categories(company_id, include_inactive=include_inactive)
    db.commit()
    return FinanceExpenseCategoryListResponse(data=[_category_read(r) for r in rows])


@router.post("/expense-categories", response_model=FinanceExpenseCategoryListResponse, status_code=201)
def create_expense_category(
    payload: FinanceExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseCategoryListResponse:
    service = FinanceService(db)
    service.create_expense_category(company_id=company_id, name=payload.name)
    db.commit()
    rows = service.list_expense_categories(company_id)
    return FinanceExpenseCategoryListResponse(data=[_category_read(r) for r in rows])


@router.patch("/expense-categories/{category_id}", response_model=FinanceExpenseCategoryListResponse)
def update_expense_category(
    category_id: str,
    payload: FinanceExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseCategoryListResponse:
    service = FinanceService(db)
    category = service.get_expense_category(category_id, company_id=company_id)
    service.update_expense_category(category, name=payload.name, is_active=payload.is_active)
    db.commit()
    rows = service.list_expense_categories(company_id, include_inactive=True)
    return FinanceExpenseCategoryListResponse(data=[_category_read(r) for r in rows])


@router.delete("/expense-categories/{category_id}", response_model=FinanceExpenseCategoryListResponse)
def deactivate_expense_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseCategoryListResponse:
    service = FinanceService(db)
    category = service.get_expense_category(category_id, company_id=company_id)
    service.update_expense_category(category, is_active=False)
    db.commit()
    rows = service.list_expense_categories(company_id)
    return FinanceExpenseCategoryListResponse(data=[_category_read(r) for r in rows])


# ── Expenses ──────────────────────────────────────────────────────────────


@router.get("/expenses", response_model=FinanceExpenseListResponse)
def list_expenses(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    category_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    party_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> FinanceExpenseListResponse:
    service = FinanceService(db)
    rows, total = service.list_expenses(
        company_id=company_id,
        status=status,
        category_id=category_id,
        project_id=project_id,
        party_id=party_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    data = [_expense_read(db, r) for r in rows]
    return FinanceExpenseListResponse(
        data=data,
        meta=FinanceExpenseListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/expenses/summary", response_model=FinanceExpenseSummaryResponse)
def expense_summary(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseSummaryResponse:
    service = FinanceService(db)
    return FinanceExpenseSummaryResponse(data=FinanceExpenseSummaryRead(**service.get_expense_summary(company_id)))


@router.get("/expenses/{expense_id}", response_model=FinanceExpenseResponse)
def get_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.post("/expenses", response_model=FinanceExpenseResponse, status_code=201)
def create_expense(
    payload: FinanceExpenseCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.create_expense(
        company_id=company_id,
        category_id=payload.category_id,
        payee=payload.payee,
        description=payload.description,
        expense_date=payload.expense_date,
        amount=payload.amount,
        tax_amount=payload.tax_amount,
        payment_method=payload.payment_method,
        payment_account_id=payload.payment_account_id,
        reference=payload.reference,
        notes=payload.notes,
        created_by=user.id,
        account_id=payload.account_id,
        allocation_rule_id=payload.allocation_rule_id,
        override_lines=[line.model_dump() for line in payload.override_lines] if payload.override_lines else None,
        party_id=payload.party_id,
    )
    db.commit()
    db.refresh(expense)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.patch("/expenses/{expense_id}", response_model=FinanceExpenseResponse)
def update_expense(
    expense_id: str,
    payload: FinanceExpenseUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    patch = payload.model_dump(exclude_unset=True)
    if "override_lines" in patch and patch["override_lines"] is not None:
        patch["override_lines"] = [
            line if isinstance(line, dict) else line.model_dump() for line in patch["override_lines"]
        ]
    service.update_expense(expense, **patch)
    db.commit()
    db.refresh(expense)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.post("/expenses/{expense_id}/approve", response_model=FinanceExpenseResponse)
def approve_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    assert_can_approve(db, company_id, user, "finance.expense", expense.total)
    service.approve_expense(expense, actor=user.id)
    db.commit()
    db.refresh(expense)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.post("/expenses/{expense_id}/reject", response_model=FinanceExpenseResponse)
def reject_expense(
    expense_id: str,
    payload: FinanceExpenseRejectRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    service.reject_expense(expense, actor=user.id, note=payload.note)
    db.commit()
    db.refresh(expense)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.post("/expenses/{expense_id}/pay", response_model=FinanceExpenseResponse)
def pay_expense(
    expense_id: str,
    payload: FinanceExpensePayRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceExpenseResponse:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    service.pay_expense(
        expense,
        payment_method=payload.payment_method,
        payment_account_id=payload.payment_account_id,
        payment_date=payload.payment_date,
        reference=payload.reference,
    )
    db.commit()
    db.refresh(expense)
    return FinanceExpenseResponse(data=_expense_read(db, expense))


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    service = FinanceService(db)
    expense = service.get_expense(expense_id, company_id=company_id)
    service.delete_expense(expense)
    db.commit()
    return Response(status_code=204)
