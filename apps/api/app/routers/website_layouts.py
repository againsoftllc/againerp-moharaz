from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_layout import WebsiteLayout
from app.schemas.website_layout import (
    WebsiteLayoutCreate,
    WebsiteLayoutListMeta,
    WebsiteLayoutListResponse,
    WebsiteLayoutRead,
    WebsiteLayoutResponse,
    WebsiteLayoutUpdate,
)

router = APIRouter(prefix="/layouts", tags=["website-layouts"])


def _to_read(row: WebsiteLayout) -> WebsiteLayoutRead:
    return WebsiteLayoutRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        description=row.description or "",
        header_style=row.header_style,  # type: ignore[arg-type]
        footer_style=row.footer_style,  # type: ignore[arg-type]
        sidebar_position=row.sidebar_position,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        is_default=row.is_default,
        pages_count=row.pages_count,
        thumbnail=row.thumbnail,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=WebsiteLayoutListResponse)
def list_layouts(db: Session = Depends(get_db)) -> WebsiteLayoutListResponse:
    rows = db.query(WebsiteLayout).order_by(WebsiteLayout.created_at.asc()).all()
    data = [_to_read(row) for row in rows]
    return WebsiteLayoutListResponse(data=data, meta=WebsiteLayoutListMeta(count=len(data)))


@router.get("/{layout_id}", response_model=WebsiteLayoutResponse)
def get_layout(layout_id: str, db: Session = Depends(get_db)) -> WebsiteLayoutResponse:
    row = db.get(WebsiteLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout not found")
    return WebsiteLayoutResponse(data=_to_read(row))


@router.post("", response_model=WebsiteLayoutResponse, status_code=201)
def create_layout(
    payload: WebsiteLayoutCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteLayoutResponse:
    row = WebsiteLayout(
        id=str(uuid.uuid4()),
        company_id="default",
        name=payload.name.strip(),
        description=payload.description,
        header_style=payload.header_style,
        footer_style=payload.footer_style,
        sidebar_position=payload.sidebar_position,
        status=payload.status,
        is_default=False,
        pages_count=0,
        thumbnail=payload.thumbnail,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WebsiteLayoutResponse(data=_to_read(row))


@router.patch("/{layout_id}", response_model=WebsiteLayoutResponse)
def update_layout(
    layout_id: str,
    payload: WebsiteLayoutUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteLayoutResponse:
    row = db.get(WebsiteLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default") is True:
        db.query(WebsiteLayout).filter(WebsiteLayout.id != row.id).update({"is_default": False})

    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return WebsiteLayoutResponse(data=_to_read(row))


@router.delete("/{layout_id}", status_code=204)
def delete_layout(
    layout_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(WebsiteLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout not found")
    if row.is_default:
        raise HTTPException(status_code=400, detail="Default layout cannot be deleted")
    db.delete(row)
    db.commit()
