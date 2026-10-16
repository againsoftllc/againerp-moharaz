from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.storefront_customer_auth import CustomerAuthContext, get_current_storefront_customer
from app.models.commerce_customer import CommerceCustomer, append_customer_timeline, dump_json, load_json
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.commerce_order_refund import CommerceOrderRefund
from app.models.commerce_order_return import CommerceOrderReturn
from app.models.commerce_order_shipment import CommerceOrderShipment
from app.models.finance import FinancePayment
from app.models.storefront_customer_auth import StorefrontCustomerCase
from app.schemas.storefront_account import (
    AccountCaseCreate,
    AccountCaseListResponse,
    AccountCaseRead,
    AccountCaseReplyCreate,
    AccountCaseReplyRead,
    AccountCaseResponse,
    AccountDeliveryListResponse,
    AccountDeliveryRead,
    AccountOrderDetailRead,
    AccountOrderDetailResponse,
    AccountOrderLineRead,
    AccountOrderListResponse,
    AccountOrderProductRead,
    AccountOrderRead,
    AccountPaymentListResponse,
    AccountPaymentRead,
    AccountPointsEventRead,
    AccountPointsRead,
    AccountPointsResponse,
    AccountWalletRead,
    AccountWalletResponse,
    AccountWalletTxnRead,
    AccountRefundCreate,
    AccountRefundListResponse,
    AccountRefundRead,
    AccountRefundResponse,
    AccountSummaryRead,
    AccountSummaryResponse,
    AddressItem,
    CustomerMeRead,
    OrderStatusStat,
    ProfileRead,
    ProfileResponse,
    ProfileUpdateRequest,
    RecentOrderRead,
)
from app.services.ecommerce.storefront_customer_auth_service import StorefrontCustomerAuthService
from app.services.media_storage import save_media_bytes
from app.security import new_session_token

router = APIRouter(prefix="/account", tags=["storefront-account"])


def _me(customer: CommerceCustomer, identity) -> CustomerMeRead:
    return CustomerMeRead(**StorefrontCustomerAuthService.customer_to_me(customer, identity))


def _owned_orders_query(db: Session, customer: CommerceCustomer):
    return (
        db.query(CommerceOrder)
        .filter(CommerceOrder.customer_id == customer.id)
        .order_by(CommerceOrder.order_date.desc())
    )


def _order_product_label(db: Session, order: CommerceOrder) -> str:
    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order.id)
        .order_by(CommerceOrderItem.sort_order.asc())
        .all()
    )
    if not items:
        return "Order"
    # Count distinct products, not variant lines, so a multi-variant order of
    # one product reads as that single product.
    seen: List[str] = []
    for item in items:
        key = item.product_id or item.name
        if key not in seen:
            seen.append(key)
    first_name = items[0].name
    if len(seen) == 1:
        return first_name
    return f"{first_name} +{len(seen) - 1} more"


def _note_parts(notes: str | None) -> list[str]:
    if not notes:
        return []
    text = str(notes).replace("\r", "\n")
    parts: list[str] = []
    for line in text.split("\n"):
        for chunk in line.split("·"):
            cleaned = chunk.strip()
            if cleaned:
                parts.append(cleaned)
    return parts


def _extract_coupon_code(notes: str | None) -> str | None:
    for part in _note_parts(notes):
        if part.lower().startswith("coupon:"):
            code = part.split(":", 1)[1].strip()
            return code or None
    return None


def _extract_shipping_method(notes: str | None) -> str | None:
    for part in _note_parts(notes):
        if part.lower().startswith("shipping:"):
            value = part.split(":", 1)[1].strip()
            return value or None
    return None


def _to_order_read(db: Session, order: CommerceOrder) -> AccountOrderRead:
    return AccountOrderRead(
        id=order.id,
        order_number=order.order_number,
        date=order.order_date.strftime("%Y-%m-%d"),
        product_label=_order_product_label(db, order),
        total=order.grand_total,
        paid=order.paid_amount,
        due=order.due_amount,
        status=order.status,
        payment_status=order.payment_status,
        shipment_status=order.shipment_status,
        subtotal=order.subtotal or 0,
        discount_amount=order.discount_amount or 0,
        shipping_amount=order.shipping_amount or order.shipping_cost or 0,
        tax_amount=order.tax_amount or 0,
        coupon_code=_extract_coupon_code(order.notes),
    )


def _to_order_detail(db: Session, order: CommerceOrder) -> AccountOrderDetailRead:
    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order.id)
        .order_by(CommerceOrderItem.sort_order.asc())
        .all()
    )
    # Group variant lines under their parent product so an order for several
    # variants of one product renders as one product with nested option lines.
    grouped: dict[str, AccountOrderProductRead] = {}
    for item in items:
        key = item.product_id or item.name
        qty = int(item.quantity or 0)
        unit = item.unit_price or 0
        line_total = item.line_total if item.line_total is not None else (unit * qty)
        line = AccountOrderLineRead(
            label=item.variant_label or item.sku or item.name,
            qty=qty,
            unit_price=unit,
            line_total=line_total,
            discount_amount=item.discount_amount or 0,
        )
        existing = grouped.get(key)
        if existing:
            existing.lines.append(line)
            existing.total_qty += qty
        else:
            grouped[key] = AccountOrderProductRead(
                name=item.name,
                image_url=item.image_url,
                total_qty=qty,
                lines=[line],
            )
    products: List[AccountOrderProductRead] = list(grouped.values())
    shipping_bits = [order.shipping_address or "", order.shipping_city or "", order.shipping_region or ""]
    delivery_address = ", ".join(part for part in shipping_bits if part)
    shipping_method = (
        _extract_shipping_method(order.notes)
        or order.courier
        or "standard"
    )
    return AccountOrderDetailRead(
        **_to_order_read(db, order).model_dump(),
        customer_name=order.customer_name,
        phone=order.customer_phone,
        email=order.customer_email,
        delivery_address=delivery_address,
        delivery_method=order.courier or order.shipment_status,
        shipping_method=shipping_method,
        advance_paid=order.paid_amount,
        products=products,
        notes=order.notes,
    )


@router.get("/summary", response_model=AccountSummaryResponse)
def account_summary(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountSummaryResponse:
    _session, identity, customer = ctx
    orders = _owned_orders_query(db, customer).all()
    pending = sum(1 for o in orders if o.status in {"pending", "confirmed"})
    processing = sum(1 for o in orders if o.status in {"processing", "packed", "shipped"})
    completed = sum(1 for o in orders if o.status in {"completed", "delivered"})
    total = max(len(orders), 1)
    stats = [
        OrderStatusStat(key="pending", label="Pending", count=pending, pct=int(round(pending * 100 / total))),
        OrderStatusStat(key="processing", label="Processing", count=processing, pct=int(round(processing * 100 / total))),
        OrderStatusStat(key="completed", label="Completed", count=completed, pct=int(round(completed * 100 / total))),
    ]
    recent = [
        RecentOrderRead(
            id=o.id,
            order_number=o.order_number,
            title=_order_product_label(db, o),
            status=o.status,
            date=o.order_date.strftime("%Y-%m-%d"),
            amount=o.grand_total,
        )
        for o in orders[:5]
    ]
    manager = None
    if customer.assigned_staff:
        manager = {
            "name": customer.assigned_staff,
            "phone": "",
            "initial": "".join(part[0] for part in customer.assigned_staff.split()[:2]).upper() or "AM",
            "message": "Your account manager can help with orders and shipping.",
        }
    return AccountSummaryResponse(
        data=AccountSummaryRead(
            customer=_me(customer, identity),
            status_stats=stats,
            recent_orders=recent,
            account_manager=manager,
        )
    )


def _profile_response(identity, customer) -> ProfileResponse:
    addresses_raw = load_json(customer.addresses_json, [])
    addresses: List[AddressItem] = []
    for a in addresses_raw:
        if not isinstance(a, dict):
            continue
        # Accept legacy seed keys (address / isDefault) alongside API keys.
        normalized = {
            "id": a.get("id"),
            "label": a.get("label") or "Home",
            "line1": a.get("line1") or a.get("address") or "",
            "city": a.get("city") or "",
            "region": a.get("region") or "",
            "postal_code": a.get("postal_code") or a.get("postalCode") or "",
            "country": a.get("country") or "Bangladesh",
            "is_default": bool(a.get("is_default", a.get("isDefault", False))),
        }
        addresses.append(AddressItem(**{k: v for k, v in normalized.items() if v is not None}))
    default_address = next((a.line1 for a in addresses if a.is_default and a.line1), "")
    if not default_address and addresses:
        default_address = addresses[0].line1
    emergency = ""
    notes = load_json(customer.notes, {}) if customer.notes and customer.notes.startswith("{") else {}
    if isinstance(notes, dict):
        emergency = str(notes.get("emergency_number") or "")
    base = StorefrontCustomerAuthService.customer_to_me(customer, identity)
    return ProfileResponse(
        data=ProfileRead(
            **base,
            emergency_number=emergency,
            address=default_address,
            addresses=addresses,
            customer_since=customer.customer_since,
        )
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> ProfileResponse:
    _session, identity, customer = ctx
    return _profile_response(identity, customer)


PROFILE_PHOTO_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
PROFILE_PHOTO_MAX_BYTES = 4 * 1024 * 1024


@router.post("/profile/photo", response_model=ProfileResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    """Store the customer's photo and point `profile_image` at it.

    The column only holds a URL, so the bytes have to live in media storage.
    """
    _session, identity, customer = ctx
    filename = file.filename or "photo.jpg"
    ext = Path(filename).suffix.lower()
    if ext not in PROFILE_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WEBP, GIF or AVIF image")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The image file is empty")
    if len(content) > PROFILE_PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 4MB or smaller")

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    stored = f"{uuid.uuid4().hex}_{safe_name}"
    public_url, _local_path, _provider = save_media_bytes(
        db, stored, content, file.content_type or "image/jpeg"
    )
    customer.profile_image = public_url
    append_customer_timeline(customer, "Profile photo updated", actor=customer.name or "Customer")
    db.commit()
    db.refresh(customer)
    return _profile_response(identity, customer)


@router.patch("/profile", response_model=ProfileResponse)
def patch_profile(
    payload: ProfileUpdateRequest,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    _session, identity, customer = ctx
    changes: list[str] = []
    actor = (customer.name or "Customer").strip() or "Customer"

    if payload.name is not None:
        next_name = payload.name.strip() or customer.name
        if next_name != customer.name:
            changes.append(f"Name: {customer.name or '—'} → {next_name}")
            customer.name = next_name
    if payload.phone is not None:
        next_phone = payload.phone.strip()
        if next_phone != (customer.phone or ""):
            changes.append(f"Phone: {customer.phone or '—'} → {next_phone or '—'}")
            customer.phone = next_phone
    if payload.email is not None:
        next_email = payload.email.strip().lower()
        if next_email != (customer.email or ""):
            changes.append(f"Email: {customer.email or '—'} → {next_email or '—'}")
            customer.email = next_email
    if payload.city is not None:
        next_city = payload.city.strip()
        if next_city != (customer.city or ""):
            changes.append(f"City: {customer.city or '—'} → {next_city or '—'}")
            customer.city = next_city
    if payload.region is not None:
        next_region = payload.region.strip()
        if next_region != (customer.region or ""):
            changes.append(f"Region: {customer.region or '—'} → {next_region or '—'}")
            customer.region = next_region
    if payload.country is not None:
        next_country = payload.country.strip() or "Bangladesh"
        if next_country != (customer.country or ""):
            changes.append(f"Country: {customer.country or '—'} → {next_country}")
            customer.country = next_country
    if payload.profile_image is not None:
        next_image = payload.profile_image.strip() or None
        if next_image != customer.profile_image:
            changes.append("Profile photo updated")
            customer.profile_image = next_image

    addresses = load_json(customer.addresses_json, [])
    address_changed = False
    if payload.addresses is not None:
        addresses = [a.model_dump() for a in payload.addresses]
        address_changed = True
    elif payload.address is not None:
        line1 = payload.address.strip()
        if addresses and isinstance(addresses[0], dict):
            if addresses[0].get("line1") != line1:
                address_changed = True
            addresses[0]["line1"] = line1
            addresses[0]["city"] = payload.city or customer.city
            addresses[0]["region"] = payload.region or customer.region
        else:
            address_changed = True
            addresses = [
                {
                    "id": str(uuid.uuid4()),
                    "label": "Home",
                    "line1": line1,
                    "city": payload.city or customer.city,
                    "region": payload.region or customer.region,
                    "postal_code": "",
                    "country": payload.country or customer.country or "Bangladesh",
                    "is_default": True,
                }
            ]
    if address_changed:
        changes.append("Address updated")
    customer.addresses_json = dump_json(addresses)

    notes_obj = {}
    if customer.notes and customer.notes.startswith("{"):
        try:
            notes_obj = load_json(customer.notes, {})
        except Exception:
            notes_obj = {}
    if not isinstance(notes_obj, dict):
        notes_obj = {}
    if payload.emergency_number is not None:
        emergency = payload.emergency_number.strip()
        if str(notes_obj.get("emergency_number") or "") != emergency:
            changes.append("Emergency number updated")
            notes_obj["emergency_number"] = emergency
            customer.notes = dump_json(notes_obj)

    if changes:
        title = changes[0] if len(changes) == 1 else f"Updated {len(changes)} profile fields"
        append_customer_timeline(
            customer,
            title,
            actor=actor,
            event_type="activity",
            description=None if len(changes) == 1 else "; ".join(changes),
            role="customer",
        )

    db.commit()
    db.refresh(customer)
    return get_profile(ctx)


@router.get("/orders", response_model=AccountOrderListResponse)
def list_orders(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountOrderListResponse:
    _session, _identity, customer = ctx
    orders = _owned_orders_query(db, customer).all()
    return AccountOrderListResponse(data=[_to_order_read(db, o) for o in orders], total=len(orders))


@router.get("/orders/{order_id}", response_model=AccountOrderDetailResponse)
def get_order(
    order_id: str,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountOrderDetailResponse:
    _session, _identity, customer = ctx
    order = db.get(CommerceOrder, order_id)
    if not order:
        order = (
            _owned_orders_query(db, customer)
            .filter(CommerceOrder.order_number == order_id)
            .first()
        )
    if not order or order.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return AccountOrderDetailResponse(data=_to_order_detail(db, order))


_PAYMENT_PROVIDER_LABELS = {
    "cod": "Cash on Delivery",
    "mobile": "Mobile Banking",
    "online": "Online Banking",
    "manual": "Manual",
}

_PAYMENT_STATUS_LABELS = {
    "awaiting_collection": "Awaiting collection",
    "requires_action": "Requires action",
    "pending": "Pending",
    "paid": "Paid",
    "completed": "Completed",
    "failed": "Failed",
}


def _humanize_payment_note(raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Turn the internal JSON payment note into customer-facing text.

    Returns (note, status_hint) — status_hint overrides the derived payment
    status when the note carries a clearer state (e.g. COD awaiting collection).
    """
    if not raw:
        return None, None
    text = raw.strip()
    if not text.startswith("{"):
        return text, None
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return text, None
    if not isinstance(data, dict):
        return text, None

    provider = str(data.get("provider") or "").strip().lower()
    status = str(data.get("status") or "").strip().lower()
    parts: List[str] = []
    if provider:
        parts.append(_PAYMENT_PROVIDER_LABELS.get(provider, provider.replace("_", " ").title()))
    if status:
        parts.append(_PAYMENT_STATUS_LABELS.get(status, status.replace("_", " ").capitalize()))
    note = " — ".join(parts) if parts else None
    if not note:
        payload = data.get("client_payload")
        if isinstance(payload, dict) and payload.get("message"):
            note = str(payload["message"])

    status_hint: Optional[str] = None
    if status in ("awaiting_collection", "pending", "requires_action") or data.get("requires_action"):
        status_hint = "Initiated"
    elif status in ("paid", "completed", "captured"):
        status_hint = "Completed"
    elif status == "failed":
        status_hint = "Failed"
    return note, status_hint


@router.get("/payments", response_model=AccountPaymentListResponse)
def list_payments(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountPaymentListResponse:
    _session, _identity, customer = ctx
    order_ids = [o.id for o in _owned_orders_query(db, customer).all()]
    if not order_ids:
        return AccountPaymentListResponse(data=[])
    payments = (
        db.query(FinancePayment)
        .filter(
            FinancePayment.source_type == "commerce_order",
            FinancePayment.source_id.in_(order_ids),
        )
        .order_by(FinancePayment.created_at.desc())
        .all()
    )
    order_map = {o.id: o for o in db.query(CommerceOrder).filter(CommerceOrder.id.in_(order_ids)).all()}
    rows: List[AccountPaymentRead] = []
    for pay in payments:
        order = order_map.get(pay.source_id)
        note, status_hint = _humanize_payment_note(pay.notes)
        rows.append(
            AccountPaymentRead(
                id=pay.id,
                date=pay.payment_date.isoformat() if pay.payment_date else pay.created_at.strftime("%Y-%m-%d"),
                order_id=pay.source_id,
                order_number=order.order_number if order else "",
                amount=pay.amount,
                method=pay.payment_method,
                status=status_hint or ("Completed" if pay.direction == "inbound" else pay.direction),
                trx_id=pay.reference,
                customer_name=order.customer_name if order else customer.name,
                customer_phone=order.customer_phone if order else customer.phone,
                customer_email=order.customer_email if order else customer.email,
                note=note,
            )
        )
    return AccountPaymentListResponse(data=rows)


@router.get("/deliveries", response_model=AccountDeliveryListResponse)
def list_deliveries(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountDeliveryListResponse:
    _session, _identity, customer = ctx
    orders = _owned_orders_query(db, customer).all()
    if not orders:
        return AccountDeliveryListResponse(data=[])
    order_map = {o.id: o for o in orders}
    shipments = (
        db.query(CommerceOrderShipment)
        .filter(CommerceOrderShipment.order_id.in_(list(order_map.keys())))
        .order_by(CommerceOrderShipment.created_at.desc())
        .all()
    )
    rows: List[AccountDeliveryRead] = []
    for ship in shipments:
        order = order_map.get(ship.order_id)
        rows.append(
            AccountDeliveryRead(
                id=ship.id,
                invoice=ship.shipment_number,
                date=ship.created_at.strftime("%Y-%m-%d"),
                orders=order.order_number if order else "",
                method=ship.courier or "Courier",
                amount=order.shipping_amount if order else Decimal("0"),
                status=ship.status,
                tracking_number=ship.tracking_number,
                tracking_url=ship.tracking_url,
            )
        )
    # Fallback: orders with shipment status but no shipment row yet.
    shipped_ids = {s.order_id for s in shipments}
    for order in orders:
        if order.id in shipped_ids:
            continue
        if order.shipment_status in {"unfulfilled", "pending"} and not order.tracking_number:
            continue
        rows.append(
            AccountDeliveryRead(
                id=order.id,
                invoice=order.order_number,
                date=order.order_date.strftime("%Y-%m-%d"),
                orders=order.order_number,
                method=order.courier or "Courier",
                amount=order.shipping_amount,
                status=order.shipment_status,
                tracking_number=order.tracking_number,
                tracking_url=order.tracking_url,
            )
        )
    return AccountDeliveryListResponse(data=rows)


@router.get("/refunds", response_model=AccountRefundListResponse)
def list_refunds(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountRefundListResponse:
    _session, _identity, customer = ctx
    order_ids = [o.id for o in _owned_orders_query(db, customer).all()]
    if not order_ids:
        return AccountRefundListResponse(data=[])
    refunds = (
        db.query(CommerceOrderRefund)
        .filter(CommerceOrderRefund.order_id.in_(order_ids))
        .all()
    )
    # A product/order return belongs on the same customer-facing list as the
    # refund it eventually produces.
    returns = (
        db.query(CommerceOrderReturn)
        .filter(CommerceOrderReturn.order_id.in_(order_ids))
        .all()
    )

    rows = [
        (
            r.created_at,
            AccountRefundRead(
                id=r.id,
                refund_number=r.refund_number,
                date=r.created_at.strftime("%Y-%m-%d"),
                order_id=r.order_id,
                order_number=r.order_number,
                amount=r.amount,
                method=r.method,
                reason=r.reason,
                status=r.status,
                kind="refund",
            ),
        )
        for r in refunds
    ]
    rows += [
        (
            r.created_at,
            AccountRefundRead(
                id=r.id,
                refund_number=r.return_number,
                date=r.created_at.strftime("%Y-%m-%d"),
                order_id=r.order_id,
                order_number=r.order_number,
                amount=r.amount,
                method="return",
                reason=r.reason,
                status=r.status,
                kind="return",
                product_name=r.product_name,
                quantity=r.quantity,
            ),
        )
        for r in returns
    ]
    rows.sort(key=lambda pair: pair[0], reverse=True)
    return AccountRefundListResponse(data=[row for _, row in rows])


@router.post("/refunds", response_model=AccountRefundResponse)
def create_refund(
    payload: AccountRefundCreate,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountRefundResponse:
    _session, _identity, customer = ctx
    order = db.get(CommerceOrder, payload.order_id)
    if not order:
        order = (
            db.query(CommerceOrder)
            .filter(
                CommerceOrder.customer_id == customer.id,
                CommerceOrder.order_number == payload.order_id.strip(),
            )
            .first()
        )
    if not order or order.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Order not found")
    amount = payload.amount if payload.amount is not None else order.grand_total
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be positive")
    refund_number = f"RF-{new_session_token()[:8].upper()}"
    row = CommerceOrderRefund(
        company_id=order.company_id,
        refund_number=refund_number,
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        amount=amount,
        method=payload.method,
        reason=payload.reason.strip(),
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AccountRefundResponse(
        data=AccountRefundRead(
            id=row.id,
            refund_number=row.refund_number,
            date=row.created_at.strftime("%Y-%m-%d"),
            order_id=row.order_id,
            order_number=row.order_number,
            amount=row.amount,
            method=row.method,
            reason=row.reason,
            status=row.status,
        )
    )


@router.get("/points", response_model=AccountPointsResponse)
def get_points(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> AccountPointsResponse:
    _session, _identity, customer = ctx
    events_raw = load_json(customer.reward_events_json, [])
    events: List[AccountPointsEventRead] = []
    for ev in events_raw:
        if not isinstance(ev, dict):
            continue
        events.append(
            AccountPointsEventRead(
                date=str(ev.get("date") or ev.get("at") or "")[:10],
                type=str(ev.get("type") or "earn"),
                purpose=str(ev.get("purpose") or ev.get("title") or ""),
                orders=str(ev.get("orders") or ev.get("order_number") or ""),
                payment_id=str(ev.get("payment_id") or ""),
                amount=Decimal(str(ev.get("amount") or 0)),
            )
        )
    return AccountPointsResponse(data=AccountPointsRead(balance=customer.reward_points or 0, events=events))


@router.get("/wallet", response_model=AccountWalletResponse)
def get_wallet(
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> AccountWalletResponse:
    _session, _identity, customer = ctx
    txs_raw = load_json(customer.wallet_transactions_json, [])
    transactions: List[AccountWalletTxnRead] = []
    for tx in txs_raw:
        if not isinstance(tx, dict):
            continue
        tx_type = str(tx.get("type") or "credit").lower()
        if tx_type not in ("credit", "debit"):
            tx_type = "credit"
        transactions.append(
            AccountWalletTxnRead(
                id=str(tx.get("id") or f"wt_{len(transactions) + 1}"),
                label=str(tx.get("label") or tx.get("title") or tx.get("note") or "Wallet transaction"),
                amount=Decimal(str(tx.get("amount") or 0)),
                type=tx_type,
                at=str(tx.get("at") or tx.get("date") or ""),
                payment_method=str(tx.get("payment_method") or ""),
                payment_reference=str(tx.get("payment_reference") or ""),
            )
        )
    return AccountWalletResponse(
        data=AccountWalletRead(
            balance=Decimal(str(customer.wallet_balance or 0)),
            transactions=transactions,
        )
    )


@router.get("/cases", response_model=AccountCaseListResponse)
def list_cases(
    case_type: Optional[str] = Query(default=None),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountCaseListResponse:
    _session, _identity, customer = ctx
    q = db.query(StorefrontCustomerCase).filter(StorefrontCustomerCase.customer_id == customer.id)
    if case_type:
        q = q.filter(StorefrontCustomerCase.case_type == case_type)
    rows = q.order_by(StorefrontCustomerCase.created_at.desc()).all()

    def _replies(row: StorefrontCustomerCase) -> list[AccountCaseReplyRead]:
        raw = load_json(getattr(row, "replies_json", None), [])
        if not isinstance(raw, list):
            return []
        out: list[AccountCaseReplyRead] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            message = str(item.get("message") or "").strip()
            if not message:
                continue
            out.append(
                AccountCaseReplyRead(
                    id=str(item.get("id") or ""),
                    at=str(item.get("at") or ""),
                    author=str(item.get("author") or "Support"),
                    role=str(item.get("role") or "admin"),
                    message=message,
                )
            )
        return out

    return AccountCaseListResponse(
        data=[
            AccountCaseRead(
                id=r.id,
                case_number=r.case_number,
                case_type=r.case_type,
                date=r.created_at.strftime("%Y-%m-%d"),
                order_id=r.order_id,
                order_number=r.order_number,
                subject=r.subject,
                message=r.message,
                product_label=r.product_label,
                status=r.status,
                manager_name=r.manager_name,
                replies=_replies(r),
            )
            for r in rows
        ]
    )


@router.post("/cases", response_model=AccountCaseResponse)
def create_case(
    payload: AccountCaseCreate,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountCaseResponse:
    _session, _identity, customer = ctx
    order_number = None
    if payload.order_id:
        order = db.get(CommerceOrder, payload.order_id)
        if not order:
            order = (
                db.query(CommerceOrder)
                .filter(
                    CommerceOrder.customer_id == customer.id,
                    CommerceOrder.order_number == payload.order_id.strip(),
                )
                .first()
            )
        if not order or order.customer_id != customer.id:
            raise HTTPException(status_code=404, detail="Order not found")
        order_number = order.order_number
        payload_order_id = order.id
    else:
        payload_order_id = None
    prefix = {"support": "SUP", "complaint": "CMP", "qc": "QC"}.get(payload.case_type, "CASE")
    case_number = f"{prefix}-{new_session_token()[:8].upper()}"
    row = StorefrontCustomerCase(
        customer_id=customer.id,
        case_type=payload.case_type,
        case_number=case_number,
        order_id=payload_order_id,
        order_number=order_number,
        subject=payload.subject.strip(),
        message=payload.message.strip(),
        product_label=payload.product_label,
        status="open",
        manager_name=customer.assigned_staff,
        replies_json="[]",
    )
    db.add(row)
    append_customer_timeline(
        customer,
        f"Opened support case {case_number}",
        actor=(customer.name or "Customer").strip() or "Customer",
        event_type="support",
        description=payload.subject.strip(),
        role="customer",
    )
    db.commit()
    db.refresh(row)
    return AccountCaseResponse(
        data=AccountCaseRead(
            id=row.id,
            case_number=row.case_number,
            case_type=row.case_type,
            date=row.created_at.strftime("%Y-%m-%d"),
            order_id=row.order_id,
            order_number=row.order_number,
            subject=row.subject,
            message=row.message,
            product_label=row.product_label,
            status=row.status,
            manager_name=row.manager_name,
            replies=[],
        )
    )


@router.post("/cases/{case_id}/replies", response_model=AccountCaseResponse)
def reply_case(
    case_id: str,
    payload: AccountCaseReplyCreate,
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
    db: Session = Depends(get_db),
) -> AccountCaseResponse:
    _session, _identity, customer = ctx
    row = db.get(StorefrontCustomerCase, case_id)
    if not row or row.customer_id != customer.id:
        raise HTTPException(status_code=404, detail="Case not found")
    if (row.status or "").lower() == "closed":
        raise HTTPException(status_code=409, detail="Case is closed")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Reply message is required")

    author = (customer.name or "Customer").strip() or "Customer"
    replies = load_json(getattr(row, "replies_json", None), [])
    if not isinstance(replies, list):
        replies = []
    replies.append(
        {
            "id": f"reply_{new_session_token()[:10]}",
            "at": datetime.utcnow().isoformat() + "Z",
            "author": author,
            "role": "customer",
            "message": message,
        }
    )
    row.replies_json = dump_json(replies)
    append_customer_timeline(
        customer,
        f"Replied on support case {row.case_number}",
        actor=author,
        event_type="support",
        description=message[:180],
        role="customer",
    )
    db.commit()
    db.refresh(row)

    def _replies(case: StorefrontCustomerCase) -> list[AccountCaseReplyRead]:
        raw = load_json(getattr(case, "replies_json", None), [])
        if not isinstance(raw, list):
            return []
        out: list[AccountCaseReplyRead] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            text = str(item.get("message") or "").strip()
            if not text:
                continue
            out.append(
                AccountCaseReplyRead(
                    id=str(item.get("id") or ""),
                    at=str(item.get("at") or ""),
                    author=str(item.get("author") or "Support"),
                    role=str(item.get("role") or "admin"),
                    message=text,
                )
            )
        return out

    return AccountCaseResponse(
        data=AccountCaseRead(
            id=row.id,
            case_number=row.case_number,
            case_type=row.case_type,
            date=row.created_at.strftime("%Y-%m-%d"),
            order_id=row.order_id,
            order_number=row.order_number,
            subject=row.subject,
            message=row.message,
            product_label=row.product_label,
            status=row.status,
            manager_name=row.manager_name,
            replies=_replies(row),
        )
    )
