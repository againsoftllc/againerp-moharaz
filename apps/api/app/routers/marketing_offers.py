from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.marketing_offer import MarketingOffer, MarketingOfferSection
from app.schemas.marketing_offer import (
    OfferCreate,
    OfferListMeta,
    OfferListResponse,
    OfferRead,
    OfferResponse,
    OfferSectionInput,
    OfferSectionRead,
    OfferUpdate,
)

router = APIRouter(prefix="/marketing/offers", tags=["marketing-offers"])


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return cleaned.strip("-") or "section"


def _to_read(row: MarketingOffer) -> OfferRead:
    sections = sorted(row.sections or [], key=lambda s: (s.sort_order, s.label))
    return OfferRead(
        id=row.id,
        company_id=row.company_id,
        slug=row.slug,
        title=row.title,
        description=row.description or "",
        image_url=row.image_url,
        outlet_label=row.outlet_label or "All Outlet",
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        status=row.status,
        sort_order=row.sort_order,
        products_limit=int(getattr(row, "products_limit", 12) or 12),
        sections=[
            OfferSectionRead(
                id=s.id,
                key=s.key,
                label=s.label,
                category_slug=s.category_slug,
                sort_order=s.sort_order,
            )
            for s in sections
        ],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _replace_sections(db: Session, offer: MarketingOffer, sections: List[OfferSectionInput]) -> None:
    offer.sections.clear()
    db.flush()
    seen: set[str] = set()
    for index, item in enumerate(sections):
        key = (item.key or _slugify(item.category_slug or item.label)).strip()
        if not key or key in seen:
            key = f"{key or 'section'}-{index + 1}"
        seen.add(key)
        offer.sections.append(
            MarketingOfferSection(
                key=key,
                label=item.label.strip(),
                category_slug=item.category_slug.strip(),
                sort_order=item.sort_order if item.sort_order is not None else index,
            )
        )


@router.get("", response_model=OfferListResponse)
def list_offers(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> OfferListResponse:
    q = db.query(MarketingOffer).options(joinedload(MarketingOffer.sections))
    if status and status != "all":
        q = q.filter(MarketingOffer.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (MarketingOffer.title.ilike(term))
            | (MarketingOffer.slug.ilike(term))
            | (MarketingOffer.description.ilike(term))
        )
    rows = q.order_by(MarketingOffer.sort_order.asc(), MarketingOffer.updated_at.desc()).all()
    return OfferListResponse(
        data=[_to_read(row) for row in rows],
        meta=OfferListMeta(count=len(rows)),
    )


@router.get("/{offer_id}", response_model=OfferResponse)
def get_offer(offer_id: str, db: Session = Depends(get_db)) -> OfferResponse:
    row = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .filter(MarketingOffer.id == offer_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    return OfferResponse(data=_to_read(row))


@router.post("", response_model=OfferResponse, status_code=201)
def create_offer(
    payload: OfferCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> OfferResponse:
    slug = _slugify(payload.slug)
    if db.query(MarketingOffer).filter(MarketingOffer.slug == slug).first():
        raise HTTPException(status_code=400, detail="Offer slug already exists")
    if payload.ends_at < payload.starts_at:
        raise HTTPException(status_code=400, detail="End must be on or after start")

    row = MarketingOffer(
        slug=slug,
        title=payload.title.strip(),
        description=payload.description or "",
        image_url=payload.image_url,
        outlet_label=(payload.outlet_label or "All Outlet").strip(),
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=payload.status,
        sort_order=payload.sort_order,
        products_limit=payload.products_limit,
    )
    db.add(row)
    db.flush()
    _replace_sections(db, row, payload.sections or [])
    db.commit()
    db.refresh(row)
    row = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .filter(MarketingOffer.id == row.id)
        .first()
    )
    return OfferResponse(data=_to_read(row))


@router.patch("/{offer_id}", response_model=OfferResponse)
def update_offer(
    offer_id: str,
    payload: OfferUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> OfferResponse:
    row = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .filter(MarketingOffer.id == offer_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")

    data = payload.model_dump(exclude_unset=True, exclude={"sections"})
    sections_payload = payload.sections if "sections" in payload.model_fields_set else None

    if "slug" in data and data["slug"] is not None:
        slug = _slugify(str(data["slug"]))
        clash = (
            db.query(MarketingOffer)
            .filter(MarketingOffer.slug == slug, MarketingOffer.id != offer_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Offer slug already exists")
        data["slug"] = slug

    starts = data.get("starts_at", row.starts_at)
    ends = data.get("ends_at", row.ends_at)
    if ends < starts:
        raise HTTPException(status_code=400, detail="End must be on or after start")

    for key, value in data.items():
        setattr(row, key, value)

    if sections_payload is not None:
        _replace_sections(db, row, sections_payload)

    db.commit()
    row = (
        db.query(MarketingOffer)
        .options(joinedload(MarketingOffer.sections))
        .filter(MarketingOffer.id == offer_id)
        .first()
    )
    return OfferResponse(data=_to_read(row))


@router.delete("/{offer_id}", status_code=204)
def delete_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(MarketingOffer, offer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    db.delete(row)
    db.commit()
