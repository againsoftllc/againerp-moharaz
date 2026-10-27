from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, get_current_user, require_permission
from app.models.auth_user import AuthUser
from app.schemas.ai_billing import (
    AiOverageInvoiceRead,
    AiPackageListResponse,
    AiPackageRead,
    AiPlanOverviewResponse,
    AiPlanOverviewRead,
    SelectPackageRequest,
    SetOnDemandRequest,
)
from app.services.ai import billing_service

router = APIRouter(prefix="/ai/billing", tags=["ai-billing"])


@router.get("/packages", response_model=AiPackageListResponse)
def list_packages(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> AiPackageListResponse:
    billing_service.ensure_packages(db)
    db.commit()
    rows = billing_service.list_packages(db)
    return AiPackageListResponse(data=[AiPackageRead.model_validate(p) for p in rows])


def _overview_read(overview: dict) -> AiPlanOverviewRead:
    sub = overview["subscription"]
    invoice = overview["unpaid_invoice"]
    return AiPlanOverviewRead(
        package=AiPackageRead.model_validate(overview["package"]),
        on_demand_enabled=sub.on_demand_enabled,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        tokens_used=overview["tokens_used"],
        percent_used=overview["percent_used"],
        unpaid_invoice=AiOverageInvoiceRead.model_validate(invoice) if invoice else None,
    )


@router.get("/plan", response_model=AiPlanOverviewResponse)
def get_plan(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> AiPlanOverviewResponse:
    billing_service.ensure_packages(db)
    overview = billing_service.plan_overview(db, company_id)
    db.commit()
    return AiPlanOverviewResponse(data=_overview_read(overview))


@router.post("/plan/package", response_model=AiPlanOverviewResponse)
def change_package(
    payload: SelectPackageRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AiPlanOverviewResponse:
    billing_service.assert_self_service_package_change(db, company_id, payload.package_id)
    billing_service.select_package(db, company_id, payload.package_id)
    overview = billing_service.plan_overview(db, company_id)
    db.commit()
    return AiPlanOverviewResponse(data=_overview_read(overview))


@router.post("/plan/on-demand", response_model=AiPlanOverviewResponse)
def toggle_on_demand(
    payload: SetOnDemandRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
) -> AiPlanOverviewResponse:
    billing_service.set_on_demand(db, company_id, payload.enabled)
    overview = billing_service.plan_overview(db, company_id)
    db.commit()
    return AiPlanOverviewResponse(data=_overview_read(overview))
