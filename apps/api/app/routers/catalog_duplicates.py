from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.catalog_duplicates import MAX_IDS, find_duplicates

router = APIRouter(prefix="/catalog/product-duplicates", tags=["catalog-duplicates"])


class DuplicateCheckRequest(BaseModel):
    product_ids: List[str] = Field(default_factory=list, max_length=MAX_IDS)


@router.post("")
def check_duplicates(
    payload: DuplicateCheckRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """For each product id: is another product of the company the same? level confirmed / possible / unique + the matching products."""
    return {"data": find_duplicates(db, company_id, payload.product_ids)}
