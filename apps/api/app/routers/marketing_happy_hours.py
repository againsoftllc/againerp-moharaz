from __future__ import annotations

import json
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.marketing_happy_hour import (
    MarketingHappyHour,
    MarketingHappyHourDeal,
    MarketingHappyHourSection,
)
from app.schemas.marketing_happy_hour import (
    HappyHourCreate,
    HappyHourDealRead,
    HappyHourListMeta,
    HappyHourListResponse,
    HappyHourRead,
    HappyHourResponse,
    HappyHourSectionInput,
    HappyHourSectionRead,
    HappyHourUpdate,
)

router = APIRouter(prefix="/marketing/happy-hours", tags=["marketing-happy-hours"])


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return cleaned.strip("-") or "section"


def _terms_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except Exception:
        pass
    return []


def _to_read(row: MarketingHappyHour) -> HappyHourRead:
    sections = sorted(row.sections or [], key=lambda s: (s.sort_order, s.label))
    return HappyHourRead(
        id=row.id,
        company_id=row.company_id,
        slug=row.slug,
        title=row.title,
        subtitle=row.subtitle,
        description=row.description or "",
        outlet_label=row.outlet_label or "Online Only",
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        daily_start_hour=int(row.daily_start_hour or 22),
        daily_end_hour=int(row.daily_end_hour or 24),
        status=row.status,
        terms=_terms_list(row.terms_json),
        sort_order=row.sort_order,
        sections=[
            HappyHourSectionRead(
                id=s.id,
                key=s.key,
                label=s.label,
                sort_order=s.sort_order,
                deals=[
                    HappyHourDealRead(
                        id=d.id,
                        product_slug=d.product_slug,
                        offer_price=float(d.offer_price),
                        note=d.note,
                        sort_order=d.sort_order,
                    )
                    for d in sorted(s.deals or [], key=lambda x: (x.sort_order, x.product_slug))
                ],
            )
            for s in sections
        ],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _replace_sections(db: Session, campaign: MarketingHappyHour, sections: List[HappyHourSectionInput]) -> None:
    campaign.sections.clear()
    db.flush()
    seen: set[str] = set()
    for index, item in enumerate(sections):
        key = (item.key or _slugify(item.label)).strip()
        if not key or key in seen:
            key = f"{key or 'section'}-{index + 1}"
        seen.add(key)
        section = MarketingHappyHourSection(
            key=key,
            label=item.label.strip(),
            sort_order=item.sort_order if item.sort_order is not None else index,
        )
        for d_index, deal in enumerate(item.deals or []):
            slug = deal.product_slug.strip()
            if not slug or deal.offer_price <= 0:
                continue
            section.deals.append(
                MarketingHappyHourDeal(
                    product_slug=slug,
                    offer_price=float(deal.offer_price),
                    note=(deal.note or "").strip() or None,
                    sort_order=deal.sort_order if deal.sort_order is not None else d_index,
                )
            )
        campaign.sections.append(section)


def _load(db: Session, campaign_id: str) -> MarketingHappyHour | None:
    return (
        db.query(MarketingHappyHour)
        .options(
            joinedload(MarketingHappyHour.sections).joinedload(MarketingHappyHourSection.deals)
        )
        .filter(MarketingHappyHour.id == campaign_id)
        .first()
    )


@router.get("", response_model=HappyHourListResponse)
def list_happy_hours(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> HappyHourListResponse:
    q = db.query(MarketingHappyHour).options(
        joinedload(MarketingHappyHour.sections).joinedload(MarketingHappyHourSection.deals)
    )
    if status and status != "all":
        q = q.filter(MarketingHappyHour.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (MarketingHappyHour.title.ilike(term))
            | (MarketingHappyHour.slug.ilike(term))
            | (MarketingHappyHour.description.ilike(term))
        )
    rows = q.order_by(MarketingHappyHour.sort_order.asc(), MarketingHappyHour.updated_at.desc()).all()
    return HappyHourListResponse(
        data=[_to_read(row) for row in rows],
        meta=HappyHourListMeta(count=len(rows)),
    )


@router.get("/{campaign_id}", response_model=HappyHourResponse)
def get_happy_hour(campaign_id: str, db: Session = Depends(get_db)) -> HappyHourResponse:
    row = _load(db, campaign_id)
    if not row:
        raise HTTPException(status_code=404, detail="Happy Hour not found")
    return HappyHourResponse(data=_to_read(row))


@router.post("", response_model=HappyHourResponse, status_code=201)
def create_happy_hour(
    payload: HappyHourCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> HappyHourResponse:
    slug = payload.slug.strip().strip("/")
    if db.query(MarketingHappyHour).filter(MarketingHappyHour.slug == slug).first():
        raise HTTPException(status_code=400, detail="Slug already exists")
    if payload.ends_at < payload.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    row = MarketingHappyHour(
        slug=slug,
        title=payload.title.strip(),
        subtitle=(payload.subtitle or "").strip() or None,
        description=payload.description or "",
        outlet_label=payload.outlet_label.strip() or "Online Only",
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        daily_start_hour=payload.daily_start_hour,
        daily_end_hour=payload.daily_end_hour,
        status=payload.status,
        terms_json=json.dumps([t.strip() for t in payload.terms if t.strip()], ensure_ascii=False),
        sort_order=payload.sort_order,
    )
    db.add(row)
    db.flush()
    _replace_sections(db, row, payload.sections)
    db.commit()
    loaded = _load(db, row.id)
    assert loaded
    return HappyHourResponse(data=_to_read(loaded))


@router.patch("/{campaign_id}", response_model=HappyHourResponse)
def update_happy_hour(
    campaign_id: str,
    payload: HappyHourUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> HappyHourResponse:
    row = _load(db, campaign_id)
    if not row:
        raise HTTPException(status_code=404, detail="Happy Hour not found")
    data = payload.model_dump(exclude_unset=True)
    sections = data.pop("sections", None)
    terms = data.pop("terms", None)
    if "slug" in data and data["slug"] is not None:
        slug = str(data["slug"]).strip().strip("/")
        clash = (
            db.query(MarketingHappyHour)
            .filter(MarketingHappyHour.slug == slug, MarketingHappyHour.id != campaign_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Slug already exists")
        data["slug"] = slug
    if "title" in data and data["title"] is not None:
        data["title"] = str(data["title"]).strip()
    if "subtitle" in data:
        sub = (data["subtitle"] or "").strip() if data["subtitle"] is not None else None
        data["subtitle"] = sub or None
    if "outlet_label" in data and data["outlet_label"] is not None:
        data["outlet_label"] = str(data["outlet_label"]).strip() or "Online Only"
    for key, value in data.items():
        setattr(row, key, value)
    if terms is not None:
        row.terms_json = json.dumps([str(t).strip() for t in terms if str(t).strip()], ensure_ascii=False)
    starts = row.starts_at
    ends = row.ends_at
    if ends < starts:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    if sections is not None:
        parsed = [HappyHourSectionInput.model_validate(s) for s in sections]
        _replace_sections(db, row, parsed)
    db.commit()
    loaded = _load(db, campaign_id)
    assert loaded
    return HappyHourResponse(data=_to_read(loaded))


@router.delete("/{campaign_id}", status_code=204)
def delete_happy_hour(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.query(MarketingHappyHour).filter(MarketingHappyHour.id == campaign_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Happy Hour not found")
    db.delete(row)
    db.commit()
