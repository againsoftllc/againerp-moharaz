from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Type, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.lifecycle import (
    HrmComplaint,
    HrmEmployeeTransfer,
    HrmPromotion,
    HrmResignation,
    HrmTermination,
    HrmTrip,
    HrmTripExpense,
    HrmWarning,
)
from app.models.hrm.org import (
    HrmBranch,
    HrmDepartment,
    HrmDesignation,
    HrmEmployee,
)
from app.schemas.hrm.lifecycle import (
    ComplaintCreate,
    ComplaintUpdate,
    PromotionCreate,
    PromotionUpdate,
    ResignationCreate,
    ResignationUpdate,
    TerminationCreate,
    TerminationUpdate,
    TransferCreate,
    TransferUpdate,
    TripCreate,
    TripExpenseCreate,
    TripExpenseUpdate,
    TripUpdate,
    WarningCreate,
    WarningUpdate,
)

T = TypeVar("T")
ZERO = Decimal("0")


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _get(db: Session, model: Type[T], row_id: str, company_id: Optional[str], label: str) -> T:
    row = db.get(model, row_id)
    if not row or (company_id and getattr(row, "company_id", None) != company_id):
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _list(
    db: Session,
    model,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(model).filter(model.company_id == company_id)
    if employee_id and hasattr(model, "employee_id"):
        query = query.filter(model.employee_id == employee_id)
    if status and hasattr(model, "status"):
        query = query.filter(model.status == status)
    return query.order_by(model.created_at.desc()).all()


# --- resignations ---


def list_resignations(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmResignation, company_id=company_id, employee_id=employee_id, status=status)


def get_resignation(db, row_id, company_id=None):
    return _get(db, HrmResignation, row_id, company_id, "Resignation")


def create_resignation(db, payload: ResignationCreate, *, created_by):
    _require_employee(db, payload.employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "pending"
    data["created_by"] = created_by
    data["resignation_date"] = payload.resignation_date or date.today()
    row = HrmResignation(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_resignation(db, row_id, payload: ResignationUpdate, *, company_id):
    row = get_resignation(db, row_id, company_id=company_id)
    if row.status not in ("pending",):
        raise HTTPException(status_code=409, detail="Only pending resignations can be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def approve_resignation(db, row_id, *, company_id, approved_by):
    row = get_resignation(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending resignations can be approved")
    row.status = "approved"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    if row.employee_id:
        emp = db.get(HrmEmployee, row.employee_id)
        if emp:
            emp.employee_status = "resigned"
    db.commit()
    db.refresh(row)
    return row


def reject_resignation(db, row_id, *, company_id, approved_by):
    row = get_resignation(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending resignations can be rejected")
    row.status = "rejected"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_resignation(db, row_id, *, company_id):
    row = get_resignation(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending resignations can be deleted")
    db.delete(row)
    db.commit()


# --- promotions ---


def list_promotions(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmPromotion, company_id=company_id, employee_id=employee_id, status=status)


def get_promotion(db, row_id, company_id=None):
    return _get(db, HrmPromotion, row_id, company_id, "Promotion")


def create_promotion(db, payload: PromotionCreate, *, created_by):
    emp = _require_employee(db, payload.employee_id, payload.company_id)
    des = db.get(HrmDesignation, payload.designation_id)
    if not des or des.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid designation_id")
    prev = payload.previous_designation
    if not prev and emp.designation_id:
        cur = db.get(HrmDesignation, emp.designation_id)
        prev = (cur.name if cur else None)
        if prev:
            prev = prev[:50]
    data = payload.model_dump()
    data["previous_designation"] = prev
    data["status"] = "pending"
    data["created_by"] = created_by
    data["promotion_date"] = payload.promotion_date or date.today()
    row = HrmPromotion(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_promotion(db, row_id, payload: PromotionUpdate, *, company_id):
    row = get_promotion(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending promotions can be edited")
    data = payload.model_dump(exclude_unset=True)
    if "designation_id" in data and data["designation_id"]:
        des = db.get(HrmDesignation, data["designation_id"])
        if not des or des.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid designation_id")
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def approve_promotion(db, row_id, *, company_id):
    row = get_promotion(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending promotions can be approved")
    row.status = "approved"
    if row.employee_id and row.designation_id:
        emp = db.get(HrmEmployee, row.employee_id)
        if emp:
            emp.designation_id = row.designation_id
            if row.salary_adjustment is not None:
                emp.base_salary = row.salary_adjustment
    db.commit()
    db.refresh(row)
    return row


def reject_promotion(db, row_id, *, company_id):
    row = get_promotion(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending promotions can be rejected")
    row.status = "rejected"
    db.commit()
    db.refresh(row)
    return row


def delete_promotion(db, row_id, *, company_id):
    row = get_promotion(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending promotions can be deleted")
    db.delete(row)
    db.commit()


# --- terminations ---


def list_terminations(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmTermination, company_id=company_id, employee_id=employee_id, status=status)


def get_termination(db, row_id, company_id=None):
    return _get(db, HrmTermination, row_id, company_id, "Termination")


def create_termination(db, payload: TerminationCreate, *, created_by):
    _require_employee(db, payload.employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "pending"
    data["created_by"] = created_by
    data["termination_date"] = payload.termination_date or date.today()
    row = HrmTermination(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_termination(db, row_id, payload: TerminationUpdate, *, company_id):
    row = get_termination(db, row_id, company_id=company_id)
    if row.status not in ("pending",):
        raise HTTPException(status_code=409, detail="Only pending terminations can be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def approve_termination(db, row_id, *, company_id, approved_by):
    row = get_termination(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending terminations can be approved")
    row.status = "approved"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    if row.employee_id:
        emp = db.get(HrmEmployee, row.employee_id)
        if emp:
            emp.employee_status = "terminated"
    db.commit()
    db.refresh(row)
    return row


def reject_termination(db, row_id, *, company_id, approved_by):
    row = get_termination(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending terminations can be rejected")
    row.status = "rejected"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_termination(db, row_id, *, company_id):
    row = get_termination(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending terminations can be deleted")
    db.delete(row)
    db.commit()


# --- warnings ---


def list_warnings(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmWarning, company_id=company_id, employee_id=employee_id, status=status)


def get_warning(db, row_id, company_id=None):
    return _get(db, HrmWarning, row_id, company_id, "Warning")


def create_warning(db, payload: WarningCreate, *, created_by):
    _require_employee(db, payload.employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "draft"
    data["warning_by"] = created_by
    data["created_by"] = created_by
    data["warning_date"] = payload.warning_date or date.today()
    row = HrmWarning(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_warning(db, row_id, payload: WarningUpdate, *, company_id):
    row = get_warning(db, row_id, company_id=company_id)
    if row.status not in ("draft", "issued"):
        raise HTTPException(status_code=409, detail="Warning cannot be edited in this status")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def issue_warning(db, row_id, *, company_id, approved_by):
    row = get_warning(db, row_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft warnings can be issued")
    row.status = "issued"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def acknowledge_warning(db, row_id, *, company_id):
    row = get_warning(db, row_id, company_id=company_id)
    if row.status != "issued":
        raise HTTPException(status_code=409, detail="Only issued warnings can be acknowledged")
    row.status = "acknowledged"
    row.acknowledgment_date = date.today()
    db.commit()
    db.refresh(row)
    return row


def delete_warning(db, row_id, *, company_id):
    row = get_warning(db, row_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft warnings can be deleted")
    db.delete(row)
    db.commit()


# --- complaints ---


def list_complaints(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmComplaint, company_id=company_id, employee_id=employee_id, status=status)


def get_complaint(db, row_id, company_id=None):
    return _get(db, HrmComplaint, row_id, company_id, "Complaint")


def create_complaint(db, payload: ComplaintCreate, *, created_by):
    if payload.employee_id:
        _require_employee(db, payload.employee_id, payload.company_id)
    if payload.against_employee_id:
        _require_employee(db, payload.against_employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "open"
    data["created_by"] = created_by
    data["complaint_date"] = payload.complaint_date or date.today()
    row = HrmComplaint(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_complaint(db, row_id, payload: ComplaintUpdate, *, company_id):
    row = get_complaint(db, row_id, company_id=company_id)
    if row.status == "closed":
        raise HTTPException(status_code=409, detail="Closed complaints cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if data.get("against_employee_id"):
        _require_employee(db, data["against_employee_id"], company_id)
    if data.get("status") == "resolved" and not row.resolution_date:
        row.resolution_date = date.today()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def resolve_complaint(db, row_id, *, company_id):
    row = get_complaint(db, row_id, company_id=company_id)
    if row.status not in ("open", "investigating"):
        raise HTTPException(status_code=409, detail="Complaint cannot be resolved from this status")
    row.status = "resolved"
    row.resolution_date = date.today()
    db.commit()
    db.refresh(row)
    return row


def close_complaint(db, row_id, *, company_id):
    row = get_complaint(db, row_id, company_id=company_id)
    row.status = "closed"
    db.commit()
    db.refresh(row)
    return row


def delete_complaint(db, row_id, *, company_id):
    row = get_complaint(db, row_id, company_id=company_id)
    if row.status not in ("open",):
        raise HTTPException(status_code=409, detail="Only open complaints can be deleted")
    db.delete(row)
    db.commit()


# --- transfers ---


def list_transfers(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmEmployeeTransfer, company_id=company_id, employee_id=employee_id, status=status)


def get_transfer(db, row_id, company_id=None):
    return _get(db, HrmEmployeeTransfer, row_id, company_id, "Transfer")


def _validate_org_fk(db, company_id, branch_id=None, department_id=None, designation_id=None):
    if branch_id:
        row = db.get(HrmBranch, branch_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid to_branch_id")
    if department_id:
        row = db.get(HrmDepartment, department_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid to_department_id")
    if designation_id:
        row = db.get(HrmDesignation, designation_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid to_designation_id")


def create_transfer(db, payload: TransferCreate, *, created_by):
    emp = _require_employee(db, payload.employee_id, payload.company_id)
    _validate_org_fk(
        db,
        payload.company_id,
        branch_id=payload.to_branch_id,
        department_id=payload.to_department_id,
        designation_id=payload.to_designation_id,
    )
    row = HrmEmployeeTransfer(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        from_branch_id=emp.branch_id,
        to_branch_id=payload.to_branch_id,
        from_department_id=emp.department_id,
        to_department_id=payload.to_department_id,
        from_designation_id=emp.designation_id,
        to_designation_id=payload.to_designation_id,
        transfer_date=payload.transfer_date or date.today(),
        effective_date=payload.effective_date,
        reason=payload.reason,
        notes=payload.notes,
        documents=payload.documents,
        status="pending",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_transfer(db, row_id, payload: TransferUpdate, *, company_id):
    row = get_transfer(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending transfers can be edited")
    data = payload.model_dump(exclude_unset=True)
    _validate_org_fk(
        db,
        company_id,
        branch_id=data.get("to_branch_id"),
        department_id=data.get("to_department_id"),
        designation_id=data.get("to_designation_id"),
    )
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def approve_transfer(db, row_id, *, company_id, approved_by):
    row = get_transfer(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending transfers can be approved")
    row.status = "approved"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    if row.employee_id:
        emp = db.get(HrmEmployee, row.employee_id)
        if emp:
            if row.to_branch_id:
                emp.branch_id = row.to_branch_id
            if row.to_department_id:
                emp.department_id = row.to_department_id
            if row.to_designation_id:
                emp.designation_id = row.to_designation_id
    db.commit()
    db.refresh(row)
    return row


def reject_transfer(db, row_id, *, company_id, approved_by):
    row = get_transfer(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending transfers can be rejected")
    row.status = "rejected"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_transfer(db, row_id, *, company_id):
    row = get_transfer(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending transfers can be deleted")
    db.delete(row)
    db.commit()


# --- trips ---


def list_trips(db, *, company_id, employee_id=None, status=None):
    return _list(db, HrmTrip, company_id=company_id, employee_id=employee_id, status=status)


def get_trip(db, row_id, company_id=None):
    return _get(db, HrmTrip, row_id, company_id, "Trip")


def create_trip(db, payload: TripCreate, *, created_by):
    _require_employee(db, payload.employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "pending"
    data["created_by"] = created_by
    data["advance_status"] = "pending" if payload.advance_amount else None
    data["total_expenses"] = ZERO
    data["reimbursement_status"] = "pending"
    row = HrmTrip(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_trip(db, row_id, payload: TripUpdate, *, company_id):
    row = get_trip(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled", "approved"):
        # allow report updates on approved
        data = payload.model_dump(exclude_unset=True)
        if row.status == "approved":
            allowed = {"trip_report", "documents", "reimbursement_status", "advance_status"}
            data = {k: v for k, v in data.items() if k in allowed}
        elif row.status != "pending":
            raise HTTPException(status_code=409, detail="Trip cannot be edited in this status")
    else:
        data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def approve_trip(db, row_id, *, company_id, approved_by):
    row = get_trip(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending trips can be approved")
    row.status = "approved"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def complete_trip(db, row_id, *, company_id):
    row = get_trip(db, row_id, company_id=company_id)
    if row.status != "approved":
        raise HTTPException(status_code=409, detail="Only approved trips can be completed")
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def cancel_trip(db, row_id, *, company_id):
    row = get_trip(db, row_id, company_id=company_id)
    if row.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Trip cannot be cancelled")
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return row


def delete_trip(db, row_id, *, company_id):
    row = get_trip(db, row_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending trips can be deleted")
    db.delete(row)
    db.commit()


def _recalc_trip_expenses(db, trip_id: str):
    trip = db.get(HrmTrip, trip_id)
    if not trip:
        return
    total = (
        db.query(HrmTripExpense)
        .filter(HrmTripExpense.trip_id == trip_id, HrmTripExpense.status != "rejected")
        .all()
    )
    trip.total_expenses = sum((e.amount for e in total), ZERO)


def list_trip_expenses(db, *, company_id, trip_id=None):
    query = db.query(HrmTripExpense).filter(HrmTripExpense.company_id == company_id)
    if trip_id:
        query = query.filter(HrmTripExpense.trip_id == trip_id)
    return query.order_by(HrmTripExpense.created_at.desc()).all()


def get_trip_expense(db, row_id, company_id=None):
    return _get(db, HrmTripExpense, row_id, company_id, "Trip expense")


def create_trip_expense(db, payload: TripExpenseCreate, *, created_by):
    trip = get_trip(db, payload.trip_id, company_id=payload.company_id)
    if trip.status not in ("pending", "approved"):
        raise HTTPException(status_code=409, detail="Cannot add expenses to this trip")
    data = payload.model_dump()
    data["status"] = "pending"
    data["created_by"] = created_by
    data["expense_date"] = payload.expense_date or date.today()
    row = HrmTripExpense(**data)
    db.add(row)
    db.flush()
    _recalc_trip_expenses(db, payload.trip_id)
    db.commit()
    db.refresh(row)
    return row


def update_trip_expense(db, row_id, payload: TripExpenseUpdate, *, company_id):
    row = get_trip_expense(db, row_id, company_id=company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.flush()
    if row.trip_id:
        _recalc_trip_expenses(db, row.trip_id)
    db.commit()
    db.refresh(row)
    return row


def delete_trip_expense(db, row_id, *, company_id):
    row = get_trip_expense(db, row_id, company_id=company_id)
    trip_id = row.trip_id
    db.delete(row)
    db.flush()
    if trip_id:
        _recalc_trip_expenses(db, trip_id)
    db.commit()
