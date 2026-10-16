from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_qa import CatalogProductQa
from app.schemas.catalog_product_qa import (
    ProductQaCreate,
    ProductQaListMeta,
    ProductQaListResponse,
    ProductQaRead,
    ProductQaResponse,
    ProductQaUpdate,
)
from app.services.core.sequence_service import next_number as allocate_number

router = APIRouter(prefix="/qa", tags=["catalog-qa"])

ALLOWED_STATUS = {"pending", "answered", "archived"}


def _to_read(row: CatalogProductQa) -> ProductQaRead:
    return ProductQaRead.model_validate(row)


def _next_question_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "catalog.question",
        initial=lambda: 20001 + db.query(CatalogProductQa).count(),
    )


def _sync_answer_fields(row: CatalogProductQa) -> None:
    answer = (row.answer or "").strip()
    if answer:
        row.answer = answer
        if row.status == "pending":
            row.status = "answered"
        if not row.answered_by:
            row.answered_by = "Admin"
    else:
        row.answer = None
        row.answered_by = None
        if row.status == "answered":
            row.status = "pending"


@router.get("", response_model=ProductQaListResponse)
def list_qa(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> ProductQaListResponse:
    query = db.query(CatalogProductQa).order_by(CatalogProductQa.created_at.desc())

    if status:
        query = query.filter(CatalogProductQa.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            (CatalogProductQa.question_number.ilike(term))
            | (CatalogProductQa.product_name.ilike(term))
            | (CatalogProductQa.customer_name.ilike(term))
            | (CatalogProductQa.question.ilike(term)),
        )

    rows = query.all()
    data = [_to_read(row) for row in rows]
    pending = sum(1 for row in rows if row.status == "pending")
    return ProductQaListResponse(
        data=data,
        meta=ProductQaListMeta(count=len(data), pending_count=pending),
    )


@router.post("", response_model=ProductQaResponse, status_code=201)
def create_qa(
    payload: ProductQaCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductQaResponse:
    product = db.get(CatalogProduct, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    status = payload.status if payload.status in ALLOWED_STATUS else "pending"
    row = CatalogProductQa(
        id=str(uuid.uuid4()),
        question_number=_next_question_number(db),
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku or "",
        product_brand=product.brand,
        product_category=product.category,
        product_image_url=product.thumbnail,
        customer_name=payload.customer_name.strip(),
        question=payload.question.strip(),
        answer=(payload.answer or "").strip() or None,
        answered_by=payload.answered_by,
        status=status,
        is_verified=payload.is_verified,
    )
    _sync_answer_fields(row)
    if row.status not in ALLOWED_STATUS:
        row.status = "pending"
    db.add(row)
    db.commit()
    db.refresh(row)
    return ProductQaResponse(data=_to_read(row))


@router.get("/{qa_id}", response_model=ProductQaResponse)
def get_qa(qa_id: str, db: Session = Depends(get_db)) -> ProductQaResponse:
    row = db.get(CatalogProductQa, qa_id)
    if not row:
        raise HTTPException(status_code=404, detail="Question not found")
    return ProductQaResponse(data=_to_read(row))


@router.patch("/{qa_id}", response_model=ProductQaResponse)
def update_qa(
    qa_id: str,
    payload: ProductQaUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductQaResponse:
    row = db.get(CatalogProductQa, qa_id)
    if not row:
        raise HTTPException(status_code=404, detail="Question not found")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")

    for key, value in updates.items():
        setattr(row, key, value)

    if "answer" in updates or "status" in updates:
        _sync_answer_fields(row)
        if "status" in updates and updates["status"] in ALLOWED_STATUS:
            row.status = updates["status"]

    db.commit()
    db.refresh(row)
    return ProductQaResponse(data=_to_read(row))
