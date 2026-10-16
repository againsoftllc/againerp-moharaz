from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional, Type, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmBranch, HrmEmployee
from app.models.hrm.training import (
    HrmEmployeeAssessmentResult,
    HrmEmployeeTraining,
    HrmTrainingAssessment,
    HrmTrainingProgram,
    HrmTrainingSession,
    HrmTrainingSessionAttendance,
    HrmTrainingType,
)
from app.schemas.hrm.training import (
    AssessmentResultCreate,
    AssessmentResultUpdate,
    EmployeeTrainingCreate,
    EmployeeTrainingUpdate,
    SessionAttendanceCreate,
    SessionAttendanceUpdate,
    TrainingAssessmentCreate,
    TrainingAssessmentUpdate,
    TrainingProgramCreate,
    TrainingProgramUpdate,
    TrainingSessionCreate,
    TrainingSessionUpdate,
    TrainingTypeCreate,
    TrainingTypeUpdate,
)

T = TypeVar("T")


def _get(db: Session, model: Type[T], row_id: str, company_id: Optional[str], label: str) -> T:
    row = db.get(model, row_id)
    if not row or (company_id and getattr(row, "company_id", None) != company_id):
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_program(db: Session, program_id: str, company_id: str) -> HrmTrainingProgram:
    return _get(db, HrmTrainingProgram, program_id, company_id, "Training program")


def _require_type(db: Session, type_id: str, company_id: str) -> HrmTrainingType:
    return _get(db, HrmTrainingType, type_id, company_id, "Training type")


# --- training types ---

def list_training_types(db: Session, *, company_id: str, branch_id: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmTrainingType).filter(HrmTrainingType.company_id == company_id)
    if branch_id:
        query = query.filter(HrmTrainingType.branch_id == branch_id)
    if q:
        query = query.filter(HrmTrainingType.name.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmTrainingType.name.asc()).all()


def get_training_type(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmTrainingType, row_id, company_id, "Training type")


def create_training_type(db: Session, payload: TrainingTypeCreate, *, created_by: Optional[str]):
    if payload.branch_id:
        branch = db.get(HrmBranch, payload.branch_id)
        if not branch or branch.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid branch_id")
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    data["created_by"] = created_by
    row = HrmTrainingType(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_training_type(db: Session, row_id: str, payload: TrainingTypeUpdate, *, company_id: str):
    row = get_training_type(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "branch_id" in data and data["branch_id"]:
        branch = db.get(HrmBranch, data["branch_id"])
        if not branch or branch.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid branch_id")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_training_type(db: Session, row_id: str, *, company_id: str):
    row = get_training_type(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- programs ---

def list_programs(db: Session, *, company_id: str, training_type_id: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmTrainingProgram).filter(HrmTrainingProgram.company_id == company_id)
    if training_type_id:
        query = query.filter(HrmTrainingProgram.training_type_id == training_type_id)
    if status:
        query = query.filter(HrmTrainingProgram.status == status)
    if q:
        query = query.filter(HrmTrainingProgram.name.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmTrainingProgram.created_at.desc()).all()


def get_program(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmTrainingProgram, row_id, company_id, "Training program")


def create_program(db: Session, payload: TrainingProgramCreate, *, created_by: Optional[str]):
    if payload.training_type_id:
        _require_type(db, payload.training_type_id, payload.company_id)
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    data["status"] = "draft"
    data["created_by"] = created_by
    row = HrmTrainingProgram(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_program(db: Session, row_id: str, payload: TrainingProgramUpdate, *, company_id: str):
    row = get_program(db, row_id, company_id=company_id)
    if row.status not in ("draft", "active"):
        raise HTTPException(status_code=409, detail="Only draft/active programs can be edited")
    data = payload.model_dump(exclude_unset=True)
    if "training_type_id" in data and data["training_type_id"]:
        _require_type(db, data["training_type_id"], company_id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def activate_program(db: Session, row_id: str, *, company_id: str):
    row = get_program(db, row_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft programs can be activated")
    row.status = "active"
    db.commit()
    db.refresh(row)
    return row


def complete_program(db: Session, row_id: str, *, company_id: str):
    row = get_program(db, row_id, company_id=company_id)
    if row.status != "active":
        raise HTTPException(status_code=409, detail="Only active programs can be completed")
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def cancel_program(db: Session, row_id: str, *, company_id: str):
    row = get_program(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Program already finished")
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return row


def delete_program(db: Session, row_id: str, *, company_id: str):
    row = get_program(db, row_id, company_id=company_id)
    if row.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=409, detail="Only draft/cancelled programs can be deleted")
    db.delete(row)
    db.commit()


# --- sessions ---

def list_sessions(db: Session, *, company_id: str, training_program_id: Optional[str] = None, status: Optional[str] = None):
    query = db.query(HrmTrainingSession).filter(HrmTrainingSession.company_id == company_id)
    if training_program_id:
        query = query.filter(HrmTrainingSession.training_program_id == training_program_id)
    if status:
        query = query.filter(HrmTrainingSession.status == status)
    return query.order_by(HrmTrainingSession.created_at.desc()).all()


def get_session(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmTrainingSession, row_id, company_id, "Training session")


def create_session(db: Session, payload: TrainingSessionCreate, *, created_by: Optional[str]):
    _require_program(db, payload.training_program_id, payload.company_id)
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    data["status"] = "scheduled"
    data["created_by"] = created_by
    row = HrmTrainingSession(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_session(db: Session, row_id: str, payload: TrainingSessionUpdate, *, company_id: str):
    row = get_session(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=409, detail="Only scheduled/in_progress sessions can be edited")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def start_session(db: Session, row_id: str, *, company_id: str):
    row = get_session(db, row_id, company_id=company_id)
    if row.status != "scheduled":
        raise HTTPException(status_code=409, detail="Only scheduled sessions can be started")
    row.status = "in_progress"
    db.commit()
    db.refresh(row)
    return row


def complete_session(db: Session, row_id: str, *, company_id: str):
    row = get_session(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=409, detail="Only scheduled/in_progress sessions can be completed")
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def cancel_session(db: Session, row_id: str, *, company_id: str):
    row = get_session(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Session already finished")
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return row


def delete_session(db: Session, row_id: str, *, company_id: str):
    row = get_session(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "cancelled"):
        raise HTTPException(status_code=409, detail="Only scheduled/cancelled sessions can be deleted")
    db.delete(row)
    db.commit()


# --- attendance ---

def list_attendance(db: Session, *, company_id: str, training_session_id: Optional[str] = None, employee_id: Optional[str] = None):
    query = db.query(HrmTrainingSessionAttendance).filter(HrmTrainingSessionAttendance.company_id == company_id)
    if training_session_id:
        query = query.filter(HrmTrainingSessionAttendance.training_session_id == training_session_id)
    if employee_id:
        query = query.filter(HrmTrainingSessionAttendance.employee_id == employee_id)
    return query.order_by(HrmTrainingSessionAttendance.created_at.desc()).all()


def get_attendance(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmTrainingSessionAttendance, row_id, company_id, "Session attendance")


def create_attendance(db: Session, payload: SessionAttendanceCreate):
    session = get_session(db, payload.training_session_id, company_id=payload.company_id)
    _require_employee(db, payload.employee_id, payload.company_id)
    existing = (
        db.query(HrmTrainingSessionAttendance)
        .filter(
            HrmTrainingSessionAttendance.company_id == payload.company_id,
            HrmTrainingSessionAttendance.training_session_id == session.id,
            HrmTrainingSessionAttendance.employee_id == payload.employee_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Attendance already recorded for this employee/session")
    row = HrmTrainingSessionAttendance(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_attendance(db: Session, row_id: str, payload: SessionAttendanceUpdate, *, company_id: str):
    row = get_attendance(db, row_id, company_id=company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_attendance(db: Session, row_id: str, *, company_id: str):
    row = get_attendance(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- employee trainings ---

def list_employee_trainings(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    training_program_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmEmployeeTraining).filter(HrmEmployeeTraining.company_id == company_id)
    if employee_id:
        query = query.filter(HrmEmployeeTraining.employee_id == employee_id)
    if training_program_id:
        query = query.filter(HrmEmployeeTraining.training_program_id == training_program_id)
    if status:
        query = query.filter(HrmEmployeeTraining.status == status)
    return query.order_by(HrmEmployeeTraining.created_at.desc()).all()


def get_employee_training(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmEmployeeTraining, row_id, company_id, "Employee training")


def create_employee_training(db: Session, payload: EmployeeTrainingCreate, *, created_by: Optional[str]):
    _require_employee(db, payload.employee_id, payload.company_id)
    _require_program(db, payload.training_program_id, payload.company_id)
    existing = (
        db.query(HrmEmployeeTraining)
        .filter(
            HrmEmployeeTraining.company_id == payload.company_id,
            HrmEmployeeTraining.employee_id == payload.employee_id,
            HrmEmployeeTraining.training_program_id == payload.training_program_id,
            HrmEmployeeTraining.status.in_(("assigned", "in_progress")),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Employee already assigned to this program")
    data = payload.model_dump()
    data["status"] = "assigned"
    data["assigned_date"] = payload.assigned_date or date.today()
    data["assigned_by"] = created_by
    data["created_by"] = created_by
    row = HrmEmployeeTraining(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_employee_training(db: Session, row_id: str, payload: EmployeeTrainingUpdate, *, company_id: str):
    row = get_employee_training(db, row_id, company_id=company_id)
    if row.status in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Completed/failed trainings cannot be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def start_employee_training(db: Session, row_id: str, *, company_id: str):
    row = get_employee_training(db, row_id, company_id=company_id)
    if row.status != "assigned":
        raise HTTPException(status_code=409, detail="Only assigned trainings can be started")
    row.status = "in_progress"
    db.commit()
    db.refresh(row)
    return row


def complete_employee_training(db: Session, row_id: str, *, company_id: str):
    row = get_employee_training(db, row_id, company_id=company_id)
    if row.status not in ("assigned", "in_progress"):
        raise HTTPException(status_code=409, detail="Only assigned/in_progress trainings can be completed")
    row.status = "completed"
    row.completion_date = row.completion_date or date.today()
    if row.is_passed is None:
        row.is_passed = True
    db.commit()
    db.refresh(row)
    return row


def fail_employee_training(db: Session, row_id: str, *, company_id: str):
    row = get_employee_training(db, row_id, company_id=company_id)
    if row.status not in ("assigned", "in_progress"):
        raise HTTPException(status_code=409, detail="Only assigned/in_progress trainings can be failed")
    row.status = "failed"
    row.completion_date = row.completion_date or date.today()
    row.is_passed = False
    db.commit()
    db.refresh(row)
    return row


def delete_employee_training(db: Session, row_id: str, *, company_id: str):
    row = get_employee_training(db, row_id, company_id=company_id)
    if row.status not in ("assigned",):
        raise HTTPException(status_code=409, detail="Only assigned trainings can be deleted")
    db.delete(row)
    db.commit()


# --- assessments ---

def list_assessments(db: Session, *, company_id: str, training_program_id: Optional[str] = None):
    query = db.query(HrmTrainingAssessment).filter(HrmTrainingAssessment.company_id == company_id)
    if training_program_id:
        query = query.filter(HrmTrainingAssessment.training_program_id == training_program_id)
    return query.order_by(HrmTrainingAssessment.name.asc()).all()


def get_assessment(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmTrainingAssessment, row_id, company_id, "Training assessment")


def create_assessment(db: Session, payload: TrainingAssessmentCreate, *, created_by: Optional[str]):
    _require_program(db, payload.training_program_id, payload.company_id)
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    data["created_by"] = created_by
    row = HrmTrainingAssessment(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_assessment(db: Session, row_id: str, payload: TrainingAssessmentUpdate, *, company_id: str):
    row = get_assessment(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_assessment(db: Session, row_id: str, *, company_id: str):
    row = get_assessment(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- assessment results ---

def list_assessment_results(
    db: Session,
    *,
    company_id: str,
    employee_training_id: Optional[str] = None,
    training_assessment_id: Optional[str] = None,
):
    query = db.query(HrmEmployeeAssessmentResult).filter(HrmEmployeeAssessmentResult.company_id == company_id)
    if employee_training_id:
        query = query.filter(HrmEmployeeAssessmentResult.employee_training_id == employee_training_id)
    if training_assessment_id:
        query = query.filter(HrmEmployeeAssessmentResult.training_assessment_id == training_assessment_id)
    return query.order_by(HrmEmployeeAssessmentResult.created_at.desc()).all()


def get_assessment_result(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmEmployeeAssessmentResult, row_id, company_id, "Assessment result")


def create_assessment_result(db: Session, payload: AssessmentResultCreate, *, assessed_by: Optional[str]):
    emp_training = get_employee_training(db, payload.employee_training_id, company_id=payload.company_id)
    assessment = get_assessment(db, payload.training_assessment_id, company_id=payload.company_id)
    if emp_training.training_program_id != assessment.training_program_id:
        raise HTTPException(status_code=400, detail="Assessment does not belong to the employee training program")
    score = payload.score if payload.score is not None else Decimal("0")
    is_passed = payload.is_passed if payload.is_passed is not None else (score >= assessment.passing_score)
    row = HrmEmployeeAssessmentResult(
        company_id=payload.company_id,
        employee_training_id=payload.employee_training_id,
        training_assessment_id=payload.training_assessment_id,
        score=score,
        is_passed=is_passed,
        feedback=payload.feedback,
        assessment_date=payload.assessment_date or date.today(),
        assessed_by=assessed_by,
    )
    db.add(row)
    # roll latest score onto employee training
    emp_training.score = score
    emp_training.is_passed = is_passed
    db.commit()
    db.refresh(row)
    return row


def update_assessment_result(db: Session, row_id: str, payload: AssessmentResultUpdate, *, company_id: str):
    row = get_assessment_result(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "score" in data and "is_passed" not in data:
        assessment = get_assessment(db, row.training_assessment_id, company_id=company_id)
        data["is_passed"] = data["score"] >= assessment.passing_score
    for k, v in data.items():
        setattr(row, k, v)
    if row.employee_training_id and ("score" in data or "is_passed" in data):
        emp_training = get_employee_training(db, row.employee_training_id, company_id=company_id)
        emp_training.score = row.score
        emp_training.is_passed = row.is_passed
    db.commit()
    db.refresh(row)
    return row


def delete_assessment_result(db: Session, row_id: str, *, company_id: str):
    row = get_assessment_result(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()
