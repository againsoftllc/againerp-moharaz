from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.contracts import (
    ContractRenewalCreate,
    ContractRenewalDecision,
    ContractRenewalListResponse,
    ContractRenewalRead,
    ContractRenewalResponse,
    ContractRenewalUpdate,
    ContractTemplateCreate,
    ContractTemplateListResponse,
    ContractTemplateRead,
    ContractTemplateResponse,
    ContractTemplateUpdate,
    ContractTypeCreate,
    ContractTypeListResponse,
    ContractTypeRead,
    ContractTypeResponse,
    ContractTypeUpdate,
    EmployeeContractCreate,
    EmployeeContractListResponse,
    EmployeeContractRead,
    EmployeeContractResponse,
    EmployeeContractUpdate,
)
from app.services.hrm import contracts_service as svc

contract_types_router = APIRouter(
    prefix="/contract-types", tags=["hrm-contract-types"]
)
contract_templates_router = APIRouter(
    prefix="/contract-templates", tags=["hrm-contract-templates"]
)
employee_contracts_router = APIRouter(
    prefix="/employee-contracts", tags=["hrm-employee-contracts"]
)
contract_renewals_router = APIRouter(
    prefix="/contract-renewals", tags=["hrm-contract-renewals"]
)


# --- contract types ---


@contract_types_router.get("", response_model=ContractTypeListResponse)
def list_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_contract_types(db, company_id=company_id, status=status, q=q)
    data = [ContractTypeRead.model_validate(r) for r in rows]
    return ContractTypeListResponse(data=data, meta={"count": len(data)})


@contract_types_router.post("", response_model=ContractTypeResponse, status_code=201)
def create_type(
    payload: ContractTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_contract_type(db, payload, created_by=user.id)
    return ContractTypeResponse(data=ContractTypeRead.model_validate(row))


@contract_types_router.patch("/{type_id}", response_model=ContractTypeResponse)
def update_type(
    type_id: str,
    payload: ContractTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_contract_type(db, type_id, payload, company_id=company_id)
    return ContractTypeResponse(data=ContractTypeRead.model_validate(row))


@contract_types_router.delete("/{type_id}", status_code=204)
def delete_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_contract_type(db, type_id, company_id=company_id)
    return Response(status_code=204)


# --- contract templates ---


@contract_templates_router.get("", response_model=ContractTemplateListResponse)
def list_templates(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    contract_type_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_contract_templates(
        db,
        company_id=company_id,
        contract_type_id=contract_type_id,
        status=status,
        q=q,
    )
    data = [ContractTemplateRead.model_validate(r) for r in rows]
    return ContractTemplateListResponse(data=data, meta={"count": len(data)})


@contract_templates_router.post(
    "", response_model=ContractTemplateResponse, status_code=201
)
def create_template(
    payload: ContractTemplateCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_contract_template(db, payload, created_by=user.id)
    return ContractTemplateResponse(data=ContractTemplateRead.model_validate(row))


@contract_templates_router.patch(
    "/{template_id}", response_model=ContractTemplateResponse
)
def update_template(
    template_id: str,
    payload: ContractTemplateUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_contract_template(
        db, template_id, payload, company_id=company_id
    )
    return ContractTemplateResponse(data=ContractTemplateRead.model_validate(row))


@contract_templates_router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_contract_template(db, template_id, company_id=company_id)
    return Response(status_code=204)


# --- employee contracts ---


@employee_contracts_router.get("", response_model=EmployeeContractListResponse)
def list_employee_contracts(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    contract_type_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|active|expired|terminated)$"
    ),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_employee_contracts(
        db,
        company_id=company_id,
        employee_id=employee_id,
        contract_type_id=contract_type_id,
        status=status,
        q=q,
    )
    data = [EmployeeContractRead.model_validate(r) for r in rows]
    return EmployeeContractListResponse(data=data, meta={"count": len(data)})


@employee_contracts_router.post(
    "", response_model=EmployeeContractResponse, status_code=201
)
def create_employee_contract(
    payload: EmployeeContractCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_employee_contract(db, payload, created_by=user.id)
    return EmployeeContractResponse(data=EmployeeContractRead.model_validate(row))


@employee_contracts_router.patch(
    "/{contract_id}", response_model=EmployeeContractResponse
)
def update_employee_contract(
    contract_id: str,
    payload: EmployeeContractUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_employee_contract(
        db, contract_id, payload, company_id=company_id
    )
    return EmployeeContractResponse(data=EmployeeContractRead.model_validate(row))


@employee_contracts_router.post(
    "/{contract_id}/activate", response_model=EmployeeContractResponse
)
def activate_employee_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.activate_employee_contract(
        db, contract_id, company_id=company_id, approved_by=user.id
    )
    return EmployeeContractResponse(data=EmployeeContractRead.model_validate(row))


@employee_contracts_router.delete("/{contract_id}", status_code=204)
def delete_employee_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_employee_contract(db, contract_id, company_id=company_id)
    return Response(status_code=204)


# --- contract renewals ---


@contract_renewals_router.get("", response_model=ContractRenewalListResponse)
def list_contract_renewals(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    contract_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|approved|rejected)$"
    ),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_contract_renewals(
        db,
        company_id=company_id,
        contract_id=contract_id,
        status=status,
        q=q,
    )
    data = [ContractRenewalRead.model_validate(r) for r in rows]
    return ContractRenewalListResponse(data=data, meta={"count": len(data)})


@contract_renewals_router.post(
    "", response_model=ContractRenewalResponse, status_code=201
)
def create_contract_renewal(
    payload: ContractRenewalCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_contract_renewal(db, payload, created_by=user.id)
    return ContractRenewalResponse(data=ContractRenewalRead.model_validate(row))


@contract_renewals_router.patch(
    "/{renewal_id}", response_model=ContractRenewalResponse
)
def update_contract_renewal(
    renewal_id: str,
    payload: ContractRenewalUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_contract_renewal(
        db, renewal_id, payload, company_id=company_id
    )
    return ContractRenewalResponse(data=ContractRenewalRead.model_validate(row))


@contract_renewals_router.post(
    "/{renewal_id}/approve", response_model=ContractRenewalResponse
)
def approve_contract_renewal(
    renewal_id: str,
    payload: ContractRenewalDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.decide_contract_renewal(
        db,
        renewal_id,
        company_id=company_id,
        payload=payload,
        decided_by=user.id,
    )
    return ContractRenewalResponse(data=ContractRenewalRead.model_validate(row))


@contract_renewals_router.delete("/{renewal_id}", status_code=204)
def delete_contract_renewal(
    renewal_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_contract_renewal(db, renewal_id, company_id=company_id)
    return Response(status_code=204)
