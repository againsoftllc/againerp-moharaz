"""Storefront SSLCommerz Hosted Checkout — create session + success/fail/IPN."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_optional_storefront_customer,
)
from app.models.commerce_customer import dump_json, load_json
from app.models.commerce_order import CommerceOrder
from app.models.finance import FinancePayment, FinanceReceivable
from app.models.sslcommerz_plugin import SslcommerzPayment, SslcommerzPlugin
from app.services.sslcommerz_client import (
    SslcommerzError,
    credentials_complete,
    init_payment,
    uuid_short,
    validate_payment,
)

router = APIRouter(prefix="/payments/sslcommerz", tags=["storefront-payments-sslcommerz"])

PLUGIN_ID = "sslcommerz-default"
GUEST_PAY_WINDOW = timedelta(hours=24)


class SslcommerzCreateRequest(BaseModel):
    order_id: str


class SslcommerzCreateRead(BaseModel):
    tran_id: str
    gateway_url: str
    amount: str
    order_number: str


class SslcommerzCreateResponse(BaseModel):
    data: SslcommerzCreateRead


def _active_plugin(db: Session) -> SslcommerzPlugin:
    row = db.get(SslcommerzPlugin, PLUGIN_ID)
    if not row or not row.installed or not row.enabled or not row.checkout_enabled:
        raise HTTPException(status_code=400, detail="SSLCommerz payment is not enabled")
    if not credentials_complete(row):
        raise HTTPException(status_code=400, detail="SSLCommerz store credentials are not configured")
    return row


def _api_base(request: Request) -> str:
    settings = get_settings()
    configured = settings.public_api_base_url.strip()
    if configured:
        return configured.rstrip("/")
    base = str(request.base_url).rstrip("/")
    # Behind Railway's proxy uvicorn sees plain http; SSLCommerz must post back to https, since a redirect
    # from http would turn its POST into a GET.
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    if proto == "https" and base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return base


def _result_redirect(order_number: str, status: str, message: str = "") -> RedirectResponse:
    settings = get_settings()
    base = settings.storefront_public_url.strip().rstrip("/")
    url = f"{base}/payment/sslcommerz/result?order={quote(order_number)}&status={quote(status)}"
    if message:
        url += f"&message={quote(message[:200])}"
    return RedirectResponse(url=url, status_code=303)


def _mark_order_paid(db: Session, order: CommerceOrder, *, trx_id: str, amount: Decimal) -> None:
    now = datetime.utcnow()
    order.payment_status = "paid"
    order.paid_amount = amount
    order.due_amount = max(order.grand_total - amount, Decimal("0"))

    timeline = load_json(order.payment_timeline_json, [])
    timeline.append(
        {
            "id": f"pay_{uuid.uuid4().hex[:8]}",
            "status": "paid",
            "method": "sslcommerz",
            "amount": str(amount),
            "trx_id": trx_id,
            "at": now.isoformat(),
        },
    )
    order.payment_timeline_json = dump_json(timeline)

    events = load_json(order.timeline_json, [])
    events.append(
        {
            "id": f"evt_{uuid.uuid4().hex[:8]}",
            "type": "payment",
            "label": f"SSLCommerz payment received (Trx {trx_id})",
            "at": now.isoformat(),
            "source": "sslcommerz_gateway",
        },
    )
    order.timeline_json = dump_json(events)

    if order.payment_id:
        payment = db.get(FinancePayment, order.payment_id)
        if payment:
            payment.amount = amount
            payment.reference = trx_id or payment.reference
            payment.notes = json.dumps(
                {
                    "status": "paid",
                    "provider": "sslcommerz",
                    "trx_id": trx_id,
                    "paid_at": now.isoformat(),
                },
            )

    receivable = (
        db.query(FinanceReceivable)
        .filter(
            FinanceReceivable.source_type == "commerce_order",
            FinanceReceivable.source_id == order.id,
        )
        .first()
    )
    if receivable:
        receivable.amount_paid = amount
        receivable.balance = max(receivable.amount - amount, Decimal("0"))
        receivable.status = "paid" if receivable.balance <= 0 else "partial"

    db.commit()


def _finalize_success(
    db: Session,
    row: SslcommerzPayment,
    order: CommerceOrder | None,
    *,
    val_id: str,
    bank_tran_id: str,
    raw: Dict[str, Any],
) -> None:
    row.status = "success"
    row.val_id = val_id
    row.bank_tran_id = bank_tran_id
    row.raw_result_json = json.dumps(raw)
    if order and order.payment_status != "paid":
        _mark_order_paid(db, order, trx_id=bank_tran_id or val_id, amount=row.amount)
    else:
        db.commit()


@router.post("/create", response_model=SslcommerzCreateResponse)
def create_sslcommerz_payment(
    payload: SslcommerzCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Optional[CustomerAuthContext] = Depends(get_optional_storefront_customer),
) -> SslcommerzCreateResponse:
    """Signed-in shoppers pay their own orders. Guests pay the order they just placed: its id is only in
    the checkout response, and only within GUEST_PAY_WINDOW of placing it."""
    customer = ctx[2] if ctx else None
    plugin = _active_plugin(db)

    order = db.get(CommerceOrder, payload.order_id.strip())
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if customer is not None and order.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if customer is None and (order.created_at is None or datetime.utcnow() - order.created_at > GUEST_PAY_WINDOW):
        raise HTTPException(status_code=403, detail="Sign in to pay for this order")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")
    if order.grand_total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    base = _api_base(request)
    prefix = f"{base}/api/v1/storefront/payments/sslcommerz"
    tran_id = f"SC{uuid_short()}"

    try:
        body = init_payment(
            plugin,
            amount=order.grand_total,
            tran_id=tran_id,
            success_url=f"{prefix}/success",
            fail_url=f"{prefix}/fail",
            cancel_url=f"{prefix}/cancel",
            ipn_url=f"{prefix}/ipn",
            customer_name=order.customer_name or (customer.name if customer else "") or "Customer",
            customer_email=order.customer_email or (customer.email if customer else "") or "customer@example.com",
            customer_phone=order.customer_phone or (customer.phone if customer else "") or "01700000000",
            customer_address=order.billing_address or "Dhaka",
            customer_city=order.billing_city or "Dhaka",
            product_name=order.order_number,
        )
    except SslcommerzError as exc:
        raise HTTPException(status_code=502, detail=f"SSLCommerz: {exc}") from exc

    row = SslcommerzPayment(
        tran_id=tran_id,
        session_key=str(body.get("sessionkey") or ""),
        order_id=order.id,
        order_number=order.order_number,
        amount=order.grand_total,
        environment=plugin.environment,
        status="created",
        gateway_url=str(body.get("GatewayPageURL") or ""),
        raw_result_json=json.dumps(body),
    )
    db.add(row)
    db.commit()

    return SslcommerzCreateResponse(
        data=SslcommerzCreateRead(
            tran_id=row.tran_id,
            gateway_url=row.gateway_url,
            amount=str(order.grand_total),
            order_number=order.order_number,
        ),
    )


def _handle_return(
    db: Session,
    *,
    tran_id: str,
    val_id: str,
    status: str,
    bank_tran_id: str = "",
    amount: str = "",
    raw_extra: Dict[str, Any] | None = None,
) -> RedirectResponse:
    row = (
        db.query(SslcommerzPayment).filter(SslcommerzPayment.tran_id == tran_id.strip()).first()
        if tran_id.strip()
        else None
    )
    if not row:
        return _result_redirect("", "failed", "Unknown SSLCommerz payment reference")

    order = db.get(CommerceOrder, row.order_id)
    order_number = row.order_number or (order.order_number if order else "")

    if row.status == "success":
        return _result_redirect(order_number, "success")

    status_u = (status or "").upper()
    if status_u in {"FAILED", "CANCELLED", "UNATTEMPTED", "EXPIRED"} or not val_id:
        row.status = "cancelled" if "CANCEL" in status_u else "failed"
        row.raw_result_json = json.dumps(raw_extra or {"status": status})
        db.commit()
        return _result_redirect(
            order_number,
            "cancelled" if row.status == "cancelled" else "failed",
            "Payment was cancelled" if row.status == "cancelled" else "Payment failed at SSLCommerz",
        )

    plugin = db.get(SslcommerzPlugin, PLUGIN_ID)
    if not plugin:
        return _result_redirect(order_number, "failed", "SSLCommerz plugin missing")

    try:
        validated = validate_payment(plugin, val_id)
    except SslcommerzError as exc:
        row.status = "error"
        row.raw_result_json = json.dumps({"error": str(exc), **(raw_extra or {})})
        db.commit()
        return _result_redirect(order_number, "failed", str(exc))

    v_status = str(validated.get("status") or "").upper()
    # VALID / VALIDATED = success; INVALID / FAILED = reject
    if v_status not in {"VALID", "VALIDATED"}:
        row.status = "failed"
        row.raw_result_json = json.dumps(validated)
        db.commit()
        return _result_redirect(
            order_number,
            "failed",
            str(validated.get("error") or validated.get("status") or "Validation failed"),
        )

    # Amount check — reject if gateway amount differs
    try:
        paid = Decimal(str(validated.get("amount") or amount or "0"))
    except Exception:
        paid = Decimal("0")
    if paid != row.amount:
        row.status = "error"
        row.raw_result_json = json.dumps(validated)
        db.commit()
        return _result_redirect(order_number, "failed", "Paid amount mismatch")

    bank = str(validated.get("bank_tran_id") or bank_tran_id or "")
    _finalize_success(db, row, order, val_id=val_id, bank_tran_id=bank, raw=validated)
    return _result_redirect(order_number, "success")


@router.post("/success")
async def sslcommerz_success(
    request: Request,
    db: Session = Depends(get_db),
    tran_id: str = Form(default=""),
    val_id: str = Form(default=""),
    status: str = Form(default=""),
    bank_tran_id: str = Form(default=""),
    amount: str = Form(default=""),
) -> RedirectResponse:
    form = dict(await request.form())
    return _handle_return(
        db,
        tran_id=tran_id or str(form.get("tran_id") or ""),
        val_id=val_id or str(form.get("val_id") or ""),
        status=status or str(form.get("status") or ""),
        bank_tran_id=bank_tran_id or str(form.get("bank_tran_id") or ""),
        amount=amount or str(form.get("amount") or ""),
        raw_extra=form,
    )


@router.post("/fail")
async def sslcommerz_fail(
    request: Request,
    db: Session = Depends(get_db),
    tran_id: str = Form(default=""),
    status: str = Form(default=""),
) -> RedirectResponse:
    form = dict(await request.form())
    tid = tran_id or str(form.get("tran_id") or "")
    row = db.query(SslcommerzPayment).filter(SslcommerzPayment.tran_id == tid).first() if tid else None
    if row and row.status != "success":
        row.status = "failed"
        row.raw_result_json = json.dumps(form)
        db.commit()
    order_number = row.order_number if row else ""
    return _result_redirect(order_number, "failed", "Payment failed at SSLCommerz")


@router.post("/cancel")
async def sslcommerz_cancel(
    request: Request,
    db: Session = Depends(get_db),
    tran_id: str = Form(default=""),
) -> RedirectResponse:
    form = dict(await request.form())
    tid = tran_id or str(form.get("tran_id") or "")
    row = db.query(SslcommerzPayment).filter(SslcommerzPayment.tran_id == tid).first() if tid else None
    if row and row.status != "success":
        row.status = "cancelled"
        row.raw_result_json = json.dumps(form)
        db.commit()
    order_number = row.order_number if row else ""
    return _result_redirect(order_number, "cancelled", "Payment was cancelled")


@router.post("/ipn")
async def sslcommerz_ipn(
    request: Request,
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    """Server-to-server notification — validate and mark paid if still pending."""
    form = dict(await request.form())
    tran_id = str(form.get("tran_id") or "")
    val_id = str(form.get("val_id") or "")
    status = str(form.get("status") or "")
    bank_tran_id = str(form.get("bank_tran_id") or "")

    row = (
        db.query(SslcommerzPayment).filter(SslcommerzPayment.tran_id == tran_id).first()
        if tran_id
        else None
    )
    if not row:
        return PlainTextResponse("INVALID", status_code=400)
    if row.status == "success":
        return PlainTextResponse("OK")

    if str(status).upper() != "VALID" or not val_id:
        row.status = "failed"
        row.raw_result_json = json.dumps(form)
        db.commit()
        return PlainTextResponse("FAILED")

    plugin = db.get(SslcommerzPlugin, PLUGIN_ID)
    if not plugin:
        return PlainTextResponse("NO_PLUGIN", status_code=500)

    try:
        validated = validate_payment(plugin, val_id)
    except SslcommerzError:
        return PlainTextResponse("VALIDATE_ERROR", status_code=502)

    if str(validated.get("status") or "").upper() not in {"VALID", "VALIDATED"}:
        row.status = "failed"
        row.raw_result_json = json.dumps(validated)
        db.commit()
        return PlainTextResponse("INVALID")

    order = db.get(CommerceOrder, row.order_id)
    _finalize_success(
        db,
        row,
        order,
        val_id=val_id,
        bank_tran_id=str(validated.get("bank_tran_id") or bank_tran_id),
        raw=validated,
    )
    return PlainTextResponse("OK")
