"""Cheque book register: books of numbered cheque leaves for a bank account.

A book is Draft (being set up) -> Active (cheques can be issued from it) -> Closed (finished). "Generate cheques" makes one
leaf per number; "Delete unused" removes the leaves nobody used. An issued cheque (finance_cheques) takes its number and
bank from a leaf, and the leaf then follows that cheque: waiting at the bank (not treated), cleared, bounced or cancelled.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.finance import FinanceCheque, FinancePaymentAccount
from app.models.finance_cheque_book import FinanceChequeBook, FinanceChequeLeaf
from app.services.core.sequence_service import next_number

MAX_LEAVES = 500  # one cheque book is 10 - 100 leaves; this only stops a typo (1..9999999) from creating millions of rows

# an issued leaf, by the status of its cheque
TREATMENT = {
    "issued": "not_treated",
    "presented": "not_treated",
    "cleared": "cleared",
    "bounced": "bounced",
    "cancelled": "cancelled",
}


def leaf_display_status(leaf: FinanceChequeLeaf, cheque: Optional[FinanceCheque]) -> str:
    """unused | void | not_treated | cleared | bounced | cancelled"""
    if leaf.status == "issued" and cheque is not None:
        return TREATMENT.get(cheque.status, "not_treated")
    return leaf.status


def format_leaf_number(prefix: str, number: int, width: int) -> str:
    return f"{prefix}{str(number).zfill(width)}"


class ChequeBookService:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── reads ────────────────────────────────────────────────────────────────

    def get(self, book_id: str, *, company_id: str, lock: bool = False) -> FinanceChequeBook:
        query = self._db.query(FinanceChequeBook).filter(
            FinanceChequeBook.id == book_id, FinanceChequeBook.company_id == company_id,
        )
        if lock:
            query = query.with_for_update()
        book = query.first()
        if book is None:
            raise HTTPException(status_code=404, detail="Cheque book not found")
        return book

    def list(self, *, company_id: str, state: Optional[str] = None, payment_account_id: Optional[str] = None) -> list[FinanceChequeBook]:
        query = self._db.query(FinanceChequeBook).filter(FinanceChequeBook.company_id == company_id)
        if state:
            query = query.filter(FinanceChequeBook.state == state)
        if payment_account_id:
            query = query.filter(FinanceChequeBook.payment_account_id == payment_account_id)
        return query.order_by(FinanceChequeBook.created_at.desc()).all()

    def leaves(self, book_id: str) -> list[FinanceChequeLeaf]:
        return (
            self._db.query(FinanceChequeLeaf)
            .filter(FinanceChequeLeaf.book_id == book_id)
            .order_by(FinanceChequeLeaf.cheque_number)
            .all()
        )

    def leaf_counts(self, book_ids: list[str]) -> dict[str, dict[str, int]]:
        """book id -> {"total": n, "unused": n} for the list screen."""
        if not book_ids:
            return {}
        rows = (
            self._db.query(FinanceChequeLeaf.book_id, FinanceChequeLeaf.status, func.count(FinanceChequeLeaf.id))
            .filter(FinanceChequeLeaf.book_id.in_(book_ids))
            .group_by(FinanceChequeLeaf.book_id, FinanceChequeLeaf.status)
            .all()
        )
        out: dict[str, dict[str, int]] = {bid: {"total": 0, "unused": 0} for bid in book_ids}
        for book_id, status, count in rows:
            out[book_id]["total"] += count
            if status == "unused":
                out[book_id]["unused"] += count
        return out

    def available_leaves(self, *, company_id: str, payment_account_id: Optional[str] = None) -> list[tuple[FinanceChequeLeaf, FinanceChequeBook]]:
        """Unused leaves of Active books - what an issued cheque can pick from (first number of each book first)."""
        query = (
            self._db.query(FinanceChequeLeaf, FinanceChequeBook)
            .join(FinanceChequeBook, FinanceChequeBook.id == FinanceChequeLeaf.book_id)
            .filter(
                FinanceChequeLeaf.company_id == company_id,
                FinanceChequeLeaf.status == "unused",
                FinanceChequeBook.state == "active",
            )
        )
        if payment_account_id:
            query = query.filter(FinanceChequeBook.payment_account_id == payment_account_id)
        return query.order_by(FinanceChequeBook.created_at, FinanceChequeLeaf.cheque_number).all()

    # ── book setup ───────────────────────────────────────────────────────────

    def _check_range(self, number_from: int, number_to: int) -> None:
        if number_from < 0 or number_to < number_from:
            raise HTTPException(status_code=400, detail="'Cheque to' must be the same as or after 'Cheque from'")
        if number_to - number_from + 1 > MAX_LEAVES:
            raise HTTPException(status_code=400, detail=f"A cheque book can have at most {MAX_LEAVES} leaves")

    def _account(self, company_id: str, account_id: str) -> FinancePaymentAccount:
        account = self._db.get(FinancePaymentAccount, account_id)
        if account is None or account.company_id != company_id:
            raise HTTPException(status_code=404, detail="Bank account not found")
        return account

    def create(
        self,
        *,
        company_id: str,
        payment_account_id: str,
        bank_name: str,
        branch_name: Optional[str],
        routing_number: Optional[str],
        cheque_prefix: str,
        number_from: int,
        number_to: int,
        remarks: Optional[str],
        actor: Optional[str],
    ) -> FinanceChequeBook:
        self._account(company_id, payment_account_id)
        self._check_range(number_from, number_to)
        bank_name = (bank_name or "").strip()
        if not bank_name:
            raise HTTPException(status_code=400, detail="Bank name is required")
        book = FinanceChequeBook(
            company_id=company_id,
            book_number=next_number(
                self._db, company_id, "finance.cheque_book",
                initial=lambda: (self._db.query(func.count(FinanceChequeBook.id)).filter(FinanceChequeBook.company_id == company_id).scalar() or 0) + 1,
            ),
            payment_account_id=payment_account_id,
            bank_name=bank_name,
            branch_name=(branch_name or "").strip() or None,
            routing_number=(routing_number or "").strip() or None,
            cheque_prefix=(cheque_prefix or "").strip(),
            number_from=number_from,
            number_to=number_to,
            remarks=(remarks or "").strip() or None,
            state="draft",
            created_by=actor,
        )
        self._db.add(book)
        self._db.flush()
        return book

    def update(self, book_id: str, *, company_id: str, changes: dict) -> FinanceChequeBook:
        book = self.get(book_id, company_id=company_id, lock=True)
        if book.state == "closed":
            raise HTTPException(status_code=409, detail="A closed cheque book cannot be edited - reopen it first")
        has_leaves = self._db.query(FinanceChequeLeaf.id).filter(FinanceChequeLeaf.book_id == book.id).first() is not None
        numbering = {"cheque_prefix", "number_from", "number_to", "payment_account_id", "bank_name"}
        if has_leaves and any(k in changes and changes[k] != getattr(book, k) for k in numbering):
            raise HTTPException(
                status_code=409,
                detail="Cheques are already generated for this book. Use Delete Unused first to change its numbers or bank.",
            )
        if "payment_account_id" in changes:
            self._account(company_id, changes["payment_account_id"])
        for key in ("payment_account_id", "bank_name", "branch_name", "routing_number", "cheque_prefix", "number_from", "number_to", "remarks"):
            if key in changes:
                value = changes[key]
                if isinstance(value, str):
                    value = value.strip()
                    if key in ("branch_name", "routing_number", "remarks"):
                        value = value or None
                setattr(book, key, value)
        if not book.bank_name:
            raise HTTPException(status_code=400, detail="Bank name is required")
        self._check_range(book.number_from, book.number_to)
        self._db.flush()
        return book

    def delete(self, book_id: str, *, company_id: str) -> None:
        book = self.get(book_id, company_id=company_id, lock=True)
        if self._db.query(FinanceChequeLeaf.id).filter(FinanceChequeLeaf.book_id == book.id, FinanceChequeLeaf.status == "issued").first():
            raise HTTPException(status_code=409, detail="Cheques were issued from this book, so it cannot be deleted")
        self._db.delete(book)
        self._db.flush()

    # ── leaves ───────────────────────────────────────────────────────────────

    def generate_leaves(self, book_id: str, *, company_id: str) -> int:
        """One leaf per number in the book's range that has none yet; returns how many were made."""
        book = self.get(book_id, company_id=company_id, lock=True)
        if book.state == "closed":
            raise HTTPException(status_code=409, detail="A closed cheque book cannot get new cheques - reopen it first")
        width = max(len(str(book.number_from)), len(str(book.number_to)))
        wanted = [format_leaf_number(book.cheque_prefix, n, width) for n in range(book.number_from, book.number_to + 1)]
        have = {row[0] for row in self._db.query(FinanceChequeLeaf.cheque_number).filter(FinanceChequeLeaf.book_id == book.id)}
        # the same number must not sit in two books of the same bank account (it would let one cheque be issued twice)
        taken = {
            row[0]
            for row in self._db.query(FinanceChequeLeaf.cheque_number)
            .join(FinanceChequeBook, FinanceChequeBook.id == FinanceChequeLeaf.book_id)
            .filter(
                FinanceChequeBook.company_id == company_id,
                FinanceChequeBook.payment_account_id == book.payment_account_id,
                FinanceChequeBook.id != book.id,
                FinanceChequeLeaf.cheque_number.in_(wanted),
            )
        }
        if taken:
            raise HTTPException(
                status_code=409,
                detail=f"Cheque {sorted(taken)[0]} already belongs to another cheque book of this bank account",
            )
        made = 0
        for number in wanted:
            if number in have:
                continue
            self._db.add(FinanceChequeLeaf(book_id=book.id, company_id=company_id, cheque_number=number, status="unused"))
            made += 1
        self._db.flush()
        return made

    def delete_unused(self, book_id: str, *, company_id: str) -> int:
        book = self.get(book_id, company_id=company_id, lock=True)
        if book.state == "closed":
            raise HTTPException(status_code=409, detail="A closed cheque book cannot be changed - reopen it first")
        removed = (
            self._db.query(FinanceChequeLeaf)
            .filter(FinanceChequeLeaf.book_id == book.id, FinanceChequeLeaf.status == "unused")
            .delete(synchronize_session=False)
        )
        self._db.flush()
        return removed

    def set_leaf_void(self, leaf_id: str, *, company_id: str, void: bool) -> FinanceChequeLeaf:
        leaf = (
            self._db.query(FinanceChequeLeaf)
            .filter(FinanceChequeLeaf.id == leaf_id, FinanceChequeLeaf.company_id == company_id)
            .with_for_update()
            .first()
        )
        if leaf is None:
            raise HTTPException(status_code=404, detail="Cheque leaf not found")
        if leaf.status == "issued":
            raise HTTPException(status_code=409, detail="This cheque is already issued - cancel the cheque instead")
        leaf.status = "void" if void else "unused"
        self._db.flush()
        return leaf

    # ── state ────────────────────────────────────────────────────────────────

    def set_state(self, book_id: str, state: str, *, company_id: str) -> FinanceChequeBook:
        book = self.get(book_id, company_id=company_id, lock=True)
        if state == book.state:
            return book
        if state == "active":
            if book.state == "draft" and self._db.query(FinanceChequeLeaf.id).filter(FinanceChequeLeaf.book_id == book.id).first() is None:
                raise HTTPException(status_code=409, detail="Generate the cheques before activating the book")
        elif state == "closed":
            if book.state != "active":
                raise HTTPException(status_code=409, detail="Only an active cheque book can be closed")
        elif state == "draft":
            if self._db.query(FinanceChequeLeaf.id).filter(FinanceChequeLeaf.book_id == book.id, FinanceChequeLeaf.status == "issued").first():
                raise HTTPException(status_code=409, detail="Cheques were issued from this book, so it cannot go back to draft")
        else:
            raise HTTPException(status_code=400, detail="State must be draft, active or closed")
        book.state = state
        self._db.flush()
        return book

    # ── issuing a cheque from a leaf ─────────────────────────────────────────

    def take_leaf(self, leaf_id: str, *, company_id: str) -> tuple[FinanceChequeLeaf, FinanceChequeBook]:
        """Lock a leaf for a cheque that is about to be issued; it must be unused and in an Active book."""
        leaf = (
            self._db.query(FinanceChequeLeaf)
            .filter(FinanceChequeLeaf.id == leaf_id, FinanceChequeLeaf.company_id == company_id)
            .with_for_update()
            .first()
        )
        if leaf is None:
            raise HTTPException(status_code=404, detail="Cheque leaf not found")
        book = self.get(leaf.book_id, company_id=company_id)
        if book.state != "active":
            raise HTTPException(status_code=409, detail=f"Cheque book {book.book_number} is not active")
        if leaf.status != "unused":
            raise HTTPException(status_code=409, detail=f"Cheque {leaf.cheque_number} is already {leaf.status}")
        return leaf, book

    def attach_cheque(self, leaf: FinanceChequeLeaf, cheque: FinanceCheque) -> None:
        leaf.status = "issued"
        leaf.cheque_id = cheque.id
        self._db.flush()

    def leaf_of_cheque(self, cheque_id: str) -> Optional[tuple[FinanceChequeLeaf, FinanceChequeBook]]:
        row = (
            self._db.query(FinanceChequeLeaf, FinanceChequeBook)
            .join(FinanceChequeBook, FinanceChequeBook.id == FinanceChequeLeaf.book_id)
            .filter(FinanceChequeLeaf.cheque_id == cheque_id)
            .first()
        )
        return (row[0], row[1]) if row else None
