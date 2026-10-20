from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps.auth import require_write_access, get_current_company_id
from app.models.party import Party
from app.schemas.party import (
    PartyCreate,
    PartyListMeta,
    PartyListResponse,
    PartyRead,
    PartyResponse,
    PartyRoleAssign,
    PartyRoleRead,
    PartyRoleResponse,
    PartyRolesResponse,
    PartyUpdate,
    PartyCommerceLinkRequest,
    PartyCommerceLinksResponse,
)
from app.services.parties.interfaces import PartyCreateInput, PartyUpdateInput
from app.services.parties.party_service import PartyService, PartyValidationError

router = APIRouter(prefix="/parties", tags=["parties"])


def _to_read(record) -> PartyRead:
    return PartyRead(
        id=record.id,
        company_id=record.company_id,
        type=record.type,
        display_name=record.display_name,
        legal_name=record.legal_name,
        status=record.status,
        roles=list(record.roles),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("", response_model=PartyListResponse)
def list_parties(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(default=None),
    party_type: Optional[str] = Query(default=None, alias="type"),
    role: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, description="Match on the display or legal name"),
    company_id: str = Depends(get_current_company_id),
) -> PartyListResponse:
    query = db.query(Party).options(selectinload(Party.roles)).filter(Party.company_id == company_id)
    if status:
        query = query.filter(Party.status == status)
    if party_type:
        query = query.filter(Party.type == party_type)
    if role:
        from app.models.party_role import PartyRole

        query = query.join(PartyRole).filter(PartyRole.role == role)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(or_(Party.display_name.ilike(like), Party.legal_name.ilike(like)))
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(Party.updated_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return PartyListResponse(
        data=[
            PartyRead(
                id=row.id,
                company_id=row.company_id,
                type=row.type,
                display_name=row.display_name,
                legal_name=row.legal_name,
                status=row.status,
                roles=sorted(r.role for r in row.roles),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ],
        meta=PartyListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{party_id}", response_model=PartyResponse)
def get_party(
    party_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> PartyResponse:
    service = PartyService(db)
    row = service.get(party_id, company_id=company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Party not found")
    return PartyResponse(data=_to_read(row))


@router.post("", response_model=PartyResponse, status_code=201)
def create_party(
    payload: PartyCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PartyResponse:
    service = PartyService(db)
    try:
        created = service.create(
            PartyCreateInput(
                display_name=payload.display_name,
                type=payload.type,
                legal_name=payload.legal_name,
                status=payload.status,
                company_id=company_id,
                roles=tuple(payload.roles),
            ),
        )
    except PartyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    row = service.get(created.id)
    if not row:
        raise HTTPException(status_code=500, detail="Party create failed")
    return PartyResponse(data=_to_read(row))


@router.patch("/{party_id}", response_model=PartyResponse)
def update_party(
    party_id: str,
    payload: PartyUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PartyResponse:
    service = PartyService(db)
    try:
        updated = service.update(
            party_id,
            PartyUpdateInput(
                type=payload.type,
                display_name=payload.display_name,
                legal_name=payload.legal_name,
                status=payload.status,
            ),
            company_id=company_id,
        )
    except PartyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Party not found")
    db.commit()
    row = service.get(party_id, company_id=company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Party not found")
    return PartyResponse(data=_to_read(row))


@router.get("/{party_id}/roles", response_model=PartyRolesResponse)
def list_party_roles(
    party_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> PartyRolesResponse:
    service = PartyService(db)
    if not service.get(party_id, company_id=company_id):
        raise HTTPException(status_code=404, detail="Party not found")
    roles = service.list_roles(party_id, company_id=company_id)
    return PartyRolesResponse(
        data=[
            PartyRoleRead(
                id=role.id,
                party_id=role.party_id,
                role=role.role,
                created_at=role.created_at,
            )
            for role in roles
        ],
    )


@router.post("/{party_id}/roles", response_model=PartyRoleResponse, status_code=201)
def assign_party_role(
    party_id: str,
    payload: PartyRoleAssign,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PartyRoleResponse:
    service = PartyService(db)
    try:
        role = service.add_role(party_id, payload.role, company_id=company_id)
    except PartyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    return PartyRoleResponse(
        data=PartyRoleRead(
            id=role.id,
            party_id=role.party_id,
            role=role.role,
            created_at=role.created_at,
        ),
    )


@router.delete("/{party_id}/roles/{role}", status_code=204)
def remove_party_role(
    party_id: str,
    role: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = PartyService(db)
    if not service.get(party_id, company_id=company_id):
        raise HTTPException(status_code=404, detail="Party not found")
    removed = service.remove_role(party_id, role, company_id=company_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Role not assigned")
    db.commit()


@router.get("/{party_id}/commerce-links", response_model=PartyCommerceLinksResponse)
def get_party_commerce_links(
    party_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> PartyCommerceLinksResponse:
    service = PartyService(db)
    if not service.get(party_id, company_id=company_id):
        raise HTTPException(status_code=404, detail="Party not found")
    from app.services.parties.party_commerce_links import links_for_party

    return PartyCommerceLinksResponse(data=links_for_party(db, party_id))


@router.post("/{party_id}/commerce-links", response_model=PartyCommerceLinksResponse)
def enable_party_commerce_role(
    party_id: str,
    payload: PartyCommerceLinkRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> PartyCommerceLinksResponse:
    service = PartyService(db)
    if not service.get(party_id, company_id=company_id):
        raise HTTPException(status_code=404, detail="Party not found")
    from app.services.parties.party_commerce_links import enable_commerce_role

    data = enable_commerce_role(
        db,
        party_id,
        payload.role,
        company_id=company_id,
        existing_id=payload.existing_id,
    )
    db.commit()
    return PartyCommerceLinksResponse(data=data)
