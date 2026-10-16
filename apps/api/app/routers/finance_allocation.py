from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.finance import FinanceAccount, FinanceCostCenter
from app.schemas.finance import (
    FinanceAllocationPreviewRequest,
    FinanceAllocationPreviewResponse,
    FinanceAllocationRuleCreate,
    FinanceAllocationRuleLineRead,
    FinanceAllocationRuleListResponse,
    FinanceAllocationRuleRead,
    FinanceAllocationRuleResponse,
    FinanceAllocationRuleUpdate,
    FinanceCostCenterCreate,
    FinanceCostCenterListResponse,
    FinanceCostCenterRead,
    FinanceCostCenterResponse,
    FinanceCostCenterUpdate,
    FinanceReportResponse,
)
from app.services.finance.finance_reports import FinanceReportService
from app.services.finance.finance_service import FinanceService

router = APIRouter(prefix="/finance", tags=["finance"])


def _cost_center_read(row: FinanceCostCenter) -> FinanceCostCenterRead:
    return FinanceCostCenterRead.model_validate(row)


def _rule_read(db: Session, service: FinanceService, rule) -> FinanceAllocationRuleRead:
    account = db.get(FinanceAccount, rule.account_id) if rule.account_id else None
    line_rows = service.list_allocation_rule_lines(rule.id)
    lines = []
    for line in line_rows:
        center = db.get(FinanceCostCenter, line.cost_center_id)
        data = FinanceAllocationRuleLineRead.model_validate(line).model_dump()
        data["cost_center_code"] = center.code if center else None
        data["cost_center_name"] = center.name if center else None
        lines.append(FinanceAllocationRuleLineRead(**data))
    payload = FinanceAllocationRuleRead.model_validate(rule).model_dump()
    payload["account_code"] = account.code if account else None
    payload["account_name"] = account.name if account else None
    payload["lines"] = lines
    return FinanceAllocationRuleRead(**payload)


@router.get("/cost-centers", response_model=FinanceCostCenterListResponse)
def list_cost_centers(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    include_inactive: bool = Query(default=False),
) -> FinanceCostCenterListResponse:
    service = FinanceService(db)
    rows = service.list_cost_centers(company_id, include_inactive=include_inactive)
    db.commit()
    return FinanceCostCenterListResponse(data=[_cost_center_read(r) for r in rows])


@router.post("/cost-centers", response_model=FinanceCostCenterResponse, status_code=201)
def create_cost_center(
    payload: FinanceCostCenterCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceCostCenterResponse:
    service = FinanceService(db)
    row = service.create_cost_center(
        company_id=company_id,
        code=payload.code,
        name=payload.name,
        kind=payload.kind,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
    )
    db.commit()
    db.refresh(row)
    return FinanceCostCenterResponse(data=_cost_center_read(row))


@router.patch("/cost-centers/{cost_center_id}", response_model=FinanceCostCenterResponse)
def update_cost_center(
    cost_center_id: str,
    payload: FinanceCostCenterUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceCostCenterResponse:
    service = FinanceService(db)
    row = service.get_cost_center(cost_center_id, company_id=company_id)
    service.update_cost_center(row, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(row)
    return FinanceCostCenterResponse(data=_cost_center_read(row))


@router.get("/cost-centers/{cost_center_id}/accounts", response_model=FinanceReportResponse)
def cost_center_accounts(
    cost_center_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> FinanceReportResponse:
    return FinanceReportResponse(
        **FinanceReportService(db).concern_accounts(
            company_id=company_id,
            cost_center_id=cost_center_id,
            date_from=date_from,
            date_to=date_to,
        )
    )


@router.get("/allocation-rules", response_model=FinanceAllocationRuleListResponse)
def list_allocation_rules(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
    include_inactive: bool = Query(default=False),
) -> FinanceAllocationRuleListResponse:
    service = FinanceService(db)
    rows = service.list_allocation_rules(company_id, include_inactive=include_inactive)
    return FinanceAllocationRuleListResponse(data=[_rule_read(db, service, r) for r in rows])


@router.post("/allocation-rules", response_model=FinanceAllocationRuleResponse, status_code=201)
def create_allocation_rule(
    payload: FinanceAllocationRuleCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "create")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAllocationRuleResponse:
    service = FinanceService(db)
    rule = service.create_allocation_rule(
        company_id=company_id,
        name=payload.name,
        method=payload.method,
        lines=[line.model_dump() for line in payload.lines],
        account_id=payload.account_id,
        unit_label=payload.unit_label,
        is_active=payload.is_active,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(rule)
    return FinanceAllocationRuleResponse(data=_rule_read(db, service, rule))


@router.get("/allocation-rules/{rule_id}", response_model=FinanceAllocationRuleResponse)
def get_allocation_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAllocationRuleResponse:
    service = FinanceService(db)
    rule = service.get_allocation_rule(rule_id, company_id=company_id)
    return FinanceAllocationRuleResponse(data=_rule_read(db, service, rule))


@router.patch("/allocation-rules/{rule_id}", response_model=FinanceAllocationRuleResponse)
def update_allocation_rule(
    rule_id: str,
    payload: FinanceAllocationRuleUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAllocationRuleResponse:
    service = FinanceService(db)
    rule = service.get_allocation_rule(rule_id, company_id=company_id)
    patch = payload.model_dump(exclude_unset=True)
    service.update_allocation_rule(rule, **patch)
    db.commit()
    db.refresh(rule)
    return FinanceAllocationRuleResponse(data=_rule_read(db, service, rule))


@router.delete("/allocation-rules/{rule_id}", status_code=204)
def delete_allocation_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    service = FinanceService(db)
    rule = service.get_allocation_rule(rule_id, company_id=company_id)
    service.delete_allocation_rule(rule)
    db.commit()
    return Response(status_code=204)


@router.post("/allocation-rules/{rule_id}/preview", response_model=FinanceAllocationPreviewResponse)
def preview_allocation_rule(
    rule_id: str,
    payload: FinanceAllocationPreviewRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> FinanceAllocationPreviewResponse:
    service = FinanceService(db)
    rule = service.get_allocation_rule(rule_id, company_id=company_id)
    overrides = None
    if payload.override_lines:
        overrides = [line.model_dump() for line in payload.override_lines]
    data = service.preview_allocation(rule, payload.amount, overrides)
    return FinanceAllocationPreviewResponse(data=data)
