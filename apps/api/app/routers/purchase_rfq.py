from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.purchase_rfq import PurchaseRfq, PurchaseRfqQuote
from app.schemas.purchase.order import (
    PurchaseBulkDeleteRequest,
    PurchaseBulkDeleteResponse,
    PurchaseBulkDeleteResult,
    PurchaseStatusHistoryListResponse,
    PurchaseStatusHistoryRead,
)
from app.schemas.purchase.rfq import (
    PurchaseRfqCreate,
    PurchaseRfqInviteRead,
    PurchaseRfqLineRead,
    PurchaseRfqLinkPoRequest,
    PurchaseRfqListMeta,
    PurchaseRfqListResponse,
    PurchaseRfqQuoteCreate,
    PurchaseRfqQuoteFlatRead,
    PurchaseRfqQuoteLineRead,
    PurchaseRfqQuoteListMeta,
    PurchaseRfqQuoteListResponse,
    PurchaseRfqQuoteRead,
    PurchaseRfqQuoteStatusUpdate,
    PurchaseRfqQuoteUpdate,
    PurchaseRfqRead,
    PurchaseRfqResponse,
    PurchaseRfqStatusUpdate,
    PurchaseRfqUpdate,
)
from app.services.purchase.purchase_rfq_service import (
    PurchaseRfqService,
    RfqLineInput,
    RfqQuoteLineInput,
)

router = APIRouter(prefix="/purchase", tags=["purchase-rfq"])


def _service(db: Session, company_id: str) -> PurchaseRfqService:
    return PurchaseRfqService(db, company_id=company_id)


# ------------------------------------------------------------- read helpers
# (Small, local read-side joins — same idea as purchase_read_service.py's
# supplier/warehouse name maps for purchase orders, scoped to this router
# rather than shared, since RFQ is a self-contained new domain.)


def _supplier_names(db: Session, supplier_ids: set[str]) -> dict[str, str]:
    if not supplier_ids:
        return {}
    return {
        s.id: s.name
        for s in db.query(CommerceSupplier).filter(CommerceSupplier.id.in_(supplier_ids)).all()
    }


def _quote_to_read(
    db: Session,
    quote: PurchaseRfqQuote,
    service: PurchaseRfqService,
    supplier_names: Optional[dict[str, str]] = None,
) -> PurchaseRfqQuoteRead:
    lines = service.get_quote_lines(quote.id)
    names = supplier_names if supplier_names is not None else _supplier_names(db, {quote.supplier_id})
    return PurchaseRfqQuoteRead(
        id=quote.id,
        purchase_rfq_id=quote.purchase_rfq_id,
        supplier_id=quote.supplier_id,
        supplier_name=names.get(quote.supplier_id),
        quote_number=quote.quote_number,
        status=quote.status,
        valid_until=quote.valid_until,
        lead_time_days=quote.lead_time_days,
        moq=quote.moq,
        total_amount=quote.total_amount,
        submitted_at=quote.submitted_at,
        source=quote.source,
        notes=quote.notes,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        line_quotes=[
            PurchaseRfqQuoteLineRead(id=l.id, rfq_line_id=l.purchase_rfq_line_id, unit_price=l.unit_price)
            for l in lines
        ],
    )


def _rfq_to_read(db: Session, rfq: PurchaseRfq, service: PurchaseRfqService) -> PurchaseRfqRead:
    lines = service.get_lines(rfq.id)
    invites = service.get_invites(rfq.id)
    quotes = service.get_quotes(rfq.id)
    supplier_ids = {i.supplier_id for i in invites} | {q.supplier_id for q in quotes}
    names = _supplier_names(db, supplier_ids)
    return PurchaseRfqRead(
        id=rfq.id,
        company_id=rfq.company_id,
        rfq_number=rfq.rfq_number,
        title=rfq.title,
        status=rfq.status,
        deadline=rfq.deadline,
        buyer_name=rfq.buyer_name,
        notes=rfq.notes,
        created_by=rfq.created_by,
        sent_at=rfq.sent_at,
        sent_by=rfq.sent_by,
        awarded_supplier_id=rfq.awarded_supplier_id,
        linked_po_id=rfq.linked_po_id,
        cancelled_at=rfq.cancelled_at,
        cancelled_by=rfq.cancelled_by,
        created_at=rfq.created_at,
        updated_at=rfq.updated_at,
        lines=[
            PurchaseRfqLineRead(
                id=l.id,
                item_id=l.item_id,
                sku=l.sku,
                name=l.name,
                quantity=l.quantity,
                sort_order=l.sort_order,
            )
            for l in lines
        ],
        invited_supplier_ids=[i.supplier_id for i in invites],
        invites=[
            PurchaseRfqInviteRead(
                supplier_id=i.supplier_id,
                supplier_name=names.get(i.supplier_id),
                invited_at=i.invited_at,
                viewed_at=i.viewed_at,
            )
            for i in invites
        ],
        quotes=[_quote_to_read(db, q, service, names) for q in quotes],
    )


def _flat_quote_read(
    db: Session,
    quote: PurchaseRfqQuote,
    service: PurchaseRfqService,
    rfq: Optional[PurchaseRfq],
    supplier_names: Optional[dict[str, str]] = None,
) -> PurchaseRfqQuoteFlatRead:
    base = _quote_to_read(db, quote, service, supplier_names)
    return PurchaseRfqQuoteFlatRead(
        **base.model_dump(),
        rfq_number=rfq.rfq_number if rfq else "",
        rfq_title=rfq.title if rfq else "",
        rfq_status=rfq.status if rfq else "",
    )


def _lines_from_payload(service: PurchaseRfqService, lines) -> list[RfqLineInput]:
    return [
        RfqLineInput(
            item_id=service.resolve_item_id(item_id=line.item_id, sku=line.sku),
            quantity=line.quantity,
        )
        for line in lines
    ]


def _line_quotes_from_payload(line_quotes) -> list[RfqQuoteLineInput]:
    return [
        RfqQuoteLineInput(rfq_line_id=lq.rfq_line_id, unit_price=lq.unit_price) for lq in line_quotes
    ]


# ---------------------------------------------------------------------- rfqs


@router.get("/rfqs", response_model=PurchaseRfqListResponse)
def list_rfqs(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> PurchaseRfqListResponse:
    service = _service(db, company_id)
    rows, total = service.list_rfqs(
        company_id=company_id,
        status=status,
        supplier_id=supplier_id,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return PurchaseRfqListResponse(
        data=[_rfq_to_read(db, r, service) for r in rows],
        meta=PurchaseRfqListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("/rfqs/bulk-delete", response_model=PurchaseBulkDeleteResponse)
def bulk_delete_rfqs(
    payload: PurchaseBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBulkDeleteResponse:
    deleted, skipped = _service(db, company_id).bulk_delete_rfqs(payload.ids)
    db.commit()
    return PurchaseBulkDeleteResponse(data=PurchaseBulkDeleteResult(deleted=deleted, skipped=skipped))


@router.delete("/rfqs/{rfq_id}", status_code=204)
def delete_rfq(
    rfq_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    _service(db, company_id).delete_rfq(rfq_id)
    db.commit()
    return Response(status_code=204)


@router.get("/rfqs/{rfq_id}", response_model=PurchaseRfqResponse)
def get_rfq(
    rfq_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.get_rfq(rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.get("/rfqs/{rfq_id}/history", response_model=PurchaseStatusHistoryListResponse)
def rfq_history(
    rfq_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseStatusHistoryListResponse:
    service = _service(db, company_id)
    if not service.get_rfq(rfq_id):
        raise HTTPException(status_code=404, detail="RFQ not found")
    history = service.get_history(rfq_id)
    return PurchaseStatusHistoryListResponse(
        data=[
            PurchaseStatusHistoryRead(
                id=h.id,
                from_status=h.from_status,
                to_status=h.to_status,
                changed_by=h.changed_by,
                notes=h.notes,
                created_at=h.created_at,
            )
            for h in history
        ]
    )


@router.post("/rfqs", response_model=PurchaseRfqResponse, status_code=201)
def create_rfq(
    payload: PurchaseRfqCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "create")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.create_rfq(
        company_id=company_id,
        title=payload.title,
        deadline=payload.deadline,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        invited_supplier_ids=payload.invited_supplier_ids,
        lines=_lines_from_payload(service, payload.lines),
        created_by=user.id,
    )
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.put("/rfqs/{rfq_id}", response_model=PurchaseRfqResponse)
def update_rfq(
    rfq_id: str,
    payload: PurchaseRfqUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.update_rfq(
        rfq_id,
        title=payload.title,
        deadline=payload.deadline,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        invited_supplier_ids=payload.invited_supplier_ids,
        lines=_lines_from_payload(service, payload.lines),
        actor_id=user.id,
    )
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.patch("/rfqs/{rfq_id}", response_model=PurchaseRfqResponse)
def update_rfq_status(
    rfq_id: str,
    payload: PurchaseRfqStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.update_status(rfq_id, payload.status, actor_id=user.id, notes=payload.notes)
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.post("/rfqs/{rfq_id}/send", response_model=PurchaseRfqResponse)
def send_rfq(
    rfq_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.send_rfq(rfq_id, actor_id=user.id)
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.post("/rfqs/{rfq_id}/cancel", response_model=PurchaseRfqResponse)
def cancel_rfq(
    rfq_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
    reason: Optional[str] = Query(default=None),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.cancel_rfq(rfq_id, actor_id=user.id, reason=reason)
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


# -------------------------------------------------------------------- quotes


@router.post("/rfqs/{rfq_id}/quotes", response_model=PurchaseRfqResponse, status_code=201)
def create_quote(
    rfq_id: str,
    payload: PurchaseRfqQuoteCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    """Staff records a quote on behalf of a supplier (e.g. a phoned-in bid)."""
    service = _service(db, company_id)
    if not service.get_rfq(rfq_id):
        raise HTTPException(status_code=404, detail="RFQ not found")
    service.submit_quote(
        rfq_id,
        payload.supplier_id,
        quote_number=payload.quote_number,
        valid_until=payload.valid_until,
        lead_time_days=payload.lead_time_days,
        moq=payload.moq,
        line_quotes=_line_quotes_from_payload(payload.line_quotes),
        source="manual",
        notes=payload.notes,
    )
    db.commit()
    rfq = service.get_rfq(rfq_id)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.put("/rfqs/{rfq_id}/quotes/{quote_id}", response_model=PurchaseRfqResponse)
def update_quote(
    rfq_id: str,
    quote_id: str,
    payload: PurchaseRfqQuoteUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    quote = service.get_quote(quote_id)
    if not quote or quote.purchase_rfq_id != rfq_id:
        raise HTTPException(status_code=404, detail="Quote not found on this RFQ")
    service.update_quote(
        quote_id,
        quote_number=payload.quote_number,
        valid_until=payload.valid_until,
        lead_time_days=payload.lead_time_days,
        moq=payload.moq,
        line_quotes=_line_quotes_from_payload(payload.line_quotes),
        notes=payload.notes,
    )
    db.commit()
    rfq = service.get_rfq(rfq_id)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.post("/rfqs/{rfq_id}/quotes/{quote_id}/award", response_model=PurchaseRfqResponse)
def award_quote(
    rfq_id: str,
    quote_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.award_quote(rfq_id, quote_id, actor_id=user.id)
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


@router.post("/rfqs/{rfq_id}/link-po", response_model=PurchaseRfqResponse)
def link_po(
    rfq_id: str,
    payload: PurchaseRfqLinkPoRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqResponse:
    service = _service(db, company_id)
    rfq = service.link_po(rfq_id, payload.po_id, actor_id=user.id)
    db.commit()
    db.refresh(rfq)
    return PurchaseRfqResponse(data=_rfq_to_read(db, rfq, service))


# ------------------------------------------------------- flat quotations page


@router.get("/rfq-quotes", response_model=PurchaseRfqQuoteListResponse)
def list_all_quotes(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    rfq_id: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> PurchaseRfqQuoteListResponse:
    service = _service(db, company_id)
    rows, total = service.list_quotes(
        company_id=company_id,
        status=status,
        rfq_id=rfq_id,
        supplier_id=supplier_id,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    rfqs = (
        {
            r.id: r
            for r in db.query(PurchaseRfq)
            .filter(PurchaseRfq.id.in_({q.purchase_rfq_id for q in rows}))
            .all()
        }
        if rows
        else {}
    )
    supplier_names = _supplier_names(db, {q.supplier_id for q in rows})
    data = [_flat_quote_read(db, q, service, rfqs.get(q.purchase_rfq_id), supplier_names) for q in rows]
    return PurchaseRfqQuoteListResponse(
        data=data, meta=PurchaseRfqQuoteListMeta(count=total, page=page, per_page=per_page)
    )


@router.patch("/rfq-quotes/{quote_id}/status", response_model=PurchaseRfqQuoteFlatRead)
def update_quote_status(
    quote_id: str,
    payload: PurchaseRfqQuoteStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseRfqQuoteFlatRead:
    service = _service(db, company_id)
    quote = service.get_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    service.update_quote_status(quote_id, payload.status, actor_id=user.id)
    db.commit()
    quote = service.get_quote(quote_id)
    rfq = service.get_rfq(quote.purchase_rfq_id)
    return _flat_quote_read(db, quote, service, rfq)


@router.post("/rfq-quotes/bulk-delete", response_model=PurchaseBulkDeleteResponse)
def bulk_delete_quotes(
    payload: PurchaseBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PurchaseBulkDeleteResponse:
    deleted, skipped = _service(db, company_id).bulk_delete_quotes(payload.ids)
    db.commit()
    return PurchaseBulkDeleteResponse(data=PurchaseBulkDeleteResult(deleted=deleted, skipped=skipped))
