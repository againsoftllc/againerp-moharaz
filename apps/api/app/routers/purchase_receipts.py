from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, require_admin_user, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.purchase.order import (
    PurchaseReceiptCreate,
    PurchaseReceiptListMeta,
    PurchaseReceiptListResponse,
    PurchaseReceiptLineCorrectionCreate,
    PurchaseReceiptLineCorrectionListResponse,
    PurchaseReceiptLineCorrectionRead,
    PurchaseReceiptResponse,
)
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_receipt import PurchaseReceipt
from app.services.core.access_scope import assert_document_warehouse, warehouse_scope
from app.services.finance.finance_service import FinanceService
from app.services.purchase import purchase_read_service as reads
from app.services.purchase.purchase_order_service import (
    PurchaseOrderService,
    ReceiptLineInput,
)

router = APIRouter(prefix="/purchase/receipts", tags=["purchase-receipts"])


@router.get("", response_model=PurchaseReceiptListResponse)
def list_receipts(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    purchase_order_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(draft|posted|cancelled)$"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> PurchaseReceiptListResponse:
    rows, total = PurchaseOrderService(db).list_receipts(
        warehouse_ids=warehouse_scope(db, user),
        company_id=company_id,
        purchase_order_id=purchase_order_id,
        status=status,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return PurchaseReceiptListResponse(
        data=reads.receipts_to_read(db, rows),
        meta=PurchaseReceiptListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{receipt_id}", response_model=PurchaseReceiptResponse)
def get_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptResponse:
    receipt = PurchaseOrderService(db, company_id=company_id).get_receipt(receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return PurchaseReceiptResponse(data=reads.receipt_to_read(db, receipt))


@router.post("", response_model=PurchaseReceiptResponse, status_code=201)
def create_receipt(
    payload: PurchaseReceiptCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "create")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptResponse:
    assert_document_warehouse(db, user, PurchaseOrder, payload.purchase_order_id, "warehouse_id")
    receipt = PurchaseOrderService(db, company_id=company_id).create_receipt(
        payload.purchase_order_id,
        [
            ReceiptLineInput(
                purchase_order_line_id=line.purchase_order_line_id,
                quantity_received=line.quantity_received,
                serial_numbers=tuple(line.serial_numbers),
                notes=line.notes,
            )
            for line in payload.lines
        ],
        receipt_date=payload.receipt_date,
        received_by=payload.received_by,
        notes=payload.notes,
        delivery_note=payload.delivery_note,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(receipt)
    return PurchaseReceiptResponse(data=reads.receipt_to_read(db, receipt))


@router.post("/{receipt_id}/post", response_model=PurchaseReceiptResponse)
def post_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptResponse:
    """Posting moves the goods into stock — the service writes inventory movements."""
    assert_document_warehouse(db, user, PurchaseReceipt, receipt_id, "warehouse_id")  # only the member's warehouses
    receipt = PurchaseOrderService(db, company_id=company_id).post_receipt(receipt_id, actor_id=user.id)
    db.commit()
    db.refresh(receipt)
    return PurchaseReceiptResponse(data=reads.receipt_to_read(db, receipt))


@router.post("/{receipt_id}/cancel", response_model=PurchaseReceiptResponse)
def cancel_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptResponse:
    assert_document_warehouse(db, user, PurchaseReceipt, receipt_id, "warehouse_id")  # only the member's warehouses
    receipt = PurchaseOrderService(db, company_id=company_id).cancel_receipt(receipt_id, actor_id=user.id)
    db.commit()
    db.refresh(receipt)
    return PurchaseReceiptResponse(data=reads.receipt_to_read(db, receipt))


@router.post(
    "/{receipt_id}/lines/{line_id}/correct",
    response_model=PurchaseReceiptResponse,
)
def correct_receipt_line(
    receipt_id: str,
    line_id: str,
    payload: PurchaseReceiptLineCorrectionCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_admin_user),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptResponse:
    """Admin-only fix for a mistaken received quantity on an already-posted
    receipt. Every correction is written to a permanent audit trail (see
    GET .../corrections) and the linked Finance payable is adjusted by the
    same value delta so AP never drifts from the corrected stock."""
    assert_document_warehouse(db, user, PurchaseReceipt, receipt_id, "warehouse_id")  # only the member's warehouses
    svc = PurchaseOrderService(db, company_id=company_id)
    _, audit, delta = svc.correct_receipt_line(
        receipt_id,
        line_id,
        new_quantity=payload.new_quantity,
        reason=payload.reason,
        actor_id=user.id,
    )
    receipt = svc.get_receipt(receipt_id)
    po_line = None
    if receipt:
        from app.models.purchase_receipt import PurchaseReceiptLine

        rline = db.get(PurchaseReceiptLine, line_id)
        if rline:
            from app.models.purchase_order import PurchaseOrderLine

            po_line = db.get(PurchaseOrderLine, rline.purchase_order_line_id)
    if receipt and po_line:
        delta_value = po_line.unit_cost * delta
        FinanceService(db).correct_purchase_receipt(
            receipt,
            delta_value=delta_value,
            correction_id=audit.id,
            description=f"Correction on {receipt.receipt_number}: {audit.old_quantity} -> {audit.new_quantity} ({audit.reason})",
        )
    db.commit()
    db.refresh(receipt)
    return PurchaseReceiptResponse(data=reads.receipt_to_read(db, receipt))


@router.get(
    "/{receipt_id}/corrections",
    response_model=PurchaseReceiptLineCorrectionListResponse,
)
def list_receipt_corrections(
    receipt_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReceiptLineCorrectionListResponse:
    from app.models.auth_user import AuthUser as AuthUserModel

    rows = PurchaseOrderService(db, company_id=company_id).list_receipt_line_corrections(
        receipt_id, company_id=company_id
    )
    user_ids = {r.corrected_by for r in rows if r.corrected_by}
    names = (
        {u.id: u.name for u in db.query(AuthUserModel).filter(AuthUserModel.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    return PurchaseReceiptLineCorrectionListResponse(
        data=[
            PurchaseReceiptLineCorrectionRead(
                id=r.id,
                purchase_receipt_id=r.purchase_receipt_id,
                purchase_receipt_line_id=r.purchase_receipt_line_id,
                old_quantity=r.old_quantity,
                new_quantity=r.new_quantity,
                reason=r.reason,
                corrected_by=r.corrected_by,
                corrected_by_name=names.get(r.corrected_by) or "Default",
                created_at=r.created_at,
            )
            for r in rows
        ]
    )
