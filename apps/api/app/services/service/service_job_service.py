"""Service job-card numbering, lifecycle, lines, and billing.

Billing uses FinanceReceivable. Parts consume stock only through
StockMovementService. Labour/custom lines never move stock.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.models.finance import FinanceReceivable
from app.models.item import Item
from app.models.service_job import ServiceJob, ServiceJobHistory, ServiceJobLine
from app.services.service.constants import (
    APPROVAL_STATUSES,
    DIAGNOSIS_STATUSES,
    JOB_STATUS_TRANSITIONS,
    JOB_STATUSES,
    JOB_TYPES,
    LINE_KINDS,
    PRIORITIES,
    QC_STATUSES,
)
from app.services.core.sequence_service import next_number as allocate_number

ZERO = Decimal("0")


@dataclass(frozen=True)
class ServiceJobIntake:
    issue: str
    company_id: str = "default"
    service_type: str = "direct"
    rma_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str = ""
    customer_phone: str = ""
    customer_email: str = ""
    product_id: Optional[str] = None
    item_id: Optional[str] = None
    sku: str = ""
    product_name: str = ""
    serial_number: Optional[str] = None
    brand: str = ""
    model: str = ""
    imei: Optional[str] = None
    warehouse_id: Optional[str] = None
    warranty_status: str = "unknown"
    notes: Optional[str] = None
    condition_notes: Optional[str] = None
    labour_total: Decimal = ZERO
    parts_total: Decimal = ZERO
    created_by: Optional[str] = None
    priority: str = "normal"
    technician_id: Optional[str] = None
    technician_name: str = ""
    expected_at: Optional[datetime] = None
    invoice_only: bool = False


@dataclass(frozen=True)
class LineIntake:
    kind: str
    name: str
    quantity: int = 1
    unit_price: Decimal = ZERO
    item_id: Optional[str] = None
    sku: str = ""
    unit: str = "job"
    discount: Decimal = ZERO
    tax_rate: Decimal = ZERO
    warehouse_id: Optional[str] = None
    notes: Optional[str] = None


def next_job_number(db: Session, company_id: str) -> str:
    prefix = f"SJ-{date.today().year}-"
    return allocate_number(
        db,
        company_id,
        "service.job",
        initial=lambda: (
            db.query(func.count(ServiceJob.id))
            .filter(ServiceJob.company_id == company_id, ServiceJob.job_number.like(f"{prefix}%"))
            .scalar()
            or 0
        )
        + 1,
        is_taken=lambda number: db.query(ServiceJob.id)
        .filter(ServiceJob.job_number == number)
        .first()
        is not None,
    )


def _record(db: Session, job: ServiceJob, from_status: Optional[str], to_status: str, actor: Optional[str], note: Optional[str]) -> None:
    db.add(
        ServiceJobHistory(
            job_id=job.id,
            from_status=from_status,
            to_status=to_status,
            changed_by=actor,
            note=note,
        )
    )


def _set_status(db: Session, job: ServiceJob, to_status: str, *, actor: Optional[str] = None, note: Optional[str] = None) -> None:
    if to_status not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {to_status}")
    allowed = JOB_STATUS_TRANSITIONS.get(job.status, ())
    if to_status != job.status and to_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move a {job.status} job to {to_status}",
        )
    previous = job.status
    job.status = to_status
    _record(db, job, previous, to_status, actor, note)


def _recalc(job: ServiceJob) -> None:
    labour = ZERO
    parts = ZERO
    for line in job.lines:
        if line.kind == "part":
            parts += line.line_total
        else:
            labour += line.line_total
    if not job.lines:
        labour = job.labour_total or ZERO
        parts = job.parts_total or ZERO
    job.labour_total = labour.quantize(Decimal("0.01"))
    job.parts_total = parts.quantize(Decimal("0.01"))
    job.total = (job.labour_total + job.parts_total).quantize(Decimal("0.01"))
    if job.service_type == "warranty_repair":
        job.is_billable = False
    else:
        job.is_billable = job.total > 0


def _tax_total(job: ServiceJob) -> Decimal:
    tax = ZERO
    for line in job.lines or []:
        base = (Decimal(line.quantity) * (line.unit_price or ZERO)) - (line.discount or ZERO)
        if base < 0:
            base = ZERO
        tax += (base * ((line.tax_rate or ZERO) / Decimal("100"))).quantize(Decimal("0.01"))
    return tax.quantize(Decimal("0.01"))


def _line_total(quantity: int, unit_price: Decimal, discount: Decimal, tax_rate: Decimal) -> Decimal:
    base = (Decimal(quantity) * unit_price) - discount
    if base < 0:
        base = ZERO
    tax = (base * (tax_rate / Decimal("100"))).quantize(Decimal("0.01"))
    return (base + tax).quantize(Decimal("0.01"))


def create_job(db: Session, intake: ServiceJobIntake) -> ServiceJob:
    if intake.service_type not in JOB_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid service type: {intake.service_type}")
    if not intake.issue.strip():
        raise HTTPException(status_code=400, detail="Describe the issue before opening a service job")
    if not intake.customer_name.strip() and not intake.customer_id:
        raise HTTPException(status_code=400, detail="Customer is required for a service job")
    if intake.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {intake.priority}")

    total = (intake.labour_total + intake.parts_total).quantize(Decimal("0.01"))
    warranty = intake.service_type == "warranty_repair"
    billable = (not warranty) and (
        intake.service_type == "paid_repair" or (intake.service_type == "direct" and total > 0)
    )
    start = "received"
    job = ServiceJob(
        company_id=intake.company_id,
        job_number=next_job_number(db, intake.company_id),
        status=start,
        service_type=intake.service_type,
        rma_id=intake.rma_id,
        customer_id=intake.customer_id,
        customer_name=intake.customer_name,
        customer_phone=intake.customer_phone,
        customer_email=intake.customer_email,
        product_id=intake.product_id,
        item_id=intake.item_id,
        sku=intake.sku,
        product_name=intake.product_name,
        serial_number=intake.serial_number,
        brand=intake.brand,
        model=intake.model,
        imei=intake.imei,
        warehouse_id=intake.warehouse_id,
        issue=intake.issue.strip(),
        condition_notes=intake.condition_notes,
        warranty_status=intake.warranty_status,
        notes=intake.notes,
        priority=intake.priority,
        technician_id=intake.technician_id,
        technician_name=intake.technician_name,
        expected_at=intake.expected_at,
        labour_total=intake.labour_total,
        parts_total=intake.parts_total,
        total=total,
        is_billable=billable,
        qc_status="not_required" if intake.invoice_only else "pending",
        created_by=intake.created_by,
        completed_at=None,
    )
    db.add(job)
    db.flush()
    _record(db, job, None, job.status, intake.created_by, "Job card opened")
    return job


def get_job(db: Session, job_id: str, *, company_id: Optional[str] = None) -> ServiceJob:
    row = (
        db.query(ServiceJob)
        .options(selectinload(ServiceJob.lines))
        .filter(ServiceJob.id == job_id)
        .first()
    )
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Service job not found")
    return row


def list_jobs(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    rma_id: Optional[str] = None,
    technician_id: Optional[str] = None,
    service_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[Sequence[ServiceJob], int]:
    query = db.query(ServiceJob).options(selectinload(ServiceJob.lines)).filter(ServiceJob.company_id == company_id)
    if status:
        query = query.filter(ServiceJob.status == status)
    if rma_id:
        query = query.filter(ServiceJob.rma_id == rma_id)
    if technician_id:
        query = query.filter(ServiceJob.technician_id == technician_id)
    if service_type:
        query = query.filter(ServiceJob.service_type == service_type)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (ServiceJob.job_number.ilike(like))
            | (ServiceJob.customer_name.ilike(like))
            | (ServiceJob.sku.ilike(like))
            | (ServiceJob.product_name.ilike(like))
            | (ServiceJob.serial_number.ilike(like))
            | (ServiceJob.imei.ilike(like))
        )
    total = query.count()
    rows = query.order_by(ServiceJob.created_at.desc()).offset(offset).limit(limit).all()
    return rows, total


def history(db: Session, job_id: str) -> Sequence[ServiceJobHistory]:
    return (
        db.query(ServiceJobHistory)
        .filter(ServiceJobHistory.job_id == job_id)
        .order_by(ServiceJobHistory.created_at.asc())
        .all()
    )


def update_job(db: Session, job: ServiceJob, **fields) -> ServiceJob:
    if job.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Closed jobs cannot be edited")
    allowed = {
        "customer_name",
        "customer_phone",
        "customer_email",
        "product_name",
        "sku",
        "serial_number",
        "brand",
        "model",
        "imei",
        "issue",
        "condition_notes",
        "notes",
        "priority",
        "technician_id",
        "technician_name",
        "expected_at",
        "warehouse_id",
        "warranty_status",
    }
    for key, value in fields.items():
        if key not in allowed or value is None:
            continue
        if key == "priority" and value not in PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {value}")
        setattr(job, key, value)
    db.flush()
    return job


def change_status(db: Session, job: ServiceJob, status: str, *, actor: Optional[str] = None, note: Optional[str] = None) -> ServiceJob:
    _set_status(db, job, status, actor=actor, note=note)
    db.flush()
    return job


def start_diagnosis(db: Session, job: ServiceJob, *, actor: Optional[str] = None) -> ServiceJob:
    if job.status not in {"received", "on_hold"}:
        raise HTTPException(status_code=400, detail="Diagnosis can only start from a received job")
    _set_status(db, job, "diagnosis", actor=actor, note="Diagnosis started")
    db.flush()
    return job


def record_diagnosis(
    db: Session,
    job: ServiceJob,
    *,
    diagnosis: str,
    found_problems: Optional[str] = None,
    recommended_action: Optional[str] = None,
    estimated_cost: Decimal = ZERO,
    estimated_hours: Decimal = ZERO,
    actor: Optional[str] = None,
) -> ServiceJob:
    if job.status not in {"received", "diagnosis", "on_hold"}:
        raise HTTPException(status_code=400, detail="Diagnosis can only be recorded on a received job")
    if not diagnosis.strip():
        raise HTTPException(status_code=400, detail="Diagnosis notes are required")
    job.diagnosis = diagnosis.strip()
    job.found_problems = found_problems
    job.recommended_action = recommended_action
    job.estimated_cost = estimated_cost
    job.estimated_hours = estimated_hours
    job.diagnosis_status = "completed"
    chargeable = job.service_type != "warranty_repair" and estimated_cost > 0
    if chargeable:
        job.approval_status = "pending"
        _set_status(db, job, "waiting_approval", actor=actor, note="Diagnosis complete — waiting for customer approval")
    else:
        job.approval_status = "not_required"
        _set_status(db, job, "approved", actor=actor, note="Diagnosis complete")
    db.flush()
    return job


def approve_job(db: Session, job: ServiceJob, *, actor: Optional[str] = None, note: Optional[str] = None) -> ServiceJob:
    if job.status != "waiting_approval":
        raise HTTPException(status_code=400, detail="This job is not waiting for approval")
    job.approval_status = "approved"
    job.approval_note = note
    job.approved_at = datetime.utcnow()
    _set_status(db, job, "approved", actor=actor, note=note or "Customer approved")
    db.flush()
    return job


def reject_job(db: Session, job: ServiceJob, *, actor: Optional[str] = None, note: Optional[str] = None) -> ServiceJob:
    if job.status != "waiting_approval":
        raise HTTPException(status_code=400, detail="This job is not waiting for approval")
    job.approval_status = "rejected"
    job.approval_note = note
    _set_status(db, job, "rejected", actor=actor, note=note or "Customer rejected")
    db.flush()
    return job


def start_work(db: Session, job: ServiceJob, *, actor: Optional[str] = None) -> ServiceJob:
    if job.status not in {"approved", "received", "diagnosis"}:
        raise HTTPException(status_code=400, detail="Work can only start after approval (or on a simple received job)")
    _set_status(db, job, "in_progress", actor=actor, note="Work started")
    db.flush()
    return job


def add_line(db: Session, job: ServiceJob, intake: LineIntake, *, actor: Optional[str] = None) -> ServiceJobLine:
    if job.status in {"completed", "cancelled", "rejected"}:
        raise HTTPException(status_code=400, detail="Cannot add lines to a closed job")
    if intake.kind not in LINE_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid line kind: {intake.kind}")
    if intake.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    if not intake.name.strip():
        raise HTTPException(status_code=400, detail="Line name is required")

    item = None
    sku = intake.sku
    name = intake.name.strip()
    warehouse_id = intake.warehouse_id or job.warehouse_id
    if intake.item_id:
        item = db.get(Item, intake.item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
        sku = sku or item.sku
        name = name or item.name
        if intake.kind == "part" and item.item_type != "physical":
            raise HTTPException(status_code=400, detail="Parts must be physical inventory items")
        if intake.kind == "service" and item.item_type not in {"service", "digital"}:
            raise HTTPException(status_code=400, detail="Service lines must use a service item")

    price = intake.unit_price
    if price == ZERO and item is not None and intake.kind == "service":
        from app.models.service_item import ServiceItem

        ext = db.query(ServiceItem).filter(ServiceItem.item_id == item.id).first()
        if ext is not None:
            price = ext.rate or ZERO

    line = ServiceJobLine(
        job_id=job.id,
        kind=intake.kind,
        item_id=intake.item_id,
        sku=sku or "",
        name=name,
        quantity=intake.quantity,
        unit=intake.unit,
        unit_price=price,
        discount=intake.discount,
        tax_rate=intake.tax_rate,
        line_total=_line_total(intake.quantity, price, intake.discount, intake.tax_rate),
        warehouse_id=warehouse_id,
        notes=intake.notes,
        sort_order=len(job.lines),
    )
    db.add(line)
    db.flush()

    if intake.kind == "part":
        if not line.item_id:
            raise HTTPException(status_code=400, detail="Inventory parts require an item")
        if not warehouse_id:
            raise HTTPException(status_code=400, detail="Choose a warehouse before using inventory parts")
        _consume_part(db, job, line, actor=actor)
        line.stock_moved = True

    db.refresh(job)
    _recalc(job)
    _record(db, job, job.status, job.status, actor, f"Added {intake.kind}: {name}")
    db.flush()
    return line


def _consume_part(db: Session, job: ServiceJob, line: ServiceJobLine, *, actor: Optional[str] = None) -> None:
    from app.services.inventory.constants import MOVEMENT_SERVICE_CONSUMPTION
    from app.services.inventory.stock_movement_service import MovementInput, StockMovementService

    StockMovementService(db).apply_movement(
        MovementInput(
            item_id=line.item_id or "",
            warehouse_id=line.warehouse_id or "",
            movement_type=MOVEMENT_SERVICE_CONSUMPTION,
            quantity=line.quantity,
            company_id=job.company_id,
            source_type="service_job",
            source_id=job.id,
            source_line_id=line.id,
            reference=job.job_number,
            notes=f"Part used on {job.job_number}",
            created_by=actor,
        )
    )


def remove_line(db: Session, job: ServiceJob, line_id: str) -> ServiceJob:
    if job.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot remove lines from a closed job")
    line = db.get(ServiceJobLine, line_id)
    if line is None or line.job_id != job.id:
        raise HTTPException(status_code=404, detail="Line not found")
    if line.stock_moved:
        raise HTTPException(status_code=400, detail="Stock already moved for this part — reverse via inventory adjustment")
    db.delete(line)
    db.flush()
    db.refresh(job)
    _recalc(job)
    db.flush()
    return job


def complete_work(db: Session, job: ServiceJob, *, actor: Optional[str] = None) -> ServiceJob:
    if job.status not in {"in_progress", "waiting_parts"}:
        raise HTTPException(status_code=400, detail="Complete work from an in-progress job")
    job.qc_status = "pending"
    _set_status(db, job, "ready_for_qc", actor=actor, note="Work completed — ready for QC")
    db.flush()
    return job


def record_qc(
    db: Session,
    job: ServiceJob,
    *,
    result: str,
    notes: Optional[str] = None,
    checked_by: Optional[str] = None,
    actor: Optional[str] = None,
) -> ServiceJob:
    if job.status != "ready_for_qc":
        raise HTTPException(status_code=400, detail="QC can only run when the job is ready for QC")
    if result not in {"passed", "failed"}:
        raise HTTPException(status_code=400, detail="QC result must be passed or failed")
    job.qc_status = result
    job.qc_notes = notes
    job.qc_checked_by = checked_by or actor
    job.qc_checked_at = datetime.utcnow()
    if result == "failed":
        _set_status(db, job, "in_progress", actor=actor, note=notes or "QC failed")
    else:
        _set_status(db, job, "ready_for_delivery", actor=actor, note=notes or "QC passed")
    db.flush()
    return job


def deliver_job(
    db: Session,
    job: ServiceJob,
    *,
    delivered_by: Optional[str] = None,
    received_by_name: Optional[str] = None,
    notes: Optional[str] = None,
    actor: Optional[str] = None,
) -> ServiceJob:
    if job.status != "ready_for_delivery":
        raise HTTPException(status_code=400, detail="Deliver from ready-for-delivery")
    job.delivered_at = datetime.utcnow()
    job.delivered_by = delivered_by
    job.received_by_name = received_by_name
    return complete_job(db, job, actor=actor, note=notes or "Delivered")


def complete_job(db: Session, job: ServiceJob, *, actor: Optional[str] = None, note: Optional[str] = None) -> ServiceJob:
    if job.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled jobs cannot be completed")
    if job.qc_status == "failed":
        raise HTTPException(status_code=400, detail="QC failed — return to work before completing")
    if job.qc_status == "pending" and job.status != "ready_for_delivery":
        raise HTTPException(status_code=400, detail="QC must pass before this job can be completed")
    if job.status == "ready_for_qc":
        raise HTTPException(status_code=400, detail="QC must pass before this job can be completed")
    if job.status not in {"ready_for_delivery", "in_progress", "received", "approved", "completed"}:
        raise HTTPException(status_code=400, detail=f"Cannot complete a {job.status} job")
    if job.status != "completed":
        previous = job.status
        job.status = "completed"
        _record(db, job, previous, "completed", actor, note or "Job completed")
    job.completed_at = datetime.utcnow()
    db.flush()
    return job


def cancel_job(db: Session, job: ServiceJob, *, actor: Optional[str] = None, note: Optional[str] = None) -> ServiceJob:
    if job.status == "completed":
        raise HTTPException(status_code=400, detail="Completed jobs cannot be cancelled")
    _set_status(db, job, "cancelled", actor=actor, note=note or "Cancelled")
    db.flush()
    return job


def raise_bill(db: Session, job: ServiceJob, *, due_date: Optional[date] = None) -> FinanceReceivable:
    if job.bill_status == "billed":
        raise HTTPException(status_code=400, detail="This service job is already billed")
    if job.service_type == "warranty_repair" and not job.is_billable:
        raise HTTPException(status_code=400, detail="Warranty repair has no customer charge")
    _recalc(job)
    if not job.is_billable or job.total <= 0:
        raise HTTPException(status_code=400, detail="There is nothing to bill on this service job")
    if not job.customer_id:
        raise HTTPException(status_code=400, detail="Link a customer before billing")

    prefix = f"SJ-INV-{date.today().year}-"
    count = (
        db.query(func.count(FinanceReceivable.id))
        .filter(
            FinanceReceivable.company_id == job.company_id,
            FinanceReceivable.invoice_number.like(f"{prefix}%"),
        )
        .scalar()
        or 0
    )
    invoice_number = f"{prefix}{count + 1:04d}"
    receivable = FinanceReceivable(
        company_id=job.company_id,
        customer_id=job.customer_id,
        source_type="service_job",
        source_id=job.id,
        invoice_number=invoice_number,
        amount=job.total,
        amount_paid=ZERO,
        balance=job.total,
        tax_amount=_tax_total(job),
        due_date=due_date,
        status="open",
        posting_status="pending",
    )
    db.add(receivable)
    db.flush()
    job.bill_status = "billed"
    job.receivable_id = receivable.id
    job.invoice_number = invoice_number
    _record(db, job, job.status, job.status, None, f"Invoice {invoice_number}")
    if job.qc_status == "not_required" and job.status == "received":
        complete_job(db, job, note=f"Direct service invoiced as {invoice_number}")
    db.flush()

    from app.services.finance.finance_service import FinanceService

    FinanceService(db).try_post(
        lambda: FinanceService(db).record_service_invoice(job.id),
        source_type="service_job",
        source_id=job.id,
        company_id=job.company_id,
    )
    db.refresh(receivable)
    return receivable


def catalog_search(db: Session, query: str, *, company_id: str = "default", limit: int = 30) -> list[dict]:
    q = (query or "").strip()
    rows = db.query(Item).filter(Item.company_id == company_id, Item.status == "active")
    if q:
        like = f"%{q}%"
        rows = rows.filter(or_(Item.name.ilike(like), Item.sku.ilike(like)))
    rows = (
        rows.filter(Item.item_type.in_(("service", "physical")))
        .order_by(Item.name.asc())
        .limit(limit)
        .all()
    )
    from app.models.service_item import ServiceItem

    out = []
    for item in rows:
        rate = ZERO
        unit = "pcs" if item.item_type == "physical" else "job"
        if item.item_type == "service":
            ext = db.query(ServiceItem).filter(ServiceItem.item_id == item.id).first()
            if ext is not None:
                rate = ext.rate or ZERO
                unit = ext.unit_type or "job"
        out.append(
            {
                "id": item.id,
                "sku": item.sku,
                "name": item.name,
                "item_type": item.item_type,
                "kind": "part" if item.item_type == "physical" else "service",
                "rate": rate,
                "unit": unit,
            }
        )
    return out


def dashboard(db: Session, company_id: str) -> dict:
    rows = db.query(ServiceJob).filter(ServiceJob.company_id == company_id).all()
    today = date.today()
    breakdown: dict[str, int] = {}
    overdue = 0
    for row in rows:
        breakdown[row.status] = breakdown.get(row.status, 0) + 1
        if row.expected_at and row.status not in {"completed", "cancelled"} and row.expected_at.date() < today:
            overdue += 1
    billed = sum((row.total for row in rows if row.bill_status == "billed"), ZERO)
    return {
        "total": len(rows),
        "today": sum(1 for row in rows if row.created_at.date() == today),
        "overdue": overdue,
        "open": sum(1 for row in rows if row.status not in {"completed", "cancelled", "rejected"}),
        "completed": breakdown.get("completed", 0),
        "billed_amount": billed,
        "status_breakdown": breakdown,
    }


def reports(db: Session, company_id: str) -> dict:
    rows = (
        db.query(ServiceJob)
        .options(selectinload(ServiceJob.lines))
        .filter(ServiceJob.company_id == company_id)
        .all()
    )
    by_type: dict[str, int] = {}
    by_warranty: dict[str, int] = {}
    technician: dict[str, dict] = {}
    durations: list[float] = []
    parts_used: dict[str, int] = {}
    services_used: dict[str, int] = {}
    revenue = ZERO
    for row in rows:
        by_type[row.service_type] = by_type.get(row.service_type, 0) + 1
        by_warranty[row.warranty_status] = by_warranty.get(row.warranty_status, 0) + 1
        if row.bill_status == "billed":
            revenue += row.total
        name = row.technician_name or "Unassigned"
        bucket = technician.setdefault(name, {"assigned": 0, "completed": 0})
        bucket["assigned"] += 1
        if row.status == "completed":
            bucket["completed"] += 1
            if row.completed_at and row.created_at:
                durations.append((row.completed_at - row.created_at).total_seconds() / 86400)
        for line in row.lines:
            key = line.sku or line.name
            if line.kind == "part":
                parts_used[key] = parts_used.get(key, 0) + line.quantity
            else:
                services_used[key] = services_used.get(key, 0) + line.quantity
    avg_days = round(sum(durations) / len(durations), 1) if durations else 0
    top_parts = sorted(parts_used.items(), key=lambda kv: kv[1], reverse=True)[:10]
    top_services = sorted(services_used.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return {
        "total": len(rows),
        "completed": sum(1 for row in rows if row.status == "completed"),
        "pending": sum(1 for row in rows if row.status not in {"completed", "cancelled", "rejected"}),
        "revenue": revenue,
        "avg_repair_days": avg_days,
        "by_type": by_type,
        "by_warranty": by_warranty,
        "by_technician": technician,
        "top_parts": [{"sku": k, "count": v} for k, v in top_parts],
        "top_services": [{"name": k, "count": v} for k, v in top_services],
        "rma_linked": sum(1 for row in rows if row.rma_id),
        "external": sum(1 for row in rows if not row.rma_id),
        "warranty_jobs": sum(1 for row in rows if row.service_type == "warranty_repair"),
        "paid_jobs": sum(1 for row in rows if row.service_type in {"paid_repair", "direct"}),
    }
