from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, require_system_manager, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.sales_return import SalesReturn
from app.services import rbac as rbac_service
from app.models.commerce_customer import CommerceCustomer, load_json
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.sales import (
    SalesDelivery,
    SalesDeliveryLine,
    SalesOrder,
    SalesOrderActivity,
    SalesOrderLine,
    SalesQuotation,
)
from app.schemas.sales import (
    CustomerItemPriceCreate,
    CustomerItemPriceRead,
    CustomerPriceResolveResponse,
    LinkInvoiceRequest,
    SalesApiEnvelope,
    SalesApiMeta,
    SalesBulkDeleteRequest,
    SalesBulkStatusRequest,
    SalesWebsiteStatusRequest,
    SalesDashboardRead,
    SalesDashboardResponse,
    SalesDashboardPeriodRead,
    SalesDashboardPeriodResponse,
    SalesPeriodTotals,
    SalesDeliveryCreate,
    SalesDeliveryLineRead,
    SalesDeliveryListMeta,
    SalesDeliveryListResponse,
    SalesDeliveryRead,
    SalesDeliveryResponse,
    SalesHistoryResponse,
    SalesOrderCreate,
    SalesOrderEditRequestCreate,
    SalesOrderEditRequestRead,
    SalesOrderEditRequestReview,
    SalesOrderListMeta,
    SalesOrderListResponse,
    SalesOrderActivityRead,
    SalesOrderCancelRequest,
    SalesOrderPathaoConsignmentCreate,
    SalesOrderPathaoConsignmentRead,
    SalesOrderPathaoConsignmentResponse,
    SalesOrderPut,
    SalesOrderRead,
    SalesOrderResponse,
    SalesOrderUpdate,
    SalesQuotationCreate,
    SalesQuotationListMeta,
    SalesQuotationListResponse,
    SalesQuotationPut,
    SalesQuotationRead,
    SalesQuotationResponse,
    SalesQuotationStatusUpdate,
    SalesStatusHistoryRead,
)
from app.services.sales.constants import EDITABLE_SALES_ORDER_STATUSES
from app.services.sales.sales_service import DeliveryLineInput, SalesLineInput, SalesService
from app.services.sales.website_order_status import next_statuses as website_next_statuses, set_website_status
from modules.sales.permissions.permissions import require_sales_write
from app.services.core.approval_service import assert_can_approve

router = APIRouter(prefix="/sales", tags=["sales"])


def _format_customer_group(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    return value.replace("_", " ").title()


def _customer_snapshot(customer: CommerceCustomer | None) -> dict:
    if not customer:
        return {
            "customer_phone": None,
            "customer_email": None,
            "customer_group": None,
            "customer_city": None,
            "customer_region": None,
            "customer_country": None,
            "customer_tags": [],
            "customer_assigned_staff": None,
            "customer_order_count": 0,
            "customer_lifetime_value": Decimal("0"),
            "customer_risk_score": 0,
        }
    tags = load_json(customer.tags_json, [])
    if not isinstance(tags, list):
        tags = []
    return {
        "customer_phone": customer.phone or None,
        "customer_email": customer.email or None,
        "customer_group": _format_customer_group(customer.group),
        "customer_city": customer.city or None,
        "customer_region": customer.region or None,
        "customer_country": customer.country or None,
        "customer_tags": [str(tag).strip() for tag in tags if str(tag).strip()],
        "customer_assigned_staff": customer.assigned_staff,
        "customer_order_count": int(customer.total_orders or 0),
        "customer_lifetime_value": customer.total_spend or Decimal("0"),
        "customer_risk_score": int(customer.risk_score or 0),
    }


def _line_inputs(svc: SalesService, lines) -> list[SalesLineInput]:
    result: list[SalesLineInput] = []
    for line in lines:
        data = line.model_dump()
        item_id = svc.resolve_item_id(item_id=data.get("item_id"), sku=data.get("sku"))
        result.append(
            SalesLineInput(
                item_id=item_id,
                quantity=data["quantity"],
                unit_price=data["unit_price"],
                tax_rate=data.get("tax_rate") or Decimal("0"),
                discount_amount=data.get("discount_amount") or Decimal("0"),
                notes=data.get("notes"),
                serial_numbers=data.get("serial_numbers"),
            ),
        )
    return result


def _quotation_read(db: Session, quote: SalesQuotation) -> SalesQuotationRead:
    svc = SalesService(db)
    customer = db.get(CommerceCustomer, quote.customer_id)
    lines = svc.get_quotation_lines(quote.id)
    from app.schemas.sales import SalesQuotationLineRead

    return SalesQuotationRead(
        id=quote.id,
        company_id=quote.company_id,
        quotation_number=quote.quotation_number,
        customer_id=quote.customer_id,
        customer_name=customer.name if customer else None,
        **_customer_snapshot(customer),
        warehouse_id=quote.warehouse_id,
        status=quote.status,
        quote_date=quote.quote_date,
        valid_until=quote.valid_until,
        sales_rep=quote.sales_rep,
        notes=quote.notes,
        subtotal=quote.subtotal,
        tax_total=quote.tax_total,
        discount_total=quote.discount_total,
        total=quote.total,
        sales_order_id=quote.sales_order_id,
        sent_at=quote.sent_at,
        approved_at=quote.approved_at,
        rejected_at=quote.rejected_at,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        lines=[SalesQuotationLineRead.model_validate(l) for l in lines],
    )


def _expenses_json(items) -> str:
    return json.dumps(
        [{"title": (e.title or "").strip(), "amount": str(e.amount)} for e in (items or [])],
        ensure_ascii=False,
    )


def _checkout_address(db: Session, commerce_order, kind: str) -> Optional[dict]:
    """The billing / shipping address of a website order: the snapshot taken at checkout, else the order's own
    address columns. None when the shopper gave no street."""
    from app.models.commerce_order_address import CommerceOrderAddress

    snap = (
        db.query(CommerceOrderAddress)
        .filter(CommerceOrderAddress.order_id == commerce_order.id, CommerceOrderAddress.address_type == kind)
        .order_by(CommerceOrderAddress.created_at.desc())
        .first()
    )
    if snap is not None and (snap.line1 or "").strip():
        return {
            "name": f"{snap.first_name or ''} {snap.last_name or ''}".strip(),
            "phone": snap.phone or "",
            "email": snap.email or "",
            "address": snap.line1.strip(),
            "city": snap.city or "",
            "region": snap.region or "",
            "postal_code": snap.postal_code or "",
            "country": snap.country or "",
        }
    street = (getattr(commerce_order, f"{kind}_address", None) or "").strip()
    if not street:
        return None
    return {
        "name": commerce_order.customer_name or "",
        "phone": commerce_order.customer_phone or "",
        "email": commerce_order.customer_email or "",
        "address": street,
        "city": getattr(commerce_order, f"{kind}_city", None) or "",
        "region": getattr(commerce_order, f"{kind}_region", None) or "",
        "postal_code": "",
        "country": getattr(commerce_order, f"{kind}_country", None) or "",
    }


def _order_read(db: Session, order: SalesOrder) -> SalesOrderRead:
    svc = SalesService(db)
    customer = db.get(CommerceCustomer, order.customer_id)
    warehouse = db.get(InventoryWarehouse, order.warehouse_id)
    lines = svc.get_order_lines(order.id)
    from app.schemas.sales import SalesOrderLineRead

    # Backfill variant labels / product images from the storefront-synced
    # commerce order items (sales lines don't store either directly).
    commerce_variants: list[str] = []
    commerce_images: list[str] = []
    website_status: Optional[str] = None
    website_shipment: Optional[str] = None
    website_billing = None
    website_shipping = None
    notes = order.notes or ""
    marker = "commerce_order_id="
    commerce_id = ""
    if marker in notes:
        commerce_id = notes.split(marker, 1)[1].split()[0].strip()
        if commerce_id:
            from app.models.commerce_order import CommerceOrder
            from app.models.commerce_order_item import CommerceOrderItem

            commerce_rows = (
                db.query(CommerceOrderItem)
                .filter(CommerceOrderItem.order_id == commerce_id)
                .order_by(CommerceOrderItem.sort_order.asc())
                .all()
            )
            commerce_variants = [(row.variant_label or "").strip() for row in commerce_rows]
            commerce_images = [(row.image_url or "").strip() for row in commerce_rows]

            commerce_order = db.get(CommerceOrder, commerce_id)
            if commerce_order is not None:
                website_status = commerce_order.status
                website_shipment = commerce_order.shipment_status
                website_billing = _checkout_address(db, commerce_order, "billing")
                website_shipping = _checkout_address(db, commerce_order, "shipping")
                # Keep Sales payment method in sync with storefront (e.g. COD).
                before = order.notes or ""
                svc._ensure_storefront_payment_meta(order, commerce_order)
                if (order.notes or "") != before:
                    db.commit()
                    db.refresh(order)
                    notes = order.notes or ""

    line_reads: list[SalesOrderLineRead] = []
    for idx, line in enumerate(lines):
        read = SalesOrderLineRead.model_validate(line)
        updates: dict = {}
        if not read.notes and idx < len(commerce_variants) and commerce_variants[idx]:
            updates["notes"] = f"variant: {commerce_variants[idx]}"
        if idx < len(commerce_images) and commerce_images[idx]:
            updates["image_url"] = commerce_images[idx]
        if updates:
            read = read.model_copy(update=updates)
        line_reads.append(read)

    delivery_person_name = None
    if order.delivery_person_id:
        delivery_person = db.get(AuthUser, order.delivery_person_id)
        delivery_person_name = delivery_person.name if delivery_person else None

    activity_rows = (
        db.query(SalesOrderActivity)
        .filter(SalesOrderActivity.sales_order_id == order.id)
        .order_by(SalesOrderActivity.created_at.desc())
        .limit(100)
        .all()
    )
    actor_ids = {row.actor_id for row in activity_rows if row.actor_id}
    actor_names: dict[str, str] = {}
    if actor_ids:
        for user_row in db.query(AuthUser).filter(AuthUser.id.in_(actor_ids)).all():
            actor_names[user_row.id] = user_row.name
    activity_reads = [
        SalesOrderActivityRead(
            id=row.id,
            activity_type=row.activity_type,
            title=row.title,
            description=row.description,
            actor_id=row.actor_id,
            actor_name=actor_names.get(row.actor_id or "") if row.actor_id else None,
            created_at=row.created_at,
        )
        for row in activity_rows
    ]

    return SalesOrderRead(
        id=order.id,
        company_id=order.company_id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=customer.name if customer else None,
        **_customer_snapshot(customer),
        warehouse_id=order.warehouse_id,
        warehouse_name=warehouse.name if warehouse else None,
        sales_quotation_id=order.sales_quotation_id,
        status=order.status,
        delivery_status=order.delivery_status,
        order_date=order.order_date,
        expected_date=order.expected_date,
        sales_rep=order.sales_rep,
        notes=notes or order.notes,
        payment_terms=order.payment_terms,
        sale_stage=order.sale_stage or "final",
        invoice_scheme=order.invoice_scheme or "standard",
        shipping_status=order.shipping_status or website_shipment,
        delivered_to=order.delivered_to,
        delivery_person_id=order.delivery_person_id,
        delivery_person_name=delivery_person_name,
        courier=order.courier,
        tracking_number=order.tracking_number,
        tracking_url=order.tracking_url,
        subtotal=order.subtotal,
        tax_total=order.tax_total,
        discount_total=order.discount_total,
        total=order.total,
        order_discount=order.order_discount or Decimal("0"),
        order_discount_type=order.order_discount_type or "fixed",
        shipping_charge=order.shipping_charge or Decimal("0"),
        additional_expenses=[
            {"title": e["title"], "amount": e["amount"]} for e in SalesService.additional_expenses(order)
        ],
        invoice_id=order.invoice_id,
        invoice_number=order.invoice_number,
        invoiced_at=order.invoiced_at,
        public_key=order.public_key,
        confirmed_at=order.confirmed_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        lines=line_reads,
        activities=activity_reads,
        edit_request=(
            SalesOrderEditRequestRead.model_validate(active_edit)
            if (active_edit := svc.active_edit_request(order.id)) is not None
            else None
        ),
        returned_total=db.query(func.coalesce(func.sum(SalesReturn.credit_amount), 0))
        .filter(SalesReturn.sales_order_id == order.id, SalesReturn.status != "cancelled")
        .scalar()
        or Decimal("0"),
        website_order_id=commerce_id if website_status else None,
        website_billing_address=website_billing,
        website_shipping_address=website_shipping,
        website_status=website_status,
        website_next_statuses=website_next_statuses(website_status) if website_status else [],
    )


def _delivery_read(db: Session, delivery: SalesDelivery) -> SalesDeliveryRead:
    dlines = (
        db.query(SalesDeliveryLine)
        .filter(SalesDeliveryLine.sales_delivery_id == delivery.id)
        .all()
    )
    line_reads = []
    for dl in dlines:
        from app.models.sales import SalesOrderLine

        so_line = db.get(SalesOrderLine, dl.sales_order_line_id)
        line_reads.append(
            SalesDeliveryLineRead(
                id=dl.id,
                sales_order_line_id=dl.sales_order_line_id,
                item_id=dl.item_id,
                sku=so_line.sku if so_line else None,
                name=so_line.name if so_line else None,
                quantity_delivered=dl.quantity_delivered,
                notes=dl.notes,
            ),
        )
    return SalesDeliveryRead(
        id=delivery.id,
        delivery_number=delivery.delivery_number,
        sales_order_id=delivery.sales_order_id,
        customer_id=delivery.customer_id,
        warehouse_id=delivery.warehouse_id,
        status=delivery.status,
        delivery_date=delivery.delivery_date,
        delivered_by=delivery.delivered_by,
        notes=delivery.notes,
        created_at=delivery.created_at,
        lines=line_reads,
    )


@router.get("/dashboard/period", response_model=SalesDashboardPeriodResponse)
def sales_dashboard_period(
    date_from: Optional[date] = Query(None, description="first day, inclusive (none: from the first order)"),
    date_to: Optional[date] = Query(None, description="last day, inclusive (none: up to today)"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesDashboardPeriodResponse:
    svc = SalesService(db)
    raw = svc.dashboard_period(company_id, date_from, date_to)
    now = svc.dashboard(company_id)
    recent = [_order_read(db, db.get(SalesOrder, oid)) for oid in raw["recent_order_ids"] if db.get(SalesOrder, oid)]
    return SalesDashboardPeriodResponse(
        data=SalesDashboardPeriodRead(
            date_from=date_from,
            date_to=date_to,
            current=SalesPeriodTotals(**raw["current"]),
            previous=SalesPeriodTotals(**raw["previous"]) if raw["previous"] else None,
            series=raw["series"],
            by_month=raw["by_month"],
            recent_orders=recent,
            open_order_count=now["open_order_count"],
            pending_delivery_count=now["pending_delivery_count"],
            open_quotation_count=now["open_quotation_count"],
        ),
    )


@router.get("/dashboard", response_model=SalesDashboardResponse)
def sales_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesDashboardResponse:
    svc = SalesService(db)
    raw = svc.dashboard(company_id)
    recent = [_order_read(db, db.get(SalesOrder, oid)) for oid in raw["recent_order_ids"] if db.get(SalesOrder, oid)]
    return SalesDashboardResponse(
        data=SalesDashboardRead(
            open_order_count=raw["open_order_count"],
            pending_delivery_count=raw["pending_delivery_count"],
            completed_count=raw["completed_count"],
            revenue_total=Decimal(str(raw["revenue_total"])),
            open_quotation_count=raw["open_quotation_count"],
            status_breakdown=raw["status_breakdown"],
            recent_orders=recent,
            daily_series=raw.get("daily_series") or [],
        ),
    )


SALES_REVENUE_STATUSES = ("confirmed", "processing", "completed")


@router.get("/reports/summary")
def sales_summary_report(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> dict:
    """Sales orders in a period (by order_date): counts and money by status, top customers,
    invoiced vs not-yet-invoiced. Feeds the AI assistant and the sales overview — one number
    set shared by both. Revenue counts confirmed / processing / completed orders; drafts and
    cancellations are reported separately, never in revenue."""
    today = date.today()
    start = date_from or today.replace(day=1)
    end = date_to or today
    if start > end:
        start, end = end, start
    base = db.query(SalesOrder).filter(
        SalesOrder.company_id == company_id,
        SalesOrder.deleted_at.is_(None),
        SalesOrder.order_date >= start,
        SalesOrder.order_date <= end,
    )
    by_status = {
        status: {"orders": int(count or 0), "total": str(Decimal(str(total or 0)).quantize(Decimal("0.01")))}
        for status, count, total in (
            base.with_entities(SalesOrder.status, func.count(SalesOrder.id), func.coalesce(func.sum(SalesOrder.total), 0))
            .group_by(SalesOrder.status)
            .all()
        )
    }
    revenue_q = base.filter(SalesOrder.status.in_(SALES_REVENUE_STATUSES))
    rev = revenue_q.with_entities(
        func.count(SalesOrder.id),
        func.coalesce(func.sum(SalesOrder.subtotal), 0),
        func.coalesce(func.sum(SalesOrder.tax_total), 0),
        func.coalesce(func.sum(SalesOrder.discount_total), 0),
        func.coalesce(func.sum(SalesOrder.total), 0),
        func.count(func.distinct(SalesOrder.customer_id)),
        func.coalesce(func.sum(func.cast(SalesOrder.invoice_id.isnot(None), Integer)), 0),
    ).one()
    top = (
        revenue_q.with_entities(
            SalesOrder.customer_id,
            CommerceCustomer.name,
            func.count(SalesOrder.id),
            func.coalesce(func.sum(SalesOrder.total), 0),
        )
        .outerjoin(CommerceCustomer, CommerceCustomer.id == SalesOrder.customer_id)
        .group_by(SalesOrder.customer_id, CommerceCustomer.name)
        .order_by(func.coalesce(func.sum(SalesOrder.total), 0).desc())
        .limit(limit)
        .all()
    )
    money = lambda v: str(Decimal(str(v or 0)).quantize(Decimal("0.01")))  # noqa: E731
    order_count = int(rev[0] or 0)
    total = Decimal(str(rev[4] or 0))
    return {
        "data": {
            "period": {"from": start.isoformat(), "to": end.isoformat()},
            "orders": order_count,
            "customers": int(rev[5] or 0),
            "subtotal": money(rev[1]),
            "tax": money(rev[2]),
            "discount": money(rev[3]),
            "total": money(total),
            "average_order_value": money(total / order_count) if order_count else "0.00",
            "invoiced_orders": int(rev[6] or 0),
            "not_invoiced_orders": order_count - int(rev[6] or 0),
            "by_status": by_status,
            "top_customers": [
                {"customer_id": cid, "customer": name or "Unknown customer", "orders": int(cnt or 0), "total": money(tot)}
                for cid, name, cnt, tot in top
            ],
            "revenue_statuses": list(SALES_REVENUE_STATUSES),
        }
    }


@router.get("/reports/top-products")
def sales_top_products_report(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> dict:
    """Products ranked by units sold / revenue from sales order lines in a period — the one
    aggregate `/reports/summary` never computed (it only ranks by customer), which meant "which
    product sells most" had no real answer anywhere in the API for the AI (or anything else) to
    read. Same revenue-status filter as `/reports/summary` so the two stay consistent."""
    today = date.today()
    start = date_from or today.replace(day=1)
    end = date_to or today
    if start > end:
        start, end = end, start
    name_col = func.coalesce(Item.name, SalesOrderLine.name)
    sku_col = func.coalesce(Item.sku, SalesOrderLine.sku)
    rows = (
        db.query(
            SalesOrderLine.item_id,
            name_col,
            sku_col,
            func.sum(SalesOrderLine.quantity_ordered),
            func.sum(SalesOrderLine.line_total),
            func.count(func.distinct(SalesOrderLine.sales_order_id)),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .outerjoin(Item, Item.id == SalesOrderLine.item_id)
        .filter(
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.order_date >= start,
            SalesOrder.order_date <= end,
            SalesOrder.status.in_(SALES_REVENUE_STATUSES),
        )
        .group_by(SalesOrderLine.item_id, name_col, sku_col)
        .order_by(func.sum(SalesOrderLine.quantity_ordered).desc())
        .limit(limit)
        .all()
    )
    money = lambda v: str(Decimal(str(v or 0)).quantize(Decimal("0.01")))  # noqa: E731
    return {
        "data": {
            "period": {"from": start.isoformat(), "to": end.isoformat()},
            "revenue_statuses": list(SALES_REVENUE_STATUSES),
            "top_products": [
                {
                    "item_id": item_id,
                    "product": name or "Unknown product",
                    "sku": sku or "",
                    "quantity_sold": int(qty or 0),
                    "revenue": money(revenue),
                    "orders": int(order_count or 0),
                }
                for item_id, name, sku, qty, revenue, order_count in rows
            ],
        }
    }


@router.get("/quotations", response_model=SalesQuotationListResponse)
def list_quotations(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> SalesQuotationListResponse:
    svc = SalesService(db)
    offset = (page - 1) * per_page
    rows, total = svc.list_quotations(
        company_id=company_id,
        status=status,
        customer_id=customer_id,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=per_page,
        offset=offset,
    )
    return SalesQuotationListResponse(
        data=[_quotation_read(db, r) for r in rows],
        meta=SalesQuotationListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("/quotations", response_model=SalesQuotationResponse, status_code=201)
def create_quotation(
    payload: SalesQuotationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesQuotationResponse:
    require_sales_write(user)
    svc = SalesService(db)
    quote = svc.create_quotation(
        customer_id=payload.customer_id,
        warehouse_id=payload.warehouse_id,
        quote_date=payload.quote_date,
        valid_until=payload.valid_until,
        sales_rep=payload.sales_rep,
        notes=payload.notes,
        company_id=company_id,
        created_by=user.id,
        lines=_line_inputs(svc, payload.lines),
    )
    db.commit()
    db.refresh(quote)
    return SalesQuotationResponse(data=_quotation_read(db, quote))


@router.get("/quotations/{quotation_id}", response_model=SalesQuotationResponse)
def get_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesQuotationResponse:
    quote = db.get(SalesQuotation, quotation_id)
    if not quote or quote.deleted_at is not None or (quote.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return SalesQuotationResponse(data=_quotation_read(db, quote))


@router.put("/quotations/{quotation_id}", response_model=SalesApiEnvelope)
def replace_quotation(
    quotation_id: str,
    payload: SalesQuotationPut,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    quote = svc.update_quotation(
        quotation_id,
        customer_id=payload.customer_id,
        warehouse_id=payload.warehouse_id,
        quote_date=payload.quote_date,
        valid_until=payload.valid_until,
        sales_rep=payload.sales_rep,
        notes=payload.notes,
        actor_id=user.id,
        lines=_line_inputs(svc, payload.lines),
    )
    db.commit()
    db.refresh(quote)
    return SalesApiEnvelope(
        success=True,
        message="Quotation updated",
        data=_quotation_read(db, quote).model_dump(),
    )


@router.delete("/quotations/{quotation_id}", response_model=SalesApiEnvelope)
def delete_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    quote = svc.delete_quotation(quotation_id, actor_id=user.id)
    db.commit()
    return SalesApiEnvelope(success=True, message="Quotation deleted", data={"id": quote.id})


@router.post("/quotations/{quotation_id}/duplicate", response_model=SalesQuotationResponse, status_code=201)
def duplicate_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesQuotationResponse:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    quote = svc.duplicate_quotation(quotation_id, actor_id=user.id)
    db.commit()
    db.refresh(quote)
    return SalesQuotationResponse(data=_quotation_read(db, quote))


@router.patch("/quotations/{quotation_id}/status", response_model=SalesQuotationResponse)
def update_quotation_status(
    quotation_id: str,
    payload: SalesQuotationStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesQuotationResponse:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    quote = svc.update_quotation_status(
        quotation_id,
        payload.status,
        actor_id=user.id,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(quote)
    return SalesQuotationResponse(data=_quotation_read(db, quote))


@router.post("/quotations/{quotation_id}/convert", response_model=SalesOrderResponse, status_code=201)
def convert_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    warehouse_id: Optional[str] = Query(default=None),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.convert_quotation_to_order(quotation_id, warehouse_id=warehouse_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.get("/orders", response_model=SalesOrderListResponse)
def list_orders(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    delivery_status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> SalesOrderListResponse:
    svc = SalesService(db)
    offset = (page - 1) * per_page
    rows, total = svc.list_orders(
        company_id=company_id,
        status=status,
        customer_id=customer_id,
        delivery_status=delivery_status,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=per_page,
        offset=offset,
    )
    return SalesOrderListResponse(
        data=[_order_read(db, r) for r in rows],
        meta=SalesOrderListMeta(count=total, page=page, per_page=per_page),
    )


@router.post("/orders", response_model=SalesOrderResponse, status_code=201)
def create_order(
    payload: SalesOrderCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    require_sales_write(user)
    svc = SalesService(db)
    warehouse_id = payload.warehouse_id or svc.resolve_default_warehouse(company_id)
    order = svc.create_order(
        customer_id=payload.customer_id,
        warehouse_id=warehouse_id,
        sales_quotation_id=payload.sales_quotation_id,
        order_date=payload.order_date,
        expected_date=payload.expected_date,
        sales_rep=payload.sales_rep,
        notes=payload.notes,
        payment_terms=payload.payment_terms,
        sale_stage=payload.sale_stage,
        invoice_scheme=payload.invoice_scheme,
        shipping_status=payload.shipping_status,
        delivered_to=payload.delivered_to,
        delivery_person_id=payload.delivery_person_id,
        company_id=company_id,
        created_by=user.id,
        order_discount=payload.order_discount,
        order_discount_type=payload.order_discount_type,
        shipping_charge=payload.shipping_charge,
        additional_expenses_json=_expenses_json(payload.additional_expenses),
        lines=_line_inputs(svc, payload.lines),
    )
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.get("/orders/{order_id}", response_model=SalesOrderResponse)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    order = db.get(SalesOrder, order_id)
    if not order or order.deleted_at is not None or (order.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return SalesOrderResponse(data=_order_read(db, order))


@router.patch("/orders/{order_id}", response_model=SalesOrderResponse)
def update_order(
    order_id: str,
    payload: SalesOrderUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    require_sales_write(user)
    order = db.get(SalesOrder, order_id)
    if not order or order.deleted_at is not None or (order.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Sales order not found")
    svc = SalesService(db, company_id=company_id)
    approved = svc.authorize_edit(
        order, user_id=user.id, is_admin=rbac_service.is_system_manager(db, user)
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    order.updated_by = user.id
    if approved is not None:
        svc.consume_edit_request(approved, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.put("/orders/{order_id}", response_model=SalesApiEnvelope)
def replace_order(
    order_id: str,
    payload: SalesOrderPut,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    existing = svc.get_order(order_id)
    if not existing or existing.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Sales order not found")
    approved = svc.authorize_edit(
        existing, user_id=user.id, is_admin=rbac_service.is_system_manager(db, user)
    )
    order = svc.update_order(
        order_id,
        customer_id=payload.customer_id,
        warehouse_id=payload.warehouse_id or existing.warehouse_id,
        order_date=payload.order_date,
        expected_date=payload.expected_date,
        sales_rep=payload.sales_rep,
        notes=payload.notes,
        payment_terms=payload.payment_terms,
        sale_stage=payload.sale_stage,
        invoice_scheme=payload.invoice_scheme,
        shipping_status=payload.shipping_status,
        delivered_to=payload.delivered_to,
        delivery_person_id=payload.delivery_person_id,
        actor_id=user.id,
        lines=_line_inputs(svc, payload.lines),
        allow_locked=True,
        order_discount=payload.order_discount,
        order_discount_type=payload.order_discount_type,
        shipping_charge=payload.shipping_charge,
        additional_expenses_json=(
            _expenses_json(payload.additional_expenses)
            if payload.additional_expenses is not None
            else None
        ),
    )
    if approved is not None:
        svc.consume_edit_request(approved, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesApiEnvelope(
        success=True,
        message="Sales order updated",
        data=_order_read(db, order).model_dump(),
    )


@router.delete("/orders/{order_id}", response_model=SalesApiEnvelope)
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    order = svc.delete_order(order_id, actor_id=user.id)
    db.commit()
    return SalesApiEnvelope(success=True, message="Sales order deleted", data={"id": order.id})


@router.post("/orders/{order_id}/duplicate", response_model=SalesOrderResponse, status_code=201)
def duplicate_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    order = svc.duplicate_order(order_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post(
    "/orders/{order_id}/pathao-consignment",
    response_model=SalesOrderPathaoConsignmentResponse,
)
def create_sales_order_pathao_consignment(
    order_id: str,
    payload: SalesOrderPathaoConsignmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderPathaoConsignmentResponse:
    """Book a Pathao consignment for this order's already-selected shipping address.

    Returns skipped=true (not an error) when the Pathao plugin isn't installed/enabled,
    so picking the "Pathao" shipping line never blocks saving an order.
    """
    require_sales_write(user)
    order = db.get(SalesOrder, order_id)
    if not order or (order.company_id or "default") != company_id:
        raise HTTPException(status_code=404, detail="Order not found")

    from app.services.pathao_shipping import create_sales_order_pathao_consignment as book_pathao

    result = book_pathao(
        db,
        order,
        recipient_name=payload.recipient_name,
        recipient_phone=payload.recipient_phone,
        recipient_address=payload.recipient_address,
        item_quantity=payload.item_quantity,
        item_weight_kg=float(payload.item_weight_kg) if payload.item_weight_kg else None,
    )
    if result.created:
        db.commit()
        db.refresh(order)
    return SalesOrderPathaoConsignmentResponse(
        data=SalesOrderPathaoConsignmentRead(
            created=result.created,
            skipped=result.skipped,
            consignment_id=result.consignment_id,
            tracking_url=result.tracking_url,
            message=result.message,
        ),
    )


@router.post("/orders/bulk-delete", response_model=SalesApiEnvelope)
def bulk_delete_orders(
    payload: SalesBulkDeleteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    deleted = svc.bulk_delete_orders(payload.ids, actor_id=user.id)
    db.commit()
    return SalesApiEnvelope(success=True, message=f"{deleted} order(s) deleted", data={"deleted": deleted})


@router.post("/orders/bulk-status", response_model=SalesApiEnvelope)
def bulk_update_order_status(
    payload: SalesBulkStatusRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesApiEnvelope:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    updated = svc.bulk_update_order_status(payload.ids, payload.status, actor_id=user.id)
    db.commit()
    return SalesApiEnvelope(success=True, message=f"{updated} order(s) updated", data={"updated": updated})


@router.post("/orders/{order_id}/confirm", response_model=SalesOrderResponse)
def confirm_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    pending = svc.get_order(order_id)
    assert_can_approve(db, company_id, user, "sales.order", getattr(pending, "total", None))
    order = svc.confirm_order(order_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post("/orders/{order_id}/edit-requests", response_model=SalesOrderResponse)
def request_order_edit(
    order_id: str,
    payload: SalesOrderEditRequestCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    order = svc.get_order(order_id)
    if not order or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Sales order not found")
    svc.request_edit(order_id, actor_id=user.id, actor_name=user.name, reason=payload.reason)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post(
    "/orders/{order_id}/edit-requests/{request_id}/review",
    response_model=SalesOrderResponse,
)
def review_order_edit_request(
    order_id: str,
    request_id: str,
    payload: SalesOrderEditRequestReview,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_system_manager),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.get_order(order_id)
    if not order or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Sales order not found")
    svc.review_edit_request(
        order_id,
        request_id,
        approve=payload.decision == "approve",
        actor_id=user.id,
        actor_name=user.name,
        note=payload.note,
    )
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post("/orders/{order_id}/cancel", response_model=SalesOrderResponse)
def cancel_order(
    order_id: str,
    payload: Optional[SalesOrderCancelRequest] = None,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    reason: Optional[str] = Query(default=None, max_length=500),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    # Reason arrives as ?reason= from the drawer or as a JSON body from API clients.
    note = reason or (payload.reason if payload else None)
    order = svc.cancel_order(order_id, actor_id=user.id, reason=note)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post("/orders/{order_id}/website-status", response_model=SalesOrderResponse)
def set_website_order_status(
    order_id: str,
    payload: SalesWebsiteStatusRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    """Change a website order's status: the customer's order (what the storefront account shows) and this Sales
    order move together, and the Activity tab records it."""
    require_sales_write(user)
    svc = SalesService(db, company_id=company_id)
    order = svc.get_order(order_id)
    if not order or order.deleted_at is not None or order.company_id != company_id:
        raise HTTPException(status_code=404, detail="Order not found")
    set_website_status(
        db,
        order,
        payload.status.strip().lower(),
        company_id=company_id,
        actor_id=user.id,
        actor_name=user.name or user.email or "admin",
        message=payload.message,
    )
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post("/orders/{order_id}/invoice", response_model=SalesOrderResponse)
def issue_sales_invoice(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.issue_invoice(order_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.post("/orders/{order_id}/public-link")
def create_sales_invoice_public_link(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    svc = SalesService(db, company_id=company_id)
    order = svc.ensure_public_invoice(order_id, actor_id=user.id)
    db.commit()
    db.refresh(order)
    key = order.public_key or ""
    return {
        "data": {
            "public_key": key,
            "path": f"/invoice/{key}",
            "invoice_number": order.invoice_number,
        }
    }


@router.post("/orders/{order_id}/link-invoice", response_model=SalesOrderResponse)
def link_invoice(
    order_id: str,
    payload: LinkInvoiceRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesOrderResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.link_invoice(
        order_id,
        invoice_id=payload.invoice_id,
        invoice_number=payload.invoice_number,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(order)
    return SalesOrderResponse(data=_order_read(db, order))


@router.get("/orders/{order_id}/history", response_model=SalesHistoryResponse)
def order_history(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> SalesHistoryResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.get_order(order_id)
    if not order or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Sales order not found")
    rows = svc.get_order_history(order_id)
    return SalesHistoryResponse(data=[SalesStatusHistoryRead.model_validate(r) for r in rows])


@router.get("/orders/{order_id}/deliveries", response_model=SalesDeliveryListResponse)
def list_order_deliveries(
    order_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> SalesDeliveryListResponse:
    svc = SalesService(db, company_id=company_id)
    order = svc.get_order(order_id)
    if not order or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Sales order not found")
    rows, total = svc.list_deliveries(company_id=company_id, sales_order_id=order_id)
    return SalesDeliveryListResponse(
        data=[_delivery_read(db, r) for r in rows],
        meta=SalesDeliveryListMeta(count=total),
    )


@router.post("/orders/{order_id}/deliveries", response_model=SalesDeliveryResponse, status_code=201)
def create_delivery(
    order_id: str,
    payload: SalesDeliveryCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesDeliveryResponse:
    svc = SalesService(db, company_id=company_id)
    delivery = svc.create_delivery(
        order_id,
        [DeliveryLineInput(**l.model_dump()) for l in payload.lines],
        delivery_date=payload.delivery_date,
        delivered_by=payload.delivered_by,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(delivery)
    return SalesDeliveryResponse(data=_delivery_read(db, delivery))


@router.post("/deliveries/{delivery_id}/post", response_model=SalesDeliveryResponse)
def post_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SalesDeliveryResponse:
    svc = SalesService(db, company_id=company_id)
    delivery = svc.post_delivery(delivery_id, actor_id=user.id)
    db.commit()
    db.refresh(delivery)
    return SalesDeliveryResponse(data=_delivery_read(db, delivery))


@router.get("/customer-prices", response_model=list[CustomerItemPriceRead])
def list_customer_prices(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    customer_id: Optional[str] = Query(default=None),
    item_id: Optional[str] = Query(default=None),
) -> list[CustomerItemPriceRead]:
    svc = SalesService(db)
    rows = svc.list_customer_prices(company_id=company_id, customer_id=customer_id, item_id=item_id)
    result = []
    for row in rows:
        item = db.get(Item, row.item_id)
        result.append(
            CustomerItemPriceRead(
                id=row.id,
                customer_id=row.customer_id,
                item_id=row.item_id,
                unit_price=row.unit_price,
                currency=row.currency,
                discount_pct=row.discount_pct,
                min_qty=row.min_qty,
                valid_from=row.valid_from,
                valid_to=row.valid_to,
                is_active=row.is_active,
                notes=row.notes,
                item_sku=item.sku if item else None,
                item_name=item.name if item else None,
            ),
        )
    return result


@router.post("/customer-prices", response_model=CustomerItemPriceRead, status_code=201)
def upsert_customer_price(
    payload: CustomerItemPriceCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerItemPriceRead:
    svc = SalesService(db)
    row = svc.upsert_customer_price(company_id=company_id, **payload.model_dump())
    db.commit()
    db.refresh(row)
    item = db.get(Item, row.item_id)
    return CustomerItemPriceRead(
        id=row.id,
        customer_id=row.customer_id,
        item_id=row.item_id,
        unit_price=row.unit_price,
        currency=row.currency,
        discount_pct=row.discount_pct,
        min_qty=row.min_qty,
        valid_from=row.valid_from,
        valid_to=row.valid_to,
        is_active=row.is_active,
        notes=row.notes,
        item_sku=item.sku if item else None,
        item_name=item.name if item else None,
    )


@router.get("/customer-prices/resolve", response_model=CustomerPriceResolveResponse)
def resolve_customer_price(
    customer_id: str = Query(...),
    item_id: str = Query(...),
    quantity: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> CustomerPriceResolveResponse:
    svc = SalesService(db)
    row = svc.resolve_customer_price(customer_id, item_id, company_id=company_id, quantity=quantity)
    if not row:
        return CustomerPriceResolveResponse(data=None)
    item = db.get(Item, row.item_id)
    return CustomerPriceResolveResponse(
        data=CustomerItemPriceRead(
            id=row.id,
            customer_id=row.customer_id,
            item_id=row.item_id,
            unit_price=row.unit_price,
            currency=row.currency,
            discount_pct=row.discount_pct,
            min_qty=row.min_qty,
            valid_from=row.valid_from,
            valid_to=row.valid_to,
            is_active=row.is_active,
            notes=row.notes,
            item_sku=item.sku if item else None,
            item_name=item.name if item else None,
        ),
    )
