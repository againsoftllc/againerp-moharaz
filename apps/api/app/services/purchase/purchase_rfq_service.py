"""Purchase RFQ (Request for Quotation) business logic.

Mirrors `PurchaseOrderService`'s conventions exactly: every single-row getter
re-checks `row.company_id == self._company_id` even after a primary-key fetch,
list queries scope in the query itself, every write only `flush()`s (the
router commits), and all status changes go through one `_transition()` helper
that always writes a status-history row.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.item import Item
from app.models.purchase_rfq import (
    PurchaseRfq,
    PurchaseRfqInvite,
    PurchaseRfqLine,
    PurchaseRfqQuote,
    PurchaseRfqQuoteLine,
    PurchaseRfqStatusHistory,
)
from app.services.purchase.constants import QUOTE_STATUSES, RFQ_STATUSES, RFQ_STATUS_TRANSITIONS
from app.services.purchase.purchase_order_service import PurchaseOrderService
from app.services.core.sequence_service import next_number as allocate_number


@dataclass(frozen=True)
class RfqLineInput:
    item_id: str
    quantity: int


@dataclass(frozen=True)
class RfqQuoteLineInput:
    rfq_line_id: str
    unit_price: Decimal


class PurchaseRfqService:
    def __init__(self, db: Session, company_id: Optional[str] = None) -> None:
        self._db = db
        self._company_id = company_id

    # -------------------------------------------------------------- reads

    def list_rfqs(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        supplier_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseRfq], int]:
        query = self._db.query(PurchaseRfq).filter(PurchaseRfq.company_id == company_id)
        if status:
            query = query.filter(PurchaseRfq.status == status)
        if supplier_id:
            query = query.join(
                PurchaseRfqInvite, PurchaseRfqInvite.purchase_rfq_id == PurchaseRfq.id
            ).filter(PurchaseRfqInvite.supplier_id == supplier_id)
        total = query.count()
        rows = (
            query.order_by(PurchaseRfq.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_rfq(self, rfq_id: str) -> Optional[PurchaseRfq]:
        row = self._db.get(PurchaseRfq, rfq_id)
        if not row:
            return None
        if self._company_id is not None and (row.company_id or "default") != self._company_id:
            return None
        return row

    def get_lines(self, rfq_id: str) -> list[PurchaseRfqLine]:
        return (
            self._db.query(PurchaseRfqLine)
            .filter(PurchaseRfqLine.purchase_rfq_id == rfq_id)
            .order_by(PurchaseRfqLine.sort_order)
            .all()
        )

    def get_invites(self, rfq_id: str) -> list[PurchaseRfqInvite]:
        return (
            self._db.query(PurchaseRfqInvite)
            .filter(PurchaseRfqInvite.purchase_rfq_id == rfq_id)
            .order_by(PurchaseRfqInvite.invited_at)
            .all()
        )

    def get_quotes(self, rfq_id: str) -> list[PurchaseRfqQuote]:
        return (
            self._db.query(PurchaseRfqQuote)
            .filter(PurchaseRfqQuote.purchase_rfq_id == rfq_id)
            .order_by(PurchaseRfqQuote.created_at)
            .all()
        )

    def get_quote_lines(self, quote_id: str) -> list[PurchaseRfqQuoteLine]:
        return (
            self._db.query(PurchaseRfqQuoteLine)
            .filter(PurchaseRfqQuoteLine.purchase_rfq_quote_id == quote_id)
            .all()
        )

    def get_history(self, rfq_id: str) -> list[PurchaseRfqStatusHistory]:
        return (
            self._db.query(PurchaseRfqStatusHistory)
            .filter(PurchaseRfqStatusHistory.purchase_rfq_id == rfq_id)
            .order_by(PurchaseRfqStatusHistory.created_at.desc())
            .all()
        )

    def get_quote(self, quote_id: str) -> Optional[PurchaseRfqQuote]:
        """Company-scoped through its parent RFQ (quotes have no company_id of
        their own — they belong to exactly one RFQ, which does)."""
        row = self._db.get(PurchaseRfqQuote, quote_id)
        if not row:
            return None
        if self._company_id is not None and not self.get_rfq(row.purchase_rfq_id):
            return None
        return row

    def list_quotes(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        rfq_id: Optional[str] = None,
        supplier_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PurchaseRfqQuote], int]:
        """Flat, cross-RFQ listing for the Quotations page."""
        query = (
            self._db.query(PurchaseRfqQuote)
            .join(PurchaseRfq, PurchaseRfq.id == PurchaseRfqQuote.purchase_rfq_id)
            .filter(PurchaseRfq.company_id == company_id)
        )
        if status:
            query = query.filter(PurchaseRfqQuote.status == status)
        if rfq_id:
            query = query.filter(PurchaseRfqQuote.purchase_rfq_id == rfq_id)
        if supplier_id:
            query = query.filter(PurchaseRfqQuote.supplier_id == supplier_id)
        total = query.count()
        rows = (
            query.order_by(PurchaseRfqQuote.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    # ------------------------------------------------------------- writes

    def create_rfq(
        self,
        *,
        company_id: str = "default",
        title: str,
        deadline: Optional[date] = None,
        buyer_name: Optional[str] = None,
        notes: Optional[str] = None,
        invited_supplier_ids: Optional[list[str]] = None,
        lines: list[RfqLineInput],
        created_by: Optional[str] = None,
    ) -> PurchaseRfq:
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")

        rfq = PurchaseRfq(
            company_id=company_id,
            rfq_number=self._next_rfq_number(company_id),
            title=title,
            status="draft",
            deadline=deadline,
            buyer_name=buyer_name,
            notes=notes,
            created_by=created_by,
        )
        self._db.add(rfq)
        self._db.flush()

        self._replace_lines(rfq, lines)
        self._replace_invites(rfq, invited_supplier_ids or [])

        self._record_status(rfq.id, None, "draft", created_by, "RFQ created")
        self._db.flush()
        return rfq

    def update_rfq(
        self,
        rfq_id: str,
        *,
        title: str,
        deadline: Optional[date] = None,
        buyer_name: Optional[str] = None,
        notes: Optional[str] = None,
        invited_supplier_ids: Optional[list[str]] = None,
        lines: list[RfqLineInput],
        actor_id: Optional[str] = None,
    ) -> PurchaseRfq:
        rfq = self._require_rfq(rfq_id)
        if rfq.status in {"approved", "po_created", "cancelled"}:
            raise HTTPException(
                status_code=400,
                detail="RFQs that are approved, converted to a purchase order, or cancelled cannot be edited",
            )
        if not lines:
            raise HTTPException(status_code=400, detail="At least one line is required")

        self._replace_lines(rfq, lines, existing=self.get_lines(rfq.id))
        self._replace_invites(rfq, invited_supplier_ids or [])

        rfq.title = title
        rfq.deadline = deadline
        rfq.buyer_name = buyer_name
        rfq.notes = notes
        self._record_status(rfq.id, rfq.status, rfq.status, actor_id, "RFQ updated")
        self._db.flush()
        return rfq

    def _replace_lines(
        self,
        rfq: PurchaseRfq,
        lines: list[RfqLineInput],
        *,
        existing: Optional[list[PurchaseRfqLine]] = None,
    ) -> None:
        unused = list(existing or [])

        for idx, line_in in enumerate(lines, start=1):
            if line_in.quantity <= 0:
                raise HTTPException(status_code=400, detail="Line quantity must be positive")
            item = self._db.get(Item, line_in.item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"Item not found: {line_in.item_id}")

            match: Optional[PurchaseRfqLine] = None
            for pos, old in enumerate(unused):
                if old.item_id == line_in.item_id:
                    match = unused.pop(pos)
                    break

            if match:
                match.sku = item.sku
                match.name = item.name
                match.quantity = line_in.quantity
                match.sort_order = idx
            else:
                self._db.add(
                    PurchaseRfqLine(
                        purchase_rfq_id=rfq.id,
                        item_id=item.id,
                        sku=item.sku,
                        name=item.name,
                        quantity=line_in.quantity,
                        sort_order=idx,
                    )
                )

        for leftover in unused:
            has_quotes = (
                self._db.query(PurchaseRfqQuoteLine.id)
                .filter(PurchaseRfqQuoteLine.purchase_rfq_line_id == leftover.id)
                .first()
                is not None
            )
            if has_quotes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot remove {leftover.sku}: a supplier has already quoted this line",
                )
            self._db.delete(leftover)

    def _replace_invites(self, rfq: PurchaseRfq, supplier_ids: list[str]) -> None:
        wanted = list(dict.fromkeys(supplier_ids))
        existing = {inv.supplier_id: inv for inv in self.get_invites(rfq.id)}

        for supplier_id in wanted:
            if supplier_id in existing:
                continue
            supplier = self._db.get(CommerceSupplier, supplier_id)
            if not supplier:
                raise HTTPException(status_code=404, detail=f"Supplier not found: {supplier_id}")
            self._db.add(PurchaseRfqInvite(purchase_rfq_id=rfq.id, supplier_id=supplier_id))

        wanted_set = set(wanted)
        for supplier_id, invite in existing.items():
            if supplier_id in wanted_set:
                continue
            has_quote = (
                self._db.query(PurchaseRfqQuote.id)
                .filter(
                    PurchaseRfqQuote.purchase_rfq_id == rfq.id,
                    PurchaseRfqQuote.supplier_id == supplier_id,
                )
                .first()
                is not None
            )
            if has_quote:
                # Keep the invite so a supplier who already bid never silently
                # disappears from the comparison — un-inviting doesn't retract
                # a submitted quote.
                continue
            self._db.delete(invite)

    def send_rfq(self, rfq_id: str, *, actor_id: Optional[str] = None) -> PurchaseRfq:
        rfq = self._require_rfq(rfq_id)
        if not self.get_lines(rfq.id):
            raise HTTPException(status_code=400, detail="Add at least one line before sending")
        if not self.get_invites(rfq.id):
            raise HTTPException(status_code=400, detail="Invite at least one supplier before sending")
        self._transition(rfq, "sent", actor_id, "RFQ sent to suppliers")
        rfq.sent_at = datetime.utcnow()
        rfq.sent_by = actor_id
        self._db.flush()
        return rfq

    def cancel_rfq(
        self, rfq_id: str, *, actor_id: Optional[str] = None, reason: Optional[str] = None
    ) -> PurchaseRfq:
        rfq = self._require_rfq(rfq_id)
        self._transition(rfq, "cancelled", actor_id, reason or "RFQ cancelled")
        rfq.cancelled_at = datetime.utcnow()
        rfq.cancelled_by = actor_id
        self._db.flush()
        return rfq

    def delete_rfq(self, rfq_id: str) -> None:
        rfq = self._require_rfq(rfq_id)
        has_quotes = (
            self._db.query(PurchaseRfqQuote.id)
            .filter(PurchaseRfqQuote.purchase_rfq_id == rfq.id)
            .first()
            is not None
        )
        if has_quotes:
            raise HTTPException(
                status_code=400,
                detail=f"{rfq.rfq_number} has quotes recorded and cannot be deleted",
            )
        self._db.delete(rfq)
        self._db.flush()

    def bulk_delete_rfqs(self, rfq_ids: list[str]) -> tuple[int, list[str]]:
        deleted = 0
        skipped: list[str] = []
        for rid in rfq_ids:
            nested = self._db.begin_nested()
            try:
                self.delete_rfq(rid)
                nested.commit()
                deleted += 1
            except HTTPException as exc:
                nested.rollback()
                skipped.append(exc.detail if isinstance(exc.detail, str) else rid)
            except IntegrityError:
                nested.rollback()
                skipped.append(rid)
        return deleted, skipped

    def update_status(
        self,
        rfq_id: str,
        status: str,
        *,
        actor_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> PurchaseRfq:
        if status not in RFQ_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        rfq = self._require_rfq(rfq_id)
        if status == "cancelled":
            return self.cancel_rfq(rfq_id, actor_id=actor_id, reason=notes)
        self._transition(rfq, status, actor_id, notes)
        self._db.flush()
        return rfq

    def record_view(self, rfq_id: str, supplier_id: str) -> PurchaseRfq:
        """Called from the portal when a supplier opens an RFQ they were
        invited to. Marks the read receipt and, the first time this happens
        while the RFQ is `sent`, flips it internally to `vendor_response`."""
        rfq = self._require_rfq(rfq_id)
        invite = (
            self._db.query(PurchaseRfqInvite)
            .filter(
                PurchaseRfqInvite.purchase_rfq_id == rfq.id,
                PurchaseRfqInvite.supplier_id == supplier_id,
            )
            .first()
        )
        if not invite:
            raise HTTPException(status_code=404, detail="RFQ not found")
        if invite.viewed_at is None:
            invite.viewed_at = datetime.utcnow()
        if rfq.status == "sent":
            self._transition(rfq, "vendor_response", None, "Supplier viewed the RFQ", internal=True)
        self._db.flush()
        return rfq

    def submit_quote(
        self,
        rfq_id: str,
        supplier_id: str,
        *,
        quote_number: Optional[str] = None,
        valid_until: Optional[date] = None,
        lead_time_days: int = 0,
        moq: int = 0,
        line_quotes: list[RfqQuoteLineInput],
        source: str = "manual",
        notes: Optional[str] = None,
    ) -> PurchaseRfqQuote:
        """Creates (or, if this supplier already has a draft/submitted quote on
        this RFQ, updates in place) one supplier bid. Serves both the staff
        "record a phoned-in quote" route and the supplier portal's self-serve
        submission — same table, two entry points, distinguished only by
        `source`."""
        rfq = self._require_rfq(rfq_id)
        if rfq.status in {"approved", "po_created", "closed", "cancelled"}:
            raise HTTPException(
                status_code=400, detail=f"RFQ is {rfq.status} and no longer accepting quotes"
            )
        if not line_quotes:
            raise HTTPException(status_code=400, detail="At least one line price is required")

        supplier = self._db.get(CommerceSupplier, supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

        rfq_lines = {l.id: l for l in self.get_lines(rfq.id)}
        total = Decimal("0")
        validated: list[tuple[str, Decimal]] = []
        for lq in line_quotes:
            rfq_line = rfq_lines.get(lq.rfq_line_id)
            if not rfq_line:
                raise HTTPException(status_code=404, detail=f"RFQ line not found: {lq.rfq_line_id}")
            if lq.unit_price < 0:
                raise HTTPException(status_code=400, detail="Unit price cannot be negative")
            total += Decimal(rfq_line.quantity) * lq.unit_price
            validated.append((rfq_line.id, lq.unit_price))

        quote = (
            self._db.query(PurchaseRfqQuote)
            .filter(
                PurchaseRfqQuote.purchase_rfq_id == rfq.id,
                PurchaseRfqQuote.supplier_id == supplier_id,
                PurchaseRfqQuote.status.in_(("draft", "submitted")),
            )
            .first()
        )
        if quote:
            self._db.query(PurchaseRfqQuoteLine).filter(
                PurchaseRfqQuoteLine.purchase_rfq_quote_id == quote.id
            ).delete()
            quote.quote_number = quote_number
            quote.valid_until = valid_until
            quote.lead_time_days = lead_time_days
            quote.moq = moq
            quote.total_amount = total
            quote.status = "submitted"
            quote.submitted_at = datetime.utcnow()
            quote.source = source
            quote.notes = notes
        else:
            quote = PurchaseRfqQuote(
                purchase_rfq_id=rfq.id,
                supplier_id=supplier_id,
                quote_number=quote_number,
                status="submitted",
                valid_until=valid_until,
                lead_time_days=lead_time_days,
                moq=moq,
                total_amount=total,
                submitted_at=datetime.utcnow(),
                source=source,
                notes=notes,
            )
            self._db.add(quote)
        self._db.flush()

        for rfq_line_id, unit_price in validated:
            self._db.add(
                PurchaseRfqQuoteLine(
                    purchase_rfq_quote_id=quote.id,
                    purchase_rfq_line_id=rfq_line_id,
                    unit_price=unit_price,
                )
            )

        invite = (
            self._db.query(PurchaseRfqInvite)
            .filter(
                PurchaseRfqInvite.purchase_rfq_id == rfq.id,
                PurchaseRfqInvite.supplier_id == supplier_id,
            )
            .first()
        )
        if not invite:
            # Mirrors the existing frontend store's upsertQuote behavior, which
            # auto-adds the bidder to invitedSupplierIds.
            self._db.add(PurchaseRfqInvite(purchase_rfq_id=rfq.id, supplier_id=supplier_id))

        if rfq.status in {"sent", "vendor_response"}:
            self._transition(rfq, "quotation", None, "Quote submitted", internal=True)

        self._db.flush()
        return quote

    def update_quote(
        self,
        quote_id: str,
        *,
        quote_number: Optional[str] = None,
        valid_until: Optional[date] = None,
        lead_time_days: int = 0,
        moq: int = 0,
        line_quotes: list[RfqQuoteLineInput],
        notes: Optional[str] = None,
    ) -> PurchaseRfqQuote:
        quote = self._require_quote(quote_id)
        if quote.status in {"accepted", "rejected"}:
            raise HTTPException(status_code=400, detail=f"Quote is {quote.status} and cannot be amended")
        rfq = self._require_rfq(quote.purchase_rfq_id)
        if rfq.status not in {"sent", "vendor_response", "quotation"}:
            raise HTTPException(
                status_code=400, detail=f"RFQ is {rfq.status}; quotes can no longer be amended"
            )
        if not line_quotes:
            raise HTTPException(status_code=400, detail="At least one line price is required")

        rfq_lines = {l.id: l for l in self.get_lines(rfq.id)}
        total = Decimal("0")
        validated: list[tuple[str, Decimal]] = []
        for lq in line_quotes:
            rfq_line = rfq_lines.get(lq.rfq_line_id)
            if not rfq_line:
                raise HTTPException(status_code=404, detail=f"RFQ line not found: {lq.rfq_line_id}")
            if lq.unit_price < 0:
                raise HTTPException(status_code=400, detail="Unit price cannot be negative")
            total += Decimal(rfq_line.quantity) * lq.unit_price
            validated.append((rfq_line.id, lq.unit_price))

        self._db.query(PurchaseRfqQuoteLine).filter(
            PurchaseRfqQuoteLine.purchase_rfq_quote_id == quote.id
        ).delete()
        for rfq_line_id, unit_price in validated:
            self._db.add(
                PurchaseRfqQuoteLine(
                    purchase_rfq_quote_id=quote.id,
                    purchase_rfq_line_id=rfq_line_id,
                    unit_price=unit_price,
                )
            )

        quote.quote_number = quote_number
        quote.valid_until = valid_until
        quote.lead_time_days = lead_time_days
        quote.moq = moq
        quote.total_amount = total
        quote.notes = notes
        self._db.flush()
        return quote

    def update_quote_status(
        self, quote_id: str, status: str, *, actor_id: Optional[str] = None
    ) -> PurchaseRfqQuote:
        """Manual accept/reject action from the Quotations grid's row action."""
        if status not in QUOTE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid quote status: {status}")
        quote = self._require_quote(quote_id)
        quote.status = status
        self._db.flush()
        return quote

    def bulk_delete_quotes(self, quote_ids: list[str]) -> tuple[int, list[str]]:
        """Cross-RFQ delete for the flattened Quotations page."""
        deleted = 0
        skipped: list[str] = []
        for qid in quote_ids:
            quote = self.get_quote(qid)
            if not quote:
                skipped.append(qid)
                continue
            self._db.delete(quote)
            deleted += 1
        self._db.flush()
        return deleted, skipped

    def award_quote(self, rfq_id: str, quote_id: str, *, actor_id: Optional[str] = None) -> PurchaseRfq:
        rfq = self._require_rfq(rfq_id)
        quote = self._db.get(PurchaseRfqQuote, quote_id)
        if not quote or quote.purchase_rfq_id != rfq.id:
            raise HTTPException(status_code=404, detail="Quote not found on this RFQ")
        if quote.status != "submitted":
            raise HTTPException(status_code=400, detail="Only a submitted quote can be awarded")

        self._transition(rfq, "approved", actor_id, f"Awarded to supplier {quote.supplier_id}")
        rfq.awarded_supplier_id = quote.supplier_id
        quote.status = "accepted"

        others = (
            self._db.query(PurchaseRfqQuote)
            .filter(
                PurchaseRfqQuote.purchase_rfq_id == rfq.id,
                PurchaseRfqQuote.id != quote.id,
                PurchaseRfqQuote.status == "submitted",
            )
            .all()
        )
        for other in others:
            other.status = "rejected"

        self._db.flush()
        return rfq

    def link_po(self, rfq_id: str, po_id: str, *, actor_id: Optional[str] = None) -> PurchaseRfq:
        rfq = self._require_rfq(rfq_id)
        if rfq.status != "approved":
            raise HTTPException(
                status_code=400, detail="RFQ must be approved before linking a purchase order"
            )
        self._transition(rfq, "po_created", actor_id, f"Converted to purchase order {po_id}")
        rfq.linked_po_id = po_id
        self._db.flush()
        return rfq

    # ------------------------------------------------------------- helpers

    def _transition(
        self,
        rfq: PurchaseRfq,
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
        *,
        internal: bool = False,
    ) -> None:
        if to_status not in RFQ_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {to_status}")
        # "vendor_response" and the "sent"/"vendor_response" -> "quotation"
        # transitions are only reachable as an internal side effect (a
        # supplier viewing the RFQ via record_view, or submitting a quote via
        # submit_quote) — never as a manually-requested PATCH target, or a
        # caller could jump a draft RFQ straight to "quotation" with no
        # supplier ever having seen it. Unlike PO's exemption (whose internal-
        # only targets are simply absent from PO_STATUS_TRANSITIONS), these
        # two ARE listed as reachable in RFQ_STATUS_TRANSITIONS — so the
        # manual-vs-internal guard has to be explicit here.
        if to_status in {"vendor_response", "quotation"} and not internal:
            raise HTTPException(
                status_code=400,
                detail=f"{to_status} is reached automatically and cannot be set directly",
            )
        allowed = RFQ_STATUS_TRANSITIONS.get(rfq.status, frozenset())
        if to_status != rfq.status and to_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {rfq.status} to {to_status}",
            )
        from_status = rfq.status
        rfq.status = to_status
        self._record_status(rfq.id, from_status, to_status, actor_id, notes)

    def _record_status(
        self,
        rfq_id: str,
        from_status: Optional[str],
        to_status: str,
        actor_id: Optional[str],
        notes: Optional[str],
    ) -> None:
        self._db.add(
            PurchaseRfqStatusHistory(
                purchase_rfq_id=rfq_id,
                from_status=from_status,
                to_status=to_status,
                changed_by=actor_id,
                notes=notes,
            )
        )

    def _require_rfq(self, rfq_id: str) -> PurchaseRfq:
        rfq = self.get_rfq(rfq_id)
        if not rfq:
            raise HTTPException(status_code=404, detail="RFQ not found")
        return rfq

    def _require_quote(self, quote_id: str) -> PurchaseRfqQuote:
        quote = self.get_quote(quote_id)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        return quote

    def _next_rfq_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "purchase.rfq",
            initial=lambda: self._db.query(PurchaseRfq)
            .filter(PurchaseRfq.company_id == company_id)
            .count()
            + 1,
        )

    def resolve_item_id(self, *, item_id: Optional[str] = None, sku: Optional[str] = None) -> str:
        """Delegates to PurchaseOrderService's item-resolution logic instead of
        reimplementing item_id/sku lookup."""
        return PurchaseOrderService(self._db).resolve_item_id(item_id=item_id, sku=sku)
