from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.schemas.website_homepage import (
    HomepageContent,
    WebsiteHomepageRead,
    WebsiteHomepageResponse,
    WebsiteHomepageUpdate,
)
from app.services.website_homepage_service import (
    ensure_homepage_category_pins,
    load_homepage_raw,
)
from app.models.website_homepage import dump_json

router = APIRouter(prefix="/homepage", tags=["website-homepage"])


def _to_read(row) -> WebsiteHomepageRead:
    raw = load_homepage_raw(row)
    try:
        content = HomepageContent.model_validate(raw)
    except Exception:
        # Last resort: keep known chrome/body fields, coerce layout types to strings.
        layout = raw.get("layout") if isinstance(raw.get("layout"), list) else []
        safe_layout = []
        for block in layout:
            if not isinstance(block, dict):
                continue
            bid = str(block.get("id") or "").strip()
            btype = str(block.get("type") or "").strip()
            if not bid or not btype:
                continue
            safe_layout.append(
                {
                    "id": bid[:64],
                    "type": btype[:64],
                    "hidden": bool(block.get("hidden")),
                }
            )
        content = HomepageContent.model_validate({**raw, "layout": safe_layout or None})
    return WebsiteHomepageRead(
        id=row.id,
        company_id=row.company_id,
        content=content,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=WebsiteHomepageResponse)
def get_homepage(db: Session = Depends(get_db)) -> WebsiteHomepageResponse:
    row = ensure_homepage_category_pins(db)
    return WebsiteHomepageResponse(data=_to_read(row))


@router.patch("", response_model=WebsiteHomepageResponse)
def update_homepage(
    payload: WebsiteHomepageUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteHomepageResponse:
    row = ensure_homepage_category_pins(db)
    if payload.content is not None:
        row.content_json = dump_json(payload.content.model_dump())
    db.commit()
    db.refresh(row)
    return WebsiteHomepageResponse(data=_to_read(row))
