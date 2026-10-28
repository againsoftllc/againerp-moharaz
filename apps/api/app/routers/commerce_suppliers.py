from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.supplier.supplier import (
    SupplierBulkDeleteRequest,
    SupplierBulkDeleteResponse,
    SupplierBulkDeleteResult,
    SupplierCreate,
    SupplierListMeta,
    SupplierListResponse,
    SupplierResponse,
    SupplierUpdate,
)
from app.schemas.supplier.ledger import (
    SupplierLedgerResponse,
    SupplierPaymentCreate,
    SupplierPaymentListResponse,
    SupplierPaymentResponse,
    SupplierStatementResponse,
)
from app.services.core.access_scope import pick_payment_account
from app.services.supplier import supplier_ledger_service, supplier_service

router = APIRouter(prefix="/suppliers", tags=["commerce-suppliers"])


@router.get("", response_model=SupplierListResponse)
def list_suppliers(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|blocked|preferred)$"),
    search: Optional[str] = Query(default=None, description="Search name, code, email, phone"),
) -> SupplierListResponse:
    rows = supplier_service.list_suppliers(
        db, company_id=company_id, status=status, search=search
    )
    data = supplier_service.to_read_many(db, rows)
    return SupplierListResponse(
        data=data,
        meta=SupplierListMeta(
            count=len(data), total_spend_ytd=supplier_service.total_spend_ytd(rows)
        ),
    )


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierResponse:
    row = supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    # Older rows predate party linking — backfill lazily so the workspace tabs work.
    supplier_service.ensure_party(db, row)
    return SupplierResponse(data=supplier_service.to_read_one(db, row))


@router.post("", response_model=SupplierResponse, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "create")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierResponse:
    row = supplier_service.create_supplier(db, payload, company_id)
    return SupplierResponse(data=supplier_service.to_read_one(db, row))


@router.post("/bulk-delete", response_model=SupplierBulkDeleteResponse)
def bulk_delete_suppliers(
    payload: SupplierBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierBulkDeleteResponse:
    deleted, skipped = supplier_service.bulk_delete_suppliers(
        db, payload.ids, company_id=company_id
    )
    return SupplierBulkDeleteResponse(
        data=SupplierBulkDeleteResult(deleted=deleted, skipped=skipped),
    )


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierResponse:
    row = supplier_service.update_supplier(db, supplier_id, payload, company_id=company_id)
    return SupplierResponse(data=supplier_service.to_read_one(db, row))


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    supplier_service.delete_supplier(db, supplier_id, company_id=company_id)


@router.get("/{supplier_id}/ledger", response_model=SupplierLedgerResponse)
def supplier_ledger(
    supplier_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierLedgerResponse:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    entries, summary = supplier_ledger_service.ledger(db, supplier_id)
    return SupplierLedgerResponse(data=entries, meta=summary)


@router.get("/{supplier_id}/statement", response_model=SupplierStatementResponse)
def supplier_statement(
    supplier_id: str,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierStatementResponse:
    """Supplier statement for a period: opening, bills and payments, total and credit limit summary."""
    today = date.today()
    return SupplierStatementResponse(
        data=supplier_ledger_service.statement(
            db,
            supplier_id,
            company_id=company_id,
            date_from=date_from or today.replace(month=1, day=1),
            date_to=date_to or today,
        )
    )


@router.get("/{supplier_id}/payments", response_model=SupplierPaymentListResponse)
def list_supplier_payments(
    supplier_id: str,
    reference: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierPaymentListResponse:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    payments = supplier_ledger_service.list_payments(db, supplier_id, reference=reference)
    return SupplierPaymentListResponse(data=payments)


@router.post("/{supplier_id}/payments", response_model=SupplierPaymentResponse, status_code=201)
def record_supplier_payment(
    supplier_id: str,
    payload: SupplierPaymentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierPaymentResponse:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    if payload.amount > 0:
        payload.payment_account_id = pick_payment_account(db, user, payload.payment_account_id)
    payment = supplier_ledger_service.record_payment(
        db, supplier_id, payload, company_id=company_id
    )
    return SupplierPaymentResponse(data=payment)


@router.delete("/{supplier_id}/payments/{payment_id}", status_code=204)
def delete_supplier_payment(
    supplier_id: str,
    payment_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    supplier_service.get_supplier(db, supplier_id, company_id=company_id)
    supplier_ledger_service.delete_payment(db, supplier_id, payment_id)
