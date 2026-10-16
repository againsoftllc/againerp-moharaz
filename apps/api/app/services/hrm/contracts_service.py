from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.hrm.documents import (
    HrmContractRenewal,
    HrmContractTemplate,
    HrmContractType,
    HrmEmployeeContract,
)
from app.schemas.hrm.contracts import (
    ContractRenewalCreate,
    ContractRenewalDecision,
    ContractRenewalUpdate,
    ContractTemplateCreate,
    ContractTemplateUpdate,
    ContractTypeCreate,
    ContractTypeUpdate,
    EmployeeContractCreate,
    EmployeeContractUpdate,
)
from app.services.hrm import employee_service as emp_svc


# --- contract types ---


def list_contract_types(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmContractType).filter(HrmContractType.company_id == company_id)
    if status:
        query = query.filter(HrmContractType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmContractType.name.ilike(like),
                HrmContractType.description.ilike(like),
            )
        )
    return query.order_by(HrmContractType.name.asc()).all()


def get_contract_type(
    db: Session, type_id: str, company_id: Optional[str] = None
) -> HrmContractType:
    row = db.get(HrmContractType, type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Contract type not found")
    return row


def create_contract_type(
    db: Session, payload: ContractTypeCreate, *, created_by: Optional[str]
) -> HrmContractType:
    name = payload.name.strip()
    dup = (
        db.query(HrmContractType)
        .filter(
            HrmContractType.company_id == payload.company_id,
            func.lower(HrmContractType.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Contract type name already exists")
    row = HrmContractType(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        default_duration_months=payload.default_duration_months,
        probation_period_months=payload.probation_period_months,
        notice_period_days=payload.notice_period_days,
        is_renewable=payload.is_renewable,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_contract_type(
    db: Session,
    type_id: str,
    payload: ContractTypeUpdate,
    *,
    company_id: str,
) -> HrmContractType:
    row = get_contract_type(db, type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmContractType)
            .filter(
                HrmContractType.company_id == company_id,
                func.lower(HrmContractType.name) == name.lower(),
                HrmContractType.id != type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Contract type name already exists"
            )
        data["name"] = name
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_contract_type(db: Session, type_id: str, *, company_id: str) -> None:
    row = get_contract_type(db, type_id, company_id=company_id)
    db.delete(row)
    db.commit()


def count_contracts_in_type(db: Session, type_id: str) -> int:
    return (
        db.query(func.count(HrmEmployeeContract.id))
        .filter(HrmEmployeeContract.contract_type_id == type_id)
        .scalar()
        or 0
    )


# --- contract templates ---


def list_contract_templates(
    db: Session,
    *,
    company_id: str,
    contract_type_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmContractTemplate).filter(
        HrmContractTemplate.company_id == company_id
    )
    if contract_type_id:
        query = query.filter(HrmContractTemplate.contract_type_id == contract_type_id)
    if status:
        query = query.filter(HrmContractTemplate.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmContractTemplate.name.ilike(like),
                HrmContractTemplate.description.ilike(like),
            )
        )
    return query.order_by(HrmContractTemplate.name.asc()).all()


def get_contract_template(
    db: Session, template_id: str, company_id: Optional[str] = None
) -> HrmContractTemplate:
    row = db.get(HrmContractTemplate, template_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Contract template not found")
    return row


def create_contract_template(
    db: Session, payload: ContractTemplateCreate, *, created_by: Optional[str]
) -> HrmContractTemplate:
    if payload.contract_type_id:
        get_contract_type(db, payload.contract_type_id, company_id=payload.company_id)
    row = HrmContractTemplate(
        company_id=payload.company_id,
        name=payload.name.strip(),
        description=payload.description,
        contract_type_id=payload.contract_type_id,
        template_content=payload.template_content,
        variables=payload.variables,
        clauses=payload.clauses,
        is_default=payload.is_default,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_contract_template(
    db: Session,
    template_id: str,
    payload: ContractTemplateUpdate,
    *,
    company_id: str,
) -> HrmContractTemplate:
    row = get_contract_template(db, template_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "contract_type_id" in data and data["contract_type_id"]:
        get_contract_type(db, data["contract_type_id"], company_id=company_id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_contract_template(
    db: Session, template_id: str, *, company_id: str
) -> None:
    row = get_contract_template(db, template_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- employee contracts ---


def list_employee_contracts(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    contract_type_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmEmployeeContract).filter(
        HrmEmployeeContract.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmEmployeeContract.employee_id == employee_id)
    if contract_type_id:
        query = query.filter(HrmEmployeeContract.contract_type_id == contract_type_id)
    if status:
        query = query.filter(HrmEmployeeContract.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmEmployeeContract.contract_number.ilike(like),
                HrmEmployeeContract.terms_conditions.ilike(like),
            )
        )
    return query.order_by(HrmEmployeeContract.created_at.desc()).all()


def get_employee_contract(
    db: Session, contract_id: str, company_id: Optional[str] = None
) -> HrmEmployeeContract:
    row = db.get(HrmEmployeeContract, contract_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee contract not found")
    return row


def create_employee_contract(
    db: Session, payload: EmployeeContractCreate, *, created_by: Optional[str]
) -> HrmEmployeeContract:
    if payload.employee_id:
        emp_svc.get_employee(db, payload.employee_id, company_id=payload.company_id)
    if payload.contract_type_id:
        get_contract_type(db, payload.contract_type_id, company_id=payload.company_id)
    row = HrmEmployeeContract(
        company_id=payload.company_id,
        contract_number=payload.contract_number,
        employee_id=payload.employee_id,
        contract_type_id=payload.contract_type_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        basic_salary=payload.basic_salary,
        allowances=payload.allowances,
        benefits=payload.benefits,
        terms_conditions=payload.terms_conditions,
        status="draft",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_employee_contract(
    db: Session,
    contract_id: str,
    payload: EmployeeContractUpdate,
    *,
    company_id: str,
) -> HrmEmployeeContract:
    row = get_employee_contract(db, contract_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "employee_id" in data and data["employee_id"]:
        emp_svc.get_employee(db, data["employee_id"], company_id=company_id)
    if "contract_type_id" in data and data["contract_type_id"]:
        get_contract_type(db, data["contract_type_id"], company_id=company_id)
    if "contract_number" in data and data["contract_number"] is not None:
        data["contract_number"] = data["contract_number"].strip() or None
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def activate_employee_contract(
    db: Session,
    contract_id: str,
    *,
    company_id: str,
    approved_by: Optional[str],
) -> HrmEmployeeContract:
    row = get_employee_contract(db, contract_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(
            status_code=400, detail="Only draft contracts can be activated"
        )
    row.status = "active"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_employee_contract(
    db: Session, contract_id: str, *, company_id: str
) -> None:
    row = get_employee_contract(db, contract_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- contract renewals ---


def list_contract_renewals(
    db: Session,
    *,
    company_id: str,
    contract_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmContractRenewal).filter(
        HrmContractRenewal.company_id == company_id
    )
    if contract_id:
        query = query.filter(HrmContractRenewal.contract_id == contract_id)
    if status:
        query = query.filter(HrmContractRenewal.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmContractRenewal.renewal_number.ilike(like),
                HrmContractRenewal.changes_summary.ilike(like),
                HrmContractRenewal.reason.ilike(like),
            )
        )
    return query.order_by(HrmContractRenewal.created_at.desc()).all()


def get_contract_renewal(
    db: Session, renewal_id: str, company_id: Optional[str] = None
) -> HrmContractRenewal:
    row = db.get(HrmContractRenewal, renewal_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Contract renewal not found")
    return row


def create_contract_renewal(
    db: Session, payload: ContractRenewalCreate, *, created_by: Optional[str]
) -> HrmContractRenewal:
    if payload.contract_id:
        contract = get_employee_contract(
            db, payload.contract_id, company_id=payload.company_id
        )
        current_end = payload.current_end_date or contract.end_date
    else:
        current_end = payload.current_end_date

    row = HrmContractRenewal(
        company_id=payload.company_id,
        contract_id=payload.contract_id,
        renewal_number=payload.renewal_number,
        current_end_date=current_end,
        new_start_date=payload.new_start_date,
        new_end_date=payload.new_end_date,
        new_basic_salary=payload.new_basic_salary,
        new_allowances=payload.new_allowances,
        new_benefits=payload.new_benefits,
        new_terms_conditions=payload.new_terms_conditions,
        changes_summary=payload.changes_summary,
        reason=payload.reason,
        status="pending",
        requested_by=created_by,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_contract_renewal(
    db: Session,
    renewal_id: str,
    payload: ContractRenewalUpdate,
    *,
    company_id: str,
) -> HrmContractRenewal:
    row = get_contract_renewal(db, renewal_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "contract_id" in data and data["contract_id"]:
        get_employee_contract(db, data["contract_id"], company_id=company_id)
    if "status" in data and data["status"] and row.status != "pending":
        if data["status"] in ("approved", "rejected"):
            raise HTTPException(
                status_code=409,
                detail="Only pending renewals can change approval status via update",
            )
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def decide_contract_renewal(
    db: Session,
    renewal_id: str,
    *,
    company_id: str,
    payload: ContractRenewalDecision,
    decided_by: Optional[str],
) -> HrmContractRenewal:
    row = get_contract_renewal(db, renewal_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(
            status_code=409, detail="Only pending renewals can be approved or rejected"
        )
    row.status = payload.decision
    row.approved_by = decided_by
    row.approved_at = datetime.utcnow()
    row.approval_notes = payload.approval_notes
    if payload.decision == "approved" and row.contract_id:
        contract = get_employee_contract(db, row.contract_id, company_id=company_id)
        if row.new_start_date:
            contract.start_date = row.new_start_date
        if row.new_end_date:
            contract.end_date = row.new_end_date
        if row.new_basic_salary is not None:
            contract.basic_salary = row.new_basic_salary
        if row.new_allowances is not None:
            contract.allowances = row.new_allowances
        if row.new_benefits is not None:
            contract.benefits = row.new_benefits
        if row.new_terms_conditions is not None:
            contract.terms_conditions = row.new_terms_conditions
        if contract.status == "expired":
            contract.status = "active"
    db.commit()
    db.refresh(row)
    return row


def delete_contract_renewal(
    db: Session, renewal_id: str, *, company_id: str
) -> None:
    row = get_contract_renewal(db, renewal_id, company_id=company_id)
    db.delete(row)
    db.commit()
