from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.training import (
    AssessmentResultCreate,
    AssessmentResultListResponse,
    AssessmentResultRead,
    AssessmentResultResponse,
    AssessmentResultUpdate,
    EmployeeTrainingCreate,
    EmployeeTrainingListResponse,
    EmployeeTrainingRead,
    EmployeeTrainingResponse,
    EmployeeTrainingUpdate,
    SessionAttendanceCreate,
    SessionAttendanceListResponse,
    SessionAttendanceRead,
    SessionAttendanceResponse,
    SessionAttendanceUpdate,
    TrainingAssessmentCreate,
    TrainingAssessmentListResponse,
    TrainingAssessmentRead,
    TrainingAssessmentResponse,
    TrainingAssessmentUpdate,
    TrainingProgramCreate,
    TrainingProgramListResponse,
    TrainingProgramRead,
    TrainingProgramResponse,
    TrainingProgramUpdate,
    TrainingSessionCreate,
    TrainingSessionListResponse,
    TrainingSessionRead,
    TrainingSessionResponse,
    TrainingSessionUpdate,
    TrainingTypeCreate,
    TrainingTypeListResponse,
    TrainingTypeRead,
    TrainingTypeResponse,
    TrainingTypeUpdate,
)
from app.services.hrm import training_service as svc

training_types_router = APIRouter(prefix="/training-types", tags=["hrm-training-types"])
programs_router = APIRouter(prefix="/training-programs", tags=["hrm-training-programs"])
sessions_router = APIRouter(prefix="/training-sessions", tags=["hrm-training-sessions"])
attendance_router = APIRouter(prefix="/training-session-attendance", tags=["hrm-training-session-attendance"])
employee_trainings_router = APIRouter(prefix="/employee-trainings", tags=["hrm-employee-trainings"])
assessments_router = APIRouter(prefix="/training-assessments", tags=["hrm-training-assessments"])
assessment_results_router = APIRouter(prefix="/employee-assessment-results", tags=["hrm-employee-assessment-results"])


def _meta(rows):
    return {"count": len(rows)}


# training types
@training_types_router.get("", response_model=TrainingTypeListResponse)
def list_training_types(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), branch_id: Optional[str] = None, q: Optional[str] = None):
    rows = svc.list_training_types(db, company_id=company_id, branch_id=branch_id, q=q)
    data = [TrainingTypeRead.model_validate(r) for r in rows]
    return TrainingTypeListResponse(data=data, meta=_meta(data))


@training_types_router.post("", response_model=TrainingTypeResponse, status_code=201)
def create_training_type(payload: TrainingTypeCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TrainingTypeResponse(data=TrainingTypeRead.model_validate(svc.create_training_type(db, payload, created_by=user.id)))


@training_types_router.patch("/{row_id}", response_model=TrainingTypeResponse)
def update_training_type(row_id: str, payload: TrainingTypeUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingTypeResponse(data=TrainingTypeRead.model_validate(svc.update_training_type(db, row_id, payload, company_id=company_id)))


@training_types_router.delete("/{row_id}", status_code=204)
def delete_training_type(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_training_type(db, row_id, company_id=company_id)
    return Response(status_code=204)


# programs
@programs_router.get("", response_model=TrainingProgramListResponse)
def list_programs(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), training_type_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(draft|active|completed|cancelled)$"), q: Optional[str] = None):
    rows = svc.list_programs(db, company_id=company_id, training_type_id=training_type_id, status=status, q=q)
    data = [TrainingProgramRead.model_validate(r) for r in rows]
    return TrainingProgramListResponse(data=data, meta=_meta(data))


@programs_router.post("", response_model=TrainingProgramResponse, status_code=201)
def create_program(payload: TrainingProgramCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TrainingProgramResponse(data=TrainingProgramRead.model_validate(svc.create_program(db, payload, created_by=user.id)))


@programs_router.patch("/{row_id}", response_model=TrainingProgramResponse)
def update_program(row_id: str, payload: TrainingProgramUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingProgramResponse(data=TrainingProgramRead.model_validate(svc.update_program(db, row_id, payload, company_id=company_id)))


@programs_router.post("/{row_id}/activate", response_model=TrainingProgramResponse)
def activate_program(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingProgramResponse(data=TrainingProgramRead.model_validate(svc.activate_program(db, row_id, company_id=company_id)))


@programs_router.post("/{row_id}/complete", response_model=TrainingProgramResponse)
def complete_program(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingProgramResponse(data=TrainingProgramRead.model_validate(svc.complete_program(db, row_id, company_id=company_id)))


@programs_router.post("/{row_id}/cancel", response_model=TrainingProgramResponse)
def cancel_program(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingProgramResponse(data=TrainingProgramRead.model_validate(svc.cancel_program(db, row_id, company_id=company_id)))


@programs_router.delete("/{row_id}", status_code=204)
def delete_program(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_program(db, row_id, company_id=company_id)
    return Response(status_code=204)


# sessions
@sessions_router.get("", response_model=TrainingSessionListResponse)
def list_sessions(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), training_program_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(scheduled|in_progress|completed|cancelled)$")):
    rows = svc.list_sessions(db, company_id=company_id, training_program_id=training_program_id, status=status)
    data = [TrainingSessionRead.model_validate(r) for r in rows]
    return TrainingSessionListResponse(data=data, meta=_meta(data))


@sessions_router.post("", response_model=TrainingSessionResponse, status_code=201)
def create_session(payload: TrainingSessionCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TrainingSessionResponse(data=TrainingSessionRead.model_validate(svc.create_session(db, payload, created_by=user.id)))


@sessions_router.patch("/{row_id}", response_model=TrainingSessionResponse)
def update_session(row_id: str, payload: TrainingSessionUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingSessionResponse(data=TrainingSessionRead.model_validate(svc.update_session(db, row_id, payload, company_id=company_id)))


@sessions_router.post("/{row_id}/start", response_model=TrainingSessionResponse)
def start_session(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingSessionResponse(data=TrainingSessionRead.model_validate(svc.start_session(db, row_id, company_id=company_id)))


@sessions_router.post("/{row_id}/complete", response_model=TrainingSessionResponse)
def complete_session(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingSessionResponse(data=TrainingSessionRead.model_validate(svc.complete_session(db, row_id, company_id=company_id)))


@sessions_router.post("/{row_id}/cancel", response_model=TrainingSessionResponse)
def cancel_session(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingSessionResponse(data=TrainingSessionRead.model_validate(svc.cancel_session(db, row_id, company_id=company_id)))


@sessions_router.delete("/{row_id}", status_code=204)
def delete_session(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_session(db, row_id, company_id=company_id)
    return Response(status_code=204)


# attendance
@attendance_router.get("", response_model=SessionAttendanceListResponse)
def list_attendance(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), training_session_id: Optional[str] = None, employee_id: Optional[str] = None):
    rows = svc.list_attendance(db, company_id=company_id, training_session_id=training_session_id, employee_id=employee_id)
    data = [SessionAttendanceRead.model_validate(r) for r in rows]
    return SessionAttendanceListResponse(data=data, meta=_meta(data))


@attendance_router.post("", response_model=SessionAttendanceResponse, status_code=201)
def create_attendance(payload: SessionAttendanceCreate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "create"))):
    return SessionAttendanceResponse(data=SessionAttendanceRead.model_validate(svc.create_attendance(db, payload)))


@attendance_router.patch("/{row_id}", response_model=SessionAttendanceResponse)
def update_attendance(row_id: str, payload: SessionAttendanceUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return SessionAttendanceResponse(data=SessionAttendanceRead.model_validate(svc.update_attendance(db, row_id, payload, company_id=company_id)))


@attendance_router.delete("/{row_id}", status_code=204)
def delete_attendance(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_attendance(db, row_id, company_id=company_id)
    return Response(status_code=204)


# employee trainings
@employee_trainings_router.get("", response_model=EmployeeTrainingListResponse)
def list_employee_trainings(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, training_program_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(assigned|in_progress|completed|failed)$")):
    rows = svc.list_employee_trainings(db, company_id=company_id, employee_id=employee_id, training_program_id=training_program_id, status=status)
    data = [EmployeeTrainingRead.model_validate(r) for r in rows]
    return EmployeeTrainingListResponse(data=data, meta=_meta(data))


@employee_trainings_router.post("", response_model=EmployeeTrainingResponse, status_code=201)
def create_employee_training(payload: EmployeeTrainingCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return EmployeeTrainingResponse(data=EmployeeTrainingRead.model_validate(svc.create_employee_training(db, payload, created_by=user.id)))


@employee_trainings_router.patch("/{row_id}", response_model=EmployeeTrainingResponse)
def update_employee_training(row_id: str, payload: EmployeeTrainingUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return EmployeeTrainingResponse(data=EmployeeTrainingRead.model_validate(svc.update_employee_training(db, row_id, payload, company_id=company_id)))


@employee_trainings_router.post("/{row_id}/start", response_model=EmployeeTrainingResponse)
def start_employee_training(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return EmployeeTrainingResponse(data=EmployeeTrainingRead.model_validate(svc.start_employee_training(db, row_id, company_id=company_id)))


@employee_trainings_router.post("/{row_id}/complete", response_model=EmployeeTrainingResponse)
def complete_employee_training(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return EmployeeTrainingResponse(data=EmployeeTrainingRead.model_validate(svc.complete_employee_training(db, row_id, company_id=company_id)))


@employee_trainings_router.post("/{row_id}/fail", response_model=EmployeeTrainingResponse)
def fail_employee_training(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return EmployeeTrainingResponse(data=EmployeeTrainingRead.model_validate(svc.fail_employee_training(db, row_id, company_id=company_id)))


@employee_trainings_router.delete("/{row_id}", status_code=204)
def delete_employee_training(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_employee_training(db, row_id, company_id=company_id)
    return Response(status_code=204)


# assessments
@assessments_router.get("", response_model=TrainingAssessmentListResponse)
def list_assessments(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), training_program_id: Optional[str] = None):
    rows = svc.list_assessments(db, company_id=company_id, training_program_id=training_program_id)
    data = [TrainingAssessmentRead.model_validate(r) for r in rows]
    return TrainingAssessmentListResponse(data=data, meta=_meta(data))


@assessments_router.post("", response_model=TrainingAssessmentResponse, status_code=201)
def create_assessment(payload: TrainingAssessmentCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TrainingAssessmentResponse(data=TrainingAssessmentRead.model_validate(svc.create_assessment(db, payload, created_by=user.id)))


@assessments_router.patch("/{row_id}", response_model=TrainingAssessmentResponse)
def update_assessment(row_id: str, payload: TrainingAssessmentUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TrainingAssessmentResponse(data=TrainingAssessmentRead.model_validate(svc.update_assessment(db, row_id, payload, company_id=company_id)))


@assessments_router.delete("/{row_id}", status_code=204)
def delete_assessment(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_assessment(db, row_id, company_id=company_id)
    return Response(status_code=204)


# assessment results
@assessment_results_router.get("", response_model=AssessmentResultListResponse)
def list_assessment_results(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_training_id: Optional[str] = None, training_assessment_id: Optional[str] = None):
    rows = svc.list_assessment_results(db, company_id=company_id, employee_training_id=employee_training_id, training_assessment_id=training_assessment_id)
    data = [AssessmentResultRead.model_validate(r) for r in rows]
    return AssessmentResultListResponse(data=data, meta=_meta(data))


@assessment_results_router.post("", response_model=AssessmentResultResponse, status_code=201)
def create_assessment_result(payload: AssessmentResultCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return AssessmentResultResponse(data=AssessmentResultRead.model_validate(svc.create_assessment_result(db, payload, assessed_by=user.id)))


@assessment_results_router.patch("/{row_id}", response_model=AssessmentResultResponse)
def update_assessment_result(row_id: str, payload: AssessmentResultUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return AssessmentResultResponse(data=AssessmentResultRead.model_validate(svc.update_assessment_result(db, row_id, payload, company_id=company_id)))


@assessment_results_router.delete("/{row_id}", status_code=204)
def delete_assessment_result(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_assessment_result(db, row_id, company_id=company_id)
    return Response(status_code=204)
