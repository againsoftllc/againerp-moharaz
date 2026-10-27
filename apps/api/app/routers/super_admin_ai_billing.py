"""AgainERP staff manage a company's AI plan: record payments received for overage invoices and
switch plans once an upgrade is paid. Companies can't do either themselves (no online payment)."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.super_admin_auth import require_super_admin
from app.models.ai_package import AiOverageInvoice, AiPackage
from app.models.company import Company
from app.schemas.ai_billing import AiOverageInvoiceRead, AiPackageRead, SelectPackageRequest
from app.services.ai import billing_service

router = APIRouter(
    prefix="/super-admin",
    tags=["super-admin-ai-billing"],
    dependencies=[Depends(require_super_admin)],
)


class CompanyAiBillingRead(BaseModel):
    package: Optional[AiPackageRead] = None
    packages: List[AiPackageRead]
    invoices: List[AiOverageInvoiceRead]


class CompanyAiBillingResponse(BaseModel):
    data: CompanyAiBillingRead


def _company(db: Session, company_id: str) -> Company:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return row


def _read(db: Session, company_id: str) -> CompanyAiBillingRead:
    billing_service.ensure_packages(db)
    sub = billing_service.get_or_create_subscription(db, company_id)
    package = db.get(AiPackage, sub.package_id)
    invoices = (
        db.query(AiOverageInvoice)
        .filter(AiOverageInvoice.company_id == company_id)
        .order_by(AiOverageInvoice.created_at.desc())
        .limit(12)
        .all()
    )
    return CompanyAiBillingRead(
        package=AiPackageRead.model_validate(package) if package else None,
        packages=[AiPackageRead.model_validate(p) for p in billing_service.list_packages(db)],
        invoices=[AiOverageInvoiceRead.model_validate(i) for i in invoices],
    )


@router.get("/companies/{company_id}/ai-billing", response_model=CompanyAiBillingResponse)
def get_ai_billing(company_id: str, db: Session = Depends(get_db)) -> CompanyAiBillingResponse:
    _company(db, company_id)
    data = _read(db, company_id)
    db.commit()
    return CompanyAiBillingResponse(data=data)


@router.post("/companies/{company_id}/ai-billing/invoices/{invoice_id}/record-payment", response_model=CompanyAiBillingResponse)
def record_payment(company_id: str, invoice_id: str, db: Session = Depends(get_db)) -> CompanyAiBillingResponse:
    _company(db, company_id)
    billing_service.record_invoice_payment(db, company_id, invoice_id)
    data = _read(db, company_id)
    db.commit()
    return CompanyAiBillingResponse(data=data)


@router.post("/companies/{company_id}/ai-billing/package", response_model=CompanyAiBillingResponse)
def set_package(company_id: str, payload: SelectPackageRequest, db: Session = Depends(get_db)) -> CompanyAiBillingResponse:
    _company(db, company_id)
    billing_service.select_package(db, company_id, payload.package_id)
    data = _read(db, company_id)
    db.commit()
    return CompanyAiBillingResponse(data=data)
