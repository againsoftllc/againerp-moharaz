"""Supplier-facing portal API.

Every endpoint below is scoped by `identity.supplier_id`, which comes from the
session row. No endpoint accepts a supplier id from the client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.company_format import company_format_dict
from app.deps.portal_auth import PortalIdentity, require_supplier_user
from app.models.commerce_supplier import CommerceSupplier
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_rfq import PurchaseRfq, PurchaseRfqInvite, PurchaseRfqQuote
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.supplier_link import SupplierLink
from app.models.supplier_product import SupplierProduct
from app.models.supplier_user import SupplierUser
from app.schemas.supplier.portal import (
    OkResponse,
    PortalAcceptInviteRequest,
    PortalChangePasswordRequest,
    PortalItemListResponse,
    PortalItemOption,
    PortalLoginRequest,
    PortalMapRequest,
    PortalMeResponse,
    PortalOrderLineRead,
    PortalOrderListResponse,
    PortalOrderRead,
    PortalProductListResponse,
    PortalProductUpsert,
    PortalRfqLineRead,
    PortalRfqListResponse,
    PortalRfqQuoteCreate,
    PortalRfqQuoteLineRead,
    PortalRfqQuoteRead,
    PortalRfqRead,
    PortalRfqResponse,
    PortalSessionResponse,
    PortalSupplierProductRead,
    PortalUserRead,
)
from app.services.purchase.purchase_rfq_service import PurchaseRfqService, RfqQuoteLineInput
from app.services.supplier import supplier_auth_service

router = APIRouter(prefix="/portal", tags=["supplier-portal"])


def _user_read(db: Session, user: SupplierUser) -> PortalUserRead:
    supplier = db.get(CommerceSupplier, user.supplier_id)
    return PortalUserRead(
        id=user.id,
        email=user.email,
        name=user.name,
        supplier_id=user.supplier_id,
        supplier_name=supplier.name if supplier else None,
        is_active=user.is_active,
        accepted_at=user.accepted_at,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


# ---------------------------------------------------------------------- auth


@router.post("/auth/login", response_model=PortalSessionResponse)
def portal_login(
    payload: PortalLoginRequest, db: Session = Depends(get_db)
) -> PortalSessionResponse:
    user, session = supplier_auth_service.login(
        db, email=payload.email, password=payload.password
    )
    return PortalSessionResponse(
        token=session.token, expires_at=session.expires_at, user=_user_read(db, user)
    )


@router.post("/auth/accept-invite", response_model=PortalSessionResponse)
def portal_accept_invite(
    payload: PortalAcceptInviteRequest, db: Session = Depends(get_db)
) -> PortalSessionResponse:
    user = supplier_auth_service.accept_invite(db, token=payload.token, password=payload.password)
    _, session = supplier_auth_service.login(db, email=user.email, password=payload.password)
    return PortalSessionResponse(
        token=session.token, expires_at=session.expires_at, user=_user_read(db, user)
    )


@router.get("/auth/me", response_model=PortalMeResponse)
def portal_me(
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalMeResponse:
    return PortalMeResponse(
        data=_user_read(db, identity.user),
        company_format=company_format_dict(db),
    )


@router.post("/auth/logout", response_model=OkResponse)
def portal_logout(
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> OkResponse:
    supplier_auth_service.logout(db, identity.session.token)
    return OkResponse()


@router.post("/auth/password", response_model=OkResponse)
def portal_change_password(
    payload: PortalChangePasswordRequest,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> OkResponse:
    supplier_auth_service.change_password(
        db, identity.user, current=payload.current_password, new=payload.new_password
    )
    return OkResponse()


# ------------------------------------------------------------------- catalog


def _product_read(
    product: SupplierProduct, link: Optional[SupplierLink], item: Optional[Item]
) -> PortalSupplierProductRead:
    return PortalSupplierProductRead(
        id=product.id,
        supplier_sku=product.supplier_sku,
        supplier_title=product.supplier_title,
        supplier_price=product.supplier_price,
        currency=product.currency,
        supplier_stock=product.supplier_stock,
        stock_status=product.stock_status,
        lead_time_days=product.lead_time_days,
        min_order_qty=product.min_order_qty,
        warranty=product.warranty,
        is_active=product.is_active,
        mapped_item_sku=item.sku if item else None,
        mapped_item_name=item.name if item else None,
        is_preferred=bool(link and link.is_preferred),
        updated_at=product.updated_at,
    )


@router.get("/products", response_model=PortalProductListResponse)
def portal_products(
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
    search: Optional[str] = Query(default=None),
) -> PortalProductListResponse:
    query = db.query(SupplierProduct).filter(
        SupplierProduct.supplier_id == identity.supplier_id
    )
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (SupplierProduct.supplier_sku.ilike(like))
            | (SupplierProduct.supplier_title.ilike(like))
        )
    products = query.order_by(SupplierProduct.supplier_title.asc()).all()

    links = {
        l.supplier_product_id: l
        for l in db.query(SupplierLink)
        .filter(SupplierLink.supplier_id == identity.supplier_id)
        .all()
        if l.supplier_product_id
    }
    item_ids = {l.item_id for l in links.values()}
    items = (
        {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids
        else {}
    )

    data = [
        _product_read(p, links.get(p.id), items.get(links[p.id].item_id) if p.id in links else None)
        for p in products
    ]
    return PortalProductListResponse(
        data=data,
        meta={"count": len(data), "mapped": sum(1 for d in data if d.mapped_item_sku)},
    )


@router.post("/products", response_model=PortalSupplierProductRead, status_code=201)
def portal_upsert_product(
    payload: PortalProductUpsert,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalSupplierProductRead:
    """Create or update one of the signed-in supplier's own products."""
    product = (
        db.query(SupplierProduct)
        .filter(
            SupplierProduct.supplier_id == identity.supplier_id,
            SupplierProduct.supplier_sku == payload.supplier_sku,
        )
        .first()
    )
    if product is None:
        product = SupplierProduct(
            company_id=identity.user.company_id,
            supplier_id=identity.supplier_id,
            supplier_sku=payload.supplier_sku,
            supplier_title=payload.supplier_title,
            supplier_price=payload.supplier_price,
            currency=payload.currency or "BDT",
            supplier_stock=payload.supplier_stock,
            stock_status=payload.stock_status or "unknown",
            lead_time_days=payload.lead_time_days if payload.lead_time_days is not None else 7,
            min_order_qty=payload.min_order_qty or 1,
            warranty=payload.warranty,
            api_source="portal",
        )
        db.add(product)
    else:
        product.supplier_title = payload.supplier_title
        product.supplier_price = payload.supplier_price
        if payload.currency:
            product.currency = payload.currency
        if payload.supplier_stock is not None:
            product.supplier_stock = payload.supplier_stock
        if payload.stock_status:
            product.stock_status = payload.stock_status
        if payload.lead_time_days is not None:
            product.lead_time_days = payload.lead_time_days
        if payload.min_order_qty is not None:
            product.min_order_qty = payload.min_order_qty
        if payload.warranty is not None:
            product.warranty = payload.warranty
    product.last_synced_at = datetime.utcnow()
    db.commit()
    db.refresh(product)

    link = (
        db.query(SupplierLink)
        .filter(SupplierLink.supplier_product_id == product.id)
        .first()
    )
    item = db.get(Item, link.item_id) if link else None
    return _product_read(product, link, item)


@router.get("/items", response_model=PortalItemListResponse)
def portal_items(
    db: Session = Depends(get_db),
    _: PortalIdentity = Depends(require_supplier_user),
    search: Optional[str] = Query(default=None),
) -> PortalItemListResponse:
    """Buyer items a supplier may map onto. SKU and name only — no stock or cost."""
    query = db.query(Item).filter(Item.item_type == "physical")
    if search:
        like = f"%{search.strip()}%"
        query = query.filter((Item.sku.ilike(like)) | (Item.name.ilike(like)))
    rows = query.order_by(Item.sku.asc()).limit(300).all()
    return PortalItemListResponse(
        data=[PortalItemOption(id=r.id, sku=r.sku, name=r.name) for r in rows]
    )


@router.post("/mappings", response_model=PortalSupplierProductRead)
def portal_map_product(
    payload: PortalMapRequest,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalSupplierProductRead:
    """Map one of the supplier's own products to a buyer item.

    The product must belong to the signed-in supplier; a supplier can never
    touch another supplier's product or link.
    """
    product = db.get(SupplierProduct, payload.supplier_product_id)
    if not product or product.supplier_id != identity.supplier_id:
        raise HTTPException(status_code=404, detail="Product not found")

    item = db.get(Item, payload.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    link = (
        db.query(SupplierLink)
        .filter(
            SupplierLink.supplier_id == identity.supplier_id,
            SupplierLink.item_id == payload.item_id,
        )
        .first()
    )
    if link is None:
        link = SupplierLink(
            company_id=identity.user.company_id,
            item_id=payload.item_id,
            supplier_id=identity.supplier_id,
            supplier_product_id=product.id,
        )
        db.add(link)
    else:
        link.supplier_product_id = product.id
    # `is_preferred` stays a buyer decision — the portal never sets it.
    db.commit()
    db.refresh(link)
    return _product_read(product, link, item)


@router.delete("/mappings/{link_id}", response_model=OkResponse)
def portal_unmap(
    link_id: str,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> OkResponse:
    link = db.get(SupplierLink, link_id)
    if not link or link.supplier_id != identity.supplier_id:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(link)
    db.commit()
    return OkResponse()


# -------------------------------------------------------------------- orders


@router.get("/orders", response_model=PortalOrderListResponse)
def portal_orders(
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|confirmed|partial_received|completed|cancelled)$"
    ),
) -> PortalOrderListResponse:
    """Only orders raised on the signed-in supplier, and only once confirmed —
    a draft is the buyer's internal working state."""
    query = db.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == identity.supplier_id,
        PurchaseOrder.status != "draft",
    )
    if status:
        query = query.filter(PurchaseOrder.status == status)
    orders = query.order_by(PurchaseOrder.created_at.desc()).limit(300).all()

    warehouse_names = {
        w.id: w.name
        for w in db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.id.in_({o.warehouse_id for o in orders}))
        .all()
    } if orders else {}

    data: list[PortalOrderRead] = []
    for order in orders:
        lines = (
            db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.purchase_order_id == order.id)
            .order_by(PurchaseOrderLine.line_number.asc())
            .all()
        )
        data.append(
            PortalOrderRead(
                id=order.id,
                po_number=order.po_number,
                status=order.status,
                order_date=str(order.order_date),
                expected_date=str(order.expected_date) if order.expected_date else None,
                warehouse_name=warehouse_names.get(order.warehouse_id),
                total=order.total,
                lines=[
                    PortalOrderLineRead(
                        sku=l.sku,
                        name=l.name,
                        quantity_ordered=l.quantity_ordered,
                        quantity_received=l.quantity_received,
                        unit_cost=l.unit_cost,
                        line_total=l.line_total,
                    )
                    for l in lines
                ],
            )
        )
    return PortalOrderListResponse(data=data, meta={"count": len(data)})


# ---------------------------------------------------------------------- rfqs


def _portal_rfq_read(
    db: Session, service: PurchaseRfqService, rfq: PurchaseRfq, supplier_id: str
) -> PortalRfqRead:
    """Builds the supplier-facing RFQ view: the RFQ's own lines plus, if any,
    THIS supplier's own quote — never another supplier's bid or pricing."""
    lines = service.get_lines(rfq.id)
    my_quote = (
        db.query(PurchaseRfqQuote)
        .filter(
            PurchaseRfqQuote.purchase_rfq_id == rfq.id,
            PurchaseRfqQuote.supplier_id == supplier_id,
        )
        .order_by(PurchaseRfqQuote.created_at.desc())
        .first()
    )
    quote_read: Optional[PortalRfqQuoteRead] = None
    if my_quote:
        quote_lines = service.get_quote_lines(my_quote.id)
        quote_read = PortalRfqQuoteRead(
            id=my_quote.id,
            quote_number=my_quote.quote_number,
            status=my_quote.status,
            valid_until=my_quote.valid_until,
            lead_time_days=my_quote.lead_time_days,
            moq=my_quote.moq,
            total_amount=my_quote.total_amount,
            submitted_at=my_quote.submitted_at,
            notes=my_quote.notes,
            line_quotes=[
                PortalRfqQuoteLineRead(rfq_line_id=l.purchase_rfq_line_id, unit_price=l.unit_price)
                for l in quote_lines
            ],
        )
    return PortalRfqRead(
        id=rfq.id,
        rfq_number=rfq.rfq_number,
        title=rfq.title,
        status=rfq.status,
        deadline=rfq.deadline,
        buyer_name=rfq.buyer_name,
        notes=rfq.notes,
        lines=[
            PortalRfqLineRead(id=l.id, sku=l.sku, name=l.name, quantity=l.quantity) for l in lines
        ],
        my_quote=quote_read,
    )


def _require_invite(db: Session, rfq_id: str, supplier_id: str) -> PurchaseRfqInvite:
    invite = (
        db.query(PurchaseRfqInvite)
        .filter(
            PurchaseRfqInvite.purchase_rfq_id == rfq_id,
            PurchaseRfqInvite.supplier_id == supplier_id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return invite


@router.get("/rfqs", response_model=PortalRfqListResponse)
def portal_rfqs(
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalRfqListResponse:
    """RFQs the signed-in supplier was invited to, once sent — a draft is the
    buyer's internal working state (same idea as /portal/orders)."""
    invited_ids = {
        i.purchase_rfq_id
        for i in db.query(PurchaseRfqInvite)
        .filter(PurchaseRfqInvite.supplier_id == identity.supplier_id)
        .all()
    }
    if not invited_ids:
        return PortalRfqListResponse(data=[], meta={"count": 0})

    service = PurchaseRfqService(db, company_id=identity.user.company_id)
    rfqs = (
        db.query(PurchaseRfq)
        .filter(
            PurchaseRfq.id.in_(invited_ids),
            PurchaseRfq.company_id == identity.user.company_id,
            PurchaseRfq.status != "draft",
        )
        .order_by(PurchaseRfq.created_at.desc())
        .all()
    )
    data = [_portal_rfq_read(db, service, r, identity.supplier_id) for r in rfqs]
    return PortalRfqListResponse(data=data, meta={"count": len(data)})


@router.get("/rfqs/{rfq_id}", response_model=PortalRfqResponse)
def portal_rfq_detail(
    rfq_id: str,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalRfqResponse:
    _require_invite(db, rfq_id, identity.supplier_id)
    service = PurchaseRfqService(db, company_id=identity.user.company_id)
    rfq = service.record_view(rfq_id, identity.supplier_id)
    db.commit()
    db.refresh(rfq)
    return PortalRfqResponse(data=_portal_rfq_read(db, service, rfq, identity.supplier_id))


@router.post("/rfqs/{rfq_id}/quotes", response_model=PortalRfqResponse, status_code=201)
def portal_submit_rfq_quote(
    rfq_id: str,
    payload: PortalRfqQuoteCreate,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalRfqResponse:
    _require_invite(db, rfq_id, identity.supplier_id)
    service = PurchaseRfqService(db, company_id=identity.user.company_id)
    service.submit_quote(
        rfq_id,
        identity.supplier_id,
        quote_number=payload.quote_number,
        valid_until=payload.valid_until,
        lead_time_days=payload.lead_time_days,
        moq=payload.moq,
        line_quotes=[
            RfqQuoteLineInput(rfq_line_id=lq.rfq_line_id, unit_price=lq.unit_price)
            for lq in payload.line_quotes
        ],
        source="portal",
        notes=payload.notes,
    )
    db.commit()
    rfq = service.get_rfq(rfq_id)
    return PortalRfqResponse(data=_portal_rfq_read(db, service, rfq, identity.supplier_id))


@router.put("/rfqs/{rfq_id}/quotes/{quote_id}", response_model=PortalRfqResponse)
def portal_update_rfq_quote(
    rfq_id: str,
    quote_id: str,
    payload: PortalRfqQuoteCreate,
    db: Session = Depends(get_db),
    identity: PortalIdentity = Depends(require_supplier_user),
) -> PortalRfqResponse:
    service = PurchaseRfqService(db, company_id=identity.user.company_id)
    quote = service.get_quote(quote_id)
    if not quote or quote.supplier_id != identity.supplier_id or quote.purchase_rfq_id != rfq_id:
        raise HTTPException(status_code=404, detail="Quote not found")
    service.update_quote(
        quote_id,
        quote_number=payload.quote_number,
        valid_until=payload.valid_until,
        lead_time_days=payload.lead_time_days,
        moq=payload.moq,
        line_quotes=[
            RfqQuoteLineInput(rfq_line_id=lq.rfq_line_id, unit_price=lq.unit_price)
            for lq in payload.line_quotes
        ],
        notes=payload.notes,
    )
    db.commit()
    rfq = service.get_rfq(rfq_id)
    return PortalRfqResponse(data=_portal_rfq_read(db, service, rfq, identity.supplier_id))
