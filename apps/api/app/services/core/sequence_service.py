"""Document number allocation.

Every business document (SO, PO, GRN, receipt, journal entry…) draws its number
from a `core_sequences` row that is locked for the duration of the caller's
transaction, so two concurrent requests can never receive the same number and a
deleted record never frees its number for re-use.

A rolled-back transaction leaves a gap in the numbering. That is intended and
matches SAP number ranges / Odoo sequences — a gap is harmless, a duplicate
document number is not.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Callable, Dict, Optional, Union

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.core_sequence import CoreSequence


@dataclass(frozen=True)
class SequenceSpec:
    """Shipping default for a document type — used when the row is first created."""

    name: str
    prefix: str
    padding: int = 5
    reset_policy: str = "never"
    suffix: str = ""


# Document types the ERP ships with. Admins can edit these rows in Workspace;
# a code missing here still works and falls back to a generic spec.
DEFAULT_SEQUENCES: Dict[str, SequenceSpec] = {
    # Sales
    "sales.quotation": SequenceSpec("Sales quotation", "QUO-"),
    "sales.order": SequenceSpec("Sales order", "SO-"),
    "sales.invoice": SequenceSpec("Sales invoice", "INV-"),
    "sales.delivery": SequenceSpec("Delivery note", "DN-"),
    "sales.return": SequenceSpec("Sales return", "SR-{YYYY}-", 4, "yearly"),
    # Purchase
    "purchase.order": SequenceSpec("Purchase order", "PO-{YYYY}-", 4, "yearly"),
    "purchase.rfq": SequenceSpec("Purchase RFQ", "RFQ-{YYYY}-", 4, "yearly"),
    "purchase.bill": SequenceSpec("Supplier bill", "BILL-{YYYY}-", 4, "yearly"),
    "purchase.receipt": SequenceSpec("Goods receipt", "GRN-{YYYY}-", 4, "yearly"),
    "purchase.return": SequenceSpec("Purchase return", "PR-{YYYY}-", 4, "yearly"),
    # POS
    "pos.cart": SequenceSpec("POS cart", "POS-{YYYY}-", 6, "yearly"),
    "pos.receipt": SequenceSpec("POS receipt", "RCP-{YYYY}-", 6, "yearly"),
    "pos.return": SequenceSpec("POS return", "RET-{YYYY}-", 6, "yearly"),
    # Inventory
    "inventory.transfer": SequenceSpec("Stock transfer", "TR-{YYYY}-", 4, "yearly"),
    "inventory.adjustment": SequenceSpec("Stock adjustment", "ADJ-{YYYY}-", 4, "yearly"),
    "inventory.count": SequenceSpec("Stock count", "SC-{YYYY}-", 4, "yearly"),
    # Finance
    "finance.journal": SequenceSpec("Journal entry", "JE-"),
    "finance.payment": SequenceSpec("Payment", "PAY-"),
    "finance.expense": SequenceSpec("Expense", "EXP-"),
    "finance.payment.customer": SequenceSpec("Customer payment", "PAY-CUS-"),
    "finance.payment.supplier": SequenceSpec("Supplier payment", "PAY-SUP-"),
    # Service / CRM
    "service.job": SequenceSpec("Service job", "SJ-{YYYY}-", 4, "yearly"),
    "crm.ticket": SequenceSpec("CRM ticket", "TCK-"),
    # Vendor module
    "vendor.order": SequenceSpec("Vendor order", "ORD-V-"),
    "vendor.invoice": SequenceSpec("Vendor invoice", "INV-V-"),
    "vendor.order_request": SequenceSpec("Vendor order request", "ORQ-"),
    "vendor.quotation": SequenceSpec("Vendor quotation", "VQU-"),
    # Master data codes
    "party.customer": SequenceSpec("Customer code", "CUST-"),
    "commerce.customer": SequenceSpec("Commerce customer code", "C-", 0),
    "party.supplier": SequenceSpec("Supplier code", "VND-", 4),
    "party.vendor": SequenceSpec("Vendor code", "VEN-"),
    "hrm.employee": SequenceSpec("Employee code", "EMP", 6),
    "hrm.asset": SequenceSpec("Asset code", "AST-"),
    "hrm.job": SequenceSpec("Job code", "JOB-"),
    "hrm.requisition": SequenceSpec("Requisition code", "REQ-", 4),
    # Content
    "catalog.review": SequenceSpec("Product review", "R-", 0),
    "catalog.question": SequenceSpec("Product question", "Q-", 0),
}

GENERIC_SPEC = SequenceSpec("Document", "DOC-")


def _period_key(policy: str, at: date) -> str:
    if policy == "yearly":
        return f"{at.year:04d}"
    if policy == "monthly":
        return f"{at.year:04d}-{at.month:02d}"
    return ""


def _render_tokens(text: str, at: date) -> str:
    return (
        text.replace("{YYYY}", f"{at.year:04d}")
        .replace("{YY}", f"{at.year % 100:02d}")
        .replace("{MM}", f"{at.month:02d}")
    )


def format_number(row: CoreSequence, value: int, at: date) -> str:
    body = f"{value:0{row.padding}d}" if row.padding > 0 else str(value)
    return f"{_render_tokens(row.prefix, at)}{body}{_render_tokens(row.suffix, at)}"


Seed = Union[int, Callable[[], int], None]


def _resolve_seed(initial: Seed) -> int:
    """Seeds are resolved only when a row is created, so callers can pass a
    callable and keep the legacy MAX/COUNT query off the hot path."""
    if initial is None:
        return 1
    value = initial() if callable(initial) else initial
    return max(1, int(value or 1))


def last_sequence_value(db: Session, column, *filters, prefix: str = "") -> int:
    """Highest trailing counter already used under `prefix` — seeds a new row so
    numbering resumes above legacy documents instead of colliding with them."""
    query = db.query(column)
    for f in filters:
        if isinstance(f, str):
            prefix = f
            continue
        query = query.filter(f)
    if prefix:
        query = query.filter(column.like(f"{prefix}%"))
    best = 0
    for (value,) in query.all():
        text = str(value or "")
        tail = text[len(prefix):] if prefix and text.startswith(prefix) else text.rsplit("-", 1)[-1]
        digits = "".join(ch for ch in tail if ch.isdigit())
        if digits:
            best = max(best, int(digits))
    return best


def get_or_create(
    db: Session,
    company_id: str,
    code: str,
    *,
    initial: Seed = None,
    lock: bool = True,
) -> CoreSequence:
    """Sequence row for `code`, created from shipping defaults when missing.

    `initial` seeds the counter the first time the row is created — pass the
    highest number already in the legacy data so numbering continues instead of
    restarting at 1 and colliding with existing documents.
    """
    query = db.query(CoreSequence).filter(
        CoreSequence.company_id == company_id,
        CoreSequence.code == code,
    )
    row = query.with_for_update().first() if lock else query.first()
    if row:
        return row

    spec = DEFAULT_SEQUENCES.get(code, GENERIC_SPEC)
    # Concurrent first-use: several requests can all see "no row" and try to
    # insert. Do it inside a SAVEPOINT so losing that race costs only the
    # savepoint — the caller's transaction survives and re-reads the winner.
    try:
        with db.begin_nested():
            db.add(
                CoreSequence(
                    company_id=company_id,
                    code=code,
                    name=spec.name,
                    prefix=spec.prefix,
                    suffix=spec.suffix,
                    padding=spec.padding,
                    next_number=_resolve_seed(initial),
                    reset_policy=spec.reset_policy,
                    period_key=_period_key(spec.reset_policy, date.today()),
                )
            )
    except IntegrityError:
        pass
    # Re-read under lock so the counter is serialised from here on.
    row = query.with_for_update().first() if lock else query.first()
    if row is None:  # pragma: no cover — the insert above guarantees a row
        raise RuntimeError(f"Could not create sequence '{code}'")
    return row


def next_number(
    db: Session,
    company_id: str,
    code: str,
    *,
    initial: Seed = None,
    at: Optional[date] = None,
    is_taken: Optional[Callable[[str], bool]] = None,
) -> str:
    """Allocate the next number for `code`, holding a row lock until commit.

    `is_taken` lets a caller skip numbers that legacy data already used; it is a
    safety net, not the mechanism — the lock is what guarantees uniqueness.
    """
    at = at or date.today()
    row = get_or_create(db, company_id, code, initial=initial)

    period = _period_key(row.reset_policy, at)
    if period != row.period_key:
        row.period_key = period
        row.next_number = 1

    for _ in range(1000):
        value = row.next_number
        row.next_number = value + max(1, row.step)
        number = format_number(row, value, at)
        if is_taken is None or not is_taken(number):
            db.flush()
            return number
    db.flush()
    raise RuntimeError(f"Could not allocate a number for sequence '{code}'")
