from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceCheque, FinancePayment, FinancePaymentAccount
from app.models.finance_cheque_book import FinanceChequeBook, FinanceChequeLeaf
from app.schemas.finance_cheque_book import (
    AvailableLeafListResponse,
    AvailableLeafRead,
    ChequeBookActionResponse,
    ChequeBookCreate,
    ChequeBookDetailRead,
    ChequeBookListResponse,
    ChequeBookRead,
    ChequeBookResponse,
    ChequeBookStateRequest,
    ChequeBookUpdate,
    ChequeLeafRead,
    ChequeLeafVoidRequest,
)
from app.services.finance.cheque_book_service import ChequeBookService, leaf_display_status

router = APIRouter(prefix="/finance/cheque-books", tags=["finance-cheque-books"])


def _actor(user: AuthUser) -> str:
    return getattr(user, "email", None) or str(user.id)


def _book_read(db: Session, book: FinanceChequeBook, counts: dict[str, int]) -> dict:
    account = db.get(FinancePaymentAccount, book.payment_account_id)
    return {
        "id": book.id,
        "company_id": book.company_id,
        "book_number": book.book_number,
        "payment_account_id": book.payment_account_id,
        "payment_account_name": account.name if account else None,
        "bank_name": book.bank_name,
        "branch_name": book.branch_name,
        "routing_number": book.routing_number,
        "cheque_prefix": book.cheque_prefix,
        "number_from": book.number_from,
        "number_to": book.number_to,
        "state": book.state,
        "remarks": book.remarks,
        "leaf_count": counts.get("total", 0),
        "unused_count": counts.get("unused", 0),
        "created_at": book.created_at,
        "updated_at": book.updated_at,
    }


def _leaf_read(db: Session, leaf: FinanceChequeLeaf) -> ChequeLeafRead:
    cheque = db.get(FinanceCheque, leaf.cheque_id) if leaf.cheque_id else None
    supplier = db.get(CommerceSupplier, cheque.party_id) if cheque is not None and cheque.party_type == "supplier" else None
    payment = db.get(FinancePayment, cheque.payment_id) if cheque is not None and cheque.payment_id else None
    return ChequeLeafRead(
        id=leaf.id,
        book_id=leaf.book_id,
        cheque_number=leaf.cheque_number,
        status=leaf.status,
        display_status=leaf_display_status(leaf, cheque),
        cheque_id=cheque.id if cheque is not None else None,
        issue_date=cheque.cheque_date if cheque is not None else None,
        party_name=supplier.name if supplier is not None else None,
        payment_number=payment.payment_number if payment is not None else None,
        amount=cheque.amount if cheque is not None else 0,
        remarks=cheque.notes if cheque is not None else None,
    )


def _detail(db: Session, service: ChequeBookService, book: FinanceChequeBook) -> ChequeBookDetailRead:
    leaves = service.leaves(book.id)
    counts = {"total": len(leaves), "unused": sum(1 for leaf in leaves if leaf.status == "unused")}
    return ChequeBookDetailRead(**_book_read(db, book, counts), leaves=[_leaf_read(db, leaf) for leaf in leaves])


@router.get("", response_model=ChequeBookListResponse)
def list_cheque_books(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    state: Optional[str] = Query(default=None),
    payment_account_id: Optional[str] = Query(default=None),
) -> ChequeBookListResponse:
    service = ChequeBookService(db)
    books = service.list(company_id=company_id, state=state, payment_account_id=payment_account_id)
    counts = service.leaf_counts([b.id for b in books])
    return ChequeBookListResponse(data=[ChequeBookRead(**_book_read(db, b, counts.get(b.id, {}))) for b in books])


@router.get("/available-leaves", response_model=AvailableLeafListResponse)
def available_leaves(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    payment_account_id: Optional[str] = Query(default=None),
) -> AvailableLeafListResponse:
    """Unused cheques of Active books - the choices when issuing a cheque."""
    rows = ChequeBookService(db).available_leaves(company_id=company_id, payment_account_id=payment_account_id)
    return AvailableLeafListResponse(
        data=[
            AvailableLeafRead(
                leaf_id=leaf.id, cheque_number=leaf.cheque_number, book_id=book.id, book_number=book.book_number,
                bank_name=book.bank_name, payment_account_id=book.payment_account_id,
            )
            for leaf, book in rows
        ]
    )


@router.post("", response_model=ChequeBookResponse, status_code=201)
def create_cheque_book(
    payload: ChequeBookCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookResponse:
    service = ChequeBookService(db)
    book = service.create(company_id=company_id, actor=_actor(user), **payload.model_dump())
    db.commit()
    db.refresh(book)
    return ChequeBookResponse(data=_detail(db, service, book))


@router.get("/{book_id}", response_model=ChequeBookResponse)
def get_cheque_book(
    book_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookResponse:
    service = ChequeBookService(db)
    return ChequeBookResponse(data=_detail(db, service, service.get(book_id, company_id=company_id)))


@router.patch("/{book_id}", response_model=ChequeBookResponse)
def update_cheque_book(
    book_id: str,
    payload: ChequeBookUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookResponse:
    service = ChequeBookService(db)
    book = service.update(book_id, company_id=company_id, changes=payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(book)
    return ChequeBookResponse(data=_detail(db, service, book))


@router.delete("/{book_id}", status_code=204)
def delete_cheque_book(
    book_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    ChequeBookService(db).delete(book_id, company_id=company_id)
    db.commit()


@router.post("/{book_id}/generate", response_model=ChequeBookActionResponse)
def generate_cheques(
    book_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookActionResponse:
    service = ChequeBookService(db)
    made = service.generate_leaves(book_id, company_id=company_id)
    db.commit()
    return ChequeBookActionResponse(data=_detail(db, service, service.get(book_id, company_id=company_id)), count=made)


@router.post("/{book_id}/delete-unused", response_model=ChequeBookActionResponse)
def delete_unused_cheques(
    book_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookActionResponse:
    service = ChequeBookService(db)
    removed = service.delete_unused(book_id, company_id=company_id)
    db.commit()
    return ChequeBookActionResponse(data=_detail(db, service, service.get(book_id, company_id=company_id)), count=removed)


@router.post("/{book_id}/state", response_model=ChequeBookResponse)
def set_cheque_book_state(
    book_id: str,
    payload: ChequeBookStateRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookResponse:
    service = ChequeBookService(db)
    book = service.set_state(book_id, payload.state, company_id=company_id)
    db.commit()
    db.refresh(book)
    return ChequeBookResponse(data=_detail(db, service, book))


@router.post("/leaves/{leaf_id}/void", response_model=ChequeBookResponse)
def void_cheque_leaf(
    leaf_id: str,
    payload: ChequeLeafVoidRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChequeBookResponse:
    service = ChequeBookService(db)
    leaf = service.set_leaf_void(leaf_id, company_id=company_id, void=payload.void)
    db.commit()
    return ChequeBookResponse(data=_detail(db, service, service.get(leaf.book_id, company_id=company_id)))
