"""RMA settlement: money in / money out against an RMA, kept apart from handing the product over.

An entry (party, direction, amount, purpose, note, payment account, date, reference) is a draft until it is approved. Only approval
posts, through the existing finance services and never a second ledger:
  - the RMA's own charges (Parts / Service, Repair / Labour, money in from the customer) settle the RMA's customer receivable
    (`raise_bill` once, then `FinanceService.settle_receivable`);
  - everything else is one party payment (`FinanceService.post_party_payment`) against the account chosen from the purpose by
    `settlement_accounts` (refunds, compensation and price differences are not blindly "income" or "expense").
Approval is idempotent: it runs under the RMA row lock, only a pending entry can be approved, and the payment is keyed on the
settlement id, so a retry can never post twice. A settlement never moves stock or changes the RMA status.

Like the rest of the RMA layer this flushes; the router owns the transaction and commits.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.finance import FinancePaymentAccount, FinanceReceivable
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.rma import RmaSettlement, RmaTicket
from app.services.rma import complaint_service
from app.services.rma.constants import (
    SETTLEMENT_BLOCKED_STATUSES,
    SETTLEMENT_DIRECTIONS,
    SETTLEMENT_PARTY_TYPES,
    SETTLEMENT_PURPOSES,
    SETTLEMENT_STATUS_LABELS,
)
from app.services.rma.settlement_accounts import (
    RECEIVABLE,
    SettlementRuleError,
    counter_account,
    journal_party_tag,
    payment_party_tag,
)

ZERO = Decimal("0")
CENT = Decimal("0.01")
SOURCE_TYPE = "rma_settlement"
MIN_NOTE = 3
MIN_OTHER_NOTE = 20
# The party role a typed party must hold (Dealer = the B2B vendor role; "other" can be anyone).
ROLE_FOR_PARTY_TYPE = {"customer": "customer", "dealer": "vendor", "supplier": "supplier"}

EDITABLE_FIELDS = frozenset(
    {
        "party_type",
        "party_id",
        "party_name",
        "direction",
        "amount",
        "purpose",
        "purpose_note",
        "payment_account_id",
        "transaction_date",
        "reference",
    }
)


# A reversal mirrors an approved settlement, so only the explanation, date and reference can change.
REVERSAL_EDITABLE_FIELDS = frozenset({"purpose_note", "transaction_date", "reference"})


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT)


# ------------------------------------------------------------- lookups


def get_settlement(db: Session, settlement_id: str, company_id: Optional[str] = None) -> RmaSettlement:
    row = db.get(RmaSettlement, settlement_id)
    if row is None or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Settlement not found")
    return row


def list_settlements(db: Session, ticket_id: str) -> list[RmaSettlement]:
    return (
        db.query(RmaSettlement)
        .filter(RmaSettlement.rma_id == ticket_id)
        .order_by(RmaSettlement.created_at.desc(), RmaSettlement.settlement_number.desc())
        .all()
    )


def next_settlement_number(db: Session, company_id: str) -> str:
    year = date.today().year
    prefix = f"STL-{year}-"
    count = (
        db.query(func.count(RmaSettlement.id))
        .filter(RmaSettlement.company_id == company_id, RmaSettlement.settlement_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not db.query(RmaSettlement.id).filter(RmaSettlement.settlement_number == number).first():
            return number
    raise HTTPException(status_code=500, detail="Could not allocate a settlement number")


def resolve_party(db: Session, company_id: str, party_type: str, party_id: Optional[str], party_name: Optional[str]) -> tuple[Optional[str], str]:
    """The party on the books (id + name). Customer / dealer / supplier must be an existing party holding that role."""
    if party_type not in SETTLEMENT_PARTY_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown party type: {party_type}")
    if party_id:
        party = db.get(Party, party_id)
        if party is None or party.company_id != company_id:
            raise HTTPException(status_code=400, detail="That party does not exist.")
        role = ROLE_FOR_PARTY_TYPE.get(party_type)
        if role:
            held = db.query(PartyRole.id).filter(PartyRole.party_id == party.id, PartyRole.role == role).first()
            if held is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"{party.display_name} is not set up as a {SETTLEMENT_PARTY_TYPES[party_type].lower()}. Pick someone from the {SETTLEMENT_PARTY_TYPES[party_type].lower()} list.",
                )
        return party.id, party.display_name
    if party_type != "other":
        raise HTTPException(status_code=400, detail=f"Pick the {SETTLEMENT_PARTY_TYPES[party_type].lower()} this money is with.")
    name = (party_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name the party (an existing contact, or type a name for Other Party).")
    return None, name


# ------------------------------------------------------------- summary


def summary(db: Session, ticket: RmaTicket) -> dict[str, Any]:
    """The money picture of one RMA: its charges, what is owed, and what settlements have moved so far."""
    total = _money(ticket.total)
    receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
    if receivable is not None:
        outstanding = _money(receivable.balance) if receivable.status in ("open", "partial") else ZERO
        paid = _money(receivable.amount_paid)
    else:
        outstanding, paid = total, ZERO
    rows = list_settlements(db, ticket.id)
    money_in = sum((_money(r.amount) for r in rows if r.status == "approved" and r.direction == "in"), ZERO)
    money_out = sum((_money(r.amount) for r in rows if r.status == "approved" and r.direction == "out"), ZERO)
    blocker = None
    if ticket.status in SETTLEMENT_BLOCKED_STATUSES:
        blocker = "Approve the complaint first; there is nothing to settle yet."
    return {
        "total": total,
        "paid": paid,
        "outstanding": outstanding,
        "receivable_id": receivable.id if receivable is not None else None,
        "receivable_number": receivable.invoice_number if receivable is not None else None,
        "money_in": money_in,
        "money_out": money_out,
        "net": money_in - money_out,
        "pending_count": sum(1 for r in rows if r.status in ("pending_approval", "correction_requested")),
        "can_settle": blocker is None,
        "blocker": blocker,
        "customer_id": ticket.customer_id,
        "customer_name": ticket.customer_name or "",
    }


# --------------------------------------------------------- create / edit


def _default_account(db: Session, company_id: str) -> Optional[str]:
    from app.services.finance.finance_service import FinanceService

    try:
        return FinanceService(db).get_default_payment_account(company_id).id
    except HTTPException:
        return None


def create_settlement(db: Session, ticket: RmaTicket, data: dict[str, Any], *, user: AuthUser) -> RmaSettlement:
    if ticket.status in SETTLEMENT_BLOCKED_STATUSES:
        raise HTTPException(status_code=400, detail="Approve the complaint first; there is nothing to settle yet.")
    party_type = data.get("party_type") or "customer"
    party_id = data.get("party_id")
    party_name = data.get("party_name")
    if party_type == "customer" and not party_id and not (party_name or "").strip() and ticket.customer_id:
        party_id = ticket.customer_id  # the usual case: the RMA's own customer
    resolved_id, resolved_name = resolve_party(db, ticket.company_id, party_type, party_id, party_name)
    s = RmaSettlement(
        company_id=ticket.company_id,
        rma_id=ticket.id,
        settlement_number=next_settlement_number(db, ticket.company_id),
        status="draft",
        party_type=party_type,
        party_id=resolved_id,
        party_name=resolved_name,
        direction=data.get("direction") or "in",
        amount=_money(data.get("amount")),
        purpose=data.get("purpose") or "parts_service",
        purpose_note=(data.get("purpose_note") or "").strip() or None,
        payment_account_id=data.get("payment_account_id") or _default_account(db, ticket.company_id),
        transaction_date=data.get("transaction_date") or date.today(),
        reference=(data.get("reference") or "").strip() or None,
        created_by=user.id,
        created_by_name=user.name or user.username,
    )
    _check_enums(s)
    db.add(s)
    db.flush()
    complaint_service.record_activity(
        db,
        ticket,
        "settlement_created",
        actor=user.id,
        new_value=s.settlement_number,
        details={"direction": s.direction, "amount": str(s.amount), "purpose": s.purpose},
    )
    return s


def update_settlement(db: Session, s: RmaSettlement, changes: dict[str, Any]) -> RmaSettlement:
    if s.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"A settlement that is {SETTLEMENT_STATUS_LABELS[s.status].lower()} can no longer be edited.",
        )
    allowed = REVERSAL_EDITABLE_FIELDS if s.reverses_id else EDITABLE_FIELDS
    locked = [k for k in changes if k in EDITABLE_FIELDS and k not in allowed]
    if locked:
        raise HTTPException(
            status_code=400,
            detail="A reversal mirrors the settlement it undoes: only the explanation, date and reference can be changed.",
        )
    changes = {k: v for k, v in changes.items() if k in allowed}
    if {"party_type", "party_id", "party_name"} & changes.keys():
        party_type = changes.get("party_type", s.party_type)
        # Switching the party type drops a party that no longer fits unless a new one came with it.
        party_id = changes["party_id"] if "party_id" in changes else (s.party_id if party_type == s.party_type else None)
        party_name = changes.get("party_name") if "party_name" in changes else (s.party_name if party_type == "other" else None)
        s.party_type = party_type
        s.party_id, s.party_name = resolve_party(db, s.company_id, party_type, party_id, party_name)
    for key in ("direction", "purpose", "payment_account_id", "transaction_date"):
        if key in changes:
            setattr(s, key, changes[key])
    if "amount" in changes:
        s.amount = _money(changes["amount"])
    if "purpose_note" in changes:
        s.purpose_note = (changes["purpose_note"] or "").strip() or None
    if "reference" in changes:
        s.reference = (changes["reference"] or "").strip() or None
    _check_enums(s)
    db.flush()
    return s


def _check_enums(s: RmaSettlement) -> None:
    if s.direction not in SETTLEMENT_DIRECTIONS:
        raise HTTPException(status_code=400, detail=f"Direction must be Money In or Money Out (got {s.direction}).")
    if s.purpose not in SETTLEMENT_PURPOSES:
        raise HTTPException(status_code=400, detail=f"Unknown purpose: {s.purpose}")


# ------------------------------------------------------------ validation


def validate(db: Session, ticket: RmaTicket, s: RmaSettlement) -> str:
    """Every rule that can refuse a settlement. Returns the counter account (or RECEIVABLE) it will post to."""
    if ticket.status in SETTLEMENT_BLOCKED_STATUSES and not s.reverses_id:
        raise HTTPException(status_code=400, detail="Approve the complaint first; there is nothing to settle yet.")
    if s.reverses_id:
        _validate_reversal(db, s)
        return "reversal"
    _check_enums(s)
    amount = _money(s.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Enter an amount greater than zero. A settlement of nothing is not recorded.")
    note = (s.purpose_note or "").strip()
    if s.purpose == "other":
        if len(note) < MIN_OTHER_NOTE:
            raise HTTPException(status_code=400, detail=f"Describe in detail why this money moves (at least {MIN_OTHER_NOTE} characters) when the purpose is Other.")
    elif len(note) < MIN_NOTE:
        raise HTTPException(status_code=400, detail="Write why this money is being received or paid (Purpose details).")
    resolve_party(db, s.company_id, s.party_type, s.party_id, s.party_name)
    if not s.payment_account_id:
        raise HTTPException(status_code=400, detail="Pick the cash or bank account.")
    account = db.get(FinancePaymentAccount, s.payment_account_id)
    if account is None or account.company_id != s.company_id or not account.is_active:
        raise HTTPException(status_code=400, detail="That cash / bank account is not available.")
    try:
        counter = counter_account(s.direction, s.purpose, s.party_type)
    except SettlementRuleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if counter == RECEIVABLE:
        _validate_charge_collection(db, ticket, s, amount)
    return counter


def _validate_charge_collection(db: Session, ticket: RmaTicket, s: RmaSettlement, amount: Decimal) -> None:
    if _money(ticket.total) <= 0:
        raise HTTPException(
            status_code=400,
            detail="This RMA has no charges, so there is nothing to collect (and no receipt for zero is created). Add a charge, or choose Damage Compensation / Other.",
        )
    if not ticket.customer_id:
        raise HTTPException(status_code=400, detail="This RMA has no linked customer, so its charges have nowhere to go.")
    if s.party_id != ticket.customer_id:
        raise HTTPException(status_code=400, detail="The RMA's charges are collected from this RMA's customer. Pick that customer.")
    receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
    owed = _money(receivable.balance) if receivable is not None and receivable.status in ("open", "partial") else (ZERO if receivable is not None else _money(ticket.total))
    if owed <= 0:
        raise HTTPException(status_code=400, detail="The RMA's charges are already paid.")
    if amount > owed:
        raise HTTPException(status_code=400, detail=f"The amount ({amount}) is more than what is owed on this RMA ({owed}).")


# ------------------------------------------------------------ workflow


def submit_settlement(db: Session, s: RmaSettlement, *, actor: Optional[str]) -> RmaSettlement:
    if s.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a settlement sent back for correction can be sent for approval (this one is {SETTLEMENT_STATUS_LABELS[s.status].lower()}).",
        )
    ticket = db.get(RmaTicket, s.rma_id)
    validate(db, ticket, s)
    s.status = "pending_approval"
    s.decision = None
    db.flush()
    complaint_service.record_activity(db, ticket, "settlement_submitted", actor=actor, new_value=s.settlement_number)
    return s


def cancel_settlement(db: Session, s: RmaSettlement, *, actor: Optional[str], reason: Optional[str]) -> RmaSettlement:
    if s.status == "approved":
        raise HTTPException(
            status_code=400,
            detail="This settlement is approved and already posted. Correct it with a new settlement in the other direction, not a cancel.",
        )
    if s.status in {"cancelled", "rejected"}:
        raise HTTPException(status_code=400, detail=f"This settlement is already {s.status}.")
    s.status = "cancelled"
    db.flush()
    ticket = db.get(RmaTicket, s.rma_id)
    complaint_service.record_activity(
        db, ticket, "settlement_cancelled", actor=actor, new_value=s.settlement_number, details={"reason": (reason or "").strip() or None}
    )
    return s


def decide_settlement(db: Session, s: RmaSettlement, *, decision: str, reason: Optional[str], user: AuthUser) -> RmaSettlement:
    """Approve (posts, once), reject, or send back. The caller has checked the approve permission and the approval limit."""
    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
    ticket = db.get(RmaTicket, s.rma_id)
    complaint_service.lock_ticket(db, ticket)  # one posting at a time per RMA
    db.refresh(s)  # a concurrent approval that just finished must be seen before deciding
    # an approver finalizes a draft in one step: it is sent and decided in this same call (docs/approval.md)
    if decision == "approved" and s.status in {"draft", "correction_requested"}:
        submit_settlement(db, s, actor=user.id)
    if s.status != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Only a settlement that is pending approval can be decided (this one is {SETTLEMENT_STATUS_LABELS[s.status].lower()}).",
        )
    text = (reason or "").strip()
    if decision != "approved" and not text:
        raise HTTPException(status_code=400, detail="A reason is required to reject a settlement or send it back.")
    if decision == "approved":
        _post(db, s, ticket, user=user)
    s.status = decision
    s.decision = decision
    s.decided_by = user.id
    s.decided_by_name = user.name or user.username
    s.decided_at = datetime.utcnow()
    s.decision_reason = text or None
    if decision == "approved":
        s.posted_at = datetime.utcnow()
    db.flush()
    complaint_service.record_activity(
        db, ticket, f"settlement_{decision}", actor=user.id, new_value=s.settlement_number, details={"reason": text or None}
    )
    return s


def _post(db: Session, s: RmaSettlement, ticket: RmaTicket, *, user: AuthUser) -> None:
    """Everything approval posts, once. Anything that can refuse is checked before anything changes."""
    from app.services.finance.finance_service import FinanceService
    from app.services.rma import rma_service

    if s.payment_id or s.journal_entry_id:
        raise HTTPException(status_code=409, detail="This settlement has already been posted.")
    counter = validate(db, ticket, s)
    finance = FinanceService(db)
    if counter == "reversal":
        _post_reversal(db, s, ticket, finance, user=user)
        return
    when = s.transaction_date or date.today()
    reference = s.reference or s.settlement_number
    notes = f"RMA {ticket.rma_number} — {s.settlement_number} — {SETTLEMENT_PURPOSES[s.purpose]}: {(s.purpose_note or '').strip()}"
    account = db.get(FinancePaymentAccount, s.payment_account_id)

    if counter == RECEIVABLE:
        receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
        if receivable is None:
            receivable = rma_service.raise_bill(db, ticket)  # the RMA's own invoice, raised once
        receivable, payment = finance.settle_receivable(
            receivable,
            amount=_money(s.amount),
            payment_account_id=s.payment_account_id,
            payment_date=when,
            reference=reference,
            notes=notes,
        )
        s.receivable_id = receivable.id
        s.receivable_number = receivable.invoice_number
        if receivable.status == "paid":
            ticket.bill_status = "paid"
        entry_id = payment.journal_entry_id
    else:
        payment, entry = finance.post_party_payment(
            company_id=s.company_id,
            direction="inbound" if s.direction == "in" else "outbound",
            amount=_money(s.amount),
            payment_account_id=s.payment_account_id,
            payment_date=when,
            source_type=SOURCE_TYPE,
            source_id=s.id,
            counter_code=counter,
            description=f"RMA {ticket.rma_number} settlement {s.settlement_number} — {SETTLEMENT_PURPOSES[s.purpose]}",
            party_type=payment_party_tag(s.party_type),
            party_id=s.party_id,
            line_party_type=journal_party_tag(s.party_type, counter),
            reference=reference,
            notes=notes,
        )
        entry_id = entry.id
    s.counter_account_code = "1100" if counter == RECEIVABLE else counter
    s.payment_id = payment.id
    s.payment_number = payment.payment_number
    s.journal_entry_id = entry_id
    entry_row = finance.get_journal_entry(entry_id, company_id=s.company_id) if entry_id else None
    s.journal_number = entry_row.entry_number if entry_row is not None else None
    s.payment_method = account.kind if account is not None else payment.payment_method
    complaint_service.record_activity(
        db,
        ticket,
        "settlement_posted",
        actor=user.id,
        new_value=str(_money(s.amount)),
        details={"settlement": s.settlement_number, "direction": s.direction, "payment": payment.payment_number, "journal": s.journal_number},
    )


# ------------------------------------------------------------- reversal


def reverse_settlement(db: Session, original: RmaSettlement, *, reason: str, user: AuthUser) -> RmaSettlement:
    """Correct an approved settlement with a new, linked document that mirrors it (opposite direction).

    The original is never edited or cancelled. The reversal is a draft that goes through the same send-for-approval /
    approve steps, and approving it posts the exact mirror of the original journal through Finance (and, for the RMA's own
    charges, puts the amount back on the invoice). One reversal per settlement."""
    text = (reason or "").strip()
    if len(text) < MIN_NOTE:
        raise HTTPException(status_code=400, detail="Write why this settlement is being reversed.")
    ticket = db.get(RmaTicket, original.rma_id)
    complaint_service.lock_ticket(db, ticket)
    db.refresh(original)
    if original.status != "approved" or not original.payment_id:
        raise HTTPException(status_code=400, detail="Only an approved, posted settlement can be reversed.")
    if original.reverses_id:
        raise HTTPException(status_code=400, detail="A reversal cannot itself be reversed. Record a new settlement instead.")
    existing = (
        db.query(RmaSettlement)
        .filter(RmaSettlement.reverses_id == original.id, RmaSettlement.status.notin_(("rejected", "cancelled")))
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"{existing.settlement_number} already reverses this settlement ({SETTLEMENT_STATUS_LABELS[existing.status].lower()}).")
    r = RmaSettlement(
        company_id=original.company_id,
        rma_id=original.rma_id,
        settlement_number=next_settlement_number(db, original.company_id),
        status="draft",
        party_type=original.party_type,
        party_id=original.party_id,
        party_name=original.party_name,
        direction="out" if original.direction == "in" else "in",
        amount=original.amount,
        purpose=original.purpose,
        purpose_note=f"Reversal of {original.settlement_number}: {text}",
        payment_account_id=original.payment_account_id,
        transaction_date=date.today(),
        reference=original.settlement_number,
        reverses_id=original.id,
        created_by=user.id,
        created_by_name=user.name or user.username,
    )
    db.add(r)
    db.flush()
    complaint_service.record_activity(
        db,
        ticket,
        "settlement_reversal_created",
        actor=user.id,
        new_value=r.settlement_number,
        details={"reverses": original.settlement_number, "reason": text},
    )
    return r


def _validate_reversal(db: Session, r: RmaSettlement) -> None:
    original = db.get(RmaSettlement, r.reverses_id)
    if original is None or original.company_id != r.company_id or original.rma_id != r.rma_id:
        raise HTTPException(status_code=400, detail="The settlement this reverses was not found.")
    if original.status != "approved" or not original.payment_id:
        raise HTTPException(status_code=400, detail="Only an approved, posted settlement can be reversed.")
    if original.reversed_by_id and original.reversed_by_id != r.id:
        raise HTTPException(status_code=409, detail="This settlement has already been reversed.")
    if (r.purpose_note or "").strip() == "" or len((r.purpose_note or "").strip()) < MIN_NOTE:
        raise HTTPException(status_code=400, detail="Write why this settlement is being reversed.")
    if original.receivable_id:
        from app.models.finance import FinanceReceivable as _Receivable

        receivable = db.get(_Receivable, original.receivable_id)
        if receivable is None or receivable.status == "void" or _money(receivable.amount_paid) < _money(original.amount):
            raise HTTPException(
                status_code=400,
                detail="The invoice this payment settled has changed (voided or paid down differently), so it cannot be mirrored.",
            )


def _post_reversal(db: Session, r: RmaSettlement, ticket: RmaTicket, finance, *, user: AuthUser) -> None:
    from app.models.finance import FinancePayment

    original = db.get(RmaSettlement, r.reverses_id)
    original_payment = db.get(FinancePayment, original.payment_id)
    when = r.transaction_date or date.today()
    notes = f"RMA {ticket.rma_number} — {r.settlement_number} — {(r.purpose_note or '').strip()}"
    payment, entry = finance.reverse_party_payment(
        original_payment,
        source_type=SOURCE_TYPE,
        source_id=r.id,
        payment_date=when,
        reference=r.reference or r.settlement_number,
        notes=notes,
    )
    if original.receivable_id:
        from app.models.finance import FinanceReceivable as _Receivable

        receivable = db.get(_Receivable, original.receivable_id)
        finance.unapply_payment_from_receivable(receivable, _money(original.amount))
        r.receivable_id, r.receivable_number = receivable.id, receivable.invoice_number
        ticket.bill_status = "paid" if receivable.status == "paid" else "billed"
    r.counter_account_code = original.counter_account_code
    r.payment_id, r.payment_number = payment.id, payment.payment_number
    r.journal_entry_id, r.journal_number = entry.id, entry.entry_number
    r.payment_method = original.payment_method
    original.reversed_by_id = r.id
    complaint_service.record_activity(
        db,
        ticket,
        "settlement_posted",
        actor=user.id,
        new_value=str(_money(r.amount)),
        details={"settlement": r.settlement_number, "reverses": original.settlement_number, "direction": r.direction, "payment": payment.payment_number, "journal": r.journal_number},
    )

