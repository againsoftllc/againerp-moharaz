from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance_settlement import FinanceSettlement
from app.schemas.finance_settlement import (
    SettledByRequest,
    SettledByResponse,
    SettlementCreate,
    SettlementDocumentListResponse,
    SettlementListResponse,
    SettlementRead,
    SettlementResponse,
)
from app.services.finance.settlement_service import SettlementService

router = APIRouter(prefix="/finance/settlements", tags=["finance-settlements"])


def _actor(user: AuthUser) -> str:
    return getattr(user, "email", None) or str(user.id)


def _party_name(db: Session, party_type: str, party_id: str) -> Optional[str]:
    model = CommerceCustomer if party_type == "customer" else CommerceSupplier
    row = db.get(model, party_id)
    return row.name if row else None


def _read(db: Session, service: SettlementService, row: FinanceSettlement, *, with_lines: bool = True) -> SettlementRead:
    return SettlementRead(
        id=row.id,
        settlement_number=row.settlement_number,
        party_type=row.party_type,
        party_id=row.party_id,
        party_name=_party_name(db, row.party_type, row.party_id),
        settlement_date=row.settlement_date,
        total=row.total,
        note=row.note,
        created_by=row.created_by,
        created_at=row.created_at,
        lines=service.lines(row) if with_lines else [],
    )


@router.get("", response_model=SettlementListResponse)
def list_settlements(
    party_type: Optional[str] = Query(default=None, pattern="^(customer|supplier)$"),
    party_id: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SettlementListResponse:
    service = SettlementService(db)
    rows = service.list_settlements(company_id=company_id, party_type=party_type, party_id=party_id, limit=limit)
    return SettlementListResponse(data=[_read(db, service, row) for row in rows])


@router.get("/documents", response_model=SettlementDocumentListResponse)
def settlement_documents(
    party_type: str = Query(pattern="^(customer|supplier)$"),
    party_id: str = Query(min_length=1),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SettlementDocumentListResponse:
    """The party's invoices (customer) or bills (supplier) with what is settled, what is due and what settled it."""
    return SettlementDocumentListResponse(data=SettlementService(db).documents(party_type, party_id, company_id=company_id))


@router.post("/settled-by", response_model=SettledByResponse)
def settled_by(
    payload: SettledByRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SettledByResponse:
    """Read-only (POST only because the id list can be long): what settled each receivable / payable."""
    return SettledByResponse(data=SettlementService(db).settled_by_ids(payload.doc_type, payload.ids, company_id=company_id))


@router.get("/{settlement_id}", response_model=SettlementResponse)
def get_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SettlementResponse:
    service = SettlementService(db)
    return SettlementResponse(data=_read(db, service, service.get(settlement_id, company_id=company_id)))


@router.post("", response_model=SettlementResponse, status_code=201)
def create_settlement(
    payload: SettlementCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SettlementResponse:
    service = SettlementService(db)
    row = service.create(
        company_id=company_id,
        party_type=payload.party_type,
        party_id=payload.party_id,
        lines=[(line.document_id, line.amount) for line in payload.lines],
        settlement_date=payload.settlement_date,
        note=payload.note,
        actor=_actor(user),
    )
    db.commit()
    db.refresh(row)
    return SettlementResponse(data=_read(db, service, row))
