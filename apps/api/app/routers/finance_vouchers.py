from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.finance import FinanceAccount, FinancePaymentAccount
from app.models.finance_voucher import FinanceVoucher, FinanceVoucherTemplate
from app.schemas.finance_voucher import (
    VoucherCancelRequest,
    VoucherCreate,
    VoucherListResponse,
    VoucherRead,
    VoucherResponse,
    VoucherTemplateCreate,
    VoucherTemplateListResponse,
    VoucherTemplateRead,
    VoucherTemplateResponse,
    VoucherTemplateUpdate,
    VoucherUpdate,
)
from app.services.core.access_scope import assert_payment_account
from app.services.core.approval_service import assert_can_approve
from app.services.finance.voucher_service import VoucherService

router = APIRouter(prefix="/finance", tags=["finance-vouchers"])


def _actor(user: AuthUser) -> str:
    return getattr(user, "email", None) or str(user.id)


def _account_name(db: Session, account_id: Optional[str]) -> Optional[str]:
    if not account_id:
        return None
    row = db.get(FinancePaymentAccount, account_id)
    return row.name if row else None


def _line_reads(db: Session, lines) -> list[dict]:
    out = []
    for line in lines:
        account = db.get(FinanceAccount, line.account_id)
        out.append(
            {
                "id": line.id,
                "line_no": line.line_no,
                "account_id": line.account_id,
                "account_code": account.code if account else None,
                "account_name": account.name if account else None,
                "description": line.description,
                "debit": line.debit,
                "credit": line.credit,
                "cost_center_id": line.cost_center_id,
            }
        )
    return out


def _voucher_read(db: Session, service: VoucherService, voucher: FinanceVoucher, *, with_lines: bool = True) -> VoucherRead:
    numbers = service.entry_numbers([voucher.journal_entry_id, voucher.reversal_entry_id])
    return VoucherRead(
        id=voucher.id,
        voucher_number=voucher.voucher_number,
        voucher_type=voucher.voucher_type,
        voucher_date=voucher.voucher_date,
        description=voucher.description,
        reference=voucher.reference,
        payment_account_id=voucher.payment_account_id,
        payment_account_name=_account_name(db, voucher.payment_account_id),
        to_payment_account_id=voucher.to_payment_account_id,
        to_payment_account_name=_account_name(db, voucher.to_payment_account_id),
        amount=voucher.amount,
        status=voucher.status,
        template_id=voucher.template_id,
        journal_entry_id=voucher.journal_entry_id,
        journal_entry_number=numbers.get(voucher.journal_entry_id or ""),
        reversal_entry_id=voucher.reversal_entry_id,
        reversal_entry_number=numbers.get(voucher.reversal_entry_id or ""),
        created_by=voucher.created_by,
        approved_by=voucher.approved_by,
        approved_at=voucher.approved_at,
        cancelled_by=voucher.cancelled_by,
        cancelled_at=voucher.cancelled_at,
        cancel_reason=voucher.cancel_reason,
        created_at=voucher.created_at,
        lines=_line_reads(db, service.lines(voucher.id)) if with_lines else [],
    )


def _template_read(db: Session, service: VoucherService, template: FinanceVoucherTemplate) -> VoucherTemplateRead:
    return VoucherTemplateRead(
        id=template.id,
        name=template.name,
        voucher_type=template.voucher_type,
        description=template.description,
        payment_account_id=template.payment_account_id,
        payment_account_name=_account_name(db, template.payment_account_id),
        to_payment_account_id=template.to_payment_account_id,
        to_payment_account_name=_account_name(db, template.to_payment_account_id),
        amount=template.amount,
        is_active=template.is_active,
        created_at=template.created_at,
        lines=_line_reads(db, service.template_lines(template.id)),
    )


# ── vouchers ─────────────────────────────────────────────────────────────────


@router.get("/vouchers", response_model=VoucherListResponse)
def list_vouchers(
    voucher_type: Optional[str] = Query(default=None, pattern="^(debit|credit|contra|journal)$"),
    status: Optional[str] = Query(default=None, pattern="^(draft|approved|cancelled)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherListResponse:
    service = VoucherService(db)
    rows, total = service.list_vouchers(
        company_id=company_id, voucher_type=voucher_type, status=status, date_from=date_from, date_to=date_to,
        search=search, limit=limit, offset=offset,
    )
    return VoucherListResponse(data=[_voucher_read(db, service, row, with_lines=False) for row in rows], meta={"total": total})


@router.post("/vouchers", response_model=VoucherResponse, status_code=201)
def create_voucher(
    payload: VoucherCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherResponse:
    assert_payment_account(db, user, payload.payment_account_id)
    assert_payment_account(db, user, payload.to_payment_account_id)
    service = VoucherService(db)
    voucher = service.create(payload, company_id=company_id, actor=_actor(user))
    db.commit()
    db.refresh(voucher)
    return VoucherResponse(data=_voucher_read(db, service, voucher))


@router.get("/vouchers/{voucher_id}", response_model=VoucherResponse)
def get_voucher(
    voucher_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherResponse:
    service = VoucherService(db)
    return VoucherResponse(data=_voucher_read(db, service, service.get(voucher_id, company_id=company_id)))


@router.patch("/vouchers/{voucher_id}", response_model=VoucherResponse)
def update_voucher(
    voucher_id: str,
    payload: VoucherUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherResponse:
    assert_payment_account(db, user, payload.payment_account_id)
    assert_payment_account(db, user, payload.to_payment_account_id)
    service = VoucherService(db)
    voucher = service.update(service.get(voucher_id, company_id=company_id), payload)
    db.commit()
    db.refresh(voucher)
    return VoucherResponse(data=_voucher_read(db, service, voucher))


@router.delete("/vouchers/{voucher_id}", status_code=204)
def delete_voucher(
    voucher_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = VoucherService(db)
    service.delete(service.get(voucher_id, company_id=company_id))
    db.commit()


@router.post("/vouchers/{voucher_id}/approve", response_model=VoucherResponse)
def approve_voucher(
    voucher_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherResponse:
    service = VoucherService(db)
    voucher = service.get(voucher_id, company_id=company_id)
    assert_payment_account(db, user, voucher.payment_account_id)
    assert_payment_account(db, user, voucher.to_payment_account_id)
    assert_can_approve(db, company_id, user, "finance.voucher", voucher.amount, what="voucher")
    service.approve(voucher, actor=_actor(user))
    db.commit()
    db.refresh(voucher)
    return VoucherResponse(data=_voucher_read(db, service, voucher))


@router.post("/vouchers/{voucher_id}/cancel", response_model=VoucherResponse)
def cancel_voucher(
    voucher_id: str,
    payload: VoucherCancelRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherResponse:
    service = VoucherService(db)
    voucher = service.cancel(service.get(voucher_id, company_id=company_id), actor=_actor(user), reason=payload.reason)
    db.commit()
    db.refresh(voucher)
    return VoucherResponse(data=_voucher_read(db, service, voucher))


# ── templates ────────────────────────────────────────────────────────────────


@router.get("/voucher-templates", response_model=VoucherTemplateListResponse)
def list_voucher_templates(
    voucher_type: Optional[str] = Query(default=None, pattern="^(debit|credit|contra|journal)$"),
    include_inactive: bool = True,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherTemplateListResponse:
    service = VoucherService(db)
    rows = service.list_templates(company_id=company_id, voucher_type=voucher_type, include_inactive=include_inactive)
    return VoucherTemplateListResponse(data=[_template_read(db, service, row) for row in rows])


@router.post("/voucher-templates", response_model=VoucherTemplateResponse, status_code=201)
def create_voucher_template(
    payload: VoucherTemplateCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherTemplateResponse:
    service = VoucherService(db)
    template = service.create_template(payload, company_id=company_id)
    db.commit()
    db.refresh(template)
    return VoucherTemplateResponse(data=_template_read(db, service, template))


@router.patch("/voucher-templates/{template_id}", response_model=VoucherTemplateResponse)
def update_voucher_template(
    template_id: str,
    payload: VoucherTemplateUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> VoucherTemplateResponse:
    service = VoucherService(db)
    template = service.update_template(service.get_template(template_id, company_id=company_id), payload)
    db.commit()
    db.refresh(template)
    return VoucherTemplateResponse(data=_template_read(db, service, template))


@router.delete("/voucher-templates/{template_id}", status_code=204)
def delete_voucher_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = VoucherService(db)
    service.delete_template(service.get_template(template_id, company_id=company_id))
    db.commit()
