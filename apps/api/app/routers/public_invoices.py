from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.sales.public_invoice import public_invoice_by_key

router = APIRouter(prefix="/public/invoices", tags=["public-invoices"])


@router.get("/{key}")
def get_public_invoice(key: str, db: Session = Depends(get_db)) -> dict:
    return {"data": public_invoice_by_key(db, key)}
