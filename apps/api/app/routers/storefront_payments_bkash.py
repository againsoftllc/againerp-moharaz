"""Storefront bKash Tokenized Checkout — create payment + gateway callback."""

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
from app.models.bkash_plugin import BkashPayment, BkashPlugin
from app.models.commerce_order import CommerceOrder
from app.models.commerce_customer import dump_json, load_json
from app.models.finance import FinancePayment, FinanceReceivable
from app.services.bkash_client import (
    BkashError,
    create_payment,
    credentials_complete,
    execute_payment,
    query_payment,
)

router = APIRouter(prefix="/payments/bkash", tags=["storefront-payments-bkash"])

PLUGIN_ID = "bkash-default"


class BkashCreateRequest(BaseModel):
    order_id: str


class BkashCreateRead(BaseModel):
    payment_id: str
    bkash_url: str
    amount: str
    order_number: str


class BkashCreateResponse(BaseModel):
    data: BkashCreateRead


def _active_plugin(db: Session) -> BkashPlugin:
    row = db.get(BkashPlugin, PLUGIN_ID)
    if not row or not row.installed or not row.enabled or not row.checkout_enabled:
        raise HTTPException(status_code=400, detail="bKash payment is not enabled")
    if not credentials_complete(row):
        raise HTTPException(status_code=400, detail="bKash merchant credentials are not configured")
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
    url = f"{base}/payment/bkash/result?order={quote(order_number)}&status={quote(status)}"
    if message:
        url += f"&message={quote(message[:200])}"
    return RedirectResponse(url=url)


@router.post("/create", response_model=BkashCreateResponse)
def create_bkash_payment(
    payload: BkashCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> BkashCreateResponse:
    _session, _identity, customer = ctx
    plugin = _active_plugin(db)

    order = db.get(CommerceOrder, payload.order_id.strip())
    if not order or order.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")
    if order.grand_total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    callback_url = f"{_api_base(request)}/api/v1/storefront/payments/bkash/callback"
    try:
        body = create_payment(
            db,
            plugin,
            amount=order.grand_total,
            invoice_number=order.order_number,
            payer_reference=(customer.phone or customer.email or "guest"),
            callback_url=callback_url,
        )
    except BkashError as exc:
        raise HTTPException(status_code=502, detail=f"bKash: {exc}") from exc

    row = BkashPayment(
        payment_id=str(body["paymentID"]),
        order_id=order.id,
        order_number=order.order_number,
        amount=order.grand_total,
        environment=plugin.environment,
        status="created",
        payer_reference=(customer.phone or customer.email or "guest")[:64],
        bkash_url=str(body.get("bkashURL") or ""),
        raw_result_json=json.dumps(body),
    )
    db.add(row)
    db.commit()

    return BkashCreateResponse(
        data=BkashCreateRead(
            payment_id=row.payment_id,
            bkash_url=row.bkash_url,
            amount=str(order.grand_total),
            order_number=order.order_number,
        ),
    )


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
            "method": "bkash",
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
            "label": f"bKash payment received (Trx {trx_id})",
            "at": now.isoformat(),
            "source": "bkash_gateway",
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
                    "provider": "bkash",
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


@router.get("/callback")
def bkash_callback(
    paymentID: str = Query(default=""),
    status: str = Query(default=""),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    payment_id = paymentID.strip()
    row = (
        db.query(BkashPayment).filter(BkashPayment.payment_id == payment_id).first()
        if payment_id
        else None
    )
    if not row:
        return _result_redirect("", "failed", "Unknown bKash payment reference")

    order = db.get(CommerceOrder, row.order_id)
    order_number = row.order_number or (order.order_number if order else "")

    if status != "success":
        row.status = "cancelled" if status == "cancel" else "failed"
        db.commit()
        return _result_redirect(
            order_number,
            "cancelled" if status == "cancel" else "failed",
            "Payment was cancelled" if status == "cancel" else "Payment failed at bKash",
        )

    # Already executed (double callback / refresh) — don't execute twice.
    if row.status == "success":
        return _result_redirect(order_number, "success")

    plugin = db.get(BkashPlugin, PLUGIN_ID)
    if not plugin:
        return _result_redirect(order_number, "failed", "bKash plugin missing")

    try:
        body = execute_payment(db, plugin, payment_id)
    except BkashError:
        # Execute can time out after the money moved — fall back to status query.
        try:
            body = query_payment(db, plugin, payment_id)
        except BkashError as exc:
            row.status = "error"
            row.raw_result_json = json.dumps({"error": str(exc)})
            db.commit()
            return _result_redirect(order_number, "failed", str(exc))

    row.raw_result_json = json.dumps(body)
    status_code = str(body.get("statusCode") or "")
    trx_status = str(body.get("transactionStatus") or "")
    trx_id = str(body.get("trxID") or "")

    if status_code == "0000" and trx_status == "Completed":
        row.status = "success"
        row.trx_id = trx_id
        if order:
            _mark_order_paid(db, order, trx_id=trx_id, amount=row.amount)
        else:
            db.commit()
        return _result_redirect(order_number, "success")

    row.status = "failed"
    db.commit()
    message = str(body.get("statusMessage") or "Payment could not be completed")
    return _result_redirect(order_number, "failed", message)
