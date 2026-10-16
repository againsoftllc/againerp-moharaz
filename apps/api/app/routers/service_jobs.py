from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.service.job import (
    ServiceCatalogItemRead,
    ServiceCatalogResponse,
    ServiceDashboardRead,
    ServiceDashboardResponse,
    ServiceJobBillRequest,
    ServiceJobCreate,
    ServiceJobDeliverRequest,
    ServiceJobDiagnosisRequest,
    ServiceJobHistoryListResponse,
    ServiceJobHistoryRead,
    ServiceJobLineCreate,
    ServiceJobListMeta,
    ServiceJobListResponse,
    ServiceJobNoteRequest,
    ServiceJobQcRequest,
    ServiceJobRead,
    ServiceJobResponse,
    ServiceJobUpdate,
    ServiceReportsRead,
    ServiceReportsResponse,
)
from app.services.service.service_job_service import (
    LineIntake,
    ServiceJobIntake,
    add_line,
    approve_job,
    cancel_job,
    catalog_search,
    complete_job,
    complete_work,
    create_job,
    dashboard,
    deliver_job,
    get_job,
    history,
    list_jobs,
    raise_bill,
    record_diagnosis,
    record_qc,
    reject_job,
    remove_line,
    reports,
    start_diagnosis,
    start_work,
    update_job,
)

router = APIRouter(prefix="/service-jobs", tags=["service-jobs"])


def _read(job) -> ServiceJobRead:
    return ServiceJobRead.model_validate(job)


@router.get("", response_model=ServiceJobListResponse)
def list_service_jobs(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    rma_id: Optional[str] = Query(default=None),
    technician_id: Optional[str] = Query(default=None),
    service_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> ServiceJobListResponse:
    rows, total = list_jobs(
        db,
        company_id=company_id,
        status=status,
        rma_id=rma_id,
        technician_id=technician_id,
        service_type=service_type,
        search=search,
    )
    return ServiceJobListResponse(
        data=[_read(row) for row in rows],
        meta=ServiceJobListMeta(count=len(rows), total=total),
    )


@router.get("/dashboard", response_model=ServiceDashboardResponse)
def service_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceDashboardResponse:
    return ServiceDashboardResponse(data=ServiceDashboardRead(**dashboard(db, company_id)))


@router.get("/reports", response_model=ServiceReportsResponse)
def service_reports(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceReportsResponse:
    return ServiceReportsResponse(data=ServiceReportsRead(**reports(db, company_id)))


@router.get("/catalog", response_model=ServiceCatalogResponse)
def service_catalog(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    q: str = Query(default=""),
    company_id: str = Depends(get_current_company_id),
) -> ServiceCatalogResponse:
    rows = catalog_search(db, q, company_id=company_id)
    return ServiceCatalogResponse(data=[ServiceCatalogItemRead(**row) for row in rows])


@router.get("/{job_id}", response_model=ServiceJobResponse)
def get_service_job(
    job_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    return ServiceJobResponse(data=_read(get_job(db, job_id, company_id=company_id)))


@router.get("/{job_id}/history", response_model=ServiceJobHistoryListResponse)
def job_history(
    job_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "read")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobHistoryListResponse:
    get_job(db, job_id, company_id=company_id)
    rows = history(db, job_id)
    return ServiceJobHistoryListResponse(data=[ServiceJobHistoryRead.model_validate(r) for r in rows])


@router.post("", response_model=ServiceJobResponse, status_code=201)
def create_service_job(
    payload: ServiceJobCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "create")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    """Walk-in / non-RMA repair, or a direct service invoice (invoice_only)."""
    job = create_job(
        db,
        ServiceJobIntake(
            issue=payload.issue,
            company_id=company_id,
            service_type=payload.service_type,
            customer_id=payload.customer_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone or "",
            customer_email=payload.customer_email or "",
            sku=payload.sku or "",
            product_name=payload.product_name or "",
            serial_number=payload.serial_number,
            brand=payload.brand or "",
            model=payload.model or "",
            imei=payload.imei,
            warehouse_id=payload.warehouse_id,
            labour_total=payload.labour_total,
            parts_total=payload.parts_total,
            notes=payload.notes,
            condition_notes=payload.condition_notes,
            priority=payload.priority,
            technician_id=payload.technician_id,
            technician_name=payload.technician_name or "",
            invoice_only=payload.invoice_only,
            created_by=user.id,
        ),
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.patch("/{job_id}", response_model=ServiceJobResponse)
def patch_service_job(
    job_id: str,
    payload: ServiceJobUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = update_job(db, get_job(db, job_id, company_id=company_id), **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/lines", response_model=ServiceJobResponse)
def add_job_line(
    job_id: str,
    payload: ServiceJobLineCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = get_job(db, job_id, company_id=company_id)
    add_line(
        db,
        job,
        LineIntake(
            kind=payload.kind,
            name=payload.name,
            quantity=payload.quantity,
            unit_price=payload.unit_price,
            item_id=payload.item_id,
            sku=payload.sku or "",
            unit=payload.unit or "job",
            discount=payload.discount,
            tax_rate=payload.tax_rate,
            warehouse_id=payload.warehouse_id,
            notes=payload.notes,
        ),
        actor=user.id,
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.delete("/{job_id}/lines/{line_id}", response_model=ServiceJobResponse)
def delete_job_line(
    job_id: str,
    line_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = remove_line(db, get_job(db, job_id, company_id=company_id), line_id)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/start-diagnosis", response_model=ServiceJobResponse)
def start_job_diagnosis(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = start_diagnosis(db, get_job(db, job_id, company_id=company_id), actor=user.id)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/diagnosis", response_model=ServiceJobResponse)
def diagnose_job(
    job_id: str,
    payload: ServiceJobDiagnosisRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = record_diagnosis(
        db,
        get_job(db, job_id, company_id=company_id),
        diagnosis=payload.diagnosis,
        found_problems=payload.found_problems,
        recommended_action=payload.recommended_action,
        estimated_cost=payload.estimated_cost,
        estimated_hours=payload.estimated_hours,
        actor=user.id,
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/approve", response_model=ServiceJobResponse)
def approve_service_job(
    job_id: str,
    payload: ServiceJobNoteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = approve_job(db, get_job(db, job_id, company_id=company_id), actor=user.id, note=payload.note)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/reject", response_model=ServiceJobResponse)
def reject_service_job(
    job_id: str,
    payload: ServiceJobNoteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = reject_job(db, get_job(db, job_id, company_id=company_id), actor=user.id, note=payload.note)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/start", response_model=ServiceJobResponse)
def start_service_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = start_work(db, get_job(db, job_id, company_id=company_id), actor=user.id)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/complete-work", response_model=ServiceJobResponse)
def complete_service_work(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = complete_work(db, get_job(db, job_id, company_id=company_id), actor=user.id)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/qc", response_model=ServiceJobResponse)
def qc_service_job(
    job_id: str,
    payload: ServiceJobQcRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = record_qc(
        db,
        get_job(db, job_id, company_id=company_id),
        result=payload.result,
        notes=payload.notes,
        checked_by=payload.checked_by,
        actor=user.id,
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/deliver", response_model=ServiceJobResponse)
def deliver_service_job(
    job_id: str,
    payload: ServiceJobDeliverRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = deliver_job(
        db,
        get_job(db, job_id, company_id=company_id),
        delivered_by=payload.delivered_by,
        received_by_name=payload.received_by_name,
        notes=payload.notes,
        actor=user.id,
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/complete", response_model=ServiceJobResponse)
def complete_service_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = complete_job(db, get_job(db, job_id, company_id=company_id), actor=user.id)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/cancel", response_model=ServiceJobResponse)
def cancel_service_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
    payload: Optional[ServiceJobNoteRequest] = None,
) -> ServiceJobResponse:
    job = cancel_job(
        db,
        get_job(db, job_id, company_id=company_id),
        actor=user.id,
        note=(payload.note if payload else None),
    )
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))


@router.post("/{job_id}/bill", response_model=ServiceJobResponse)
def bill_service_job(
    job_id: str,
    payload: ServiceJobBillRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("service", "write")),
    company_id: str = Depends(get_current_company_id),
) -> ServiceJobResponse:
    job = get_job(db, job_id, company_id=company_id)
    due = payload.due_date.date() if payload.due_date else date.today()
    raise_bill(db, job, due_date=due)
    db.commit()
    db.refresh(job)
    return ServiceJobResponse(data=_read(job))
