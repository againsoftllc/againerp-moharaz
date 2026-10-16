from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.purchase.return_ import (
    PurchaseReturnCreate,
    PurchaseReturnListMeta,
    PurchaseReturnListResponse,
    PurchaseReturnRejectRequest,
    PurchaseReturnResponse,
)
from app.services.purchase import purchase_read_service as reads
from app.services.purchase.purchase_return_service import PurchaseReturnService, ReturnLineInput

router = APIRouter(prefix="/purchase/returns", tags=["purchase-returns"])


@router.get("", response_model=PurchaseReturnListResponse)
def list_returns(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    purchase_order_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(requested|approved|credited|rejected|cancelled)$"
    ),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> PurchaseReturnListResponse:
    rows, total = PurchaseReturnService(db).list_returns(
        company_id=company_id,
        purchase_order_id=purchase_order_id,
        status=status,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return PurchaseReturnListResponse(
        data=reads.returns_to_read(db, rows),
        meta=PurchaseReturnListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{return_id}", response_model=PurchaseReturnResponse)
def get_return(
    return_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    ret = PurchaseReturnService(db, company_id=company_id).get_return(return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))


@router.post("", response_model=PurchaseReturnResponse, status_code=201)
def create_return(
    payload: PurchaseReturnCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "create")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    ret = PurchaseReturnService(db, company_id=company_id).create_return(
        payload.purchase_order_id,
        [
            ReturnLineInput(
                purchase_order_line_id=line.purchase_order_line_id,
                quantity_returned=line.quantity_returned,
                reason=line.reason,
                notes=line.notes,
            )
            for line in payload.lines
        ],
        purchase_receipt_id=payload.purchase_receipt_id,
        reason=payload.reason,
        return_date=payload.return_date,
        requested_by=payload.requested_by,
        notes=payload.notes,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(ret)
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))


@router.post("/{return_id}/approve", response_model=PurchaseReturnResponse)
def approve_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    ret = PurchaseReturnService(db, company_id=company_id).approve_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))


@router.post("/{return_id}/reject", response_model=PurchaseReturnResponse)
def reject_return(
    return_id: str,
    payload: PurchaseReturnRejectRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    ret = PurchaseReturnService(db, company_id=company_id).reject_return(
        return_id, actor_id=user.id, notes=payload.notes
    )
    db.commit()
    db.refresh(ret)
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))


@router.post("/{return_id}/cancel", response_model=PurchaseReturnResponse)
def cancel_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    ret = PurchaseReturnService(db, company_id=company_id).cancel_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))


@router.post("/{return_id}/credit", response_model=PurchaseReturnResponse)
def credit_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseReturnResponse:
    """Posts the AP credit and removes the returned units from stock."""
    ret = PurchaseReturnService(db, company_id=company_id).credit_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return PurchaseReturnResponse(data=reads.return_to_read(db, ret))
