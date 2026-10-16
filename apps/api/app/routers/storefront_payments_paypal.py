"""Storefront PayPal Checkout — create order + return/cancel capture."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_current_storefront_customer,
)
from app.models.commerce_customer import dump_json, load_json
from app.models.commerce_order import CommerceOrder
from app.models.finance import FinancePayment, FinanceReceivable
from app.models.paypal_plugin import PaypalPayment, PaypalPlugin
from app.services.paypal_client import (
    PaypalError,
    approve_url_from_order,
    capture_id_from_body,
    capture_order,
    charge_amount_usd,
    create_order,
    credentials_complete,
    get_order,
    payer_email_from_body,
)

router = APIRouter(prefix="/payments/paypal", tags=["storefront-payments-paypal"])

PLUGIN_ID = "paypal-default"


class PaypalCreateRequest(BaseModel):
    order_id: str


class PaypalCreateRead(BaseModel):
    paypal_order_id: str
    approve_url: str
    amount: str
    currency: str
    order_number: str


class PaypalCreateResponse(BaseModel):
    data: PaypalCreateRead


def _active_plugin(db: Session) -> PaypalPlugin:
    row = db.get(PaypalPlugin, PLUGIN_ID)
    if not row or not row.installed or not row.enabled or not row.checkout_enabled:
        raise HTTPException(status_code=400, detail="PayPal payment is not enabled")
    if not credentials_complete(row):
        raise HTTPException(status_code=400, detail="PayPal credentials are not configured")
    return row


def _api_base(request: Request) -> str:
    settings = get_settings()
    configured = settings.public_api_base_url.strip()
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")


def _result_redirect(order_number: str, status: str, message: str = "") -> RedirectResponse:
    settings = get_settings()
    base = settings.storefront_public_url.strip().rstrip("/")
    url = f"{base}/payment/paypal/result?order={quote(order_number)}&status={quote(status)}"
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
            "method": "paypal",
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
            "label": f"PayPal payment received (Trx {trx_id})",
            "at": now.isoformat(),
            "source": "paypal_gateway",
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
                    "provider": "paypal",
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


@router.post("/create", response_model=PaypalCreateResponse)
def create_paypal_payment(
    payload: PaypalCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> PaypalCreateResponse:
    _session, _identity, customer = ctx
    plugin = _active_plugin(db)

    order = db.get(CommerceOrder, payload.order_id.strip())
    if not order or order.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")
    if order.grand_total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    currency = (plugin.currency or "USD").upper()
    charged = charge_amount_usd(plugin, order.grand_total)
    if charged < Decimal("0.01"):
        raise HTTPException(status_code=400, detail="Converted PayPal amount is too small")

    base = _api_base(request)
    prefix = f"{base}/api/v1/storefront/payments/paypal"
    return_url = f"{prefix}/return"
    cancel_url = f"{prefix}/cancel"

    try:
        body = create_order(
            db,
            plugin,
            amount=charged,
            currency=currency,
            invoice_id=order.order_number,
            description=f"Order {order.order_number}",
            return_url=return_url,
            cancel_url=cancel_url,
        )
    except PaypalError as exc:
        raise HTTPException(status_code=502, detail=f"PayPal: {exc}") from exc

    paypal_order_id = str(body["id"])
    approve = approve_url_from_order(body)
    if not approve:
        raise HTTPException(status_code=502, detail="PayPal did not return an approve URL")

    row = PaypalPayment(
        paypal_order_id=paypal_order_id,
        order_id=order.id,
        order_number=order.order_number,
        amount_bdt=order.grand_total,
        amount_charged=charged,
        currency=currency,
        environment=plugin.environment,
        status="created",
        approve_url=approve,
        raw_result_json=json.dumps(body),
    )
    db.add(row)
    db.commit()

    return PaypalCreateResponse(
        data=PaypalCreateRead(
            paypal_order_id=paypal_order_id,
            approve_url=approve,
            amount=str(charged),
            currency=currency,
            order_number=order.order_number,
        ),
    )


@router.get("/return")
def paypal_return(
    db: Session = Depends(get_db),
    token: str = Query(default=""),
    PayerID: str = Query(default=""),
) -> RedirectResponse:
    """Buyer approved on PayPal — capture the order."""
    paypal_order_id = token.strip()
    row = (
        db.query(PaypalPayment).filter(PaypalPayment.paypal_order_id == paypal_order_id).first()
        if paypal_order_id
        else None
    )
    if not row:
        return _result_redirect("", "failed", "Unknown PayPal payment reference")

    order = db.get(CommerceOrder, row.order_id)
    order_number = row.order_number or (order.order_number if order else "")

    if row.status == "success":
        return _result_redirect(order_number, "success")

    plugin = db.get(PaypalPlugin, PLUGIN_ID)
    if not plugin:
        return _result_redirect(order_number, "failed", "PayPal plugin missing")

    try:
        body = capture_order(db, plugin, paypal_order_id)
    except PaypalError:
        try:
            body = get_order(db, plugin, paypal_order_id)
        except PaypalError as exc:
            row.status = "error"
            row.raw_result_json = json.dumps({"error": str(exc), "payer_id": PayerID})
            db.commit()
            return _result_redirect(order_number, "failed", str(exc))

    row.raw_result_json = json.dumps(body)
    status = str(body.get("status") or "").upper()
    capture_id = capture_id_from_body(body)
    row.payer_email = payer_email_from_body(body)

    if status == "COMPLETED" or (status == "APPROVED" and capture_id):
        # If still APPROVED without capture fields, try capture was already done
        if status == "APPROVED" and not capture_id:
            try:
                body = capture_order(db, plugin, paypal_order_id)
                row.raw_result_json = json.dumps(body)
                status = str(body.get("status") or "").upper()
                capture_id = capture_id_from_body(body)
                row.payer_email = payer_email_from_body(body) or row.payer_email
            except PaypalError as exc:
                row.status = "error"
                db.commit()
                return _result_redirect(order_number, "failed", str(exc))

    if status == "COMPLETED":
        row.status = "success"
        row.capture_id = capture_id
        if order:
            _mark_order_paid(db, order, trx_id=capture_id or paypal_order_id, amount=row.amount_bdt)
        else:
            db.commit()
        return _result_redirect(order_number, "success")

    row.status = "failed"
    db.commit()
    return _result_redirect(order_number, "failed", f"PayPal status: {status or 'unknown'}")


@router.get("/cancel")
def paypal_cancel(
    db: Session = Depends(get_db),
    token: str = Query(default=""),
) -> RedirectResponse:
    paypal_order_id = token.strip()
    row = (
        db.query(PaypalPayment).filter(PaypalPayment.paypal_order_id == paypal_order_id).first()
        if paypal_order_id
        else None
    )
    if row and row.status != "success":
        row.status = "cancelled"
        db.commit()
    order_number = row.order_number if row else ""
    return _result_redirect(order_number, "cancelled", "Payment was cancelled")
