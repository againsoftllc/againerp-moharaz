"""Workspace → Billing: the ERP's own bills (subscription / module / plugin) and the link customers pay them from.

Admin side (System Manager): list / create / cancel / mark paid, and the billing gateway credentials.
Public side: the pay link (`/pay/<token>` in the admin app) reads the bill, opens an SSLCommerz checkout and
comes back through the gateway callbacks below.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from typing import Any, Dict, Optional
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import get_current_company_id, require_system_manager
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.models.erp_billing import BILL_TYPES, ErpBill, ErpBillPayment, new_pay_token
from app.models.platform_setting import PlatformSetting
from app.services.sslcommerz_client import (
    SslcommerzError,
    credentials_complete,
    init_payment,
    uuid_short,
    validate_payment,
    verify_credentials,
)

router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(require_system_manager)])
public_router = APIRouter(prefix="/public/billing", tags=["public-billing"])

KEY_STORE_ID = "billing.sslcommerz.store_id"
KEY_STORE_PASSWORD = "billing.sslcommerz.store_password"
KEY_ENVIRONMENT = "billing.sslcommerz.environment"


# ----------------------------------------------------------------------------------------------- helpers


def _get_setting(db: Session, key: str) -> str:
    row = db.get(PlatformSetting, key)
    return (row.value or "") if row else ""


def _set_setting(db: Session, key: str, value: str, *, secret: bool = False) -> None:
    row = db.get(PlatformSetting, key)
    if row is None:
        db.add(PlatformSetting(key=key, value=value, is_secret=secret))
    else:
        row.value = value
        row.is_secret = secret


def _gateway(db: Session) -> SimpleNamespace:
    """The billing gateway credentials in the shape the SSLCommerz client expects."""
    return SimpleNamespace(
        store_id=_get_setting(db, KEY_STORE_ID),
        store_password=_get_setting(db, KEY_STORE_PASSWORD),
        environment=_get_setting(db, KEY_ENVIRONMENT) or "sandbox",
    )


def _next_bill_number(db: Session) -> str:
    year = datetime.utcnow().year
    count = db.query(func.count(ErpBill.id)).scalar() or 0
    while True:
        count += 1
        number = f"BILL-{year}-{count:04d}"
        if not db.query(ErpBill.id).filter(ErpBill.bill_number == number).first():
            return number


def _bill_to_dict(b: ErpBill) -> dict:
    overdue = b.status == "unpaid" and b.due_date is not None and b.due_date < date.today()
    return {
        "id": b.id,
        "bill_number": b.bill_number,
        "bill_type": b.bill_type,
        "title": b.title,
        "description": b.description,
        "reference": b.reference,
        "period_label": b.period_label,
        "amount": str(b.amount),
        "currency": b.currency,
        "status": b.status,
        "is_overdue": overdue,
        "due_date": b.due_date.isoformat() if b.due_date else None,
        "issued_at": b.issued_at.isoformat() if b.issued_at else None,
        "paid_at": b.paid_at.isoformat() if b.paid_at else None,
        "paid_method": b.paid_method,
        "paid_ref": b.paid_ref,
        "pay_token": b.pay_token,
    }


def _own_bill(db: Session, bill_id: str, company_id: str) -> ErpBill:
    bill = db.get(ErpBill, bill_id)
    if not bill or (bill.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill


def _money(raw: Any) -> Decimal:
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Amount must be a number")
    if value <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    return value.quantize(Decimal("0.01"))


# ----------------------------------------------------------------------------------------------- admin API


class BillCreate(BaseModel):
    bill_type: str = Field(pattern="^(subscription|module|plugin)$")
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    reference: Optional[str] = Field(default=None, max_length=100)
    period_label: Optional[str] = Field(default=None, max_length=100)
    amount: Decimal
    currency: str = Field(default="BDT", max_length=8)
    due_date: Optional[date] = None


class BillUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    reference: Optional[str] = Field(default=None, max_length=100)
    period_label: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[Decimal] = None
    due_date: Optional[date] = None


class MarkPaid(BaseModel):
    method: str = Field(default="manual", max_length=40)
    reference: Optional[str] = Field(default=None, max_length=120)


class GatewaySettingsUpdate(BaseModel):
    store_id: Optional[str] = Field(default=None, max_length=120)
    store_password: Optional[str] = Field(default=None, max_length=255)  # blank / omitted keeps the saved one
    environment: Optional[str] = Field(default=None, pattern="^(sandbox|production)$")


@router.get("/bills")
def list_bills(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    bill_type: Optional[str] = Query(default=None, pattern="^(subscription|module|plugin)$"),
    status: Optional[str] = Query(default=None, pattern="^(unpaid|paid|cancelled|overdue)$"),
    q: Optional[str] = Query(default=None, max_length=120),
) -> dict:
    query = db.query(ErpBill).filter(ErpBill.company_id == company_id)
    if bill_type:
        query = query.filter(ErpBill.bill_type == bill_type)
    if status == "overdue":
        query = query.filter(ErpBill.status == "unpaid", ErpBill.due_date < date.today())
    elif status:
        query = query.filter(ErpBill.status == status)
    for word in (q or "").split()[:5]:
        like = f"%{word}%"
        query = query.filter(
            ErpBill.title.ilike(like) | ErpBill.bill_number.ilike(like) | ErpBill.reference.ilike(like)
        )
    rows = query.order_by(ErpBill.issued_at.desc(), ErpBill.bill_number.desc()).limit(500).all()
    return {"data": [_bill_to_dict(b) for b in rows]}


@router.get("/summary")
def billing_summary(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    rows = db.query(ErpBill).filter(ErpBill.company_id == company_id).all()
    today = date.today()
    unpaid = [b for b in rows if b.status == "unpaid"]
    overdue = [b for b in unpaid if b.due_date and b.due_date < today]
    paid = [b for b in rows if b.status == "paid"]

    def total(items: list[ErpBill]) -> str:
        return str(sum((b.amount for b in items), Decimal("0")))

    return {
        "data": {
            "unpaid_count": len(unpaid),
            "unpaid_total": total(unpaid),
            "overdue_count": len(overdue),
            "overdue_total": total(overdue),
            "paid_count": len(paid),
            "paid_total": total(paid),
            "currency": "BDT",
        }
    }


@router.post("/bills", status_code=201)
def create_bill(
    payload: BillCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    bill = ErpBill(
        company_id=company_id,
        bill_number=_next_bill_number(db),
        bill_type=payload.bill_type,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        reference=(payload.reference or "").strip() or None,
        period_label=(payload.period_label or "").strip() or None,
        amount=_money(payload.amount),
        currency=(payload.currency or "BDT").strip().upper() or "BDT",
        due_date=payload.due_date,
        status="unpaid",
        pay_token=new_pay_token(),
        created_by=user.id,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return {"data": _bill_to_dict(bill)}


@router.patch("/bills/{bill_id}")
def update_bill(
    bill_id: str,
    payload: BillUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    bill = _own_bill(db, bill_id, company_id)
    if bill.status != "unpaid":
        raise HTTPException(status_code=400, detail=f"A {bill.status} bill cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"]:
        bill.title = data["title"].strip()
    for key in ("description", "reference", "period_label"):
        if key in data:
            setattr(bill, key, (data[key] or "").strip() or None)
    if "amount" in data and data["amount"] is not None:
        bill.amount = _money(data["amount"])
    if "due_date" in data:
        bill.due_date = data["due_date"]
    db.commit()
    db.refresh(bill)
    return {"data": _bill_to_dict(bill)}


@router.post("/bills/{bill_id}/cancel")
def cancel_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    bill = _own_bill(db, bill_id, company_id)
    if bill.status == "paid":
        raise HTTPException(status_code=400, detail="A paid bill cannot be cancelled")
    bill.status = "cancelled"
    db.commit()
    db.refresh(bill)
    return {"data": _bill_to_dict(bill)}


@router.post("/bills/{bill_id}/mark-paid")
def mark_bill_paid(
    bill_id: str,
    payload: MarkPaid,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    bill = _own_bill(db, bill_id, company_id)
    if bill.status == "cancelled":
        raise HTTPException(status_code=400, detail="A cancelled bill cannot be paid")
    if bill.status != "paid":
        bill.status = "paid"
        bill.paid_at = datetime.utcnow()
        bill.paid_method = (payload.method or "manual").strip() or "manual"
        bill.paid_ref = (payload.reference or "").strip() or None
    db.commit()
    db.refresh(bill)
    return {"data": _bill_to_dict(bill)}


@router.post("/bills/{bill_id}/new-link")
def regenerate_pay_link(
    bill_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """A new pay link — the old one stops working (when a link was shared by mistake)."""
    bill = _own_bill(db, bill_id, company_id)
    bill.pay_token = new_pay_token()
    db.commit()
    db.refresh(bill)
    return {"data": _bill_to_dict(bill)}


@router.get("/settings")
def get_gateway_settings(db: Session = Depends(get_db)) -> dict:
    gw = _gateway(db)
    return {
        "data": {
            "gateway": "sslcommerz",
            "store_id": gw.store_id,
            "store_password_set": bool(gw.store_password),
            "environment": gw.environment,
            "ready": credentials_complete(gw),
        }
    }


@router.put("/settings")
def update_gateway_settings(payload: GatewaySettingsUpdate, db: Session = Depends(get_db)) -> dict:
    if payload.store_id is not None:
        _set_setting(db, KEY_STORE_ID, payload.store_id.strip())
    if payload.store_password:  # blank keeps the saved password
        _set_setting(db, KEY_STORE_PASSWORD, payload.store_password.strip(), secret=True)
    if payload.environment:
        _set_setting(db, KEY_ENVIRONMENT, payload.environment)
    db.commit()
    return get_gateway_settings(db)


@router.post("/settings/verify")
def verify_gateway_settings(db: Session = Depends(get_db)) -> dict:
    result = verify_credentials(_gateway(db))  # type: ignore[arg-type]
    return {"data": {"status": result.status, "message": result.message}}


# ----------------------------------------------------------------------------------------------- public pay link


def _api_base(request: Request) -> str:
    configured = get_settings().public_api_base_url.strip()
    if configured:
        return configured.rstrip("/")
    base = str(request.base_url).rstrip("/")
    # Behind Railway's proxy uvicorn sees plain http; SSLCommerz must post back to https
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    if proto == "https" and base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return base


def _allowed_origin(origin: str) -> str:
    """Where the browser is sent back to: only an origin the admin app is served from (no open redirect)."""
    value = (origin or "").strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        allowed = [o.strip().rstrip("/") for o in get_settings().cors_origins.split(",") if o.strip()]
        try:
            from app.services.site_cors import get_site_cors_origins

            allowed += [o.rstrip("/") for o in get_site_cors_origins()]
        except Exception:
            pass
        if normalized in allowed:
            return normalized
    return ""


def _bill_by_token(db: Session, token: str) -> ErpBill:
    bill = db.query(ErpBill).filter(ErpBill.pay_token == token.strip()).first()
    if not bill:
        raise HTTPException(status_code=404, detail="This payment link is not valid")
    return bill


@public_router.get("/{token}")
def public_bill(token: str, db: Session = Depends(get_db)) -> dict:
    bill = _bill_by_token(db, token)
    company = db.get(Company, bill.company_id)
    data = _bill_to_dict(bill)
    data.pop("pay_token", None)
    data["company_name"] = company.name if company else ""
    data["gateway_ready"] = credentials_complete(_gateway(db))  # type: ignore[arg-type]
    return {"data": data}


class PayRequest(BaseModel):
    return_origin: str = ""


@public_router.post("/{token}/pay")
def start_payment(token: str, payload: PayRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    bill = _bill_by_token(db, token)
    if bill.status == "paid":
        raise HTTPException(status_code=400, detail="This bill is already paid")
    if bill.status == "cancelled":
        raise HTTPException(status_code=400, detail="This bill was cancelled")
    gw = _gateway(db)
    if not credentials_complete(gw):  # type: ignore[arg-type]
        raise HTTPException(status_code=400, detail="Online payment is not set up yet — please contact support")

    company = db.get(Company, bill.company_id)
    tran_id = f"BL{uuid_short()}"
    prefix = f"{_api_base(request)}/api/v1/public/billing/sslcommerz"
    try:
        body = init_payment(
            gw,  # type: ignore[arg-type]
            amount=bill.amount,
            tran_id=tran_id,
            success_url=f"{prefix}/success",
            fail_url=f"{prefix}/fail",
            cancel_url=f"{prefix}/cancel",
            ipn_url=f"{prefix}/ipn",
            customer_name=(company.name if company else "") or "Customer",
            customer_email=(company.email if company else "") or "customer@example.com",
            customer_phone=(company.phone if company else "") or "01700000000",
            product_name=bill.bill_number,
        )
    except SslcommerzError as exc:
        raise HTTPException(status_code=502, detail=f"SSLCommerz: {exc}") from exc

    db.add(
        ErpBillPayment(
            bill_id=bill.id,
            tran_id=tran_id,
            session_key=str(body.get("sessionkey") or ""),
            amount=bill.amount,
            status="created",
            gateway_url=str(body.get("GatewayPageURL") or ""),
            return_origin=_allowed_origin(payload.return_origin),
            raw_result_json=json.dumps(body),
        )
    )
    db.commit()
    return {"data": {"gateway_url": str(body.get("GatewayPageURL") or ""), "tran_id": tran_id}}


def _back_to_pay_page(payment: Optional[ErpBillPayment], bill: Optional[ErpBill], status: str, message: str = "") -> RedirectResponse:
    origin = (payment.return_origin if payment else "") or ""
    if not origin:
        origins = [o.strip().rstrip("/") for o in get_settings().cors_origins.split(",") if o.strip()]
        origin = origins[0] if origins else ""
    token = bill.pay_token if bill else "invalid"  # an unknown reference lands on the "link not valid" page
    url = f"{origin}/pay/{quote(token)}?status={quote(status)}"
    if message:
        url += f"&message={quote(message[:200])}"
    return RedirectResponse(url=url, status_code=303)


def _handle_return(
    db: Session,
    *,
    tran_id: str,
    val_id: str,
    status: str,
    amount: str = "",
    bank_tran_id: str = "",
    raw_extra: Optional[Dict[str, Any]] = None,
) -> RedirectResponse:
    payment = (
        db.query(ErpBillPayment).filter(ErpBillPayment.tran_id == tran_id.strip()).first()
        if tran_id.strip()
        else None
    )
    if not payment:
        return _back_to_pay_page(None, None, "failed", "Unknown payment reference")
    bill = db.get(ErpBill, payment.bill_id)
    if not bill:
        return _back_to_pay_page(payment, None, "failed", "Bill not found")
    if payment.status == "success" or bill.status == "paid":
        return _back_to_pay_page(payment, bill, "success")

    status_u = (status or "").upper()
    if status_u in {"FAILED", "CANCELLED", "UNATTEMPTED", "EXPIRED"} or not val_id:
        payment.status = "cancelled" if "CANCEL" in status_u else "failed"
        payment.raw_result_json = json.dumps(raw_extra or {"status": status})
        db.commit()
        return _back_to_pay_page(
            payment,
            bill,
            payment.status,
            "Payment was cancelled" if payment.status == "cancelled" else "Payment failed at SSLCommerz",
        )

    try:
        validated = validate_payment(_gateway(db), val_id)  # type: ignore[arg-type]
    except SslcommerzError as exc:
        payment.status = "error"
        payment.raw_result_json = json.dumps({"error": str(exc), **(raw_extra or {})})
        db.commit()
        return _back_to_pay_page(payment, bill, "failed", str(exc))

    if str(validated.get("status") or "").upper() not in {"VALID", "VALIDATED"}:
        payment.status = "failed"
        payment.raw_result_json = json.dumps(validated)
        db.commit()
        return _back_to_pay_page(payment, bill, "failed", str(validated.get("error") or "Validation failed"))

    try:
        paid = Decimal(str(validated.get("amount") or amount or "0"))
    except Exception:
        paid = Decimal("0")
    if paid != payment.amount:
        payment.status = "error"
        payment.raw_result_json = json.dumps(validated)
        db.commit()
        return _back_to_pay_page(payment, bill, "failed", "Paid amount mismatch")

    payment.status = "success"
    payment.val_id = val_id
    payment.bank_tran_id = str(validated.get("bank_tran_id") or bank_tran_id or "")
    payment.raw_result_json = json.dumps(validated)
    bill.status = "paid"
    bill.paid_at = datetime.utcnow()
    bill.paid_method = "sslcommerz"
    bill.paid_ref = payment.bank_tran_id or tran_id
    db.commit()
    return _back_to_pay_page(payment, bill, "success")


async def _return_from_form(request: Request, db: Session, default_status: str) -> RedirectResponse:
    form = {k: str(v) for k, v in (await request.form()).items()}
    return _handle_return(
        db,
        tran_id=form.get("tran_id", ""),
        val_id=form.get("val_id", ""),
        status=form.get("status", "") or default_status,
        amount=form.get("amount", ""),
        bank_tran_id=form.get("bank_tran_id", ""),
        raw_extra=form,
    )


@public_router.post("/sslcommerz/success")
async def sslcommerz_success(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    return await _return_from_form(request, db, "VALID")


@public_router.post("/sslcommerz/fail")
async def sslcommerz_fail(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    return await _return_from_form(request, db, "FAILED")


@public_router.post("/sslcommerz/cancel")
async def sslcommerz_cancel(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    return await _return_from_form(request, db, "CANCELLED")


@public_router.post("/sslcommerz/ipn")
async def sslcommerz_ipn(request: Request, db: Session = Depends(get_db)) -> dict:
    """Server-to-server notice: settles the bill even when the shopper never returns to the site."""
    await _return_from_form(request, db, "VALID")
    return {"ok": True}
