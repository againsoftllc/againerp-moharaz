"""Bill-wise settlement (OnerERP Party Transaction Settlement / Payment Settlement) and "Settled by".

AgainERP puts a party's money on its invoices / bills when it is received (the ones chosen, then oldest first). A settlement
re-points money that already sits on one document to another document of the same party: take X off invoice A, put X on
invoice B. Both sides must be equal, so the party's total due and the AR / AP control account do not change (no journal).

Every move is written to `finance_allocations`, together with the money customer / supplier payments put on documents, so a
document can say what settled it.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.finance import FinanceCheque, FinancePayable, FinancePayment, FinanceReceivable
from app.models.finance_settlement import FinanceAllocation, FinanceSettlement
from app.models.sales import SalesOrder
from app.services.core.sequence_service import next_number as allocate_number
from app.services.finance.posting import money

ZERO = Decimal("0")
PARTY_DOC = {"customer": "receivable", "supplier": "payable"}
LIVE_CHEQUE_STATUSES_EXCLUDED = ("bounced", "cancelled")


def _doc_model(doc_type: str):
    return FinanceReceivable if doc_type == "receivable" else FinancePayable


def _set_paid(doc, paid: Decimal) -> None:
    doc.amount_paid = paid
    doc.balance = max((doc.amount or ZERO) - paid, ZERO)
    doc.status = "paid" if doc.balance <= 0 else ("partial" if paid > 0 else "open")


def paid_snapshot(docs: Iterable) -> dict[str, Decimal]:
    return {doc.id: money(doc.amount_paid) for doc in docs}


def log_allocations(
    db: Session,
    *,
    company_id: str,
    party_type: str,
    party_id: str,
    before: dict[str, Decimal],
    docs: Iterable,
    payment_id: Optional[str] = None,
    settlement_id: Optional[str] = None,
) -> dict[str, Decimal]:
    """Record what changed on each document since `before` (a `paid_snapshot`). Returns the deltas."""
    doc_type = PARTY_DOC[party_type]
    deltas: dict[str, Decimal] = {}
    for doc in docs:
        if (doc.amount or ZERO) <= 0:
            continue  # credit notes / return credits are not invoices
        delta = money(doc.amount_paid) - before.get(doc.id, ZERO)
        if delta == 0:
            continue
        deltas[doc.id] = delta
        db.add(
            FinanceAllocation(
                company_id=company_id,
                party_type=party_type,
                party_id=party_id,
                doc_type=doc_type,
                doc_id=doc.id,
                amount=delta,
                source="settlement" if settlement_id else "payment",
                payment_id=payment_id,
                settlement_id=settlement_id,
            )
        )
    return deltas


def plan_moves(documents: dict[str, tuple[Decimal, Decimal]], lines: list[tuple[str, Decimal]]) -> Decimal:
    """Pure check of a settlement. `documents` maps id -> (amount, paid); `lines` are (id, signed amount).

    Taking off may not exceed what is paid, putting on may not exceed what is due, and both sides must be equal.
    Returns the amount moved.
    """
    seen: set[str] = set()
    put = take = ZERO
    for doc_id, amount in lines:
        amount = money(amount)
        if amount == 0:
            continue
        if doc_id in seen:
            raise HTTPException(status_code=400, detail="A document appears twice; enter one amount per document")
        seen.add(doc_id)
        if doc_id not in documents:
            raise HTTPException(status_code=400, detail="A document does not belong to this party or is void")
        total, paid = documents[doc_id]
        if amount < 0 and -amount > paid:
            raise HTTPException(status_code=400, detail=f"Cannot take {-amount} off a document that has {paid} settled")
        if amount > 0 and amount > total - paid:
            raise HTTPException(status_code=400, detail=f"Cannot put {amount} on a document that has {total - paid} due")
        if amount > 0:
            put += amount
        else:
            take -= amount
    if put <= 0:
        raise HTTPException(status_code=400, detail="Enter what to take off one document and put on another")
    if put != take:
        raise HTTPException(status_code=400, detail=f"Taken off ({take}) and put on ({put}) must be equal")
    return put


class SettlementService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def _party_docs(self, party_type: str, party_id: str, company_id: str) -> list:
        if party_type not in PARTY_DOC:
            raise HTTPException(status_code=400, detail="Party type must be customer or supplier")
        model = _doc_model(PARTY_DOC[party_type])
        party_col = model.customer_id if party_type == "customer" else model.supplier_id
        return (
            self._db.query(model)
            .filter(model.company_id == company_id, party_col == party_id, model.amount > 0, model.status != "void")
            .order_by(model.created_at.asc())
            .all()
        )

    @staticmethod
    def doc_number(doc) -> str:
        return getattr(doc, "invoice_number", None) or getattr(doc, "reference_number", None) or doc.id[:8]

    def documents(self, party_type: str, party_id: str, *, company_id: str) -> list[dict]:
        docs = self._party_docs(party_type, party_id, company_id)
        settled = self.settled_by(PARTY_DOC[party_type], docs)
        return [
            {
                "id": doc.id,
                "number": self.doc_number(doc),
                "doc_date": (doc.created_at.date() if doc.created_at else None),
                "due_date": doc.due_date,
                "amount": money(doc.amount),
                "paid": money(doc.amount_paid),
                "balance": money(doc.balance),
                "status": doc.status,
                "settled_by": settled.get(doc.id, []),
            }
            for doc in docs
        ]

    # ── settled by ───────────────────────────────────────────────────────────

    def settled_by_ids(self, doc_type: str, ids: list[str], *, company_id: str) -> dict[str, list[dict]]:
        model = _doc_model(doc_type)
        docs = self._db.query(model).filter(model.company_id == company_id, model.id.in_(ids)).all() if ids else []
        return self.settled_by(doc_type, docs)

    def settled_by(self, doc_type: str, docs: list) -> dict[str, list[dict]]:
        """Per document: the payments, settlements and cheques known to have settled it, and any rest as an advance /
        earlier receipt (money put on by oldest-first matching before this record existed)."""
        ids = [doc.id for doc in docs]
        if not ids:
            return {}
        refs: dict[str, dict[str, Decimal]] = defaultdict(dict)

        rows = self._db.query(FinanceAllocation).filter(FinanceAllocation.doc_type == doc_type, FinanceAllocation.doc_id.in_(ids)).all()
        payment_ids = {r.payment_id for r in rows if r.payment_id}
        settlement_ids = {r.settlement_id for r in rows if r.settlement_id}
        pay_no = dict(self._db.query(FinancePayment.id, FinancePayment.payment_number).filter(FinancePayment.id.in_(payment_ids)).all()) if payment_ids else {}
        stl_no = (
            dict(self._db.query(FinanceSettlement.id, FinanceSettlement.settlement_number).filter(FinanceSettlement.id.in_(settlement_ids)).all())
            if settlement_ids
            else {}
        )
        for row in rows:
            label = pay_no.get(row.payment_id) if row.payment_id else stl_no.get(row.settlement_id)
            if not label:
                continue
            refs[row.doc_id][label] = refs[row.doc_id].get(label, ZERO) + money(row.amount)

        cheque_col = FinanceCheque.receivable_id if doc_type == "receivable" else FinanceCheque.payable_id
        for cheque in self._db.query(FinanceCheque).filter(cheque_col.in_(ids), FinanceCheque.status.notin_(LIVE_CHEQUE_STATUSES_EXCLUDED)).all():
            doc_id = cheque.receivable_id if doc_type == "receivable" else cheque.payable_id
            label = f"Cheque {cheque.cheque_number}"
            refs[doc_id][label] = refs[doc_id].get(label, ZERO) + money(cheque.amount)

        if doc_type == "receivable":
            order_ids = {doc.source_id: doc.id for doc in docs if doc.source_type == "sales_order"}
            if order_ids:
                orders = dict(self._db.query(SalesOrder.order_number, SalesOrder.id).filter(SalesOrder.id.in_(list(order_ids))).all())
                if orders:
                    for p in (
                        self._db.query(FinancePayment)
                        .filter(FinancePayment.source_type == "sales_order_payment", FinancePayment.reference.in_(list(orders)))
                        .all()
                    ):
                        doc_id = order_ids.get(orders.get(p.reference))
                        if doc_id:
                            signed = money(p.amount) if p.direction == "inbound" else -money(p.amount)
                            refs[doc_id][p.payment_number] = refs[doc_id].get(p.payment_number, ZERO) + signed

        out: dict[str, list[dict]] = {}
        for doc in docs:
            items = [{"ref": label, "amount": amount} for label, amount in refs.get(doc.id, {}).items() if amount != 0]
            known = sum((i["amount"] for i in items), ZERO)
            rest = money(doc.amount_paid) - known
            if rest > Decimal("0.004"):
                items.append({"ref": "Advance / earlier receipt", "amount": rest})
            out[doc.id] = items
        return out

    # ── settlements ──────────────────────────────────────────────────────────

    def get(self, settlement_id: str, *, company_id: str) -> FinanceSettlement:
        row = self._db.get(FinanceSettlement, settlement_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Settlement not found")
        return row

    def lines(self, settlement: FinanceSettlement) -> list[dict]:
        doc_type = PARTY_DOC[settlement.party_type]
        model = _doc_model(doc_type)
        rows = self._db.query(FinanceAllocation).filter(FinanceAllocation.settlement_id == settlement.id).all()
        docs = {d.id: d for d in self._db.query(model).filter(model.id.in_([r.doc_id for r in rows])).all()} if rows else {}
        return [
            {"document_id": r.doc_id, "number": self.doc_number(docs[r.doc_id]) if r.doc_id in docs else r.doc_id[:8], "amount": money(r.amount)}
            for r in rows
        ]

    def list_settlements(self, *, company_id: str, party_type: Optional[str] = None, party_id: Optional[str] = None, limit: int = 500) -> list[FinanceSettlement]:
        query = self._db.query(FinanceSettlement).filter(FinanceSettlement.company_id == company_id)
        if party_type:
            query = query.filter(FinanceSettlement.party_type == party_type)
        if party_id:
            query = query.filter(FinanceSettlement.party_id == party_id)
        return query.order_by(FinanceSettlement.settlement_date.desc(), FinanceSettlement.created_at.desc()).limit(limit).all()

    def create(
        self,
        *,
        company_id: str,
        party_type: str,
        party_id: str,
        lines: list[tuple[str, Decimal]],
        settlement_date: Optional[date] = None,
        note: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> FinanceSettlement:
        docs = self._party_docs(party_type, party_id, company_id)
        by_id = {doc.id: doc for doc in docs}
        total = plan_moves({doc.id: (money(doc.amount), money(doc.amount_paid)) for doc in docs}, lines)
        on = settlement_date or date.today()
        settlement = FinanceSettlement(
            company_id=company_id,
            settlement_number=allocate_number(self._db, company_id, "finance.settlement", at=on),
            party_type=party_type,
            party_id=party_id,
            settlement_date=on,
            total=total,
            note=(note or "").strip() or None,
            created_by=actor,
        )
        self._db.add(settlement)
        self._db.flush()
        before = paid_snapshot(docs)
        for doc_id, amount in lines:
            amount = money(amount)
            if amount:
                doc = by_id[doc_id]
                _set_paid(doc, money(doc.amount_paid) + amount)
        deltas = log_allocations(
            self._db, company_id=company_id, party_type=party_type, party_id=party_id, before=before, docs=docs, settlement_id=settlement.id
        )
        if party_type == "customer":
            self._mirror_orders(settlement, [(by_id[i], d) for i, d in deltas.items()])
        self._db.flush()
        return settlement

    def _mirror_orders(self, settlement: FinanceSettlement, moves: list[tuple[FinanceReceivable, Decimal]]) -> None:
        """Keep a sales order's own paid / due (its Payment history) in step with its invoice. The `ledger_` id and the
        `settlement` kind keep `SalesService.sync_order_payments` from posting it to Finance a second time."""
        from app.services.sales.sales_service import SalesService

        for receivable, delta in moves:
            if receivable.source_type != "sales_order":
                continue
            order = self._db.get(SalesOrder, receivable.source_id)
            meta = SalesService._load_payment_meta(order.notes) if order else None
            if order is None or meta is None:
                continue
            history = [h for h in (meta.get("history") or []) if isinstance(h, dict)]
            history.append(
                {
                    "id": f"ledger_settlement_{settlement.id}_{order.id}",
                    "label": f"{'Settled by' if delta > 0 else 'Moved to another invoice by'} {settlement.settlement_number}",
                    "amount": float(delta),
                    "status": "completed",
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "kind": "settlement",
                }
            )
            paid = Decimal(str(meta.get("paid") or 0)) + delta
            grand_total = Decimal(str(meta.get("grand_total") or order.total or 0))
            due = max(grand_total - paid, ZERO)
            meta.update({"paid": float(paid), "due": float(due), "status": "paid" if due <= 0 else ("partial" if paid > 0 else "unpaid"), "history": history})
            order.notes = SalesService._write_payment_meta(order.notes, meta)


def replay_supplier_settlements(db: Session, supplier_id: str, payables: list[FinancePayable]) -> None:
    """After a supplier's bills are re-matched oldest first (a payment was deleted), put the manual settlements back, as far
    as each bill still allows."""
    by_id = {p.id: p for p in payables}
    rows = (
        db.query(FinanceAllocation)
        .filter(FinanceAllocation.party_type == "supplier", FinanceAllocation.party_id == supplier_id, FinanceAllocation.source == "settlement")
        .order_by(FinanceAllocation.created_at.asc())
        .all()
    )
    for settlement_id in dict.fromkeys(r.settlement_id for r in rows):
        moves = [r for r in rows if r.settlement_id == settlement_id and r.doc_id in by_id]
        takes = [r for r in moves if r.amount < 0]
        taken = ZERO
        for r in takes:
            doc = by_id[r.doc_id]
            amount = min(-money(r.amount), money(doc.amount_paid))
            _set_paid(doc, money(doc.amount_paid) - amount)
            taken += amount
        for r in (r for r in moves if r.amount > 0):
            doc = by_id[r.doc_id]
            amount = min(money(r.amount), money(doc.amount) - money(doc.amount_paid), taken)
            _set_paid(doc, money(doc.amount_paid) + amount)
            taken -= amount
        if taken > 0:  # what could not be put back stays where it was
            for r in takes:
                doc = by_id[r.doc_id]
                back = min(taken, money(doc.amount) - money(doc.amount_paid))
                _set_paid(doc, money(doc.amount_paid) + back)
                taken -= back
