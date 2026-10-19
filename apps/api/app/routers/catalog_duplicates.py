from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.catalog_duplicates import MAX_IDS, scan_and_save, set_verified

router = APIRouter(prefix="/catalog/product-duplicates", tags=["catalog-duplicates"])


class DuplicateCheckRequest(BaseModel):
    product_ids: List[str] = Field(default_factory=list, max_length=MAX_IDS)
    refresh: bool = False  # scan again even when a saved result exists


class DuplicateVerifyRequest(BaseModel):
    product_id: str
    verified: bool = True


@router.post("")
def check_duplicates(
    payload: DuplicateCheckRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """For each product id: the saved duplicate scan (level confirmed / possible / unique + the matching products + who verified it);
    products not scanned yet (or changed since, or `refresh`) are scanned and saved first."""
    return {"data": scan_and_save(db, company_id, payload.product_ids, payload.refresh)}


@router.post("/verify")
def verify_duplicate(
    payload: DuplicateVerifyRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("catalog", "write")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """A person checked the matches (verified = true -> blue dot) or takes that back (verified = false)."""
    result = set_verified(db, company_id, payload.product_id, payload.verified, user.id, user.name)
    if result is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"data": result}
