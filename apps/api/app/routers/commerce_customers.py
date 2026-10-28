from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, text
from sqlalchemy.orm import Session, defer

from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.database import get_db
from app.models.commerce_customer import CommerceCustomer, CommerceCustomerContact, append_customer_timeline, dump_json, load_json
from app.models.crm import CrmProject
from app.models.finance import FinancePayment, FinanceReceivable
from app.models.collab_label import CollabLabel
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.storefront_customer_auth import StorefrontCustomerCase, StorefrontCustomerIdentity
from app.schemas.customer_ledger import (
    CustomerInvoiceCreate,
    CustomerInvoiceResponse,
    CustomerLedgerResponse,
    CustomerPaymentCreate,
    CustomerPaymentResponse,
)
from app.schemas.commerce_customer import (
    CustomerCreditPositionRead,
    CustomerCreditPositionResponse,
    CustomerBulkDeleteRequest,
    CustomerBulkDeleteResponse,
    CustomerBulkDeleteResult,
    CustomerContactCreate,
    CustomerContactListResponse,
    CustomerContactRead,
    CustomerContactResponse,
    CustomerContactUpdate,
    CustomerCrmSummaryItem,
    CustomerCrmSummaryResponse,
    CustomerCaseCreate,
    CustomerCaseListResponse,
    CustomerCaseRead,
    CustomerCaseReplyCreate,
    CustomerCaseReplyRead,
    CustomerCaseResponse,
    CustomerCreate,
    CustomerListMeta,
    CustomerListResponse,
    CustomerOrderDetailRead,
    CustomerOrderDetailResponse,
    CustomerOrderLineRead,
    CustomerOrderProductRead,
    CustomerOrderRecordPaymentRequest,
    CustomerOrderSummaryRead,
    CustomerOrdersResponse,
    CustomerPaymentHistoryItem,
    CustomerPaymentHistoryResponse,
    CustomerRead,
    CustomerResponse,
    CustomerUpdate,
    VerifyContactRequest,
    WalletRechargeRequest,
)
from app.security import new_session_token
from app.services.core.access_scope import pick_payment_account
from app.services.customer import customer_ledger_service
from app.services.ecommerce.checkout_constants import PAYMENT_METHODS
from app.services.ecommerce.storefront_customer_auth_service import (
    CustomerAuthError,
    normalize_identifier,
)
from app.services.core.sequence_service import get_or_create as get_sequence, next_number as allocate_number

WALLET_GATEWAY_METHODS = {
    method_id
    for method_id, option in PAYMENT_METHODS.items()
    if option.requires_gateway
}

router = APIRouter(prefix="/customers", tags=["commerce-customers"])

_PAYMENT_META_RE = re.compile(
    r"<!--againerp:payment-->([\s\S]*?)<!--/againerp:payment-->"
)


def _sales_payment_amounts(notes: Optional[str], total: Decimal) -> tuple[str, float, float]:
    """Return (paymentStatus, paidAmount, dueAmount) from packed sales notes."""
    amount = float(total or 0)
    if not notes:
        return "unpaid", 0.0, amount
    match = _PAYMENT_META_RE.search(notes)
    if not match:
        return "unpaid", 0.0, amount
    try:
        import json as _json

        data = _json.loads(match.group(1) or "{}")
        paid = float(data.get("paid") or 0)
        due = float(data.get("due") if data.get("due") is not None else max(0.0, amount - paid))
        status = str(
            data.get("status")
            or ("unpaid" if paid <= 0 else "partial" if due > 0 else "paid")
        )
        return status, max(0.0, paid), max(0.0, due)
    except Exception:
        return "unpaid", 0.0, amount


def _sales_payment_status(notes: Optional[str], total: Decimal) -> tuple[str, float]:
    status, _paid, due = _sales_payment_amounts(notes, total)
    return status, due


def _parse_sales_payment_meta(notes: Optional[str]) -> dict:
    if not notes:
        return {}
    match = _PAYMENT_META_RE.search(notes)
    if not match:
        return {}
    try:
        import json as _json

        data = _json.loads(match.group(1) or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _customer_orders_for_payments(
    db: Session, row: CommerceCustomer
) -> tuple[List[CommerceOrder], List[SalesOrder]]:
    phone_digits = "".join(ch for ch in (row.phone or "") if ch.isdigit())[-10:]
    filters = [CommerceOrder.customer_id == row.id]
    if (row.email or "").strip():
        filters.append(CommerceOrder.customer_email.ilike(row.email.strip()))
    if phone_digits:
        filters.append(CommerceOrder.customer_phone.ilike(f"%{phone_digits}%"))
    commerce_orders = (
        db.query(CommerceOrder)
        .filter(or_(*filters))
        .order_by(CommerceOrder.order_date.desc())
        .limit(20000)
        .all()
    )
    sales_orders = (
        db.query(SalesOrder)
        .filter(
            SalesOrder.customer_id == row.id,
            SalesOrder.deleted_at.is_(None),
        )
        .order_by(SalesOrder.order_date.desc(), SalesOrder.created_at.desc())
        .limit(20000)
        .all()
    )
    return commerce_orders, sales_orders


def _payment_history_for_customer(db: Session, row: CommerceCustomer) -> List[dict]:
    commerce_orders, sales_orders = _customer_orders_for_payments(db, row)
    entries: List[dict] = []

    for order in sales_orders:
        meta = _parse_sales_payment_meta(order.notes)
        history = meta.get("history") if isinstance(meta.get("history"), list) else []
        order_number = order.order_number or order.id
        if history:
            for idx, item in enumerate(history):
                if not isinstance(item, dict):
                    continue
                amount = float(item.get("amount") or 0)
                if amount <= 0:
                    continue
                status = str(item.get("status") or "completed")
                kind = "refund" if "refund" in status.lower() or str(item.get("id") or "").startswith("ref_") else "payment"
                entries.append(
                    {
                        "id": str(item.get("id") or f"sales-{order.id}-{idx}"),
                        "at": str(item.get("at") or order.order_date or order.created_at or ""),
                        "amount": amount,
                        "method": str(item.get("method") or meta.get("method") or "—"),
                        "label": str(item.get("label") or item.get("note") or f"Payment · {order_number}"),
                        "status": status,
                        "order_id": order.id,
                        "order_number": order_number,
                        "source": "sales",
                        "kind": kind,
                    }
                )
        else:
            paid = float(meta.get("paid") or 0)
            if paid <= 0:
                _, paid_amt, _ = _sales_payment_amounts(order.notes, order.total)
                paid = paid_amt
            if paid > 0:
                entries.append(
                    {
                        "id": f"sales-{order.id}-paid",
                        "at": str(order.order_date or order.created_at or ""),
                        "amount": paid,
                        "method": str(meta.get("method") or "—"),
                        "label": f"Paid · {order_number}",
                        "status": str(meta.get("status") or "paid"),
                        "order_id": order.id,
                        "order_number": order_number,
                        "source": "sales",
                        "kind": "payment",
                    }
                )

    for order in commerce_orders:
        order_number = order.order_number or order.id
        timeline = load_json(order.payment_timeline_json, [])
        if isinstance(timeline, list) and timeline:
            for idx, item in enumerate(timeline):
                if not isinstance(item, dict):
                    continue
                amount = float(item.get("amount") or 0)
                if amount <= 0:
                    continue
                status = str(item.get("status") or "completed")
                kind = (
                    "refund"
                    if "refund" in status.lower()
                    or str(item.get("id") or "").startswith("ref_")
                    or "refund" in str(item.get("label") or "").lower()
                    else "payment"
                )
                entries.append(
                    {
                        "id": str(item.get("id") or f"sf-{order.id}-{idx}"),
                        "at": str(item.get("at") or order.order_date or order.created_at or ""),
                        "amount": amount,
                        "method": str(item.get("method") or order.payment_method or "—"),
                        "label": str(item.get("label") or f"Payment · {order_number}"),
                        "status": status,
                        "order_id": order.id,
                        "order_number": order_number,
                        "source": "storefront",
                        "kind": kind,
                    }
                )
        else:
            paid = float(order.paid_amount or 0)
            if paid > 0:
                entries.append(
                    {
                        "id": f"sf-{order.id}-paid",
                        "at": str(order.order_date or order.created_at or ""),
                        "amount": paid,
                        "method": str(order.payment_method or "—"),
                        "label": f"Paid · {order_number}",
                        "status": str(order.payment_status or "paid"),
                        "order_id": order.id,
                        "order_number": order_number,
                        "source": "storefront",
                        "kind": "payment",
                    }
                )

    for tx in load_json(row.wallet_transactions_json, []):
        if not isinstance(tx, dict):
            continue
        amount = float(tx.get("amount") or 0)
        if amount <= 0:
            continue
        tx_type = str(tx.get("type") or "credit")
        entries.append(
            {
                "id": str(tx.get("id") or f"wallet-{tx.get('at')}-{amount}"),
                "at": str(tx.get("at") or ""),
                "amount": amount,
                "method": str(tx.get("payment_method") or "Wallet"),
                "label": str(tx.get("label") or ("Wallet credit" if tx_type == "credit" else "Wallet debit")),
                "status": "completed",
                "order_id": None,
                "order_number": None,
                "source": "wallet",
                "kind": "wallet",
            }
        )

    def sort_key(item: dict) -> str:
        return str(item.get("at") or "")

    entries.sort(key=sort_key, reverse=True)
    return entries


def _pack_sales_payment_notes(
    notes: Optional[str],
    *,
    paid: float,
    due: float,
    status: str,
    method: str,
    history: list,
) -> str:
    import json as _json

    clean = _PAYMENT_META_RE.sub("", notes or "").strip()
    block = (
        "<!--againerp:payment-->"
        + _json.dumps(
            {
                "paid": paid,
                "due": due,
                "status": status,
                "method": method,
                "history": history,
            },
            separators=(",", ":"),
        )
        + "<!--/againerp:payment-->"
    )
    return f"{clean}\n\n{block}".strip() if clean else block


def _commerce_product_label(db: Session, order_id: str) -> str:
    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order_id)
        .order_by(CommerceOrderItem.sort_order.asc())
        .all()
    )
    if not items:
        return "Order"
    seen: List[str] = []
    for item in items:
        key = item.product_id or item.name
        if key not in seen:
            seen.append(key)
    first_name = items[0].name
    if len(seen) == 1:
        return first_name
    return f"{first_name} +{len(seen) - 1} more"


def _sales_product_label(db: Session, order_id: str) -> str:
    items = (
        db.query(SalesOrderLine)
        .filter(SalesOrderLine.sales_order_id == order_id)
        .order_by(SalesOrderLine.sort_order.asc(), SalesOrderLine.line_number.asc())
        .all()
    )
    if not items:
        return "Order"
    seen: List[str] = []
    for item in items:
        key = item.item_id or item.name
        if key not in seen:
            seen.append(key)
    first_name = items[0].name or items[0].sku or "Item"
    if len(seen) == 1:
        return first_name
    return f"{first_name} +{len(seen) - 1} more"


def _recent_orders(db: Session, row: CommerceCustomer) -> List[dict]:
    phone_digits = "".join(ch for ch in (row.phone or "") if ch.isdigit())[-10:]
    filters = [CommerceOrder.customer_id == row.id]
    if (row.email or "").strip():
        filters.append(CommerceOrder.customer_email.ilike(row.email.strip()))
    if phone_digits:
        filters.append(CommerceOrder.customer_phone.ilike(f"%{phone_digits}%"))
    commerce_orders = (
        db.query(CommerceOrder)
        .filter(or_(*filters))
        .order_by(CommerceOrder.order_date.desc())
        .limit(20)
        .all()
    )
    sales_orders = (
        db.query(SalesOrder)
        .filter(
            SalesOrder.customer_id == row.id,
            SalesOrder.deleted_at.is_(None),
        )
        .order_by(SalesOrder.order_date.desc(), SalesOrder.created_at.desc())
        .limit(20)
        .all()
    )

    merged: List[dict] = []
    for order in commerce_orders:
        paid = float(order.paid_amount or 0)
        due = float(
            order.due_amount
            if order.due_amount is not None
            else max(0.0, float(order.grand_total or 0) - paid)
        )
        merged.append(
            {
                "id": order.id,
                "orderNumber": order.order_number
                if order.order_number.startswith("#")
                else f"#{order.order_number}",
                "date": order.order_date.strftime("%Y-%m-%d"),
                "productLabel": _commerce_product_label(db, order.id),
                "amount": float(order.grand_total),
                "paid": paid,
                "due": due,
                "status": order.status,
                "paymentStatus": order.payment_status,
                "source": "storefront",
                "_sort": order.order_date.isoformat(),
            }
        )
    for order in sales_orders:
        payment_status, paid, due = _sales_payment_amounts(order.notes, order.total)
        merged.append(
            {
                "id": order.id,
                "orderNumber": order.order_number,
                "date": order.order_date.strftime("%Y-%m-%d"),
                "productLabel": _sales_product_label(db, order.id),
                "amount": float(order.total),
                "paid": paid,
                "due": due,
                "status": order.status,
                "paymentStatus": payment_status,
                "source": "sales",
                "_sort": f"{order.order_date.isoformat()}T{order.created_at.isoformat()}",
            }
        )

    merged.sort(key=lambda item: item.get("_sort") or "", reverse=True)
    out: List[dict] = []
    for item in merged[:20]:
        item.pop("_sort", None)
        out.append(item)
    return out


def _order_summary_read(item: dict) -> CustomerOrderSummaryRead:
    return CustomerOrderSummaryRead(
        id=item["id"],
        order_number=item["orderNumber"],
        date=item["date"],
        product_label=item.get("productLabel") or "Order",
        total=float(item.get("amount") or 0),
        paid=float(item.get("paid") or 0),
        due=float(item.get("due") or 0),
        status=item.get("status") or "",
        payment_status=item.get("paymentStatus") or "",
        source=item.get("source") or "sales",
    )


def _customer_order_detail(
    db: Session,
    customer: CommerceCustomer,
    order_id: str,
    source: str,
) -> CustomerOrderDetailRead:
    source = source.strip().lower()
    if source == "sales":
        order = db.get(SalesOrder, order_id)
        if not order or order.deleted_at is not None or order.customer_id != customer.id:
            raise HTTPException(status_code=404, detail="Order not found")
        payment_status, paid, due = _sales_payment_amounts(order.notes, order.total)
        lines = (
            db.query(SalesOrderLine)
            .filter(SalesOrderLine.sales_order_id == order.id)
            .order_by(SalesOrderLine.sort_order.asc(), SalesOrderLine.line_number.asc())
            .all()
        )
        products = [
            CustomerOrderProductRead(
                name=line.name or line.sku or "Item",
                total_qty=int(line.quantity_ordered or 0),
                lines=[
                    CustomerOrderLineRead(
                        label=line.sku or line.name or "Item",
                        qty=int(line.quantity_ordered or 0),
                        unit_price=float(line.unit_price or 0),
                    )
                ],
            )
            for line in lines
        ]
        return CustomerOrderDetailRead(
            id=order.id,
            order_number=order.order_number,
            date=order.order_date.strftime("%Y-%m-%d"),
            product_label=_sales_product_label(db, order.id),
            total=float(order.total),
            paid=paid,
            due=due,
            status=order.status,
            payment_status=payment_status,
            source="sales",
            customer_name=customer.name,
            phone=customer.phone or "",
            email=customer.email or "",
            delivery_address="",
            delivery_method=order.delivery_status or "",
            shipping_method="",
            products=products,
        )

    order = db.get(CommerceOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    owned = order.customer_id == customer.id
    if not owned and customer.email and order.customer_email:
        owned = order.customer_email.lower() == customer.email.lower()
    if not owned and customer.phone and order.customer_phone:
        a = "".join(ch for ch in customer.phone if ch.isdigit())[-10:]
        b = "".join(ch for ch in order.customer_phone if ch.isdigit())[-10:]
        owned = bool(a) and a == b
    if not owned:
        raise HTTPException(status_code=404, detail="Order not found")

    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order.id)
        .order_by(CommerceOrderItem.sort_order.asc())
        .all()
    )
    grouped: dict[str, CustomerOrderProductRead] = {}
    for item in items:
        key = item.product_id or item.name
        line = CustomerOrderLineRead(
            label=item.variant_label or item.sku or item.name,
            qty=int(item.quantity or 0),
            unit_price=float(item.unit_price or 0),
        )
        existing = grouped.get(key)
        if existing:
            existing.lines.append(line)
            existing.total_qty += int(item.quantity or 0)
        else:
            grouped[key] = CustomerOrderProductRead(
                name=item.name,
                image_url=item.image_url,
                total_qty=int(item.quantity or 0),
                lines=[line],
            )
    paid = float(order.paid_amount or 0)
    due = float(
        order.due_amount
        if order.due_amount is not None
        else max(0.0, float(order.grand_total or 0) - paid)
    )
    shipping_bits = [order.shipping_address or "", order.shipping_city or "", order.shipping_region or ""]
    return CustomerOrderDetailRead(
        id=order.id,
        order_number=order.order_number if order.order_number.startswith("#") else f"#{order.order_number}",
        date=order.order_date.strftime("%Y-%m-%d"),
        product_label=_commerce_product_label(db, order.id),
        total=float(order.grand_total),
        paid=paid,
        due=due,
        status=order.status,
        payment_status=order.payment_status,
        source="storefront",
        customer_name=order.customer_name or customer.name,
        phone=order.customer_phone or customer.phone or "",
        email=order.customer_email or customer.email or "",
        delivery_address=", ".join(part for part in shipping_bits if part),
        delivery_method=order.courier or order.shipment_status or "",
        shipping_method=order.courier or "standard",
        products=list(grouped.values()),
    )


def _identity_verified_flags(db: Session, row: CommerceCustomer) -> tuple[bool, bool]:
    """True when the customer's current phone/email matches an active verified identity."""
    rows = (
        db.query(StorefrontCustomerIdentity)
        .filter(
            StorefrontCustomerIdentity.customer_id == row.id,
            StorefrontCustomerIdentity.is_active.is_(True),
            StorefrontCustomerIdentity.verified_at.isnot(None),
        )
        .all()
    )
    phone_verified = False
    email_verified = False
    if row.phone:
        try:
            phone_norm = normalize_identifier(row.phone)
            if phone_norm.identifier_type == "phone":
                phone_verified = any(
                    r.identifier_type == "phone" and r.identifier == phone_norm.identifier
                    for r in rows
                )
        except CustomerAuthError:
            phone_verified = False
    if row.email:
        try:
            email_norm = normalize_identifier(row.email)
            if email_norm.identifier_type == "email":
                email_verified = any(
                    r.identifier_type == "email" and r.identifier == email_norm.identifier
                    for r in rows
                )
        except CustomerAuthError:
            email_verified = False
    return phone_verified, email_verified


def _admin_addresses(raw) -> list[dict]:
    """Saved addresses in the admin's shape. The storefront (checkout, My Account) writes the street as `line1`
    and the default flag as `is_default`; the admin reads and writes `address` / `isDefault`. The street the
    storefront wrote last wins, and `line1` is left out so an admin edit saved back isn't shadowed by it."""
    out: list[dict] = []
    for i, a in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(a, dict):
            continue
        item = {k: v for k, v in a.items() if k not in ("line1", "is_default")}
        item["address"] = (a.get("line1") or a.get("address") or "").strip()
        item["isDefault"] = bool(a.get("isDefault", a.get("is_default", i == 0)))
        item.setdefault("id", f"addr-{i + 1}")
        item.setdefault("label", (a.get("label") or a.get("type") or "Address").title())
        for key in ("city", "region", "country"):
            item[key] = item.get(key) or None  # blank → the admin falls back to the customer's own city / country
        out.append(item)
    return out


def _to_read(
    db: Session,
    row: CommerceCustomer,
    include_recent: bool = True,
    links=None,
    *,
    profile: bool = True,
    include_links: bool = True,
) -> CustomerRead:
    if profile:
        recent = _recent_orders(db, row) if include_recent else []
        phone_verified, email_verified = _identity_verified_flags(db, row)
        wallet_transactions = load_json(row.wallet_transactions_json, [])
        reward_events = load_json(row.reward_events_json, [])
        timeline = load_json(row.timeline_json, [])
        comments = load_json(row.comments_json, [])
        activities = load_json(row.activities_json, [])
        attachments = load_json(row.attachments_json, [])
        ai_insights = load_json(row.ai_insights_json, {})
    else:
        recent = []
        phone_verified, email_verified = False, False
        wallet_transactions = []
        reward_events = []
        timeline = []
        comments = []
        activities = []
        attachments = []
        ai_insights = {}
    # the list carries addresses too: the sales order form picks its customer from the list, and without them a
    # storefront customer's order showed only "Dhaka, Dhaka, 1207" in the admin's shipping tab
    addresses = _admin_addresses(load_json(row.addresses_json, []))
    notes = None if not profile else row.notes
    if include_links and links is None and row.party_id:
        from app.services.parties.party_commerce_links import links_for_party

        links = links_for_party(db, row.party_id)
    return CustomerRead(
        id=row.id,
        company_id=row.company_id,
        customer_code=row.customer_code,
        name=row.name,
        phone=row.phone,
        email=row.email,
        profile_image=row.profile_image,
        group=row.group,
        status=row.status,
        loyalty_tier=row.loyalty_tier,
        city=row.city,
        region=row.region,
        country=row.country,
        customer_since=row.customer_since,
        last_order_date=row.last_order_date,
        assigned_staff=row.assigned_staff,
        tags=load_json(row.tags_json, []),
        total_orders=row.total_orders,
        total_spend=row.total_spend,
        avg_order_value=row.avg_order_value,
        return_rate=row.return_rate,
        reward_points=row.reward_points,
        wallet_balance=row.wallet_balance,
        opening_balance=getattr(row, "opening_balance", None) or Decimal("0"),
        credit_limit=getattr(row, "credit_limit", None) or Decimal("0"),
        rma_locked=bool(getattr(row, "rma_locked", False)),
        rma_lock_reason=getattr(row, "rma_lock_reason", None),
        sales_locked=bool(getattr(row, "sales_locked", False)),
        sales_lock_reason=getattr(row, "sales_lock_reason", None),
        trade_mode=getattr(row, "trade_mode", None) or "both",
        credit_days=getattr(row, "credit_days", None),
        conditional_limit=getattr(row, "conditional_limit", None) or Decimal("0"),
        conditional_valid_till=getattr(row, "conditional_valid_till", None),
        security_money=getattr(row, "security_money", None) or Decimal("0"),
        opening_date=getattr(row, "opening_date", None),
        payment_terms=getattr(row, "payment_terms", None),
        payment_schedule=getattr(row, "payment_schedule", None),
        risk_score=row.risk_score,
        risk_level=row.risk_level,
        notes=notes,
        phone_verified=phone_verified,
        email_verified=email_verified,
        whatsapp_verified=bool(getattr(row, "whatsapp_verified", False)),
        addresses=addresses,
        recent_orders=recent,
        wallet_transactions=wallet_transactions,
        reward_events=reward_events,
        timeline=timeline,
        comments=comments,
        activities=activities,
        attachments=attachments,
        ai_insights=ai_insights,
        created_at=row.created_at,
        updated_at=row.updated_at,
        party_id=row.party_id,
        roles=list(links.roles) if links else (["customer"] if row.party_id else []),
        linked_supplier_id=links.supplier.id if links and links.supplier else None,
        linked_supplier_name=links.supplier.name if links and links.supplier else None,
        linked_vendor_id=links.vendor.id if links and links.vendor else None,
        linked_vendor_name=links.vendor.name if links and links.vendor else None,
    )


def _append_timeline(
    row: CommerceCustomer,
    title: str,
    actor: str = "Admin",
    *,
    event_type: str = "activity",
    description: Optional[str] = None,
    role: Optional[str] = "admin",
) -> None:
    append_customer_timeline(
        row,
        title,
        actor=actor,
        event_type=event_type,
        description=description,
        role=role,
    )


def _field_label(key: str) -> str:
    labels = {
        "name": "Name",
        "phone": "Phone",
        "email": "Email",
        "city": "City",
        "region": "Region",
        "country": "Country",
        "status": "Status",
        "group": "Customer group",
        "loyalty_tier": "Loyalty tier",
        "assigned_staff": "Salesperson",
        "notes": "Internal notes",
        "profile_image": "Profile photo",
        "opening_balance": "Opening balance",
        "credit_limit": "Credit limit",
        "rma_locked": "RMA locked",
        "rma_lock_reason": "RMA lock reason",
        "sales_locked": "Sales locked",
        "sales_lock_reason": "Sales lock reason",
        "trade_mode": "Sells on",
        "credit_days": "Credit days",
        "conditional_limit": "Conditional limit",
        "conditional_valid_till": "Conditional limit valid till",
        "security_money": "Security money",
        "opening_date": "Opening date",
        "tags": "Tags",
        "addresses": "Addresses",
    }
    return labels.get(key, key.replace("_", " ").title())


def _summarize_customer_changes(
    row: CommerceCustomer,
    updates: dict,
    *,
    tags_changed: bool = False,
    addresses_changed: bool = False,
) -> list[str]:
    changes: list[str] = []
    scalar_keys = (
        "name",
        "phone",
        "email",
        "city",
        "region",
        "country",
        "status",
        "group",
        "loyalty_tier",
        "assigned_staff",
        "notes",
        "profile_image",
        "opening_balance",
        "credit_limit",
        "payment_terms",
        "payment_schedule",
        "rma_locked",
        "rma_lock_reason",
        "sales_locked",
        "sales_lock_reason",
        "trade_mode",
        "credit_days",
        "conditional_limit",
        "conditional_valid_till",
        "security_money",
        "opening_date",
    )
    for key in scalar_keys:
        if key not in updates:
            continue
        old = getattr(row, key, None)
        new = updates[key]
        if isinstance(old, Decimal) or isinstance(new, Decimal):
            old_cmp = Decimal(str(old or 0))
            new_cmp = Decimal(str(new or 0))
            if old_cmp == new_cmp:
                continue
            changes.append(f"{_field_label(key)}: {old_cmp} → {new_cmp}")
            continue
        old_s = "" if old is None else str(old)
        new_s = "" if new is None else str(new)
        if old_s == new_s:
            continue
        if key in {"notes", "profile_image"}:
            changes.append(f"{_field_label(key)} updated")
        else:
            changes.append(f"{_field_label(key)}: {old_s or '—'} → {new_s or '—'}")
    if tags_changed:
        changes.append("Tags updated")
    if addresses_changed:
        changes.append("Addresses updated")
    return changes


_CUSTOMER_LIST_INDEXES_READY = False
_LIST_DEFERRED = (
    defer(CommerceCustomer.timeline_json),
    defer(CommerceCustomer.comments_json),
    defer(CommerceCustomer.activities_json),
    defer(CommerceCustomer.attachments_json),
    defer(CommerceCustomer.wallet_transactions_json),
    defer(CommerceCustomer.reward_events_json),
    defer(CommerceCustomer.ai_insights_json),
    defer(CommerceCustomer.notes),
)


def _ensure_customer_list_indexes(db: Session) -> None:
    global _CUSTOMER_LIST_INDEXES_READY
    if _CUSTOMER_LIST_INDEXES_READY:
        return
    try:
        bind = db.get_bind()
        with bind.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_commerce_customers_company_name "
                    "ON commerce_customers (company_id, name)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_commerce_customers_company_status "
                    "ON commerce_customers (company_id, status)"
                )
            )
    except Exception:
        # List still works without extra indexes (full scan / existing indexes).
        pass
    _CUSTOMER_LIST_INDEXES_READY = True


_LIST_SORT_COLUMNS = {
    "name": CommerceCustomer.name,
    "created_at": CommerceCustomer.created_at,
    "customer_since": CommerceCustomer.customer_since,
    "total_orders": CommerceCustomer.total_orders,
    "total_spend": CommerceCustomer.total_spend,
    "last_order_date": CommerceCustomer.last_order_date,
}
_AR_SORT_KEYS = ("due", "advance")


def _ar_aggregates(db: Session, company_id: str, customer_ids: Optional[list[str]] = None):
    """Per-customer AR totals as two grouped subqueries plus the derived
    `closing` (billed − net receipts) — the same numbers the ledger summary
    reports as outstanding/advance, so the list and the sheet always agree.
    Pass `customer_ids` to aggregate just one page instead of every customer."""
    billed_q = db.query(
        FinanceReceivable.customer_id.label("customer_id"),
        func.coalesce(func.sum(FinanceReceivable.amount), 0).label("billed"),
        func.coalesce(
            func.sum(case((FinanceReceivable.balance > 0, 1), else_=0)), 0
        ).label("open_count"),
    ).filter(FinanceReceivable.company_id == company_id)
    paid_q = db.query(
        FinancePayment.party_id.label("party_id"),
        func.coalesce(
            func.sum(
                case(
                    (FinancePayment.direction == "inbound", FinancePayment.amount),
                    else_=-FinancePayment.amount,
                )
            ),
            0,
        ).label("paid"),
    ).filter(FinancePayment.company_id == company_id, FinancePayment.party_id.isnot(None))
    if customer_ids is not None:
        billed_q = billed_q.filter(FinanceReceivable.customer_id.in_(customer_ids))
        paid_q = paid_q.filter(FinancePayment.party_id.in_(customer_ids))
    billed = billed_q.group_by(FinanceReceivable.customer_id).subquery("ar_billed")
    paid = paid_q.group_by(FinancePayment.party_id).subquery("ar_paid")
    closing = func.coalesce(billed.c.billed, 0) - func.coalesce(paid.c.paid, 0)
    return billed, paid, closing


def _join_ar(query, billed, paid):
    return (
        query.select_from(CommerceCustomer)
        .outerjoin(billed, billed.c.customer_id == CommerceCustomer.id)
        .outerjoin(paid, paid.c.party_id == CommerceCustomer.id)
    )


def _ar_snapshot(
    db: Session, company_id: str, customer_ids: list[str]
) -> dict[str, tuple[Decimal, int]]:
    """{customer_id: (closing, open_invoice_count)} for the given ids only."""
    if not customer_ids:
        return {}
    billed, paid, closing = _ar_aggregates(db, company_id, customer_ids)
    rows = (
        _join_ar(
            db.query(CommerceCustomer.id, closing, func.coalesce(billed.c.open_count, 0)),
            billed,
            paid,
        )
        .filter(CommerceCustomer.id.in_(customer_ids))
        .all()
    )
    return {
        cid: (Decimal(str(closing_value or 0)), int(open_count or 0))
        for cid, closing_value, open_count in rows
    }


@router.get("", response_model=CustomerListResponse)
def list_customers(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    group: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    has_due: Optional[bool] = Query(default=None),
    sort: str = Query(default="name"),
    order: str = Query(default="asc"),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
) -> CustomerListResponse:
    _ensure_customer_list_indexes(db)
    filters = [CommerceCustomer.company_id == company_id]
    if status:
        filters.append(CommerceCustomer.status == status)
    if group:
        filters.append(CommerceCustomer.group == group)
    if city:
        filters.append(CommerceCustomer.city == city)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                CommerceCustomer.name.ilike(term),
                CommerceCustomer.phone.ilike(term),
                CommerceCustomer.email.ilike(term),
                CommerceCustomer.customer_code.ilike(term),
            )
        )

    sort_key = sort if (sort in _LIST_SORT_COLUMNS or sort in _AR_SORT_KEYS) else "name"
    descending = (order or "").lower() == "desc"
    order_key = "desc" if descending else "asc"

    # The AR join over every customer (~15 ms on 6k rows) is only pulled into
    # the count/page queries when the request filters or sorts by balance.
    billed, paid, closing = _ar_aggregates(db, company_id)
    due_expr = case((closing > 0, closing), else_=0)
    advance_expr = case((closing < 0, -closing), else_=0)
    needs_ar = bool(has_due) or sort_key in _AR_SORT_KEYS
    if has_due:
        filters.append(closing > 0)

    def base(query):
        return _join_ar(query, billed, paid) if needs_ar else query

    total = base(db.query(func.count(CommerceCustomer.id))).filter(*filters).scalar() or 0
    total_spend = (
        base(db.query(func.coalesce(func.sum(CommerceCustomer.total_spend), 0)))
        .filter(*filters)
        .scalar()
        or 0
    )
    total_due = (
        _join_ar(db.query(func.coalesce(func.sum(due_expr), 0)), billed, paid)
        .filter(*filters)
        .scalar()
        or 0
    )

    if sort_key == "due":
        sort_col = due_expr
    elif sort_key == "advance":
        sort_col = advance_expr
    else:
        sort_col = _LIST_SORT_COLUMNS[sort_key]
    primary = sort_col.desc().nulls_last() if descending else sort_col.asc().nulls_first()
    rows = (
        base(db.query(CommerceCustomer))
        .options(*_LIST_DEFERRED)
        .filter(*filters)
        .order_by(primary, CommerceCustomer.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    data = [
        _to_read(db, row, include_recent=False, include_links=False, profile=False)
        for row in rows
    ]
    snapshot = _ar_snapshot(db, company_id, [row.id for row in rows])
    for item in data:
        closing_value, open_count = snapshot.get(item.id, (Decimal("0"), 0))
        item.due = max(closing_value, Decimal("0"))
        item.advance = max(-closing_value, Decimal("0"))
        item.open_invoice_count = open_count
    return CustomerListResponse(
        data=data,
        meta=CustomerListMeta(
            count=int(total),
            total_spend=total_spend,
            total_due=total_due,
            limit=limit,
            offset=offset,
            sort=sort_key,
            order=order_key,
        ),
    )


def _next_customer_code(db: Session, company_id: str = "default") -> str:
    def seed() -> int:
        # Continue above the highest legacy "C-" code rather than restarting.
        best = 10000
        for (code,) in db.query(CommerceCustomer.customer_code).all():
            if isinstance(code, str) and code.startswith("C-"):
                digits = code.split("-", 1)[1]
                if digits.isdigit():
                    best = max(best, int(digits))
        return best + 1

    row = get_sequence(db, company_id, "commerce.customer")
    if row.prefix != "C-":
        row.prefix = "C-"
        row.padding = 0
    return allocate_number(
        db,
        company_id,
        "commerce.customer",
        initial=seed,
        is_taken=lambda code: db.query(CommerceCustomer.id)
        .filter(CommerceCustomer.customer_code == code)
        .first()
        is not None,
    )


def _phone_digits(value: str | None) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())[-11:]


def _assert_unique_phone_email(
    db: Session,
    *,
    phone: str,
    email: str,
    exclude_customer_id: str | None = None,
) -> None:
    """Reject create/update when another customer already uses the same phone or email."""
    phone_key = _phone_digits(phone)
    email_key = (email or "").strip().lower()

    if phone_key:
        # Same normalisation as _phone_digits (digits only, last 11), done in SQL
        # so it is one indexed-table query instead of loading every customer.
        stored_key = func.right(func.regexp_replace(CommerceCustomer.phone, r"\D", "", "g"), 11)
        query = db.query(CommerceCustomer.name).filter(
            CommerceCustomer.phone != "",
            stored_key == phone_key,
        )
        if exclude_customer_id:
            query = query.filter(CommerceCustomer.id != exclude_customer_id)
        other = query.first()
        if other:
            raise HTTPException(
                status_code=409,
                detail=f"Phone number already used by {other[0]}",
            )

    if email_key:
        query = db.query(CommerceCustomer).filter(
            CommerceCustomer.email != "",
            CommerceCustomer.email.ilike(email_key),
        )
        if exclude_customer_id:
            query = query.filter(CommerceCustomer.id != exclude_customer_id)
        other = query.first()
        if other:
            raise HTTPException(
                status_code=409,
                detail=f"Email already used by {other.name}",
            )


def _customer_has_blocking_records(db: Session, customer_id: str) -> bool:
    if (
        db.query(SalesOrder.id)
        .filter(
            SalesOrder.customer_id == customer_id,
            SalesOrder.deleted_at.is_(None),
        )
        .first()
        is not None
    ):
        return True
    if (
        db.query(CommerceOrder.id)
        .filter(CommerceOrder.customer_id == customer_id)
        .first()
        is not None
    ):
        return True
    return False


@router.get("/crm-summary", response_model=CustomerCrmSummaryResponse)
def customers_crm_summary(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCrmSummaryResponse:
    project_counts = dict(
        db.query(CrmProject.customer_id, func.count(CrmProject.id))
        .filter(CrmProject.company_id == company_id, CrmProject.customer_id.isnot(None))
        .group_by(CrmProject.customer_id)
        .all()
    )
    receivable_rows = (
        db.query(
            FinanceReceivable.customer_id,
            func.coalesce(func.sum(FinanceReceivable.amount), 0),
            func.coalesce(func.sum(FinanceReceivable.amount_paid), 0),
            func.coalesce(func.sum(FinanceReceivable.balance), 0),
        )
        .filter(FinanceReceivable.company_id == company_id)
        .group_by(FinanceReceivable.customer_id)
        .all()
    )
    finance_by_customer = {r[0]: (r[1], r[2], r[3]) for r in receivable_rows}

    label_rows = (
        db.query(CollabLabel.entity_id, CollabLabel.label_display)
        .filter(CollabLabel.company_id == company_id, CollabLabel.entity_type == "customer")
        .all()
    )
    labels_by_customer: dict[str, list[str]] = {}
    for entity_id, label_display in label_rows:
        labels_by_customer.setdefault(entity_id, []).append(label_display)

    contacts = (
        db.query(CommerceCustomerContact)
        .filter(CommerceCustomerContact.company_id == company_id)
        .all()
    )
    primary_by_customer: dict[str, str] = {}
    contact_counts: dict[str, int] = {}
    for c in contacts:
        contact_counts[c.customer_id] = contact_counts.get(c.customer_id, 0) + 1
        if c.is_primary or c.customer_id not in primary_by_customer:
            primary_by_customer[c.customer_id] = c.name

    customer_ids = (
        db.query(CommerceCustomer.id).filter(CommerceCustomer.company_id == company_id).all()
    )
    items = []
    for (cid,) in customer_ids:
        amount, paid, balance = finance_by_customer.get(cid, (0, 0, 0))
        items.append(
            CustomerCrmSummaryItem(
                customer_id=cid,
                primary_contact_name=primary_by_customer.get(cid),
                contact_count=contact_counts.get(cid, 0),
                project_count=project_counts.get(cid, 0),
                label_names=labels_by_customer.get(cid, []),
                total_invoiced=amount,
                payment_received=paid,
                due=balance,
            )
        )
    return CustomerCrmSummaryResponse(data=items)


@router.post("/bulk-delete", response_model=CustomerBulkDeleteResponse)
def bulk_delete_customers(
    payload: CustomerBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerBulkDeleteResponse:
    deleted = 0
    skipped: list[str] = []
    for customer_id in payload.ids:
        row = db.get(CommerceCustomer, customer_id)
        if not row or (row.company_id or "default") != company_id:
            skipped.append(customer_id)
            continue
        if _customer_has_blocking_records(db, row.id):
            skipped.append(customer_id)
            continue
        db.delete(row)
        deleted += 1
    db.commit()
    return CustomerBulkDeleteResponse(
        data=CustomerBulkDeleteResult(deleted=deleted, skipped=skipped),
    )


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    if _customer_has_blocking_records(db, row.id):
        raise HTTPException(
            status_code=409,
            detail="Customer has related orders and cannot be deleted",
        )
    db.delete(row)
    db.commit()


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    phone = payload.phone.strip()
    email = payload.email.strip()
    _assert_unique_phone_email(db, phone=phone, email=email)
    row = CommerceCustomer(
        id=str(uuid.uuid4()),
        company_id=company_id,
        customer_code=_next_customer_code(db),
        name=payload.name.strip(),
        phone=phone,
        email=email,
        profile_image=(payload.profile_image.strip() or None) if payload.profile_image else None,
        group=payload.group,
        city=payload.city.strip(),
        region=payload.region.strip(),
        country=payload.country.strip() or "Bangladesh",
        customer_since=date.today(),
        assigned_staff=payload.assigned_staff,
        notes=payload.notes,
        tags_json=dump_json(payload.tags or []),
        addresses_json=dump_json(payload.addresses or []),
        opening_balance=payload.opening_balance if payload.opening_balance is not None else Decimal("0"),
        credit_limit=payload.credit_limit if payload.credit_limit is not None else Decimal("0"),
        payment_terms=payload.payment_terms,
        payment_schedule=payload.payment_schedule,
    )
    _append_timeline(row, "Customer created")
    # Party must exist (and party_id be set) BEFORE the first insert — party_id
    # is NOT NULL, so row.id is generated up front above instead of left to the
    # column's lazy default, and ensure_party_for_customer runs before db.add().
    from app.services.parties.commerce_party_bridge import ensure_party_for_customer

    ensure_party_for_customer(db, row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    from app.services.parties.commerce_party_bridge import ensure_party_for_customer

    if not row.party_id:
        ensure_party_for_customer(db, row)
        db.commit()
        db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


@router.get("/{customer_id}/orders", response_model=CustomerOrdersResponse)
def list_customer_orders(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerOrdersResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerOrdersResponse(data=[_order_summary_read(item) for item in _recent_orders(db, row)])


@router.get("/{customer_id}/payments", response_model=CustomerPaymentHistoryResponse)
def list_customer_payments(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerPaymentHistoryResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    entries = _payment_history_for_customer(db, row)
    total_paid = sum(
        float(item["amount"])
        for item in entries
        if item.get("kind") in {"payment", "wallet"} and "refund" not in str(item.get("status") or "").lower()
    )
    total_refunded = sum(
        float(item["amount"]) for item in entries if item.get("kind") == "refund"
    )
    return CustomerPaymentHistoryResponse(
        data=[CustomerPaymentHistoryItem(**item) for item in entries],
        meta={
            "count": len(entries),
            "total_paid": round(total_paid, 2),
            "total_refunded": round(total_refunded, 2),
        },
    )


@router.get("/{customer_id}/ledger", response_model=CustomerLedgerResponse)
def customer_ledger(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerLedgerResponse:
    entries, summary = customer_ledger_service.ledger(
        db, customer_id, company_id=company_id
    )
    return CustomerLedgerResponse(data=entries, meta=summary)


@router.post("/{customer_id}/ledger/invoices", response_model=CustomerInvoiceResponse, status_code=201)
def raise_customer_invoice(
    customer_id: str,
    payload: CustomerInvoiceCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerInvoiceResponse:
    invoice = customer_ledger_service.raise_invoice(
        db, customer_id, payload, company_id=company_id
    )
    return CustomerInvoiceResponse(data=invoice)


@router.get("/{customer_id}/credit", response_model=CustomerCreditPositionResponse)
def customer_credit_position(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCreditPositionResponse:
    """What the customer owes, open orders, the limit in force and what is left (services/customer/credit_control.py)."""
    from app.services.customer.credit_control import credit_position

    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    pos = credit_position(db, row)
    return CustomerCreditPositionResponse(
        data=CustomerCreditPositionRead(
            ledger_balance=pos.ledger_balance,
            unsettled_orders=pos.unsettled_orders,
            exposure=pos.exposure,
            credit_limit=pos.credit_limit,
            conditional_limit=pos.conditional_limit,
            conditional_valid_till=pos.conditional_valid_till,
            effective_limit=pos.effective_limit,
            available=pos.available,
            sales_locked=bool(getattr(row, "sales_locked", False)),
            trade_mode=getattr(row, "trade_mode", None) or "both",
        )
    )


@router.post("/{customer_id}/ledger/payments", response_model=CustomerPaymentResponse, status_code=201)
def record_customer_ledger_payment(
    customer_id: str,
    payload: CustomerPaymentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerPaymentResponse:
    if payload.amount > 0:
        payload.payment_account_id = pick_payment_account(db, user, payload.payment_account_id)
    payment = customer_ledger_service.record_payment(
        db, customer_id, payload, company_id=company_id
    )
    return CustomerPaymentResponse(data=payment)


@router.get("/{customer_id}/orders/{order_id}", response_model=CustomerOrderDetailResponse)
def get_customer_order(
    customer_id: str,
    order_id: str,
    source: str = Query(default="sales", pattern="^(sales|storefront)$"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerOrderDetailResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerOrderDetailResponse(data=_customer_order_detail(db, row, order_id, source))


@router.post("/{customer_id}/orders/{order_id}/ensure-sales")
def ensure_customer_order_sales(
    customer_id: str,
    order_id: str,
    source: str = Query(default="storefront", pattern="^(sales|storefront)$"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """Return a sales-order id for the customer Orders tab (open Sales drawer)."""
    from app.models.commerce_order_item import CommerceOrderItem
    from app.services.sales.sales_service import SalesService

    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    order_key = order_id.strip()
    source_key = source.strip().lower()

    if source_key == "sales":
        sales = db.get(SalesOrder, order_key)
        if not sales or sales.deleted_at is not None or sales.customer_id != row.id:
            sales = (
                db.query(SalesOrder)
                .filter(
                    SalesOrder.customer_id == row.id,
                    SalesOrder.deleted_at.is_(None),
                    SalesOrder.order_number == order_key.lstrip("#"),
                )
                .first()
            )
        if not sales:
            raise HTTPException(status_code=404, detail="Sales order not found")
        return {"data": {"id": sales.id, "order_number": sales.order_number}}

    commerce = db.get(CommerceOrder, order_key)
    if not commerce:
        commerce = (
            db.query(CommerceOrder)
            .filter(
                CommerceOrder.customer_id == row.id,
                CommerceOrder.order_number == order_key.lstrip("#"),
            )
            .first()
        )
    if not commerce or commerce.customer_id != row.id:
        raise HTTPException(status_code=404, detail="Order not found")

    marker = f"commerce_order_id={commerce.id}"
    existing = (
        db.query(SalesOrder)
        .filter(
            SalesOrder.customer_id == row.id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.notes.contains(marker),
        )
        .first()
    )
    if not existing:
        existing = (
            db.query(SalesOrder)
            .filter(
                SalesOrder.customer_id == row.id,
                SalesOrder.deleted_at.is_(None),
                SalesOrder.order_number == (commerce.order_number or "")[:32],
            )
            .first()
        )
    if existing:
        return {"data": {"id": existing.id, "order_number": existing.order_number}}

    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == commerce.id)
        .order_by(CommerceOrderItem.sort_order.asc())
        .all()
    )
    svc = SalesService(db)
    warehouse_id = svc.resolve_default_warehouse(commerce.company_id or "default")
    sales = svc.sync_from_storefront_order(commerce, items, warehouse_id=warehouse_id)
    if not sales:
        raise HTTPException(
            status_code=409,
            detail="Could not open Sales order for this storefront order",
        )
    db.commit()
    db.refresh(sales)
    return {"data": {"id": sales.id, "order_number": sales.order_number}}


@router.post(
    "/{customer_id}/orders/{order_id}/record-payment",
    response_model=CustomerOrderDetailResponse,
)
def record_customer_order_payment(
    customer_id: str,
    order_id: str,
    payload: CustomerOrderRecordPaymentRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerOrderDetailResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    amount = float(Decimal(payload.amount).quantize(Decimal("0.01")))
    method = payload.method.strip() or "Cash"
    note = (payload.note or "").strip()
    source = payload.source.strip().lower()

    if source == "sales":
        order = db.get(SalesOrder, order_id)
        if not order or order.deleted_at is not None or order.customer_id != row.id:
            raise HTTPException(status_code=404, detail="Order not found")
        status, paid, due = _sales_payment_amounts(order.notes, order.total)
        if amount > due + 0.009:
            raise HTTPException(status_code=400, detail="Amount exceeds due balance")
        import json as _json

        history: list = []
        match = _PAYMENT_META_RE.search(order.notes or "")
        if match:
            try:
                history = list((_json.loads(match.group(1) or "{}").get("history") or []))
            except Exception:
                history = []
        history.insert(
            0,
            {
                "id": f"pay_{int(datetime.utcnow().timestamp() * 1000)}",
                "label": note or f"Admin payment · {method}",
                "amount": amount,
                "status": "completed",
                "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "method": method,
            },
        )
        next_paid = paid + amount
        next_due = max(0.0, float(order.total or 0) - next_paid)
        next_status = "unpaid" if next_paid <= 0 else "partial" if next_due > 0 else "paid"
        order.notes = _pack_sales_payment_notes(
            order.notes,
            paid=next_paid,
            due=next_due,
            status=next_status,
            method=method,
            history=history,
        )
    else:
        order = db.get(CommerceOrder, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        owned = order.customer_id == row.id
        if not owned and row.email and order.customer_email:
            owned = order.customer_email.lower() == row.email.lower()
        if not owned and row.phone and order.customer_phone:
            a = "".join(ch for ch in row.phone if ch.isdigit())[-10:]
            b = "".join(ch for ch in order.customer_phone if ch.isdigit())[-10:]
            owned = bool(a) and a == b
        if not owned:
            raise HTTPException(status_code=404, detail="Order not found")
        paid = float(order.paid_amount or 0)
        due = float(
            order.due_amount
            if order.due_amount is not None
            else max(0.0, float(order.grand_total or 0) - paid)
        )
        if amount > due + 0.009:
            raise HTTPException(status_code=400, detail="Amount exceeds due balance")
        next_paid = paid + amount
        next_due = max(0.0, float(order.grand_total or 0) - next_paid)
        order.paid_amount = Decimal(str(next_paid)).quantize(Decimal("0.01"))
        order.due_amount = Decimal(str(next_due)).quantize(Decimal("0.01"))
        order.payment_status = (
            "unpaid" if next_paid <= 0 else "partial" if next_due > 0 else "paid"
        )
        payment_timeline = load_json(order.payment_timeline_json, [])
        if not isinstance(payment_timeline, list):
            payment_timeline = []
        payment_timeline.insert(
            0,
            {
                "id": f"pay_{int(datetime.utcnow().timestamp() * 1000)}",
                "label": note or f"Admin payment · {method}",
                "amount": amount,
                "status": "completed",
                "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "method": method,
            },
        )
        order.payment_timeline_json = dump_json(payment_timeline)
        timeline = load_json(order.timeline_json, []) if hasattr(order, "timeline_json") else []
        if isinstance(timeline, list):
            timeline.insert(
                0,
                {
                    "id": f"pay_{int(datetime.utcnow().timestamp() * 1000)}",
                    "title": f"Payment recorded · {method} · ৳{amount:.2f}",
                    "actor": (user.name or user.email or "Admin"),
                    "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "note": note or None,
                },
            )
            if hasattr(order, "timeline_json"):
                order.timeline_json = dump_json(timeline)

    actor = (user.name or user.email or "Admin").strip() or "Admin"
    _append_timeline(row, f"Payment ৳{amount:.2f} recorded on order ({source})", actor=actor)
    db.commit()
    return CustomerOrderDetailResponse(data=_customer_order_detail(db, row, order_id, source))


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    updates = payload.model_dump(exclude_unset=True)
    tags_changed = False
    addresses_changed = False
    if "tags" in updates:
        new_tags = updates.pop("tags")
        if load_json(row.tags_json, []) != (new_tags or []):
            tags_changed = True
        row.tags_json = dump_json(new_tags or [])
    if "addresses" in updates:
        new_addresses = updates.pop("addresses")
        if load_json(row.addresses_json, []) != (new_addresses or []):
            addresses_changed = True
        row.addresses_json = dump_json(new_addresses or [])
    if "comments" in updates:
        row.comments_json = dump_json(updates.pop("comments"))
    if "timeline" in updates:
        # Client must not overwrite server history via patch
        updates.pop("timeline")

    change_lines = _summarize_customer_changes(
        row,
        updates,
        tags_changed=tags_changed,
        addresses_changed=addresses_changed,
    )

    next_phone = str(updates.get("phone", row.phone) or "").strip()
    next_email = str(updates.get("email", row.email) or "").strip()
    if "phone" in updates:
        updates["phone"] = next_phone
        if next_phone != (row.phone or "").strip():
            updates["whatsapp_verified"] = False
            change_lines.append("WhatsApp verification cleared (phone changed)")
    if "email" in updates:
        updates["email"] = next_email
    # The sheet always sends phone + email; only a value that actually changed
    # (after normalisation) needs the duplicate check, otherwise legacy records
    # that already share a number could never be saved.
    phone_changed = "phone" in updates and _phone_digits(next_phone) != _phone_digits(row.phone)
    email_changed = "email" in updates and next_email.lower() != (row.email or "").strip().lower()
    if phone_changed or email_changed:
        _assert_unique_phone_email(
            db,
            phone=next_phone if phone_changed else "",
            email=next_email if email_changed else "",
            exclude_customer_id=row.id,
        )

    for key, value in updates.items():
        setattr(row, key, value)

    if change_lines:
        actor = (user.name or user.email or "Admin").strip() or "Admin"
        title = change_lines[0] if len(change_lines) == 1 else f"Updated {len(change_lines)} fields"
        description = None if len(change_lines) == 1 else "; ".join(change_lines)
        event_type = "status_change" if "status" in updates and len(change_lines) == 1 else "activity"
        _append_timeline(
            row,
            title,
            actor=actor,
            event_type=event_type,
            description=description,
        )

    db.commit()
    db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


@router.post("/{customer_id}/verify-contact", response_model=CustomerResponse)
def verify_customer_contact(
    customer_id: str,
    payload: VerifyContactRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    """Mark phone or email verified without storefront OTP (admin override)."""
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    channel = payload.channel.strip().lower()
    raw = (payload.value or "").strip()
    if not raw:
        raw = (row.phone if channel == "phone" else row.email) or ""
    if not raw.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Enter a {channel} before marking verified",
        )

    try:
        normalized = normalize_identifier(raw)
    except CustomerAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if normalized.identifier_type != channel:
        raise HTTPException(
            status_code=400,
            detail=f"Value is not a valid {channel}",
        )

    identity = (
        db.query(StorefrontCustomerIdentity)
        .filter(StorefrontCustomerIdentity.identifier == normalized.identifier)
        .first()
    )
    now = datetime.utcnow()
    if identity and identity.customer_id != row.id:
        other = db.get(CommerceCustomer, identity.customer_id)
        if other and (other.company_id or "default") != company_id:
            other = None
        other_label = other.name if other else "another customer"
        raise HTTPException(
            status_code=409,
            detail=f"This {channel} is already verified for {other_label}",
        )

    if identity:
        identity.customer_id = row.id
        identity.verified_at = now
        identity.is_active = True
        identity.display_identifier = normalized.display
        identity.identifier_type = normalized.identifier_type
    else:
        identity = StorefrontCustomerIdentity(
            customer_id=row.id,
            identifier=normalized.identifier,
            identifier_type=normalized.identifier_type,
            display_identifier=normalized.display,
            verified_at=now,
            is_active=True,
        )
        db.add(identity)

    if channel == "phone":
        row.phone = normalized.display
    else:
        row.email = normalized.display

    actor = (user.name or user.email or "Admin").strip() or "Admin"
    _append_timeline(row, f"{channel.title()} marked verified by admin", actor=actor)

    db.commit()
    db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


@router.post("/{customer_id}/verify-whatsapp", response_model=CustomerResponse)
def verify_customer_whatsapp(
    customer_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    """Check if the customer phone is on WhatsApp (server-side), then persist the result."""
    from app.services.whatsapp_check import check_whatsapp_number

    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    phone = (row.phone or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Enter a phone number before verifying WhatsApp")

    available, message = check_whatsapp_number(phone)
    actor = (user.name or user.email or "Admin").strip() or "Admin"
    if not available:
        row.whatsapp_verified = False
        _append_timeline(
            row,
            f"WhatsApp check failed for {phone}",
            actor=actor,
            event_type="activity",
            description=message,
            role="admin",
        )
        db.commit()
        db.refresh(row)
        raise HTTPException(status_code=422, detail=message)

    row.whatsapp_verified = True
    _append_timeline(
        row,
        f"WhatsApp verified for {phone}",
        actor=actor,
        event_type="activity",
        description=message,
        role="admin",
    )
    db.commit()
    db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


@router.post("/{customer_id}/wallet/recharge", response_model=CustomerResponse)
def recharge_customer_wallet(
    customer_id: str,
    payload: WalletRechargeRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    method_id = payload.payment_method.strip().lower()
    if method_id not in WALLET_GATEWAY_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Wallet recharge requires a payment gateway (bKash, Nagad, or SSLCommerz)",
        )

    payment_reference = payload.payment_reference.strip()
    if len(payment_reference) < 3:
        raise HTTPException(
            status_code=400,
            detail="Payment gateway transaction ID is required",
        )

    amount = Decimal(payload.amount).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    gateway_label = PAYMENT_METHODS[method_id].label
    row.wallet_balance = (row.wallet_balance or Decimal("0")) + amount
    txs = load_json(row.wallet_transactions_json, [])
    if not isinstance(txs, list):
        txs = []
    note = (payload.note or "").strip()
    label = f"Recharge via {gateway_label} · Trx {payment_reference}"
    if note:
        label = f"{label} — {note}"
    txs.insert(
        0,
        {
            "id": f"wt_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{len(txs) + 1}",
            "label": label,
            "amount": float(amount),
            "type": "credit",
            "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "payment_method": method_id,
            "payment_reference": payment_reference,
        },
    )
    row.wallet_transactions_json = dump_json(txs)
    _append_timeline(
        row,
        f"Wallet recharged ৳{amount} via {gateway_label} (Trx {payment_reference})",
    )

    db.commit()
    db.refresh(row)
    return CustomerResponse(data=_to_read(db, row))


def _case_replies(row: StorefrontCustomerCase) -> list[CustomerCaseReplyRead]:
    raw = load_json(getattr(row, "replies_json", None), [])
    if not isinstance(raw, list):
        return []
    out: list[CustomerCaseReplyRead] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        message = str(item.get("message") or "").strip()
        if not message:
            continue
        out.append(
            CustomerCaseReplyRead(
                id=str(item.get("id") or ""),
                at=str(item.get("at") or ""),
                author=str(item.get("author") or "Admin"),
                role=str(item.get("role") or "admin"),
                message=message,
            )
        )
    return out


def _case_to_read(row: StorefrontCustomerCase) -> CustomerCaseRead:
    return CustomerCaseRead(
        id=row.id,
        case_number=row.case_number,
        case_type=row.case_type,
        date=row.created_at.strftime("%Y-%m-%d") if row.created_at else "",
        order_id=row.order_id,
        order_number=row.order_number,
        subject=row.subject or "",
        message=row.message or "",
        product_label=row.product_label,
        status=row.status or "open",
        manager_name=row.manager_name,
        replies=_case_replies(row),
    )


@router.get("/{customer_id}/cases", response_model=CustomerCaseListResponse)
def list_customer_cases(
    customer_id: str,
    case_type: Optional[str] = Query(default=None, pattern="^(support|complaint|qc)$"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCaseListResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    q = db.query(StorefrontCustomerCase).filter(StorefrontCustomerCase.customer_id == row.id)
    if case_type:
        q = q.filter(StorefrontCustomerCase.case_type == case_type)
    rows = q.order_by(StorefrontCustomerCase.created_at.desc()).all()
    return CustomerCaseListResponse(data=[_case_to_read(r) for r in rows])


@router.post("/{customer_id}/cases", response_model=CustomerCaseResponse, status_code=201)
def create_customer_case(
    customer_id: str,
    payload: CustomerCaseCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCaseResponse:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    order_number = None
    payload_order_id = None
    if payload.order_id:
        order_key = payload.order_id.strip()
        order = db.get(CommerceOrder, order_key)
        if not order:
            order = (
                db.query(CommerceOrder)
                .filter(
                    CommerceOrder.customer_id == row.id,
                    CommerceOrder.order_number == order_key,
                )
                .first()
            )
        if order and order.customer_id == row.id:
            order_number = order.order_number
            payload_order_id = order.id
        else:
            sales = db.get(SalesOrder, order_key)
            if not sales:
                sales = (
                    db.query(SalesOrder)
                    .filter(
                        SalesOrder.customer_id == row.id,
                        SalesOrder.deleted_at.is_(None),
                        SalesOrder.order_number == order_key,
                    )
                    .first()
                )
            if not sales or sales.deleted_at is not None or sales.customer_id != row.id:
                raise HTTPException(status_code=404, detail="Order not found")
            order_number = sales.order_number
            payload_order_id = sales.id

    prefix = {"support": "SUP", "complaint": "CMP", "qc": "QC"}.get(payload.case_type, "CASE")
    case_number = f"{prefix}-{new_session_token()[:8].upper()}"
    actor = (user.name or user.email or "Admin").strip() or "Admin"
    case = StorefrontCustomerCase(
        customer_id=row.id,
        case_type=payload.case_type,
        case_number=case_number,
        order_id=payload_order_id,
        order_number=order_number,
        subject=payload.subject.strip(),
        message=payload.message.strip(),
        product_label=(payload.product_label or "").strip() or None,
        status="open",
        manager_name=row.assigned_staff or actor,
        replies_json="[]",
    )
    db.add(case)
    _append_timeline(row, f"Case {case_number} created ({payload.case_type})", actor=actor)
    db.commit()
    db.refresh(case)
    return CustomerCaseResponse(data=_case_to_read(case))


def _get_customer_case(
    db: Session,
    customer_id: str,
    case_id: str,
    company_id: str,
) -> tuple[CommerceCustomer, StorefrontCustomerCase]:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    case = db.get(StorefrontCustomerCase, case_id)
    if not case or case.customer_id != row.id:
        raise HTTPException(status_code=404, detail="Case not found")
    return row, case


@router.post("/{customer_id}/cases/{case_id}/replies", response_model=CustomerCaseResponse)
def reply_customer_case(
    customer_id: str,
    case_id: str,
    payload: CustomerCaseReplyCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCaseResponse:
    row, case = _get_customer_case(db, customer_id, case_id, company_id)
    if (case.status or "").lower() == "closed":
        raise HTTPException(status_code=409, detail="Case is closed")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Reply message is required")

    actor = (user.name or user.email or "Admin").strip() or "Admin"
    replies = load_json(getattr(case, "replies_json", None), [])
    if not isinstance(replies, list):
        replies = []
    replies.append(
        {
            "id": f"reply_{new_session_token()[:10]}",
            "at": datetime.utcnow().isoformat() + "Z",
            "author": actor,
            "role": "admin",
            "message": message,
        }
    )
    case.replies_json = dump_json(replies)
    if not case.manager_name:
        case.manager_name = actor
    _append_timeline(row, f"Replied on case {case.case_number}", actor=actor)
    db.commit()
    db.refresh(case)
    return CustomerCaseResponse(data=_case_to_read(case))


@router.post("/{customer_id}/cases/{case_id}/close", response_model=CustomerCaseResponse)
def close_customer_case(
    customer_id: str,
    case_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerCaseResponse:
    row, case = _get_customer_case(db, customer_id, case_id, company_id)
    if (case.status or "").lower() == "closed":
        return CustomerCaseResponse(data=_case_to_read(case))

    actor = (user.name or user.email or "Admin").strip() or "Admin"
    case.status = "closed"
    if not case.manager_name:
        case.manager_name = actor
    _append_timeline(row, f"Case {case.case_number} closed", actor=actor)
    db.commit()
    db.refresh(case)
    return CustomerCaseResponse(data=_case_to_read(case))


# ── Contacts ─────────────────────────────────────────────────────────────


def _contact_read(row: CommerceCustomerContact) -> CustomerContactRead:
    return CustomerContactRead(
        id=row.id,
        company_id=row.company_id,
        customer_id=row.customer_id,
        name=row.name,
        title=row.title,
        email=row.email,
        phone=row.phone,
        is_primary=row.is_primary,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_customer_or_404(db: Session, customer_id: str, company_id: str) -> CommerceCustomer:
    row = db.get(CommerceCustomer, customer_id)
    if not row or (row.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return row


@router.get("/{customer_id}/contacts", response_model=CustomerContactListResponse)
def list_customer_contacts(
    customer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerContactListResponse:
    _get_customer_or_404(db, customer_id, company_id)
    rows = (
        db.query(CommerceCustomerContact)
        .filter(CommerceCustomerContact.company_id == company_id, CommerceCustomerContact.customer_id == customer_id)
        .order_by(CommerceCustomerContact.is_primary.desc(), CommerceCustomerContact.created_at.asc())
        .all()
    )
    return CustomerContactListResponse(data=[_contact_read(r) for r in rows])


@router.post("/{customer_id}/contacts", response_model=CustomerContactResponse, status_code=201)
def create_customer_contact(
    customer_id: str,
    payload: CustomerContactCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerContactResponse:
    _get_customer_or_404(db, customer_id, company_id)
    if payload.is_primary:
        db.query(CommerceCustomerContact).filter(
            CommerceCustomerContact.company_id == company_id,
            CommerceCustomerContact.customer_id == customer_id,
        ).update({"is_primary": False})
    row = CommerceCustomerContact(
        company_id=company_id,
        customer_id=customer_id,
        name=payload.name,
        title=payload.title,
        email=payload.email,
        phone=payload.phone,
        is_primary=payload.is_primary,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CustomerContactResponse(data=_contact_read(row))


@router.patch("/{customer_id}/contacts/{contact_id}", response_model=CustomerContactResponse)
def update_customer_contact(
    customer_id: str,
    contact_id: str,
    payload: CustomerContactUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerContactResponse:
    _get_customer_or_404(db, customer_id, company_id)
    row = db.get(CommerceCustomerContact, contact_id)
    if not row or row.customer_id != customer_id or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    patch = payload.model_dump(exclude_unset=True)
    if patch.get("is_primary"):
        db.query(CommerceCustomerContact).filter(
            CommerceCustomerContact.company_id == company_id,
            CommerceCustomerContact.customer_id == customer_id,
            CommerceCustomerContact.id != contact_id,
        ).update({"is_primary": False})
    for key, value in patch.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return CustomerContactResponse(data=_contact_read(row))


@router.delete("/{customer_id}/contacts/{contact_id}", status_code=204)
def delete_customer_contact(
    customer_id: str,
    contact_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("customers", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    _get_customer_or_404(db, customer_id, company_id)
    row = db.get(CommerceCustomerContact, contact_id)
    if not row or row.customer_id != customer_id or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(row)
    db.commit()
