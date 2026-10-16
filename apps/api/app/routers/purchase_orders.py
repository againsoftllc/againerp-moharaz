from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.purchase.order import (
    PurchaseBulkDeleteRequest,
    PurchaseBulkDeleteResponse,
    PurchaseBulkDeleteResult,
    PurchaseDashboardRead,
    PurchaseDashboardResponse,
    PurchaseOrderCreate,
    PurchaseOrderListMeta,
    PurchaseOrderListResponse,
    PurchaseOrderResponse,
    PurchaseOrderStatusUpdate,
    PurchaseOrderUpdate,
    PurchaseStatusHistoryListResponse,
    SupplierStockReportResponse,
    SupplierStockReportRow,
)
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.catalog_product import CatalogProduct
from app.models.inventory_stock_movement import InventoryStockMovement
from app.services.inventory.constants import (
    MOVEMENT_SALES_DELIVERY,
    MOVEMENT_POS_SALE,
    MOVEMENT_COMMERCE_SALE,
    MOVEMENT_TRANSFER_OUT,
)
from sqlalchemy import func
from app.services.purchase import purchase_read_service as reads
from app.services.purchase.purchase_order_service import (
    PurchaseLineInput,
    PurchaseOrderService,
)
from app.services.core.approval_service import assert_can_approve

router = APIRouter(prefix="/purchase", tags=["purchase-orders"])


def _service(db: Session, company_id: str) -> PurchaseOrderService:
    return PurchaseOrderService(db, company_id=company_id)


@router.get("/dashboard", response_model=PurchaseDashboardResponse)
def purchase_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseDashboardResponse:
    raw = _service(db, company_id).dashboard(company_id)
    recent = raw.get("recent_orders") or []
    return PurchaseDashboardResponse(
        data=PurchaseDashboardRead(
            open_po_count=raw.get("open_po_count", 0),
            pending_receive_count=raw.get("pending_receive_count", 0),
            completed_count=raw.get("completed_count", 0),
            spend_total=raw.get("spend_total", 0),
            status_breakdown=raw.get("status_breakdown", {}),
            recent_orders=reads.orders_to_read(db, recent),
        )
    )


@router.get("/orders", response_model=PurchaseOrderListResponse)
def list_orders(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|confirmed|partial_received|completed|cancelled)$"
    ),
    supplier_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> PurchaseOrderListResponse:
    rows, total = _service(db, company_id).list_orders(
        company_id=company_id,
        status=status,
        supplier_id=supplier_id,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return PurchaseOrderListResponse(
        data=reads.orders_to_read(db, rows),
        meta=PurchaseOrderListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/orders/supplier-stock-report", response_model=SupplierStockReportResponse)
def supplier_stock_report(
    supplier_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SupplierStockReportResponse:
    """AgainPOS-style "Stock Report": per-item purchase/return history with
    this supplier, plus the item's current on-hand stock and its value at
    the last known unit cost. Total Sold / Total Transferred aren't included —
    AgainERP doesn't link stock movements back to their originating PO line,
    so per-supplier sell-through can't be attributed the way AgainPOS does."""
    rows = (
        db.query(
            PurchaseOrderLine.item_id,
            PurchaseOrderLine.sku,
            PurchaseOrderLine.name,
            func.sum(PurchaseOrderLine.quantity_received).label("received"),
            func.sum(PurchaseOrderLine.quantity_returned).label("returned"),
            func.max(PurchaseOrderLine.unit_cost).label("unit_cost"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(
            PurchaseOrderLine.supplier_id == supplier_id,
            PurchaseOrder.company_id == company_id,
        )
        .group_by(PurchaseOrderLine.item_id, PurchaseOrderLine.sku, PurchaseOrderLine.name)
        .all()
    )
    item_ids = [row.item_id for row in rows]
    stock_by_item: dict[str, int] = {}
    sold_by_item: dict[str, int] = {}
    transferred_by_item: dict[str, int] = {}
    if item_ids:
        stock_by_item = {
            product.item_id: product.stock
            for product in db.query(CatalogProduct.item_id, CatalogProduct.stock).filter(
                CatalogProduct.item_id.in_(item_ids)
            )
        }
        sold_by_item = dict(
            db.query(
                InventoryStockMovement.item_id,
                func.sum(InventoryStockMovement.quantity),
            )
            .filter(
                InventoryStockMovement.item_id.in_(item_ids),
                InventoryStockMovement.movement_type.in_(
                    [MOVEMENT_SALES_DELIVERY, MOVEMENT_POS_SALE, MOVEMENT_COMMERCE_SALE]
                ),
            )
            .group_by(InventoryStockMovement.item_id)
            .all()
        )
        transferred_by_item = dict(
            db.query(
                InventoryStockMovement.item_id,
                func.sum(InventoryStockMovement.quantity),
            )
            .filter(
                InventoryStockMovement.item_id.in_(item_ids),
                InventoryStockMovement.movement_type == MOVEMENT_TRANSFER_OUT,
            )
            .group_by(InventoryStockMovement.item_id)
            .all()
        )
    data = [
        SupplierStockReportRow(
            item_id=row.item_id,
            sku=row.sku,
            name=row.name,
            purchased_qty=int(row.received or 0),
            total_sold=int(sold_by_item.get(row.item_id) or 0),
            total_transferred=int(transferred_by_item.get(row.item_id) or 0),
            returned_qty=int(row.returned or 0),
            current_stock=stock_by_item.get(row.item_id, 0),
            stock_value=round(
                stock_by_item.get(row.item_id, 0) * (row.unit_cost or 0),
                2,
            ),
        )
        for row in rows
    ]
    return SupplierStockReportResponse(data=data)


@router.post("/orders/bulk-delete", response_model=PurchaseBulkDeleteResponse)
def bulk_delete_orders(
    payload: PurchaseBulkDeleteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBulkDeleteResponse:
    deleted, skipped = _service(db, company_id).bulk_delete_orders(payload.ids, actor_id=user.id)
    db.commit()
    return PurchaseBulkDeleteResponse(
        data=PurchaseBulkDeleteResult(deleted=deleted, skipped=skipped)
    )


@router.delete("/orders/{order_id}", status_code=204)
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    _service(db, company_id).delete_order(order_id, actor_id=user.id)
    db.commit()
    return Response(status_code=204)


@router.get("/orders/{order_id}", response_model=PurchaseOrderResponse)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseOrderResponse:
    order = _service(db, company_id).get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))


@router.get("/orders/{order_id}/history", response_model=PurchaseStatusHistoryListResponse)
def order_history(
    order_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseStatusHistoryListResponse:
    service = _service(db, company_id)
    if not service.get_order(order_id):
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return PurchaseStatusHistoryListResponse(
        data=reads.history_to_read(service.get_history(order_id))
    )


@router.post("/orders", response_model=PurchaseOrderResponse, status_code=201)
def create_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "create")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseOrderResponse:
    service = _service(db, company_id)
    lines = [
        PurchaseLineInput(
            item_id=service.resolve_item_id(item_id=line.item_id, sku=line.sku),
            quantity_ordered=line.quantity_ordered,
            unit_cost=line.unit_cost,
            tax_rate=line.tax_rate,
            discount_amount=line.discount_amount,
            notes=line.notes,
        )
        for line in payload.lines
    ]
    order = service.create_order(
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        lines=lines,
        company_id=company_id,
        order_date=payload.order_date,
        expected_date=payload.expected_date,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        allow_over_receive=payload.allow_over_receive,
        created_by=user.id,
    )
    db.commit()
    db.refresh(order)
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))


@router.put("/orders/{order_id}", response_model=PurchaseOrderResponse)
def update_order(
    order_id: str,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseOrderResponse:
    service = _service(db, company_id)
    lines = [
        PurchaseLineInput(
            item_id=service.resolve_item_id(item_id=line.item_id, sku=line.sku),
            quantity_ordered=line.quantity_ordered,
            unit_cost=line.unit_cost,
            tax_rate=line.tax_rate,
            discount_amount=line.discount_amount,
            notes=line.notes,
        )
        for line in payload.lines
    ]
    order = service.update_order(
        order_id,
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        lines=lines,
        order_date=payload.order_date,
        expected_date=payload.expected_date,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        allow_over_receive=payload.allow_over_receive,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(order)
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))


@router.post("/orders/{order_id}/confirm", response_model=PurchaseOrderResponse)
def confirm_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseOrderResponse:
    svc = _service(db, company_id)
    pending = svc.get_order(order_id)
    assert_can_approve(db, company_id, user, "purchase.order", getattr(pending, "total", None))
    order = svc.confirm_order(order_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))


@router.post("/orders/{order_id}/cancel", response_model=PurchaseOrderResponse)
def cancel_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
    reason: Optional[str] = Query(default=None),
) -> PurchaseOrderResponse:
    order = _service(db, company_id).cancel_order(order_id, actor_id=user.id, reason=reason)
    db.commit()
    db.refresh(order)
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))


@router.patch("/orders/{order_id}", response_model=PurchaseOrderResponse)
def update_order_status(
    order_id: str,
    payload: PurchaseOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseOrderResponse:
    order = _service(db, company_id).update_status(
        order_id, payload.status, actor_id=user.id, notes=payload.notes
    )
    db.commit()
    db.refresh(order)
    return PurchaseOrderResponse(data=reads.order_to_read(db, order))
