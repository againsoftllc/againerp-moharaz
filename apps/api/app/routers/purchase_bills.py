from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.purchase_bill import PurchaseBill
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_receipt import PurchaseReceipt
from app.schemas.purchase.bill import (
    PurchaseBillCreate,
    PurchaseBillListMeta,
    PurchaseBillListResponse,
    PurchaseBillLineRead,
    PurchaseBillPostResult,
    PurchaseBillRead,
    PurchaseBillResponse,
)
from app.services.finance.finance_service import FinanceService
from app.services.purchase.purchase_bill_service import PurchaseBillService

router = APIRouter(prefix="/purchase/bills", tags=["purchase-bills"])


def _bill_read(db: Session, bill: PurchaseBill) -> PurchaseBillRead:
    order = db.get(PurchaseOrder, bill.purchase_order_id)
    receipt = db.get(PurchaseReceipt, bill.purchase_receipt_id) if bill.purchase_receipt_id else None
    supplier = db.get(CommerceSupplier, bill.supplier_id)
    created_user = db.get(AuthUser, bill.created_by) if bill.created_by else None
    lines = PurchaseBillService(db).get_lines(bill.id)
    return PurchaseBillRead(
        id=bill.id,
        company_id=bill.company_id,
        bill_number=bill.bill_number,
        vendor_invoice_number=bill.vendor_invoice_number,
        purchase_order_id=bill.purchase_order_id,
        po_number=order.po_number if order else None,
        purchase_receipt_id=bill.purchase_receipt_id,
        receipt_number=receipt.receipt_number if receipt else None,
        supplier_id=bill.supplier_id,
        supplier_name=supplier.name if supplier else None,
        bill_date=bill.bill_date,
        due_date=bill.due_date,
        status=bill.status,
        match_status=bill.match_status,
        subtotal=bill.subtotal,
        total=bill.total,
        payable_id=bill.payable_id,
        notes=bill.notes,
        created_by=bill.created_by,
        created_by_name=created_user.name if created_user else "Default",
        approved_by=bill.approved_by,
        approved_at=bill.approved_at,
        posted_by=bill.posted_by,
        posted_at=bill.posted_at,
        created_at=bill.created_at,
        updated_at=bill.updated_at,
        lines=[PurchaseBillLineRead.model_validate(l) for l in lines],
    )


@router.get("", response_model=PurchaseBillListResponse)
def list_bills(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    purchase_order_id: Optional[str] = Query(default=None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
) -> PurchaseBillListResponse:
    svc = PurchaseBillService(db)
    offset = (page - 1) * per_page
    rows, total = svc.list_bills(
        company_id=company_id,
        status=status,
        supplier_id=supplier_id,
        purchase_order_id=purchase_order_id,
        limit=per_page,
        offset=offset,
    )
    return PurchaseBillListResponse(
        data=[_bill_read(db, b) for b in rows],
        meta=PurchaseBillListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("", response_model=PurchaseBillResponse, status_code=201)
def create_bill(
    payload: PurchaseBillCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBillResponse:
    svc = PurchaseBillService(db)
    bill = svc.create_bill_from_po(
        company_id=company_id,
        purchase_order_id=payload.purchase_order_id,
        vendor_invoice_number=payload.vendor_invoice_number,
        bill_date=payload.bill_date,
        due_date=payload.due_date,
        notes=payload.notes,
        created_by=user.id,
    )
    db.commit()
    db.refresh(bill)
    return PurchaseBillResponse(data=_bill_read(db, bill))


@router.get("/{bill_id}", response_model=PurchaseBillResponse)
def get_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBillResponse:
    bill = PurchaseBillService(db).get_bill(bill_id, company_id=company_id)
    return PurchaseBillResponse(data=_bill_read(db, bill))


@router.post("/{bill_id}/match", response_model=PurchaseBillResponse)
def match_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBillResponse:
    bill = PurchaseBillService(db).run_auto_match(bill_id, company_id=company_id, actor_id=user.id)
    db.commit()
    db.refresh(bill)
    return PurchaseBillResponse(data=_bill_read(db, bill))


@router.post("/{bill_id}/approve", response_model=PurchaseBillResponse)
def approve_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBillResponse:
    bill = PurchaseBillService(db).approve_bill(bill_id, company_id=company_id, actor_id=user.id)
    db.commit()
    db.refresh(bill)
    return PurchaseBillResponse(data=_bill_read(db, bill))


@router.post("/{bill_id}/post", response_model=PurchaseBillPostResult)
def post_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBillPostResult:
    """Post a supplier bill to Finance — without ever double-posting a purchase
    that a Goods Receipt already booked. If a posted receipt exists for this
    bill's PO, the bill links to that receipt's existing FinancePayable (no new
    journal entry); only when no receipt was posted does this create a brand-new
    payable (Dr COGS / Cr AP), matching a purchase billed with no formal GRN."""
    bill_svc = PurchaseBillService(db)
    finance = FinanceService(db)
    bill = bill_svc.get_bill(bill_id, company_id=company_id)
    if bill.status in ("posted", "paid"):
        db.rollback()
        return PurchaseBillPostResult(data=_bill_read(db, bill), matched_existing_payable=True)

    from app.models.finance import FinancePayable

    receipt_id = bill_svc.find_receipt_payable_source(bill)
    existing = None
    if receipt_id:
        existing = (
            db.query(FinancePayable)
            .filter(
                FinancePayable.company_id == company_id,
                FinancePayable.source_type == "purchase_receipt",
                FinancePayable.source_id == receipt_id,
            )
            .first()
        )
    matched_existing = existing is not None
    if existing:
        bill.payable_id = existing.id
        bill.purchase_receipt_id = receipt_id
    else:
        payable = finance.record_purchase_document(
            company_id=company_id,
            supplier_id=bill.supplier_id,
            reference_number=bill.bill_number,
            amount=bill.total,
            tax_amount=Decimal("0"),
            due_date=bill.due_date,
            source_type="vendor_bill",
            source_id=bill.id,
            description=f"Supplier bill {bill.bill_number} for PO {bill.purchase_order_id}",
        )
        bill.payable_id = payable.id
    from datetime import datetime

    bill.status = "posted"
    bill.posted_by = user.id
    bill.posted_at = datetime.utcnow()
    db.flush()
    db.commit()
    db.refresh(bill)
    return PurchaseBillPostResult(data=_bill_read(db, bill), matched_existing_payable=matched_existing)


@router.delete("/{bill_id}", status_code=204)
def delete_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    PurchaseBillService(db).delete_bill(bill_id, company_id=company_id)
    db.commit()
