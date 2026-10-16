from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.crm import CrmProject
from app.models.finance import FinanceReceivable
from app.models.sales import SalesInvoice
from app.schemas.sales_invoice import (
    SalesInvoiceCreate,
    SalesInvoiceLineCreate,
    SalesInvoiceLineRead,
    SalesInvoiceListMeta,
    SalesInvoiceListResponse,
    SalesInvoicePaymentCreate,
    SalesInvoicePaymentListResponse,
    SalesInvoicePaymentRead,
    SalesInvoiceRead,
    SalesInvoiceResponse,
    SalesInvoiceUpdate,
)
from app.services.finance.finance_service import FinanceService
from app.services.sales.invoice_service import InvoiceLineInput, InvoiceService
from modules.sales.permissions.permissions import require_sales_write

router = APIRouter(prefix="/sales/invoices", tags=["sales"])


def _line_inputs(lines: list[SalesInvoiceLineCreate]) -> list[InvoiceLineInput]:
    return [
        InvoiceLineInput(
            item_id=line.item_id,
            name=line.name,
            description=line.description,
            quantity=line.quantity,
            unit_type=line.unit_type,
            rate=line.rate,
            taxable=line.taxable,
        )
        for line in lines
    ]


def _invoice_read(
    db: Session,
    invoice: SalesInvoice,
    *,
    customer_name: Optional[str] = None,
    project_name: Optional[str] = None,
    receivable: Optional[FinanceReceivable] = None,
) -> SalesInvoiceRead:
    lines = InvoiceService(db).get_lines(invoice.id)
    return SalesInvoiceRead(
        id=invoice.id,
        company_id=invoice.company_id,
        invoice_number=invoice.invoice_number,
        customer_id=invoice.customer_id,
        customer_name=customer_name,
        project_id=invoice.project_id,
        project_name=project_name,
        status=invoice.status,
        bill_date=invoice.bill_date,
        due_date=invoice.due_date,
        tax_rate=invoice.tax_rate,
        second_tax_rate=invoice.second_tax_rate,
        tds_rate=invoice.tds_rate,
        is_recurring=invoice.is_recurring,
        notes=invoice.notes,
        subtotal=invoice.subtotal,
        tax_total=invoice.tax_total,
        tds_total=invoice.tds_total,
        total=invoice.total,
        amount_paid=receivable.amount_paid if receivable else Decimal("0"),
        balance=receivable.balance if receivable else invoice.total,
        last_email_sent_at=invoice.last_email_sent_at,
        sent_at=invoice.sent_at,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        lines=[SalesInvoiceLineRead.model_validate(line) for line in lines],
    )


def _names_and_receivables(db: Session, invoices: list[SalesInvoice], company_id: str):
    customer_ids = {i.customer_id for i in invoices}
    project_ids = {i.project_id for i in invoices if i.project_id}
    invoice_ids = [i.id for i in invoices]
    customers = {
        c.id: c.name
        for c in db.query(CommerceCustomer).filter(CommerceCustomer.id.in_(customer_ids)).all()
    } if customer_ids else {}
    projects = {
        p.id: p.name for p in db.query(CrmProject).filter(CrmProject.id.in_(project_ids)).all()
    } if project_ids else {}
    receivables = {
        r.source_id: r
        for r in db.query(FinanceReceivable)
        .filter(
            FinanceReceivable.company_id == company_id,
            FinanceReceivable.source_type == "sales_invoice",
            FinanceReceivable.source_id.in_(invoice_ids),
        )
        .all()
    } if invoice_ids else {}
    return customers, projects, receivables


@router.get("", response_model=SalesInvoiceListResponse)
def list_invoices(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> SalesInvoiceListResponse:
    svc = InvoiceService(db)
    offset = (page - 1) * per_page
    rows, total = svc.list_invoices(
        company_id=company_id,
        status=status,
        customer_id=customer_id,
        project_id=project_id,
        search=search,
        limit=per_page,
        offset=offset,
    )
    customers, projects, receivables = _names_and_receivables(db, rows, company_id)
    return SalesInvoiceListResponse(
        data=[
            _invoice_read(
                db,
                r,
                customer_name=customers.get(r.customer_id),
                project_name=projects.get(r.project_id) if r.project_id else None,
                receivable=receivables.get(r.id),
            )
            for r in rows
        ],
        meta=SalesInvoiceListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("", response_model=SalesInvoiceResponse, status_code=201)
def create_invoice(
    payload: SalesInvoiceCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoiceResponse:
    require_sales_write(user)
    svc = InvoiceService(db)
    invoice = svc.create_invoice(
        company_id=company_id,
        customer_id=payload.customer_id,
        project_id=payload.project_id,
        bill_date=payload.bill_date,
        due_date=payload.due_date,
        tax_rate=payload.tax_rate,
        second_tax_rate=payload.second_tax_rate,
        tds_rate=payload.tds_rate,
        is_recurring=payload.is_recurring,
        notes=payload.notes,
        created_by=user.id,
        lines=_line_inputs(payload.lines),
    )
    receivable = FinanceService(db).record_invoice_receivable(invoice)
    db.commit()
    db.refresh(invoice)
    customer = db.get(CommerceCustomer, invoice.customer_id)
    project = db.get(CrmProject, invoice.project_id) if invoice.project_id else None
    return SalesInvoiceResponse(
        data=_invoice_read(
            db,
            invoice,
            customer_name=customer.name if customer else None,
            project_name=project.name if project else None,
            receivable=receivable,
        )
    )


@router.get("/{invoice_id}", response_model=SalesInvoiceResponse)
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoiceResponse:
    svc = InvoiceService(db)
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    customer = db.get(CommerceCustomer, invoice.customer_id)
    project = db.get(CrmProject, invoice.project_id) if invoice.project_id else None
    receivable = (
        db.query(FinanceReceivable)
        .filter(
            FinanceReceivable.company_id == company_id,
            FinanceReceivable.source_type == "sales_invoice",
            FinanceReceivable.source_id == invoice.id,
        )
        .first()
    )
    return SalesInvoiceResponse(
        data=_invoice_read(
            db,
            invoice,
            customer_name=customer.name if customer else None,
            project_name=project.name if project else None,
            receivable=receivable,
        )
    )


@router.put("/{invoice_id}", response_model=SalesInvoiceResponse)
def update_invoice(
    invoice_id: str,
    payload: SalesInvoiceUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoiceResponse:
    require_sales_write(user)
    svc = InvoiceService(db)
    patch = payload.model_dump(exclude={"lines"}, exclude_unset=True)
    invoice = svc.update_invoice(
        invoice_id,
        company_id=company_id,
        updated_by=user.id,
        lines=_line_inputs(payload.lines) if payload.lines is not None else None,
        **patch,
    )
    receivable = FinanceService(db).record_invoice_receivable(invoice)
    db.commit()
    db.refresh(invoice)
    customer = db.get(CommerceCustomer, invoice.customer_id)
    project = db.get(CrmProject, invoice.project_id) if invoice.project_id else None
    return SalesInvoiceResponse(
        data=_invoice_read(
            db,
            invoice,
            customer_name=customer.name if customer else None,
            project_name=project.name if project else None,
            receivable=receivable,
        )
    )


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    require_sales_write(user)
    InvoiceService(db).delete_invoice(invoice_id, company_id=company_id)
    db.commit()


@router.post("/{invoice_id}/lines", response_model=SalesInvoiceLineRead, status_code=201)
def add_invoice_line(
    invoice_id: str,
    payload: SalesInvoiceLineCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoiceLineRead:
    require_sales_write(user)
    svc = InvoiceService(db)
    line = svc.add_line(
        invoice_id,
        company_id=company_id,
        data=InvoiceLineInput(
            item_id=payload.item_id,
            name=payload.name,
            description=payload.description,
            quantity=payload.quantity,
            unit_type=payload.unit_type,
            rate=payload.rate,
            taxable=payload.taxable,
        ),
    )
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    FinanceService(db).record_invoice_receivable(invoice)
    db.commit()
    db.refresh(line)
    return SalesInvoiceLineRead.model_validate(line)


@router.patch("/{invoice_id}/lines/{line_id}", response_model=SalesInvoiceLineRead)
def update_invoice_line(
    invoice_id: str,
    line_id: str,
    payload: SalesInvoiceLineCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoiceLineRead:
    require_sales_write(user)
    svc = InvoiceService(db)
    line = svc.update_line(
        invoice_id,
        line_id,
        company_id=company_id,
        data=InvoiceLineInput(
            item_id=payload.item_id,
            name=payload.name,
            description=payload.description,
            quantity=payload.quantity,
            unit_type=payload.unit_type,
            rate=payload.rate,
            taxable=payload.taxable,
        ),
    )
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    FinanceService(db).record_invoice_receivable(invoice)
    db.commit()
    db.refresh(line)
    return SalesInvoiceLineRead.model_validate(line)


@router.delete("/{invoice_id}/lines/{line_id}", status_code=204)
def delete_invoice_line(
    invoice_id: str,
    line_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    require_sales_write(user)
    svc = InvoiceService(db)
    svc.delete_line(invoice_id, line_id, company_id=company_id)
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    FinanceService(db).record_invoice_receivable(invoice)
    db.commit()


@router.get("/{invoice_id}/payments", response_model=SalesInvoicePaymentListResponse)
def list_invoice_payments(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoicePaymentListResponse:
    svc = InvoiceService(db)
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    payments = FinanceService(db).list_invoice_payments(invoice)
    return SalesInvoicePaymentListResponse(
        data=[SalesInvoicePaymentRead.model_validate(p) for p in payments]
    )


@router.post("/{invoice_id}/payments", response_model=SalesInvoicePaymentRead, status_code=201)
def add_invoice_payment(
    invoice_id: str,
    payload: SalesInvoicePaymentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesInvoicePaymentRead:
    require_sales_write(user)
    svc = InvoiceService(db)
    invoice = svc.get_invoice(invoice_id, company_id=company_id)
    _, payment = FinanceService(db).record_invoice_payment(
        invoice,
        amount=payload.amount,
        payment_account_id=payload.payment_account_id,
        payment_date=payload.payment_date,
        reference=payload.reference,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(payment)
    return SalesInvoicePaymentRead.model_validate(payment)
