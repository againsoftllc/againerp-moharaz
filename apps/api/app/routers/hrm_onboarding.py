from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.onboarding import (
    CandidateOnboardingCreate,
    CandidateOnboardingListMeta,
    CandidateOnboardingListResponse,
    CandidateOnboardingRead,
    CandidateOnboardingResponse,
    CandidateOnboardingUpdate,
    ChecklistItemCreate,
    ChecklistItemListMeta,
    ChecklistItemListResponse,
    ChecklistItemRead,
    ChecklistItemResponse,
    ChecklistItemUpdate,
    OnboardingChecklistCreate,
    OnboardingChecklistListMeta,
    OnboardingChecklistListResponse,
    OnboardingChecklistRead,
    OnboardingChecklistResponse,
    OnboardingChecklistUpdate,
)
from app.services.hrm import onboarding_service

checklists_router = APIRouter(
    prefix="/onboarding-checklists", tags=["hrm-onboarding-checklists"]
)
items_router = APIRouter(prefix="/checklist-items", tags=["hrm-checklist-items"])
onboarding_router = APIRouter(
    prefix="/candidate-onboarding", tags=["hrm-candidate-onboarding"]
)


@checklists_router.get("", response_model=OnboardingChecklistListResponse)
def list_checklists(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
) -> OnboardingChecklistListResponse:
    rows = onboarding_service.list_checklists(
        db, company_id=company_id, status=status
    )
    data = [OnboardingChecklistRead.model_validate(r) for r in rows]
    return OnboardingChecklistListResponse(
        data=data, meta=OnboardingChecklistListMeta(count=len(data))
    )


@checklists_router.get("/{checklist_id}", response_model=OnboardingChecklistResponse)
def get_checklist(
    checklist_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> OnboardingChecklistResponse:
    row = onboarding_service.get_checklist(db, checklist_id, company_id=company_id)
    return OnboardingChecklistResponse(
        data=OnboardingChecklistRead.model_validate(row)
    )


@checklists_router.post("", response_model=OnboardingChecklistResponse, status_code=201)
def create_checklist(
    payload: OnboardingChecklistCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> OnboardingChecklistResponse:
    row = onboarding_service.create_checklist(db, payload, created_by=user.id)
    return OnboardingChecklistResponse(
        data=OnboardingChecklistRead.model_validate(row)
    )


@checklists_router.patch("/{checklist_id}", response_model=OnboardingChecklistResponse)
def update_checklist(
    checklist_id: str,
    payload: OnboardingChecklistUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OnboardingChecklistResponse:
    row = onboarding_service.update_checklist(
        db, checklist_id, payload, company_id=company_id
    )
    return OnboardingChecklistResponse(
        data=OnboardingChecklistRead.model_validate(row)
    )


@checklists_router.delete("/{checklist_id}", status_code=204)
def delete_checklist(
    checklist_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    onboarding_service.delete_checklist(db, checklist_id, company_id=company_id)
    return Response(status_code=204)


@items_router.get("", response_model=ChecklistItemListResponse)
def list_checklist_items(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    checklist_id: Optional[str] = Query(default=None),
) -> ChecklistItemListResponse:
    rows = onboarding_service.list_checklist_items(
        db, company_id=company_id, checklist_id=checklist_id
    )
    data = [ChecklistItemRead.model_validate(r) for r in rows]
    return ChecklistItemListResponse(
        data=data, meta=ChecklistItemListMeta(count=len(data))
    )


@items_router.get("/{item_id}", response_model=ChecklistItemResponse)
def get_checklist_item(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ChecklistItemResponse:
    row = onboarding_service.get_checklist_item(db, item_id, company_id=company_id)
    return ChecklistItemResponse(data=ChecklistItemRead.model_validate(row))


@items_router.post("", response_model=ChecklistItemResponse, status_code=201)
def create_checklist_item(
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> ChecklistItemResponse:
    row = onboarding_service.create_checklist_item(db, payload, created_by=user.id)
    return ChecklistItemResponse(data=ChecklistItemRead.model_validate(row))


@items_router.patch("/{item_id}", response_model=ChecklistItemResponse)
def update_checklist_item(
    item_id: str,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ChecklistItemResponse:
    row = onboarding_service.update_checklist_item(
        db, item_id, payload, company_id=company_id
    )
    return ChecklistItemResponse(data=ChecklistItemRead.model_validate(row))


@items_router.delete("/{item_id}", status_code=204)
def delete_checklist_item(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    onboarding_service.delete_checklist_item(db, item_id, company_id=company_id)
    return Response(status_code=204)


@onboarding_router.get("", response_model=CandidateOnboardingListResponse)
def list_candidate_onboardings(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    candidate_id: Optional[str] = Query(default=None),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|in_progress|completed)$"
    ),
) -> CandidateOnboardingListResponse:
    rows = onboarding_service.list_candidate_onboardings(
        db,
        company_id=company_id,
        candidate_id=candidate_id,
        employee_id=employee_id,
        status=status,
    )
    data = [CandidateOnboardingRead.model_validate(r) for r in rows]
    return CandidateOnboardingListResponse(
        data=data, meta=CandidateOnboardingListMeta(count=len(data))
    )


@onboarding_router.get("/{onboarding_id}", response_model=CandidateOnboardingResponse)
def get_candidate_onboarding(
    onboarding_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateOnboardingResponse:
    row = onboarding_service.get_candidate_onboarding(
        db, onboarding_id, company_id=company_id
    )
    return CandidateOnboardingResponse(
        data=CandidateOnboardingRead.model_validate(row)
    )


@onboarding_router.post("", response_model=CandidateOnboardingResponse, status_code=201)
def create_candidate_onboarding(
    payload: CandidateOnboardingCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> CandidateOnboardingResponse:
    row = onboarding_service.create_candidate_onboarding(
        db, payload, created_by=user.id
    )
    return CandidateOnboardingResponse(
        data=CandidateOnboardingRead.model_validate(row)
    )


@onboarding_router.patch("/{onboarding_id}", response_model=CandidateOnboardingResponse)
def update_candidate_onboarding(
    onboarding_id: str,
    payload: CandidateOnboardingUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateOnboardingResponse:
    row = onboarding_service.update_candidate_onboarding(
        db, onboarding_id, payload, company_id=company_id
    )
    return CandidateOnboardingResponse(
        data=CandidateOnboardingRead.model_validate(row)
    )


@onboarding_router.post(
    "/{onboarding_id}/start", response_model=CandidateOnboardingResponse
)
def start_candidate_onboarding(
    onboarding_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateOnboardingResponse:
    row = onboarding_service.start_candidate_onboarding(
        db, onboarding_id, company_id=company_id
    )
    return CandidateOnboardingResponse(
        data=CandidateOnboardingRead.model_validate(row)
    )


@onboarding_router.post(
    "/{onboarding_id}/complete", response_model=CandidateOnboardingResponse
)
def complete_candidate_onboarding(
    onboarding_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateOnboardingResponse:
    row = onboarding_service.complete_candidate_onboarding(
        db, onboarding_id, company_id=company_id
    )
    return CandidateOnboardingResponse(
        data=CandidateOnboardingRead.model_validate(row)
    )


@onboarding_router.delete("/{onboarding_id}", status_code=204)
def delete_candidate_onboarding(
    onboarding_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    onboarding_service.delete_candidate_onboarding(
        db, onboarding_id, company_id=company_id
    )
    return Response(status_code=204)
