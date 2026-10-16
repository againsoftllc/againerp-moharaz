"""Storefront Stripe Checkout — create session + success/cancel."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
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
from app.models.stripe_plugin import StripePayment, StripePlugin
from app.services.stripe_client import (
    StripeError,
    charge_amount,
    create_checkout_session,
    credentials_complete,
    retrieve_session,
)

router = APIRouter(prefix="/payments/stripe", tags=["storefront-payments-stripe"])

PLUGIN_ID = "stripe-default"


class StripeCreateRequest(BaseModel):
    order_id: str


class StripeCreateRead(BaseModel):
    session_id: str
    checkout_url: str
    amount: str
    currency: str
    order_number: str


class StripeCreateResponse(BaseModel):
    data: StripeCreateRead


def _active_plugin(db: Session) -> StripePlugin:
    row = db.get(StripePlugin, PLUGIN_ID)
    if not row or not row.installed or not row.enabled or not row.checkout_enabled:
        raise HTTPException(status_code=400, detail="Stripe payment is not enabled")
    if not credentials_complete(row):
        raise HTTPException(status_code=400, detail="Stripe credentials are not configured")
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
    url = f"{base}/payment/stripe/result?order={quote(order_number)}&status={quote(status)}"
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
            "method": "stripe",
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
            "label": f"Stripe payment received (Trx {trx_id})",
            "at": now.isoformat(),
            "source": "stripe_gateway",
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
                    "provider": "stripe",
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


@router.post("/create", response_model=StripeCreateResponse)
def create_stripe_payment(
    payload: StripeCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> StripeCreateResponse:
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
    charged = charge_amount(plugin, order.grand_total)
    if charged < Decimal("0.50") and currency == "USD":
        raise HTTPException(status_code=400, detail="Converted Stripe amount is below minimum ($0.50)")

    base = _api_base(request)
    prefix = f"{base}/api/v1/storefront/payments/stripe"
    # Stripe replaces {CHECKOUT_SESSION_ID} with the real session id on redirect.
    success_url = f"{prefix}/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{prefix}/cancel?order_id={order.id}"

    try:
        body = create_checkout_session(
            plugin,
            amount=charged,
            currency=currency,
            product_name=f"Order {order.order_number}",
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=order.id,
            customer_email=order.customer_email or customer.email or "",
            metadata={"order_id": order.id, "order_number": order.order_number},
        )
    except StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe: {exc}") from exc

    session_id = str(body["id"])
    checkout_url = str(body["url"])
    pi = body.get("payment_intent")
    payment_intent_id = pi if isinstance(pi, str) else ""

    row = StripePayment(
        session_id=session_id,
        payment_intent_id=payment_intent_id,
        order_id=order.id,
        order_number=order.order_number,
        amount_bdt=order.grand_total,
        amount_charged=charged,
        currency=currency,
        environment=plugin.environment,
        status="created",
        checkout_url=checkout_url,
        raw_result_json=json.dumps(body),
    )
    db.add(row)
    db.commit()

    return StripeCreateResponse(
        data=StripeCreateRead(
            session_id=session_id,
            checkout_url=checkout_url,
            amount=str(charged),
            currency=currency,
            order_number=order.order_number,
        ),
    )


@router.get("/success")
def stripe_success(
    db: Session = Depends(get_db),
    session_id: str = Query(default=""),
) -> RedirectResponse:
    sid = session_id.strip()
    row = (
        db.query(StripePayment).filter(StripePayment.session_id == sid).first() if sid else None
    )
    if not row:
        return _result_redirect("", "failed", "Unknown Stripe payment reference")

    order = db.get(CommerceOrder, row.order_id)
    order_number = row.order_number or (order.order_number if order else "")

    if row.status == "success":
        return _result_redirect(order_number, "success")

    plugin = db.get(StripePlugin, PLUGIN_ID)
    if not plugin:
        return _result_redirect(order_number, "failed", "Stripe plugin missing")

    try:
        body = retrieve_session(plugin, sid)
    except StripeError as exc:
        row.status = "error"
        row.raw_result_json = json.dumps({"error": str(exc)})
        db.commit()
        return _result_redirect(order_number, "failed", str(exc))

    row.raw_result_json = json.dumps(body)
    payment_status = str(body.get("payment_status") or "").lower()
    status = str(body.get("status") or "").lower()
    pi = body.get("payment_intent")
    if isinstance(pi, str) and pi:
        row.payment_intent_id = pi
    row.customer_email = str(body.get("customer_details", {}).get("email") or body.get("customer_email") or "")

    if payment_status == "paid":
        row.status = "success"
        trx = row.payment_intent_id or sid
        if order:
            _mark_order_paid(db, order, trx_id=trx, amount=row.amount_bdt)
        else:
            db.commit()
        return _result_redirect(order_number, "success")

    row.status = "failed" if status == "expired" else "cancelled"
    db.commit()
    return _result_redirect(
        order_number,
        "failed" if row.status == "failed" else "cancelled",
        f"Stripe payment status: {payment_status or status or 'unknown'}",
    )


@router.get("/cancel")
def stripe_cancel(
    db: Session = Depends(get_db),
    order_id: str = Query(default=""),
) -> RedirectResponse:
    row = (
        db.query(StripePayment)
        .filter(StripePayment.order_id == order_id.strip())
        .order_by(StripePayment.created_at.desc())
        .first()
        if order_id.strip()
        else None
    )
    if row and row.status != "success":
        row.status = "cancelled"
        db.commit()
    order_number = row.order_number if row else ""
    return _result_redirect(order_number, "cancelled", "Payment was cancelled")
