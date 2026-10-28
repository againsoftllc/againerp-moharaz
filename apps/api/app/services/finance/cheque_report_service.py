"""Cheque reports (OnerERP §11.8) built from the cheque register and its event history.

Every view can be run as of a past date: a cheque's status on that day is the ``to_status`` of its
last event dated on or before it, so a back-dated position needs no snapshot table.

Views
    status    Status-wise cheque detail
    in_hand   Received cheques not yet honoured (in hand + under collection), reconciled to GL 1150 + 1160
    issued    Advance cheque issued — issued cheques not yet honoured, reconciled to GL 2150
    bounced   Bounce analysis — every dishonour in the period, and what became of the cheque
    party     Customer / supplier-wise cheque performance
    history   Cheque history — every treatment in the period
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import (
    FinanceAccount,
    FinanceCheque,
    FinanceChequeEvent,
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.services.finance.constants import (
    CHEQUES_IN_HAND_CODE,
    CHEQUES_ISSUED_CODE,
    CHEQUES_UNDER_COLLECTION_CODE,
)
from app.services.finance.posting import money

ZERO = Decimal("0")

VIEWS = ("status", "in_hand", "issued", "bounced", "party", "history")
DATE_BASES = ("cheque", "recorded", "treatment")

# OnerERP's one-letter statuses, for people moving over from it.
ONER_CODE = {
    "received": "N",
    "issued": "N",
    "deposited": "S",
    "presented": "S",
    "cleared": "H",
    "bounced": "D",
    "cancelled": "B",
}
STATUS_ORDER = ("received", "issued", "deposited", "presented", "bounced", "cleared", "cancelled")
EVENT_LABEL = {
    "record": "Recorded",
    "deposit": "Deposited",
    "present": "Presented",
    "clear": "Honoured",
    "bounce": "Dishonoured",
    "cancel": "Cancelled",
    "represent": "Re-presented",
    "close": "Closed",
    "edit": "Edited",
}


def status_as_of(events: list[FinanceChequeEvent], as_of: date) -> Optional[tuple[str, date]]:
    """(status, since) on ``as_of``, or None when the cheque was not recorded yet. ``events`` oldest first."""
    found: Optional[tuple[str, date]] = None
    for event in events:
        if event.event_date > as_of:
            continue
        if event.action == "edit" and found is not None:
            continue
        found = (event.to_status, event.event_date)
    return found


def gl_balance(db: Session, company_id: str, code: str, as_of: date) -> Decimal:
    """Debit-minus-credit balance of one GL account at the end of ``as_of``."""
    account = (
        db.query(FinanceAccount)
        .filter(FinanceAccount.company_id == company_id, FinanceAccount.code == code)
        .first()
    )
    if account is None:
        return ZERO
    movement = (
        db.query(func.coalesce(func.sum(FinanceJournalLine.debit - FinanceJournalLine.credit), 0))
        .join(FinanceJournalEntry, FinanceJournalEntry.id == FinanceJournalLine.journal_entry_id)
        .filter(
            FinanceJournalLine.account_id == account.id,
            FinanceJournalEntry.company_id == company_id,
            FinanceJournalEntry.status == "posted",
            FinanceJournalEntry.entry_date <= as_of,
        )
        .scalar()
    )
    return money(Decimal(str(movement or 0)))


def cheque_register(
    db: Session,
    *,
    company_id: str,
    view: str = "status",
    as_of: Optional[date] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    date_basis: str = "cheque",
    direction: Optional[str] = None,
    status: Optional[str] = None,
    payment_account_id: Optional[str] = None,
    party_id: Optional[str] = None,
) -> dict:
    if view not in VIEWS:
        raise HTTPException(status_code=400, detail=f"Unknown cheque report view {view}")
    if date_basis not in DATE_BASES:
        raise HTTPException(status_code=400, detail=f"Date basis must be one of {', '.join(DATE_BASES)}")
    as_of = as_of or date.today()
    if view == "in_hand":
        direction = "received"
    elif view == "issued":
        direction = "issued"

    query = db.query(FinanceCheque).filter(FinanceCheque.company_id == company_id)
    if direction:
        query = query.filter(FinanceCheque.direction == direction)
    if payment_account_id:
        query = query.filter(FinanceCheque.payment_account_id == payment_account_id)
    if party_id:
        query = query.filter(FinanceCheque.party_id == party_id)
    cheques = query.order_by(FinanceCheque.cheque_date.asc(), FinanceCheque.created_at.asc()).all()

    events_by_cheque: dict[str, list[FinanceChequeEvent]] = defaultdict(list)
    if cheques:
        ids = [c.id for c in cheques]
        for event in (
            db.query(FinanceChequeEvent)
            .filter(FinanceChequeEvent.cheque_id.in_(ids))
            .order_by(FinanceChequeEvent.event_date.asc(), FinanceChequeEvent.created_at.asc())
        ):
            events_by_cheque[event.cheque_id].append(event)

    parties = _parties(db, cheques)
    documents = _documents(db, cheques)
    accounts = _account_names(db, cheques)

    def base_row(cheque: FinanceCheque, state: str, since: date) -> dict:
        events = events_by_cheque.get(cheque.id, [])
        party = parties.get((cheque.party_type, cheque.party_id), {})
        bounces = [e for e in events if e.action == "bounce" and e.event_date <= as_of]
        return {
            "id": cheque.id,
            "cheque_number": cheque.cheque_number,
            "cheque_date": cheque.cheque_date.isoformat(),
            "bank_name": cheque.bank_name,
            "amount": money(cheque.amount),
            "direction": cheque.direction,
            "status": state,
            "oner_status": ONER_CODE.get(state, ""),
            "status_date": since.isoformat(),
            "recorded_date": events[0].event_date.isoformat() if events else None,
            "party_type": cheque.party_type,
            "party_id": cheque.party_id,
            "party_code": party.get("code"),
            "party_name": party.get("name") or "Unknown party",
            "party_phone": party.get("phone"),
            "document_number": documents.get(cheque.id),
            "payment_account_name": accounts.get(cheque.payment_account_id or ""),
            "bounce_count": len(bounces),
            "last_bounce_reason": bounces[-1].note if bounces else None,
            "bank_charge": money(cheque.bank_charge or ZERO),
        }

    def in_range(day: Optional[date]) -> bool:
        if day is None:
            return False
        if date_from and day < date_from:
            return False
        if date_to and day > date_to:
            return False
        return True

    rows: list[dict] = []
    totals: dict = {}

    if view == "history":
        for cheque in cheques:
            party = parties.get((cheque.party_type, cheque.party_id), {})
            for event in events_by_cheque.get(cheque.id, []):
                if event.event_date > as_of or not in_range(event.event_date):
                    continue
                rows.append(
                    {
                        "id": event.id,
                        "cheque_id": cheque.id,
                        "event_date": event.event_date.isoformat(),
                        "cheque_number": cheque.cheque_number,
                        "bank_name": cheque.bank_name,
                        "direction": cheque.direction,
                        "amount": money(cheque.amount),
                        "party_name": party.get("name") or "Unknown party",
                        "action": event.action,
                        "action_label": EVENT_LABEL.get(event.action, event.action),
                        "from_status": event.from_status,
                        "to_status": event.to_status,
                        "note": event.note,
                        "actor": event.actor,
                        "journal_entry_id": event.journal_entry_id,
                    }
                )
        rows.sort(key=lambda r: (r["event_date"], r["cheque_number"]))
        totals = {"events": len(rows), "cheques": len({r["cheque_id"] for r in rows})}
        return _payload(view, as_of, date_from, date_to, date_basis, direction, status, rows, totals)

    if view == "bounced":
        for cheque in cheques:
            events = events_by_cheque.get(cheque.id, [])
            # what happened after a bounce follows the order things were done in, not their (back-datable) dates
            sequence = sorted(events, key=lambda e: (e.created_at, e.event_date))
            for index, event in enumerate(sequence):
                if event.action != "bounce" or event.event_date > as_of or not in_range(event.event_date):
                    continue
                state = status_as_of(events, as_of)
                row = base_row(cheque, *(state or (cheque.status, event.event_date)))
                outcome = "Still dishonoured"
                for nxt in (e for e in sequence[index + 1:] if e.event_date <= as_of):
                    if nxt.action == "bounce":
                        outcome = "Re-presented, dishonoured again"
                        break
                    if nxt.action == "represent":
                        outcome = "Re-presented"
                    elif nxt.action == "close":
                        outcome = "Closed (settled otherwise)"
                    elif nxt.action == "clear" and outcome == "Re-presented":
                        outcome = "Re-presented and honoured"
                row.update(
                    id=event.id,
                    cheque_id=cheque.id,
                    bounce_date=event.event_date.isoformat(),
                    reason=event.note,
                    outcome=outcome,
                )
                rows.append(row)
        rows.sort(key=lambda r: (r["bounce_date"], r["cheque_number"]))
        open_rows = [r for r in rows if r["outcome"] == "Still dishonoured"]
        totals = {
            "count": len(rows),
            "amount": money(sum((r["amount"] for r in rows), ZERO)),
            "open_count": len(open_rows),
            "open_amount": money(sum((r["amount"] for r in open_rows), ZERO)),
            "bank_charges": money(sum((r["bank_charge"] for r in {r["cheque_id"]: r for r in rows}.values()), ZERO)),
        }
        return _payload(view, as_of, date_from, date_to, date_basis, direction, status, rows, totals)

    # status / in_hand / issued / party: one row per cheque, with its position on as_of
    for cheque in cheques:
        events = events_by_cheque.get(cheque.id, [])
        state = status_as_of(events, as_of)
        if state is None:
            continue  # recorded after as_of
        row = base_row(cheque, *state)
        if view in ("status", "party"):
            basis_day = {
                "cheque": cheque.cheque_date,
                "recorded": events[0].event_date if events else None,
                "treatment": state[1],
            }[date_basis]
            if (date_from or date_to) and not in_range(basis_day):
                continue
        if view == "in_hand" and row["status"] not in ("received", "deposited"):
            continue
        if view == "issued" and row["status"] not in ("issued", "presented"):
            continue
        if status and view == "status" and row["status"] != status:
            continue
        rows.append(row)

    if view == "party":
        grouped: dict[tuple[str, str], dict] = {}
        for row in rows:
            key = (row["party_type"], row["party_id"])
            agg = grouped.setdefault(
                key,
                {
                    "id": f"{row['party_type']}:{row['party_id']}",
                    "party_type": row["party_type"],
                    "party_id": row["party_id"],
                    "party_code": row["party_code"],
                    "party_name": row["party_name"],
                    "party_phone": row["party_phone"],
                    "count": 0,
                    "amount": ZERO,
                    "honoured_count": 0,
                    "honoured_amount": ZERO,
                    "pending_count": 0,
                    "pending_amount": ZERO,
                    "dishonoured_count": 0,
                    "dishonoured_amount": ZERO,
                    "bounce_events": 0,
                },
            )
            agg["count"] += 1
            agg["amount"] += row["amount"]
            agg["bounce_events"] += row["bounce_count"]
            if row["status"] == "cleared":
                agg["honoured_count"] += 1
                agg["honoured_amount"] += row["amount"]
            elif row["status"] in ("received", "issued", "deposited", "presented"):
                agg["pending_count"] += 1
                agg["pending_amount"] += row["amount"]
            if row["bounce_count"]:
                agg["dishonoured_count"] += 1
                agg["dishonoured_amount"] += row["amount"]
        rows = []
        for agg in grouped.values():
            for key in ("amount", "honoured_amount", "pending_amount", "dishonoured_amount"):
                agg[key] = money(agg[key])
            agg["bounce_rate"] = round(agg["dishonoured_count"] * 100 / agg["count"], 1) if agg["count"] else 0
            rows.append(agg)
        rows.sort(key=lambda r: (-r["dishonoured_count"], -r["amount"], (r["party_name"] or "").lower()))
        totals = {
            "parties": len(rows),
            "count": sum(r["count"] for r in rows),
            "amount": money(sum((r["amount"] for r in rows), ZERO)),
            "dishonoured_count": sum(r["dishonoured_count"] for r in rows),
        }
        return _payload(view, as_of, date_from, date_to, date_basis, direction, status, rows, totals)

    rows.sort(key=lambda r: (STATUS_ORDER.index(r["status"]) if r["status"] in STATUS_ORDER else 99, r["cheque_date"], r["cheque_number"]))
    by_status: dict[str, dict] = {}
    for row in rows:
        bucket = by_status.setdefault(f"{row['direction']}:{row['status']}", {"direction": row["direction"], "status": row["status"], "count": 0, "amount": ZERO})
        bucket["count"] += 1
        bucket["amount"] += row["amount"]
    for bucket in by_status.values():
        bucket["amount"] = money(bucket["amount"])
    total_amount = money(sum((r["amount"] for r in rows), ZERO))
    totals = {"count": len(rows), "amount": total_amount, "by_status": list(by_status.values())}

    # The OnerERP check: the clearing account must hold exactly the cheques that sit in it.
    if view == "in_hand" and not payment_account_id and not party_id:
        in_hand = money(sum((r["amount"] for r in rows if r["status"] == "received"), ZERO))
        under = money(sum((r["amount"] for r in rows if r["status"] == "deposited"), ZERO))
        gl_hand = gl_balance(db, company_id, CHEQUES_IN_HAND_CODE, as_of)
        gl_under = gl_balance(db, company_id, CHEQUES_UNDER_COLLECTION_CODE, as_of)
        totals["reconciliation"] = [
            {"account_code": CHEQUES_IN_HAND_CODE, "label": "Cheques in Hand", "register": in_hand, "gl": gl_hand, "difference": money(gl_hand - in_hand)},
            {"account_code": CHEQUES_UNDER_COLLECTION_CODE, "label": "Cheques Under Collection", "register": under, "gl": gl_under, "difference": money(gl_under - under)},
        ]
    if view == "issued" and not payment_account_id and not party_id:
        gl_issued = -gl_balance(db, company_id, CHEQUES_ISSUED_CODE, as_of)  # a liability: credit balance
        totals["reconciliation"] = [
            {"account_code": CHEQUES_ISSUED_CODE, "label": "Cheques Issued (advance cheque issue)", "register": total_amount, "gl": gl_issued, "difference": money(gl_issued - total_amount)},
        ]
    return _payload(view, as_of, date_from, date_to, date_basis, direction, status, rows, totals)


def _payload(view, as_of, date_from, date_to, date_basis, direction, status, rows, totals) -> dict:
    from app.services.finance.finance_reports import _now_iso

    return {
        "filters": {
            "view": view,
            "as_of": as_of.isoformat(),
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "date_basis": date_basis,
            "direction": direction,
            "status": status,
        },
        "period": {"from": (date_from or as_of).isoformat(), "to": (date_to or as_of).isoformat()},
        "rows": rows,
        "totals": totals,
        "meta": {"generated_at": _now_iso()},
    }


def _parties(db: Session, cheques: list[FinanceCheque]) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    customer_ids = {c.party_id for c in cheques if c.party_type == "customer"}
    supplier_ids = {c.party_id for c in cheques if c.party_type == "supplier"}
    if customer_ids:
        for row in db.query(CommerceCustomer).filter(CommerceCustomer.id.in_(customer_ids)):
            out[("customer", row.id)] = {"name": row.name, "code": row.customer_code, "phone": row.phone}
    if supplier_ids:
        for row in db.query(CommerceSupplier).filter(CommerceSupplier.id.in_(supplier_ids)):
            out[("supplier", row.id)] = {"name": row.name, "code": row.vendor_code, "phone": row.phone}
    return out


def _documents(db: Session, cheques: list[FinanceCheque]) -> dict[str, str]:
    out: dict[str, str] = {}
    receivable_ids = {c.receivable_id: c.id for c in cheques if c.receivable_id}
    payable_ids = {c.payable_id: c.id for c in cheques if c.payable_id}
    if receivable_ids:
        for rid, number in db.query(FinanceReceivable.id, FinanceReceivable.invoice_number).filter(FinanceReceivable.id.in_(list(receivable_ids))):
            out[receivable_ids[rid]] = number
    if payable_ids:
        for pid, number in db.query(FinancePayable.id, FinancePayable.reference_number).filter(FinancePayable.id.in_(list(payable_ids))):
            out[payable_ids[pid]] = number
    return out


def _account_names(db: Session, cheques: list[FinanceCheque]) -> dict[str, str]:
    ids = {c.payment_account_id for c in cheques if c.payment_account_id}
    if not ids:
        return {}
    return dict(db.query(FinancePaymentAccount.id, FinancePaymentAccount.name).filter(FinancePaymentAccount.id.in_(ids)).all())
