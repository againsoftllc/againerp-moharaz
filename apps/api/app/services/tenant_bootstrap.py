from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.auth_role import AuthRole
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.models.hrm.org import HrmBranch
from app.models.inventory_warehouse import InventoryWarehouse
from app.services.rbac import SYSTEM_MANAGER_SLUG, set_user_roles

logger = logging.getLogger(__name__)


HEAD_OFFICE_NAME = "Head Office"


def assign_owner_role(db: Session, user: AuthUser) -> None:
    role = db.query(AuthRole).filter(AuthRole.slug == SYSTEM_MANAGER_SLUG, AuthRole.is_active.is_(True)).first()
    if role:
        set_user_roles(db, user, [role.id])
        return
    user.role = "admin"


def ensure_head_office_branch(
    db: Session,
    *,
    company_id: str,
    created_by: Optional[str],
) -> HrmBranch:
    existing = (
        db.query(HrmBranch)
        .filter(HrmBranch.company_id == company_id)
        .order_by(HrmBranch.created_at.asc())
        .first()
    )
    if existing:
        return existing
    row = HrmBranch(
        company_id=company_id,
        name=HEAD_OFFICE_NAME,
        status="active",
        created_by=created_by,
    )
    db.add(row)
    db.flush()
    return row


def _join_address(*parts: Optional[str]) -> Optional[str]:
    values = [part.strip() for part in parts if part and part.strip()]
    return ", ".join(values) or None


def ensure_default_warehouse(
    db: Session,
    *,
    company: Company,
    branch: HrmBranch,
) -> InventoryWarehouse:
    existing = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.company_id == company.id)
        .order_by(InventoryWarehouse.sort_order.asc(), InventoryWarehouse.created_at.asc())
        .first()
    )
    if existing:
        if not existing.branch_id:
            existing.branch_id = branch.id
        return existing

    used = {
        row.code.lower()
        for row in db.query(InventoryWarehouse.code).filter(
            InventoryWarehouse.company_id == company.id
        )
    }
    code = "WH"
    if code.lower() in used:
        suffix = company.slug.replace("-", "").upper()[:6] or "01"
        code = f"WH-{suffix}"[:50]
        n = 2
        while code.lower() in used:
            code = f"WH-{suffix}-{n}"[:50]
            n += 1

    row = InventoryWarehouse(
        company_id=company.id,
        branch_id=branch.id,
        code=code,
        name=f"{branch.name} Warehouse",
        type="Main warehouse",
        address=_join_address(company.street, company.street2) or branch.address,
        city=(company.city or branch.city),
        state=(company.state or branch.state),
        zip_code=(company.zip_code or branch.zip_code),
        country=(company.country or branch.country or "Bangladesh"),
        mobile=(company.mobile or company.phone or branch.phone),
        email=(company.email or branch.email),
        is_active=True,
        is_default=True,
        sort_order=0,
    )
    db.add(row)
    db.flush()
    return row


def bootstrap_new_company(db: Session, company: Company, owner: AuthUser) -> None:
    """ERP first-run: owner role, HQ branch, default warehouse, finance books."""
    assign_owner_role(db, owner)
    if not (company.country or "").strip():
        company.country = "Bangladesh"
    if not (company.currency_code or "").strip():
        company.currency_code = "BDT"
    if not (company.language_code or "").strip():
        company.language_code = "en"
    if not (company.timezone or "").strip():
        company.timezone = "Asia/Dhaka"
    if not company.fiscal_year_start_month:
        company.fiscal_year_start_month = 7
    from app.services.company_invoice import apply_invoice_defaults

    apply_invoice_defaults(company)
    hq = ensure_head_office_branch(db, company_id=company.id, created_by=owner.id)
    ensure_default_warehouse(db, company=company, branch=hq)
    try:
        from app.services.finance.finance_service import FinanceService

        finance = FinanceService(db)
        finance.ensure_accounts(company.id)
        finance.ensure_cost_centers(company.id)
    except Exception:
        logger.exception("Finance bootstrap failed for company %s", company.id)
