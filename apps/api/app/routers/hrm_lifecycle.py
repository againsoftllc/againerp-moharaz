from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.lifecycle import (
    ComplaintCreate,
    ComplaintListResponse,
    ComplaintRead,
    ComplaintResponse,
    ComplaintUpdate,
    PromotionCreate,
    PromotionListResponse,
    PromotionRead,
    PromotionResponse,
    PromotionUpdate,
    ResignationCreate,
    ResignationListResponse,
    ResignationRead,
    ResignationResponse,
    ResignationUpdate,
    TerminationCreate,
    TerminationListResponse,
    TerminationRead,
    TerminationResponse,
    TerminationUpdate,
    TransferCreate,
    TransferListResponse,
    TransferRead,
    TransferResponse,
    TransferUpdate,
    TripCreate,
    TripExpenseCreate,
    TripExpenseListResponse,
    TripExpenseRead,
    TripExpenseResponse,
    TripExpenseUpdate,
    TripListResponse,
    TripRead,
    TripResponse,
    TripUpdate,
    WarningCreate,
    WarningListResponse,
    WarningRead,
    WarningResponse,
    WarningUpdate,
)
from app.services.hrm import lifecycle_service as svc

resignations_router = APIRouter(prefix="/resignations", tags=["hrm-resignations"])
promotions_router = APIRouter(prefix="/promotions", tags=["hrm-promotions"])
terminations_router = APIRouter(prefix="/terminations", tags=["hrm-terminations"])
warnings_router = APIRouter(prefix="/warnings", tags=["hrm-warnings"])
complaints_router = APIRouter(prefix="/complaints", tags=["hrm-complaints"])
transfers_router = APIRouter(prefix="/employee-transfers", tags=["hrm-employee-transfers"])
trips_router = APIRouter(prefix="/trips", tags=["hrm-trips"])
trip_expenses_router = APIRouter(prefix="/trip-expenses", tags=["hrm-trip-expenses"])


def _meta(rows):
    return {"count": len(rows)}


# resignations
@resignations_router.get("", response_model=ResignationListResponse)
def list_resignations(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(pending|approved|rejected)$")):
    rows = svc.list_resignations(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [ResignationRead.model_validate(r) for r in rows]
    return ResignationListResponse(data=data, meta=_meta(data))


@resignations_router.post("", response_model=ResignationResponse, status_code=201)
def create_resignation(payload: ResignationCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return ResignationResponse(data=ResignationRead.model_validate(svc.create_resignation(db, payload, created_by=user.id)))


@resignations_router.patch("/{row_id}", response_model=ResignationResponse)
def update_resignation(row_id: str, payload: ResignationUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ResignationResponse(data=ResignationRead.model_validate(svc.update_resignation(db, row_id, payload, company_id=company_id)))


@resignations_router.post("/{row_id}/approve", response_model=ResignationResponse)
def approve_resignation(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ResignationResponse(data=ResignationRead.model_validate(svc.approve_resignation(db, row_id, company_id=company_id, approved_by=user.id)))


@resignations_router.post("/{row_id}/reject", response_model=ResignationResponse)
def reject_resignation(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ResignationResponse(data=ResignationRead.model_validate(svc.reject_resignation(db, row_id, company_id=company_id, approved_by=user.id)))


@resignations_router.delete("/{row_id}", status_code=204)
def delete_resignation(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_resignation(db, row_id, company_id=company_id)
    return Response(status_code=204)


# promotions
@promotions_router.get("", response_model=PromotionListResponse)
def list_promotions(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(pending|approved|rejected)$")):
    rows = svc.list_promotions(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [PromotionRead.model_validate(r) for r in rows]
    return PromotionListResponse(data=data, meta=_meta(data))


@promotions_router.post("", response_model=PromotionResponse, status_code=201)
def create_promotion(payload: PromotionCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return PromotionResponse(data=PromotionRead.model_validate(svc.create_promotion(db, payload, created_by=user.id)))


@promotions_router.patch("/{row_id}", response_model=PromotionResponse)
def update_promotion(row_id: str, payload: PromotionUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return PromotionResponse(data=PromotionRead.model_validate(svc.update_promotion(db, row_id, payload, company_id=company_id)))


@promotions_router.post("/{row_id}/approve", response_model=PromotionResponse)
def approve_promotion(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return PromotionResponse(data=PromotionRead.model_validate(svc.approve_promotion(db, row_id, company_id=company_id)))


@promotions_router.post("/{row_id}/reject", response_model=PromotionResponse)
def reject_promotion(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return PromotionResponse(data=PromotionRead.model_validate(svc.reject_promotion(db, row_id, company_id=company_id)))


@promotions_router.delete("/{row_id}", status_code=204)
def delete_promotion(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_promotion(db, row_id, company_id=company_id)
    return Response(status_code=204)


# terminations
@terminations_router.get("", response_model=TerminationListResponse)
def list_terminations(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(pending|approved|rejected)$")):
    rows = svc.list_terminations(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [TerminationRead.model_validate(r) for r in rows]
    return TerminationListResponse(data=data, meta=_meta(data))


@terminations_router.post("", response_model=TerminationResponse, status_code=201)
def create_termination(payload: TerminationCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TerminationResponse(data=TerminationRead.model_validate(svc.create_termination(db, payload, created_by=user.id)))


@terminations_router.patch("/{row_id}", response_model=TerminationResponse)
def update_termination(row_id: str, payload: TerminationUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TerminationResponse(data=TerminationRead.model_validate(svc.update_termination(db, row_id, payload, company_id=company_id)))


@terminations_router.post("/{row_id}/approve", response_model=TerminationResponse)
def approve_termination(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TerminationResponse(data=TerminationRead.model_validate(svc.approve_termination(db, row_id, company_id=company_id, approved_by=user.id)))


@terminations_router.post("/{row_id}/reject", response_model=TerminationResponse)
def reject_termination(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TerminationResponse(data=TerminationRead.model_validate(svc.reject_termination(db, row_id, company_id=company_id, approved_by=user.id)))


@terminations_router.delete("/{row_id}", status_code=204)
def delete_termination(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_termination(db, row_id, company_id=company_id)
    return Response(status_code=204)


# warnings
@warnings_router.get("", response_model=WarningListResponse)
def list_warnings(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(draft|issued|acknowledged)$")):
    rows = svc.list_warnings(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [WarningRead.model_validate(r) for r in rows]
    return WarningListResponse(data=data, meta=_meta(data))


@warnings_router.post("", response_model=WarningResponse, status_code=201)
def create_warning(payload: WarningCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return WarningResponse(data=WarningRead.model_validate(svc.create_warning(db, payload, created_by=user.id)))


@warnings_router.patch("/{row_id}", response_model=WarningResponse)
def update_warning(row_id: str, payload: WarningUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return WarningResponse(data=WarningRead.model_validate(svc.update_warning(db, row_id, payload, company_id=company_id)))


@warnings_router.post("/{row_id}/issue", response_model=WarningResponse)
def issue_warning(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return WarningResponse(data=WarningRead.model_validate(svc.issue_warning(db, row_id, company_id=company_id, approved_by=user.id)))


@warnings_router.post("/{row_id}/acknowledge", response_model=WarningResponse)
def acknowledge_warning(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return WarningResponse(data=WarningRead.model_validate(svc.acknowledge_warning(db, row_id, company_id=company_id)))


@warnings_router.delete("/{row_id}", status_code=204)
def delete_warning(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_warning(db, row_id, company_id=company_id)
    return Response(status_code=204)


# complaints
@complaints_router.get("", response_model=ComplaintListResponse)
def list_complaints(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(open|investigating|resolved|closed)$")):
    rows = svc.list_complaints(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [ComplaintRead.model_validate(r) for r in rows]
    return ComplaintListResponse(data=data, meta=_meta(data))


@complaints_router.post("", response_model=ComplaintResponse, status_code=201)
def create_complaint(payload: ComplaintCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return ComplaintResponse(data=ComplaintRead.model_validate(svc.create_complaint(db, payload, created_by=user.id)))


@complaints_router.patch("/{row_id}", response_model=ComplaintResponse)
def update_complaint(row_id: str, payload: ComplaintUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ComplaintResponse(data=ComplaintRead.model_validate(svc.update_complaint(db, row_id, payload, company_id=company_id)))


@complaints_router.post("/{row_id}/resolve", response_model=ComplaintResponse)
def resolve_complaint(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ComplaintResponse(data=ComplaintRead.model_validate(svc.resolve_complaint(db, row_id, company_id=company_id)))


@complaints_router.post("/{row_id}/close", response_model=ComplaintResponse)
def close_complaint(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ComplaintResponse(data=ComplaintRead.model_validate(svc.close_complaint(db, row_id, company_id=company_id)))


@complaints_router.delete("/{row_id}", status_code=204)
def delete_complaint(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_complaint(db, row_id, company_id=company_id)
    return Response(status_code=204)


# transfers
@transfers_router.get("", response_model=TransferListResponse)
def list_transfers(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(pending|approved|rejected)$")):
    rows = svc.list_transfers(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [TransferRead.model_validate(r) for r in rows]
    return TransferListResponse(data=data, meta=_meta(data))


@transfers_router.post("", response_model=TransferResponse, status_code=201)
def create_transfer(payload: TransferCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TransferResponse(data=TransferRead.model_validate(svc.create_transfer(db, payload, created_by=user.id)))


@transfers_router.patch("/{row_id}", response_model=TransferResponse)
def update_transfer(row_id: str, payload: TransferUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TransferResponse(data=TransferRead.model_validate(svc.update_transfer(db, row_id, payload, company_id=company_id)))


@transfers_router.post("/{row_id}/approve", response_model=TransferResponse)
def approve_transfer(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TransferResponse(data=TransferRead.model_validate(svc.approve_transfer(db, row_id, company_id=company_id, approved_by=user.id)))


@transfers_router.post("/{row_id}/reject", response_model=TransferResponse)
def reject_transfer(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TransferResponse(data=TransferRead.model_validate(svc.reject_transfer(db, row_id, company_id=company_id, approved_by=user.id)))


@transfers_router.delete("/{row_id}", status_code=204)
def delete_transfer(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_transfer(db, row_id, company_id=company_id)
    return Response(status_code=204)


# trips
@trips_router.get("", response_model=TripListResponse)
def list_trips(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), employee_id: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(pending|approved|completed|cancelled)$")):
    rows = svc.list_trips(db, company_id=company_id, employee_id=employee_id, status=status)
    data = [TripRead.model_validate(r) for r in rows]
    return TripListResponse(data=data, meta=_meta(data))


@trips_router.post("", response_model=TripResponse, status_code=201)
def create_trip(payload: TripCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TripResponse(data=TripRead.model_validate(svc.create_trip(db, payload, created_by=user.id)))


@trips_router.patch("/{row_id}", response_model=TripResponse)
def update_trip(row_id: str, payload: TripUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TripResponse(data=TripRead.model_validate(svc.update_trip(db, row_id, payload, company_id=company_id)))


@trips_router.post("/{row_id}/approve", response_model=TripResponse)
def approve_trip(row_id: str, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TripResponse(data=TripRead.model_validate(svc.approve_trip(db, row_id, company_id=company_id, approved_by=user.id)))


@trips_router.post("/{row_id}/complete", response_model=TripResponse)
def complete_trip(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TripResponse(data=TripRead.model_validate(svc.complete_trip(db, row_id, company_id=company_id)))


@trips_router.post("/{row_id}/cancel", response_model=TripResponse)
def cancel_trip(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TripResponse(data=TripRead.model_validate(svc.cancel_trip(db, row_id, company_id=company_id)))


@trips_router.delete("/{row_id}", status_code=204)
def delete_trip(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_trip(db, row_id, company_id=company_id)
    return Response(status_code=204)


# trip expenses
@trip_expenses_router.get("", response_model=TripExpenseListResponse)
def list_trip_expenses(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), trip_id: Optional[str] = None):
    rows = svc.list_trip_expenses(db, company_id=company_id, trip_id=trip_id)
    data = [TripExpenseRead.model_validate(r) for r in rows]
    return TripExpenseListResponse(data=data, meta=_meta(data))


@trip_expenses_router.post("", response_model=TripExpenseResponse, status_code=201)
def create_trip_expense(payload: TripExpenseCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return TripExpenseResponse(data=TripExpenseRead.model_validate(svc.create_trip_expense(db, payload, created_by=user.id)))


@trip_expenses_router.patch("/{row_id}", response_model=TripExpenseResponse)
def update_trip_expense(row_id: str, payload: TripExpenseUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return TripExpenseResponse(data=TripExpenseRead.model_validate(svc.update_trip_expense(db, row_id, payload, company_id=company_id)))


@trip_expenses_router.delete("/{row_id}", status_code=204)
def delete_trip_expense(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_trip_expense(db, row_id, company_id=company_id)
    return Response(status_code=204)
