from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.rma.register import (
    RmaAnalysisResponse,
    RmaAnalysisRow,
    RmaRegisterResponse,
    RmaRegisterRow,
    RmaRegisterTotals,
)
from app.schemas.rma.ticket import (
    RmaBillRead,
    RmaBillRequest,
    RmaBillResponse,
    RmaChargeCreate,
    RmaCreate,
    RmaCustomerLockRead,
    RmaCustomerLockResponse,
    RmaDashboardRead,
    RmaGenerateSerialsRequest,
    RmaGenerateSerialsResponse,
    RmaDecisionRequest,
    RmaPriorRead,
    RmaPriorResponse,
    RmaReceiptRead,
    RmaReceiptResponse,
    RmaStockEventRead,
    RmaStockEventResponse,
    RmaStockReportRead,
    RmaStockReportResponse,
    RmaStoreListResponse,
    RmaStoreRead,
    RmaTraceRead,
    RmaTraceResponse,
    RmaDashboardResponse,
    RmaHistoryListResponse,
    RmaHistoryRead,
    RmaListMeta,
    RmaListResponse,
    RmaQueuesRead,
    RmaQueuesResponse,
    RmaServiceJobRead,
    RmaServiceJobResponse,
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
from app.services import rbac
from app.services.rma import decision_rights
from app.services.rma import complaint_service, queue_service, rma_service, stock_report_service
from app.services.rma.rma_service import TicketIntake

from app.services.rma.warranty import product_warranty_text as warranty_text_of

router = APIRouter(prefix="/rma", tags=["rma"])


def _read(ticket) -> RmaTicketRead:
    return RmaTicketRead.model_validate(ticket)


def _can(db: Session, user: AuthUser, module: str) -> bool:
    """Whether the user holds a privileged RMA grant (`rma_approve` / `rma_override` / `rma_reprint`)."""
    return rbac.has_permission(db, user, module, "write")


def _need(db: Session, user: AuthUser, module: str, what: str) -> None:
    if not _can(db, user, module):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")


@router.get("/dashboard", response_model=RmaDashboardResponse)
def rma_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDashboardResponse:
    return RmaDashboardResponse(
        data=RmaDashboardRead(**rma_service.dashboard(db, company_id))
    )


@router.get("/queues", response_model=RmaQueuesResponse)
def rma_queues(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaQueuesResponse:
    """The work queues: overdue RMAs, units waiting on a supplier (with how long and whether they are late), repeat RMAs."""
    return RmaQueuesResponse(data=RmaQueuesRead(**queue_service.queues(db, company_id)))


@router.get("/stock-report", response_model=RmaStockReportResponse)
def rma_stock_report(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaStockReportResponse:
    """Every unit in an RMA store or out with a supplier right now, tied to its RMA (docs/RMA.md)."""
    return RmaStockReportResponse(data=RmaStockReportRead(**stock_report_service.stock_report(db, company_id)))


@router.get("/tickets/{ticket_id}/service-job", response_model=RmaServiceJobResponse)
def rma_service_job(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaServiceJobResponse:
    """The linked Service / Job Card (none when the RMA has no job card)."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    summary = queue_service.service_job_summary(db, ticket)
    return RmaServiceJobResponse(data=RmaServiceJobRead(**summary) if summary else None)


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
            warranty_text=warranty_text_of(product),
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
    queue: Optional[str] = Query(default=None, pattern="^(overdue|supplier_pending|repeat)$"),
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
        queue=queue,
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
            assigned_to_user_id=payload.assigned_to_user_id,
            promised_delivery_date=payload.promised_delivery_date,
            charge_estimate=payload.charge_estimate,
            diagnosis_required=payload.diagnosis_required,
            diagnosis_report=payload.diagnosis_report,
            supplier_id=payload.supplier_id,
            supplier_override_reason=payload.supplier_override_reason,
            can_override=_can(db, user, "rma_override"),
            unit_received=payload.unit_received,
            sale_source=payload.sale_source,
            previous_invoice_no=payload.previous_invoice_no,
            previous_sale_date=payload.previous_sale_date,
            serial_generated=payload.serial_generated,
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
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    reason = changes.pop("override_reason", None)

    # Values that came from the sale, the serial registry or the purchase trace change only with the override
    # permission and a reason, and the change is written to the activity log.
    protected = complaint_service.check_protected_changes(
        ticket, changes, can_override=_can(db, user, "rma_override"), reason=reason
    )
    if "warehouse_id" in changes and changes["warehouse_id"] != ticket.warehouse_id:
        if complaint_service.stock_event(db, ticket.id, "intake") is not None:
            raise HTTPException(
                status_code=400,
                detail="The unit is already stocked in this RMA store; it cannot be moved by editing the claim.",
            )
        complaint_service.require_rma_store(db, ticket.company_id, changes["warehouse_id"])

    new_supplier = changes.pop("supplier_id", None) if "supplier_id" in protected else None
    if "supplier_id" in changes:  # unchanged value
        changes.pop("supplier_id")
    assignee_id = changes.pop("assigned_to_user_id", None)
    if assignee_id:
        from app.models.auth_user import AuthUser as _User

        assignee = db.get(_User, assignee_id)
        if assignee is None or assignee.company_id != ticket.company_id:
            raise HTTPException(status_code=400, detail="The assigned staff member was not found.")
        ticket.assigned_to_user_id = assignee.id
        ticket.assigned_to = assignee.name or assignee.username
    changes.pop("supplier_name", None)

    for key, value in changes.items():
        setattr(ticket, key, value)
    if new_supplier:
        complaint_service.set_supplier_manually(
            db, ticket, supplier_id=new_supplier, reason=reason or "", actor=user.id
        )
    for key, (old, new) in protected.items():
        if key == "supplier_id":
            continue
        complaint_service.record_activity(
            db, ticket, "protected_field_changed", actor=user.id,
            old_value=str(old) if old is not None else None, new_value=str(new),
            details={"field": key, "reason": reason},
        )
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.get("/stores", response_model=RmaStoreListResponse)
def list_rma_stores(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaStoreListResponse:
    """Warehouses flagged as RMA stores (a default "RMA Store" is created the first time)."""
    rows = complaint_service.rma_stores(db, company_id)
    db.commit()
    return RmaStoreListResponse(data=[RmaStoreRead(id=w.id, code=w.code, name=w.name) for w in rows])


@router.get("/trace", response_model=RmaTraceResponse)
def trace_serial(
    serial: str = Query(min_length=1, max_length=128),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaTraceResponse:
    """Supplier, purchase receipt and vendor invoice behind a serial."""
    data = complaint_service.trace_purchase(db, serial, company_id)
    return RmaTraceResponse(
        data=RmaTraceRead(
            source=data["source"],
            supplier_id=data["supplier_id"],
            supplier_name=data["supplier_name"],
            purchase_receipt_no=data["purchase_receipt_no"],
            purchase_bill_no=data["purchase_bill_no"],
            vendor_invoice_no=data["vendor_invoice_no"],
        )
    )


@router.get("/prior", response_model=RmaPriorResponse)
def prior_claims(
    serial: Optional[str] = Query(default=None, max_length=128),
    item_id: Optional[str] = Query(default=None, max_length=36),
    customer_id: Optional[str] = Query(default=None, max_length=36),
    exclude_id: Optional[str] = Query(default=None, max_length=36),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaPriorResponse:
    """Earlier claims on the same unit — shown as a warning, never blocks the new one."""
    rows = complaint_service.prior_tickets(
        db, company_id, serial_number=serial, item_id=item_id, customer_id=customer_id, exclude_id=exclude_id
    )
    return RmaPriorResponse(data=[RmaPriorRead.model_validate(r) for r in rows])


@router.post("/tickets/{ticket_id}/submit", response_model=RmaResponse)
def submit_for_approval(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    """Send a draft (or a complaint returned for correction) to the approver."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    complaint_service.submit_for_approval(db, ticket, actor=user.id)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/decision", response_model=RmaResponse)
def decide_complaint(
    ticket_id: str,
    payload: RmaDecisionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    """Approve, reject or return a complaint for correction. Approving stocks the unit into the RMA store once."""
    decision_rights.need_to_decide(db, user, "rma_approve", "approve or reject complaints")
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    complaint_service.decide(db, ticket, decision=payload.decision, reason=payload.reason, user=user)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))


@router.post("/tickets/{ticket_id}/receipt-print", response_model=RmaReceiptResponse)
def print_complaint_receipt(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    """The customer-facing complaint receipt. The first print is free; a reprint needs the reprint permission."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    reprint = (ticket.receipt_print_count or 0) > 0
    if reprint:
        _need(db, user, "rma_reprint", "reprint documents")
    complaint_service.count_receipt_print(db, ticket, actor=user.id)
    payload = complaint_service.receipt_payload(
        db, ticket, printed_by=user.name or user.username, reprint=reprint
    )
    db.commit()
    return RmaReceiptResponse(data=RmaReceiptRead(**payload))


@router.get("/tickets/{ticket_id}/stock-events", response_model=RmaStockEventResponse)
def ticket_stock_events(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaStockEventResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaStockEventResponse(
        data=[RmaStockEventRead(**row) for row in complaint_service.stock_events_view(db, ticket)]
    )


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
    # A warranty override decides who pays, so it is a protected action like the other overrides.
    _need(db, user, "rma_override", "override the warranty result")
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
        discount=payload.discount,
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
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaResponse:
    # The manual supplier job sets the supplier by hand: the normal path is a supplier claim, so this needs the override grant.
    _need(db, user, "rma_override", "set the supplier job by hand")
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
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaBillResponse:
    """Charges become a customer receivable, the same as any other invoice."""
    _need(db, user, "rma_payment", "invoice the RMA charges")
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


@router.post("/serials/generate", response_model=RmaGenerateSerialsResponse)
def generate_serials(
    payload: RmaGenerateSerialsRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaGenerateSerialsResponse:
    """Unique 8-character serials for units that have none (a non-serial product, or a previous / unknown sale)."""
    from app.services.rma import complaint_service

    return RmaGenerateSerialsResponse(data=complaint_service.generate_serials(db, company_id, payload.count))


@router.get("/customer-lock", response_model=RmaCustomerLockResponse)
def customer_lock(
    customer_id: str = Query(..., max_length=36),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaCustomerLockResponse:
    from app.services.rma import complaint_service

    lock = complaint_service.customer_rma_lock(db, customer_id, company_id)
    return RmaCustomerLockResponse(data=RmaCustomerLockRead(locked=lock is not None, **(lock or {})))


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


def _register_totals(rows) -> RmaRegisterTotals:
    zero = Decimal("0")
    return RmaRegisterTotals(
        count=sum(row.get("count", 1) for row in rows),
        amount=sum((row.get("amount") or zero for row in rows), zero),
        collected=sum((row.get("collected") or zero for row in rows), zero),
        refund=sum((row.get("refund") or zero for row in rows), zero),
    )


@router.get("/registers/{kind}", response_model=RmaRegisterResponse)
def rma_register(
    kind: str,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None, max_length=30),
    search: Optional[str] = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaRegisterResponse:
    """Complain / Replacement Claim / Replacement Receive / Customer Delivery register for a date range."""
    from app.services.rma import register_service

    rows = register_service.register(db, company_id, kind, date_from=date_from, date_to=date_to, status=status, search=search)
    return RmaRegisterResponse(
        data=[RmaRegisterRow(**row) for row in rows],
        totals=_register_totals(rows),
        group_options=register_service.ANALYSIS_GROUPS[kind],
    )


@router.get("/registers/{kind}/analysis", response_model=RmaAnalysisResponse)
def rma_register_analysis(
    kind: str,
    group_by: str = Query(..., max_length=30),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None, max_length=30),
    search: Optional[str] = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaAnalysisResponse:
    """The same register grouped by one field (product, customer, supplier, problem, type, status ...)."""
    from app.services.rma import register_service

    rows = register_service.analysis(
        db, company_id, kind, group_by=group_by, date_from=date_from, date_to=date_to, status=status, search=search
    )
    return RmaAnalysisResponse(
        data=[RmaAnalysisRow(**row) for row in rows],
        totals=_register_totals(rows),
        group_by=group_by,
        group_options=register_service.ANALYSIS_GROUPS[kind],
    )


@router.get("/reports", response_model=RmaReportsResponse)
def rma_reports(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReportsResponse:
    return RmaReportsResponse(data=rma_service.reports(db, company_id))


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
    _need(db, user, "rma_payment", "refund the customer")
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
    _need(db, user, "rma_stock_adjust", "issue a replacement from stock")
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
    _need(db, user, "rma_stock_adjust", "release the unit to stock")
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
    _need(db, user, "rma_stock_adjust", "scrap the unit")
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    rma_service.scrap_unit(db, ticket, actor=user.id)
    db.commit()
    db.refresh(ticket)
    return RmaResponse(data=_read(ticket))
