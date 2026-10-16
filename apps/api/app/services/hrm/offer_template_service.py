from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmOfferTemplate
from app.schemas.hrm.offer_template import (
    OfferTemplateCreate,
    OfferTemplateRead,
    OfferTemplateUpdate,
)


def _dumps(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


def _loads_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [str(x) for x in data] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _to_read(row: HrmOfferTemplate) -> OfferTemplateRead:
    return OfferTemplateRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        template_content=row.template_content,
        variables=_loads_list(row.variables),
        status=row.status,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_offer_templates(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> list[OfferTemplateRead]:
    query = db.query(HrmOfferTemplate).filter(HrmOfferTemplate.company_id == company_id)
    if status:
        query = query.filter(HrmOfferTemplate.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmOfferTemplate.name.ilike(like))
    return [_to_read(r) for r in query.order_by(HrmOfferTemplate.name.asc()).all()]


def get_offer_template(
    db: Session, template_id: str, company_id: Optional[str] = None
) -> OfferTemplateRead:
    row = db.get(HrmOfferTemplate, template_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Offer template not found")
    return _to_read(row)


def create_offer_template(
    db: Session, payload: OfferTemplateCreate, *, created_by: Optional[str]
) -> OfferTemplateRead:
    name = payload.name.strip()
    dup = (
        db.query(HrmOfferTemplate)
        .filter(
            HrmOfferTemplate.company_id == payload.company_id,
            func.lower(HrmOfferTemplate.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Offer template name already exists")
    row = HrmOfferTemplate(
        company_id=payload.company_id,
        name=name,
        template_content=payload.template_content,
        variables=_dumps(payload.variables),
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def update_offer_template(
    db: Session, template_id: str, payload: OfferTemplateUpdate, *, company_id: str
) -> OfferTemplateRead:
    row = db.get(HrmOfferTemplate, template_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Offer template not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmOfferTemplate)
            .filter(
                HrmOfferTemplate.company_id == company_id,
                func.lower(HrmOfferTemplate.name) == name.lower(),
                HrmOfferTemplate.id != template_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Offer template name already exists"
            )
        data["name"] = name
    if "variables" in data:
        data["variables"] = _dumps(data["variables"])
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def delete_offer_template(db: Session, template_id: str, *, company_id: str) -> None:
    row = db.get(HrmOfferTemplate, template_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Offer template not found")
    db.delete(row)
    db.commit()
