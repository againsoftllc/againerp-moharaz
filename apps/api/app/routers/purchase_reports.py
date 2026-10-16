from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.purchase.reports import PurchasePriceResponse
from app.services.purchase import purchase_reports

router = APIRouter(prefix="/purchase/reports", tags=["purchase-reports"])


@router.get("/prices", response_model=PurchasePriceResponse)
def purchase_price_report(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    supplier_id: Optional[str] = Query(default=None),
) -> PurchasePriceResponse:
    data, meta = purchase_reports.purchase_price_report(
        db,
        company_id=company_id,
        supplier_id=supplier_id,
    )
    return PurchasePriceResponse(data=data, meta=meta)
