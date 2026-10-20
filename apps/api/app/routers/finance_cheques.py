from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceCheque, FinancePayable, FinancePaymentAccount, FinanceReceivable
from app.routers.finance import _journal_entry_read, _journal_line_read
from app.schemas.finance import (
    FinanceChequeActionRequest,
    FinanceChequeCreate,
    FinanceChequeDetailRead,
    FinanceChequeEventRead,
    FinanceChequeListResponse,
    FinanceChequeRead,
    FinanceChequeResponse,
    FinanceChequeUpdate,
    FinanceListMeta,
)
from app.services.finance.cheque_service import ChequeService, available_actions
from app.services.finance.finance_service import FinanceService

router = APIRouter(prefix="/finance/cheques", tags=["finance-cheques"])


def _actor(user: AuthUser) -> str:
    return getattr(user, "email", None) or str(user.id)


def _read_data(db: Session, cheque: FinanceCheque) -> dict:
    if cheque.party_type == "supplier":
        party = db.get(CommerceSupplier, cheque.party_id)
    else:
        party = db.get(CommerceCustomer, cheque.party_id)
    document_number = None
    if cheque.receivable_id:
        doc = db.get(FinanceReceivable, cheque.receivable_id)
        document_number = doc.invoice_number if doc else None
    elif cheque.payable_id:
        doc = db.get(FinancePayable, cheque.payable_id)
        document_number = doc.reference_number if doc else None
    account = db.get(FinancePaymentAccount, cheque.payment_account_id) if cheque.payment_account_id else None
    data = FinanceChequeRead.model_validate(cheque).model_dump()
    data.update(
        party_name=party.name if party else None,
        document_number=document_number,
        payment_account_name=account.name if account else None,
        available_actions=available_actions(cheque.status),
    )
    return data


def _detail(db: Session, service: ChequeService, cheque: FinanceCheque) -> FinanceChequeDetailRead:
    fin = FinanceService(db)
    entry_ids = [
        eid
        for eid in (
            cheque.receipt_journal_entry_id,
            cheque.deposit_journal_entry_id,
            cheque.clearance_journal_entry_id,
            cheque.reversal_journal_entry_id,
            cheque.bank_charge_journal_entry_id,
        )
        if eid
    ]
    entries = []
    for eid in entry_ids:
        entry = fin.get_journal_entry(eid, company_id=cheque.company_id)
        lines = [_journal_line_read(db, line) for line in fin.get_journal_lines(eid)]
        entries.append(_journal_entry_read(entry, lines).model_dump())
    data = _read_data(db, cheque)
    data["events"] = [FinanceChequeEventRead.model_validate(e).model_dump() for e in service.events(cheque.id)]
    data["journal_entries"] = entries
    return FinanceChequeDetailRead(**data)


@router.get("", response_model=FinanceChequeListResponse)
def list_cheques(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    direction: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    party_id: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> FinanceChequeListResponse:
    service = ChequeService(db)
    rows, total = service.list(
        company_id=company_id, direction=direction, status=status, party_id=party_id, limit=limit, offset=offset,
    )
    return FinanceChequeListResponse(
        data=[FinanceChequeRead(**_read_data(db, row)) for row in rows],
        meta=FinanceListMeta(total=total, limit=limit, offset=offset),
    )


@router.post("", response_model=FinanceChequeResponse, status_code=201)
def create_cheque(
    payload: FinanceChequeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceChequeResponse:
    service = ChequeService(db)
    cheque = service.create(
        company_id=company_id,
        direction=payload.direction,
        party_id=payload.party_id,
        bank_name=payload.bank_name,
        cheque_number=payload.cheque_number,
        cheque_date=payload.cheque_date,
        amount=payload.amount,
        leaf_id=payload.cheque_leaf_id,
        receivable_id=payload.receivable_id,
        payable_id=payload.payable_id,
        notes=payload.notes,
        actor=_actor(user),
    )
    db.commit()
    db.refresh(cheque)
    return FinanceChequeResponse(data=_detail(db, service, cheque))


@router.get("/{cheque_id}", response_model=FinanceChequeResponse)
def get_cheque(
    cheque_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceChequeResponse:
    service = ChequeService(db)
    return FinanceChequeResponse(data=_detail(db, service, service.get(cheque_id, company_id=company_id)))


@router.patch("/{cheque_id}", response_model=FinanceChequeResponse)
def update_cheque(
    cheque_id: str,
    payload: FinanceChequeUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceChequeResponse:
    service = ChequeService(db)
    cheque = service.update_details(
        cheque_id, company_id=company_id, actor=_actor(user), **payload.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(cheque)
    return FinanceChequeResponse(data=_detail(db, service, cheque))


@router.post("/{cheque_id}/actions", response_model=FinanceChequeResponse)
def cheque_action(
    cheque_id: str,
    payload: FinanceChequeActionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceChequeResponse:
    service = ChequeService(db)
    cheque = service.apply_action(
        cheque_id,
        payload.action,
        company_id=company_id,
        action_date=payload.action_date,
        payment_account_id=payload.payment_account_id,
        bank_charge=payload.bank_charge,
        note=payload.note,
        actor=_actor(user),
    )
    db.commit()
    db.refresh(cheque)
    return FinanceChequeResponse(data=_detail(db, service, cheque))
