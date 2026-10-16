from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.models.hrm.org import HrmBranch
from app.schemas.workspace_company import (
    WorkspaceCompanyRead,
    WorkspaceCompanyResponse,
    WorkspaceCompanyUpdate,
)
from app.services.company_format import LOCALIZATION_DEFAULTS
from app.services.company_invoice import dump_invoice_layout, dump_packing_layout, dump_payment_layout, dump_purchase_layout, invoice_read_values

router = APIRouter(prefix="/workspace/company", tags=["workspace-company"])

PROFILE_FIELDS = (
    "legal_name",
    "email",
    "phone",
    "mobile",
    "website",
    "logo_url",
    "street",
    "street2",
    "city",
    "state",
    "zip_code",
    "country",
    "tax_id",
    "vat_number",
    "registration_no",
    "currency_code",
    "language_code",
    "timezone",
    "date_format",
    "time_format",
    "number_grouping",
    "bank_name",
    "bank_account",
    "bank_branch",
    "bank_routing",
    "invoice_prefix",
    "invoice_payment_terms",
    "invoice_footer",
    "credit_note_prefix",
)

INT_FIELDS = (
    "invoice_padding",
    "invoice_next_sequence",
    "invoice_due_days",
    "decimal_places",
)

BOOL_FIELDS = (
    "invoice_include_year",
    "invoice_prices_include_tax",
    "tax_enabled",
)




def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _fill_localization(company: Company) -> bool:
    dirty = False
    if not (company.currency_code or "").strip():
        company.currency_code = LOCALIZATION_DEFAULTS["currency_code"]
        dirty = True
    if not (company.language_code or "").strip():
        company.language_code = LOCALIZATION_DEFAULTS["language_code"]
        dirty = True
    if not (company.timezone or "").strip():
        company.timezone = LOCALIZATION_DEFAULTS["timezone"]
        dirty = True
    if not (company.date_format or "").strip():
        company.date_format = LOCALIZATION_DEFAULTS["date_format"]
        dirty = True
    if not (company.time_format or "").strip():
        company.time_format = LOCALIZATION_DEFAULTS["time_format"]
        dirty = True
    if company.decimal_places is None:
        company.decimal_places = LOCALIZATION_DEFAULTS["decimal_places"]
        dirty = True
    if not (company.number_grouping or "").strip():
        company.number_grouping = LOCALIZATION_DEFAULTS["number_grouping"]
        dirty = True
    if company.fiscal_year_start_month is None:
        company.fiscal_year_start_month = LOCALIZATION_DEFAULTS["fiscal_year_start_month"]
        dirty = True
    return dirty


def _read(db: Session, company: Company) -> WorkspaceCompanyRead:
    branch_count = db.query(HrmBranch).filter(HrmBranch.company_id == company.id).count()
    return WorkspaceCompanyRead(
        id=company.id,
        name=company.name,
        slug=company.slug,
        status=company.status,
        branch_count=branch_count,
        legal_name=company.legal_name,
        email=company.email,
        phone=company.phone,
        mobile=company.mobile,
        website=company.website,
        logo_url=company.logo_url,
        street=company.street,
        street2=company.street2,
        city=company.city,
        state=company.state,
        zip_code=company.zip_code,
        country=company.country,
        tax_id=company.tax_id,
        vat_number=company.vat_number,
        registration_no=company.registration_no,
        currency_code=company.currency_code,
        language_code=company.language_code,
        timezone=company.timezone,
        date_format=company.date_format,
        time_format=company.time_format,
        decimal_places=company.decimal_places,
        number_grouping=company.number_grouping,
        fiscal_year_start_month=company.fiscal_year_start_month,
        bank_name=company.bank_name,
        bank_account=company.bank_account,
        bank_branch=company.bank_branch,
        bank_routing=company.bank_routing,
        **invoice_read_values(company),
    )


@router.get("", response_model=WorkspaceCompanyResponse)
def get_workspace_company(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "read")),
    company_id: str = Depends(get_current_company_id),
) -> WorkspaceCompanyResponse:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if _fill_localization(company):
        db.add(company)
        db.commit()
        db.refresh(company)
    return WorkspaceCompanyResponse(data=_read(db, company))


@router.patch("", response_model=WorkspaceCompanyResponse)
def update_workspace_company(
    payload: WorkspaceCompanyUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
) -> WorkspaceCompanyResponse:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        company.name = data["name"].strip()
    if "fiscal_year_start_month" in data:
        company.fiscal_year_start_month = data["fiscal_year_start_month"]
    if "invoice_tax_rate" in data:
        company.invoice_tax_rate = data["invoice_tax_rate"]
    if "invoice_layout" in data and data["invoice_layout"] is not None:
        company.invoice_layout = dump_invoice_layout(data["invoice_layout"])
    if "packing_layout" in data and data["packing_layout"] is not None:
        company.packing_layout = dump_packing_layout(data["packing_layout"])
    if "purchase_layout" in data and data["purchase_layout"] is not None:
        company.purchase_layout = dump_purchase_layout(data["purchase_layout"])
    if "payment_layout" in data and data["payment_layout"] is not None:
        company.payment_layout = dump_payment_layout(data["payment_layout"])
    for key in INT_FIELDS:
        if key in data:
            setattr(company, key, data[key])
    for key in BOOL_FIELDS:
        if key in data:
            setattr(company, key, data[key])
    for key in PROFILE_FIELDS:
        if key not in data:
            continue
        setattr(company, key, _clean(data[key]))
    _fill_localization(company)
    db.commit()
    db.refresh(company)
    return WorkspaceCompanyResponse(data=_read(db, company))
