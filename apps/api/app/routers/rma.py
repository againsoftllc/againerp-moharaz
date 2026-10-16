from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.rma.ticket import (
    RmaBillRead,
    RmaBillRequest,
    RmaBillResponse,
    RmaChargeCreate,
    RmaCreate,
    RmaDashboardRead,
    RmaDashboardResponse,
    RmaHistoryListResponse,
    RmaHistoryRead,
    RmaInspectionRequest,
    RmaListMeta,
    RmaListResponse,
    RmaReasonListResponse,
    RmaReasonRead,
    RmaRefundRequest,
    RmaReplacementRequest,
    RmaReportsResponse,
    RmaResolveRequest,
    RmaResponse,
    RmaServiceJobRequest,
    RmaStatusChange,
    RmaStockReleaseRequest,
    RmaSupplierJobUpsert,
    RmaTicketRead,
    RmaUpdate,
    RmaWarrantyOverride,
    WarrantyLookupRead,
    WarrantyLookupResponse,
    OrderSearchHitRead,
    OrderSearchLineRead,
    OrderSearchResponse,
)
from app.services.rma import rma_service
from app.services.rma.rma_service import TicketIntake

router = APIRouter(prefix="/rma", tags=["rma"])


def _read(ticket) -> RmaTicketRead:
    return RmaTicketRead.model_validate(ticket)


@router.get("/dashboard", response_model=RmaDashboardResponse)
def rma_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDashboardResponse:
    return RmaDashboardResponse(
        data=RmaDashboardRead(**rma_service.dashboard(db, company_id))
    )


@router.get("/warranty-lookup", response_model=WarrantyLookupResponse)
def warranty_lookup(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    order_number: Optional[str] = Query(default=None),
    sku: Optional[str] = Query(default=None),
) -> WarrantyLookupResponse:
    """Check a claim before opening a ticket — who bought it and is it covered."""
    order, item, product = rma_service.lookup_sale(db, order_number=order_number, sku=sku)
    verdict, purchased = rma_service.warranty_for(order, product)
    return WarrantyLookupResponse(
        data=WarrantyLookupRead(
            order_number=order.order_number if order else order_number,
            order_found=order is not None,
            purchased_at=purchased,
            customer_id=order.customer_id if order else None,
            customer_name=order.customer_name if order else None,
            customer_phone=order.customer_phone if order else None,
            customer_email=order.customer_email if order else None,
            sku=sku or (item.sku if item else None),
            product_name=product.name if product else None,
            warranty_text=product.warranty if product else None,
            warranty_status=verdict.status,
            warranty_expires_on=verdict.expires_on,
            warranty_note=verdict.note,
        )
    )


@router.get("/order-search", response_model=OrderSearchResponse)
def order_search(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    q: str = Query(default="", min_length=0, max_length=128),
) -> OrderSearchResponse:
    """Find orders by order number, customer phone, or product serial."""
    rows = rma_service.search_orders(db, q)
    return OrderSearchResponse(
        data=[
            OrderSearchHitRead(
                order_id=row["order_id"],
                order_number=row["order_number"],
                source=row["source"],
                customer_id=row.get("customer_id"),
                customer_name=row.get("customer_name") or "",
                customer_phone=row.get("customer_phone") or "",
                customer_email=row.get("customer_email") or "",
                purchased_at=row.get("purchased_at"),
                matched_by=row["matched_by"],
                matched_serial=row.get("matched_serial"),
                lines=[OrderSearchLineRead(**line) for line in row.get("lines") or []],
            )
            for row in rows
        ]
    )


@router.get("/tickets", response_model=RmaListResponse)
def list_tickets(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    warranty_status: Optional[str] = Query(
        default=None, pattern="^(in_warranty|out_of_warranty|unknown)$"
    ),
    rma_type: Optional[str] = Query(default=None, pattern="^(customer|warranty|supplier)$"),
    supplier_id: Optional[str] = Query(default=None),
    item_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> RmaListResponse:
    rows, total = rma_service.list_tickets(
        db,
        company_id=company_id,
        status=status,
        warranty_status=warranty_status,
        supplier_id=supplier_id,
        rma_type=rma_type,
        item_id=item_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    data = [_read(r) for r in rows]
    return RmaListResponse(
        data=data,
        meta=RmaListMeta(count=len(data), total=total, limit=limit, offset=offset),
    )


@router.get("/tickets/{ticket_id}", response_model=RmaResponse)
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    return RmaResponse(data=_read(rma_service.get_ticket(db, ticket_id, company_id=company_id)))


@router.get("/tickets/{ticket_id}/history", response_model=RmaHistoryListResponse)
def ticket_history(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
) -> RmaHistoryListResponse:
    rows = rma_service.history(db, ticket_id)
    return RmaHistoryListResponse(data=[RmaHistoryRead.model_validate(r) for r in rows])


@router.post("/tickets", response_model=RmaResponse, status_code=201)
def create_ticket(
    payload: RmaCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.create_ticket(
        db,
        TicketIntake(
            fault_reported=payload.fault_reported,
            company_id=company_id,
            order_number=payload.order_number,
            order_item_id=payload.order_item_id,
            customer_id=payload.customer_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            customer_email=payload.customer_email,
            sku=payload.sku,
            product_name=payload.product_name,
            serial_number=payload.serial_number,
            quantity=payload.quantity,
            received_by=payload.received_by,
            accessories=payload.accessories,
            condition_notes=payload.condition_notes,
            priority=payload.priority,
            assigned_to=payload.assigned_to,
            created_by=user.id,
            rma_type=payload.rma_type,
            reason_id=payload.reason_id,
            warehouse_id=payload.warehouse_id,
            start_status=payload.start_status,
            courier=payload.courier,
            tracking_number=payload.tracking_number,
            internal_notes=payload.internal_notes,
            claim_group_id=payload.claim_group_id,
        ),
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.patch("/tickets/{ticket_id}", response_model=RmaResponse)
def update_ticket(
    ticket_id: str,
    payload: RmaUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(ticket, key, value)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/status", response_model=RmaResponse)
def change_status(
    ticket_id: str,
    payload: RmaStatusChange,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.change_status(db, ticket, payload.status, actor=user.id, note=payload.note)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/warranty", response_model=RmaResponse)
def override_warranty(
    ticket_id: str,
    payload: RmaWarrantyOverride,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.set_warranty(
        db,
        ticket,
        status=payload.warranty_status,
        note=payload.note,
        expires_on=payload.warranty_expires_on,
        actor=user.name or user.username,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/warranty/recheck", response_model=RmaResponse)
def recheck_warranty(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.recheck_warranty(db, ticket)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/charges", response_model=RmaResponse, status_code=201)
def add_charge(
    ticket_id: str,
    payload: RmaChargeCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.add_charge(
        db,
        ticket,
        kind=payload.kind,
        description=payload.description,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        tax_rate=payload.tax_rate,
        item_id=payload.item_id,
        sku=payload.sku,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.delete("/tickets/{ticket_id}/charges/{charge_id}", response_model=RmaResponse)
def remove_charge(
    ticket_id: str,
    charge_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.remove_charge(db, ticket, charge_id)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.put("/tickets/{ticket_id}/supplier-job", response_model=RmaResponse)
def upsert_supplier_job(
    ticket_id: str,
    payload: RmaSupplierJobUpsert,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.upsert_supplier_job(
        db,
        ticket,
        supplier_id=payload.supplier_id,
        status=payload.status,
        dispatched_at=payload.dispatched_at,
        supplier_reference=payload.supplier_reference,
        expected_return_date=payload.expected_return_date,
        returned_at=payload.returned_at,
        outcome=payload.outcome,
        cost=payload.cost,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/bill", response_model=RmaBillResponse, status_code=201)
def raise_bill(
    ticket_id: str,
    payload: RmaBillRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaBillResponse:
    """Charges become a customer receivable, the same as any other invoice."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    receivable = rma_service.raise_bill(db, ticket, due_date=payload.due_date)
    db.commit()
    return RmaBillResponse(
        data=RmaBillRead(
            receivable_id=receivable.id,
            invoice_number=receivable.invoice_number,
            amount=receivable.amount,
            due_date=receivable.due_date,
        )
    )


@router.delete("/tickets/{ticket_id}", status_code=204)
def cancel_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    """Tickets are cancelled, never deleted — the trail has to survive."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.change_status(db, ticket, "cancelled", actor=user.id, note="Cancelled")
    db.commit()
    return Response(status_code=204)


@router.get("/reasons", response_model=RmaReasonListResponse)
def list_reasons(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReasonListResponse:
    from app.services.rma.schema import seed_rma_reasons

    seed_rma_reasons(db, company_id)
    db.commit()
    rows = rma_service.list_reasons(db, company_id=company_id)
    return RmaReasonListResponse(data=[RmaReasonRead.model_validate(row) for row in rows])


@router.get("/reports", response_model=RmaReportsResponse)
def rma_reports(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReportsResponse:
    return RmaReportsResponse(data=rma_service.reports(db, company_id))


@router.post("/tickets/{ticket_id}/inspect", response_model=RmaResponse)
def inspect_ticket(
    ticket_id: str,
    payload: RmaInspectionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.inspect_ticket(
        db,
        ticket,
        physical_condition=payload.physical_condition,
        functional_result=payload.functional_result,
        qc_result=payload.qc_result,
        notes=payload.notes,
        accessories=payload.accessories,
        actor=user.id,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/resolve", response_model=RmaResponse)
def resolve_ticket(
    ticket_id: str,
    payload: RmaResolveRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.set_resolution(
        db, ticket, resolution_type=payload.resolution_type, actor=user.id, note=payload.note
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/create-service", response_model=RmaResponse)
def create_service_job(
    ticket_id: str,
    payload: RmaServiceJobRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.create_service_from_rma(
        db,
        ticket,
        actor=user.id,
        labour_total=payload.labour_total,
        parts_total=payload.parts_total,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/refund", response_model=RmaResponse)
def refund_ticket(
    ticket_id: str,
    payload: RmaRefundRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.process_refund(
        db, ticket, amount=payload.amount, method=payload.method, actor=user.id
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/replacement", response_model=RmaResponse)
def replace_ticket(
    ticket_id: str,
    payload: RmaReplacementRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.issue_replacement(
        db,
        ticket,
        item_id=payload.item_id,
        warehouse_id=payload.warehouse_id,
        quantity=payload.quantity,
        actor=user.id,
    )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/release-stock", response_model=RmaResponse)
def release_stock(
    ticket_id: str,
    payload: RmaStockReleaseRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.release_to_stock(db, ticket, warehouse_id=payload.warehouse_id, actor=user.id)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/scrap", response_model=RmaResponse)
def scrap_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.scrap_unit(db, ticket, actor=user.id)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))
