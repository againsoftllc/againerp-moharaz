from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.sales_return import (
    SalesReturnCreate,
    SalesReturnListMeta,
    SalesReturnListResponse,
    SalesReturnResponse,
)
from app.models.sales import SalesOrder
from app.models.sales_return import SalesReturn
from app.services.core.access_scope import assert_document_warehouse, assert_warehouse_access, warehouse_scope
from app.services.sales.sales_return_service import SalesReturnLineInput, SalesReturnService

router = APIRouter(prefix="/sales/returns", tags=["sales-returns"])


def _guard_return(db: Session, user: AuthUser, return_id: str) -> None:
    """A return is handled only by a member who works in its order's warehouse."""
    ret = db.get(SalesReturn, return_id)
    if ret is not None:
        assert_document_warehouse(db, user, SalesOrder, ret.sales_order_id, "warehouse_id")


@router.get("", response_model=SalesReturnListResponse)
def list_returns(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    sales_order_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(draft|confirmed|credited|cancelled)$"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> SalesReturnListResponse:
    svc = SalesReturnService(db)
    rows, total = svc.list_returns(
        company_id=company_id,
        sales_order_id=sales_order_id,
        status=status,
        limit=per_page,
        offset=(page - 1) * per_page,
        warehouse_ids=warehouse_scope(db, user),
    )
    return SalesReturnListResponse(
        data=[svc.to_read(row) for row in rows],
        meta=SalesReturnListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{return_id}", response_model=SalesReturnResponse)
def get_return(
    return_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesReturnResponse:
    svc = SalesReturnService(db, company_id=company_id)
    ret = svc.get_return(return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return SalesReturnResponse(data=svc.to_read(ret))


@router.post("", response_model=SalesReturnResponse, status_code=201)
def create_return(
    payload: SalesReturnCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "create")),
    company_id: str = Depends(get_current_company_id),
) -> SalesReturnResponse:
    assert_document_warehouse(db, user, SalesOrder, payload.sales_order_id, "warehouse_id")
    assert_warehouse_access(db, user, payload.warehouse_id)  # where the units are received
    svc = SalesReturnService(db, company_id=company_id)
    ret = svc.create_return(
        payload.sales_order_id,
        [
            SalesReturnLineInput(
                sales_order_line_id=line.sales_order_line_id,
                quantity_returned=line.quantity_returned,
                discount_amount=line.discount_amount,
                reason=line.reason,
                notes=line.notes,
                serial_numbers=line.serial_numbers,
            )
            for line in payload.lines
        ],
        reason=payload.reason,
        return_date=payload.return_date,
        requested_by=payload.requested_by,
        notes=payload.notes,
        discount_amount=payload.discount_amount,
        actor_id=user.id,
        warehouse_id=payload.warehouse_id,
    )
    if payload.auto_credit:
        svc.confirm_return(ret.id, actor_id=user.id)
        ret = svc.credit_return(ret.id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return SalesReturnResponse(data=svc.to_read(ret))


@router.post("/{return_id}/confirm", response_model=SalesReturnResponse)
def confirm_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesReturnResponse:
    _guard_return(db, user, return_id)
    svc = SalesReturnService(db, company_id=company_id)
    ret = svc.confirm_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return SalesReturnResponse(data=svc.to_read(ret))


@router.post("/{return_id}/cancel", response_model=SalesReturnResponse)
def cancel_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesReturnResponse:
    _guard_return(db, user, return_id)
    svc = SalesReturnService(db, company_id=company_id)
    ret = svc.cancel_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return SalesReturnResponse(data=svc.to_read(ret))


@router.post("/{return_id}/credit", response_model=SalesReturnResponse)
def credit_return(
    return_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesReturnResponse:
    _guard_return(db, user, return_id)
    svc = SalesReturnService(db, company_id=company_id)
    ret = svc.credit_return(return_id, actor_id=user.id)
    db.commit()
    db.refresh(ret)
    return SalesReturnResponse(data=svc.to_read(ret))
