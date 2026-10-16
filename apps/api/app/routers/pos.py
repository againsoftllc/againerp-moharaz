from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.pos import PosCartLine
from app.schemas.pos import (
    PosCartRead,
    PosCashMovementCreate,
    PosCashMovementRead,
    PosCompleteRequest,
    PosCompleteResponse,
    PosDashboardRead,
    PosDashboardResponse,
    PosDiscountRequest,
    PosHoldRequest,
    PosLineAdd,
    PosLineQtyUpdate,
    PosProductRead,
    PosReceiptRead,
    PosReturnCreate,
    PosReturnRead,
    PosSerialRead,
    PosSessionClose,
    PosSessionOpen,
    PosSessionRead,
    PosSettingsUpdate,
    PosTerminalCreate,
    PosTerminalRead,
    PosTerminalUpdate,
    cart_to_read,
    receipt_to_read,
    terminal_to_read,
)
from app.services.pos.constants import PAYMENT_METHOD_LABELS, PAYMENT_METHODS
from app.services.pos.pos_service import PosLineInput, PosPaymentInput, PosReturnLineInput, PosService

router = APIRouter(prefix="/pos", tags=["pos"])


def _cart_payload(svc: PosService, cart) -> PosCartRead:
    payload = cart_to_read(cart, svc.get_cart_lines(cart.id))
    lines = [
        line.model_copy(update=svc.line_catalog_fields(line.item_id, cart.warehouse_id, cart.company_id))
        for line in payload.lines
    ]
    return payload.model_copy(update={"lines": lines})


@router.get("/dashboard", response_model=PosDashboardResponse)
def pos_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    session_id: Optional[str] = Query(default=None),
) -> PosDashboardResponse:
    raw = PosService(db).dashboard(company_id, session_id=session_id)
    return PosDashboardResponse(data=PosDashboardRead(**raw))


@router.get("/reports")
def pos_reports(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    return {"data": PosService(db).reports(company_id)}


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    return {"data": PosService(db).get_settings(company_id)}


@router.put("/settings")
def put_settings(
    payload: PosSettingsUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "write")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    data = PosService(db).update_settings(
        company_id,
        payload.model_dump(exclude_none=True),
        actor_id=user.id,
    )
    db.commit()
    return {"data": data}


@router.get("/payment-methods")
def payment_methods(
    _: AuthUser = Depends(require_permission("pos", "read")),
) -> dict[str, Any]:
    return {
        "data": [
            {"id": key, "label": PAYMENT_METHOD_LABELS.get(key, key)}
            for key in ("cash", "card", "bank", "mobile_banking", "other")
            if key in PAYMENT_METHODS
        ]
    }


@router.get("/warehouses")
def list_pos_warehouses(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    rows = PosService(db).list_warehouses(company_id)
    return {
        "data": [
            {"id": row.id, "name": row.name, "code": row.code, "address": row.address}
            for row in rows
        ]
    }


@router.get("/terminals", response_model=list[PosTerminalRead])
def list_terminals(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
) -> list[PosTerminalRead]:
    return [terminal_to_read(row) for row in PosService(db).list_terminals(company_id, status=status)]


@router.post("/terminals", response_model=PosTerminalRead, status_code=201)
def create_terminal(
    payload: PosTerminalCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PosTerminalRead:
    row = PosService(db).create_terminal(
        name=payload.name,
        code=payload.code,
        warehouse_id=payload.warehouse_id,
        company_id=company_id,
        default_cash_account_id=payload.default_cash_account_id,
        payment_methods=payload.payment_methods,
        receipt_printer=payload.receipt_printer,
        barcode_scanner=payload.barcode_scanner,
        customer_display=payload.customer_display,
        status=payload.status,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(row)
    return terminal_to_read(row)


@router.patch("/terminals/{terminal_id}", response_model=PosTerminalRead)
def update_terminal(
    terminal_id: str,
    payload: PosTerminalUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "write")),
) -> PosTerminalRead:
    row = PosService(db).update_terminal(
        terminal_id,
        actor_id=user.id,
        **payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(row)
    return terminal_to_read(row)


@router.get("/sessions", response_model=list[PosSessionRead])
def list_sessions(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    terminal_id: Optional[str] = Query(default=None),
) -> list[PosSessionRead]:
    rows = PosService(db).list_sessions(
        company_id,
        status=status,
        warehouse_id=warehouse_id,
        terminal_id=terminal_id,
    )
    return [PosSessionRead.model_validate(row) for row in rows]


@router.post("/sessions/open", response_model=PosSessionRead, status_code=201)
def open_session(
    payload: PosSessionOpen,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "create")),
    company_id: str = Depends(get_current_company_id),
) -> PosSessionRead:
    svc = PosService(db)
    session = svc.open_session(
        warehouse_id=payload.warehouse_id,
        company_id=company_id,
        register_name=payload.register_name,
        opening_float=payload.opening_float,
        cashier_id=user.id,
        cashier_name=payload.cashier_name or getattr(user, "name", None) or user.email,
        notes=payload.notes,
        terminal_id=payload.terminal_id,
        opening_note=payload.opening_note,
    )
    db.commit()
    db.refresh(session)
    return PosSessionRead.model_validate(session)


@router.post("/sessions/{session_id}/close", response_model=PosSessionRead)
def close_session(
    session_id: str,
    payload: PosSessionClose,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosSessionRead:
    svc = PosService(db)
    session = svc.close_session(session_id, closing_cash=payload.closing_cash, notes=payload.notes)
    db.commit()
    db.refresh(session)
    return PosSessionRead.model_validate(session)


@router.get("/sessions/{session_id}", response_model=PosSessionRead)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PosSessionRead:
    session = PosService(db).get_session(session_id, company_id=company_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return PosSessionRead.model_validate(session)


@router.get("/products/search", response_model=list[PosProductRead])
def search_products(
    q: str = Query(..., min_length=1),
    warehouse_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    limit: int = Query(20, ge=1, le=50),
) -> list[PosProductRead]:
    rows = PosService(db).search_products(q, warehouse_id=warehouse_id, company_id=company_id, limit=limit)
    return [PosProductRead.model_validate(r) for r in rows]


@router.get("/products/browse", response_model=list[PosProductRead])
def browse_products(
    warehouse_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    category: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(40, ge=1, le=80),
    offset: int = Query(0, ge=0),
) -> list[PosProductRead]:
    rows = PosService(db).browse_products(
        warehouse_id=warehouse_id,
        company_id=company_id,
        category=category,
        q=q,
        limit=limit,
        offset=offset,
    )
    return [PosProductRead.model_validate(r) for r in rows]


@router.get("/products/categories")
def product_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    return {"data": PosService(db).list_product_categories(company_id)}


@router.get("/products/scan", response_model=PosProductRead)
def scan_barcode(
    barcode: str = Query(..., min_length=1),
    warehouse_id: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PosProductRead:
    row = PosService(db).scan_barcode(barcode, warehouse_id=warehouse_id, company_id=company_id)
    return PosProductRead.model_validate(row)


@router.get("/products/{item_id}/serials", response_model=list[PosSerialRead])
def list_item_serials(
    item_id: str,
    warehouse_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> list[PosSerialRead]:
    rows = PosService(db).list_available_serials(item_id, warehouse_id=warehouse_id, company_id=company_id)
    return [
        PosSerialRead(id=row.id, serial_number=row.serial_number, status=row.status, warehouse_id=row.warehouse_id)
        for row in rows
    ]


@router.get("/sessions/{session_id}/cart", response_model=PosCartRead)
def get_active_cart(
    session_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.get_or_create_active_cart(session_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.get("/carts/{cart_id}", response_model=PosCartRead)
def get_cart(
    cart_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.get_cart(cart_id, company_id=company_id)
    if not cart:
        raise HTTPException(status_code=404, detail="POS cart not found")
    return _cart_payload(svc, cart)


@router.patch("/carts/{cart_id}/customer", response_model=PosCartRead)
def set_cart_customer(
    cart_id: str,
    customer_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.set_customer(cart_id, customer_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.patch("/carts/{cart_id}/discount", response_model=PosCartRead)
def set_cart_discount(
    cart_id: str,
    payload: PosDiscountRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.set_order_discount(cart_id, payload.amount)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.post("/carts/{cart_id}/clear", response_model=PosCartRead)
def clear_cart(
    cart_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.clear_cart(cart_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.post("/carts/{cart_id}/lines", response_model=PosCartRead, status_code=201)
def add_cart_line(
    cart_id: str,
    payload: PosLineAdd,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    svc.add_line(
        cart_id,
        PosLineInput(
            item_id=payload.item_id,
            quantity=payload.quantity,
            unit_price=payload.unit_price,
            tax_rate=payload.tax_rate,
            discount_amount=payload.discount_amount,
            serial_number=payload.serial_number,
        ),
    )
    cart = svc.get_cart(cart_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.patch("/cart-lines/{line_id}", response_model=PosCartRead)
def update_cart_line(
    line_id: str,
    payload: PosLineQtyUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    line = db.get(PosCartLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    cart_id = line.pos_cart_id
    svc.update_line(
        line_id,
        quantity=payload.quantity,
        discount_amount=payload.discount_amount,
        unit_price=payload.unit_price,
        tax_rate=payload.tax_rate,
    )
    cart = svc.get_cart(cart_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.delete("/cart-lines/{line_id}", status_code=204, response_class=Response)
def remove_cart_line(
    line_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> Response:
    svc = PosService(db)
    line = db.get(PosCartLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    svc.remove_line(line_id)
    db.commit()
    return Response(status_code=204)


@router.post("/carts/{cart_id}/hold", response_model=PosCartRead)
def hold_cart(
    cart_id: str,
    payload: PosHoldRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.hold_cart(cart_id, label=payload.label)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.post("/carts/{cart_id}/resume", response_model=PosCartRead)
def resume_cart(
    cart_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCartRead:
    svc = PosService(db)
    cart = svc.resume_cart(cart_id)
    db.commit()
    db.refresh(cart)
    return _cart_payload(svc, cart)


@router.get("/sessions/{session_id}/held", response_model=list[PosCartRead])
def list_held_carts(
    session_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
) -> list[PosCartRead]:
    svc = PosService(db)
    carts = svc.list_held_carts(session_id)
    return [_cart_payload(svc, c) for c in carts]


@router.get("/orders")
def list_orders(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    status: str = Query(default="completed"),
    session_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    svc = PosService(db)
    carts = svc.list_orders(company_id, status=status, session_id=session_id, q=q)
    return {"data": [svc.order_summary(cart) for cart in carts]}


@router.post("/carts/{cart_id}/complete", response_model=PosCompleteResponse)
def complete_cart(
    cart_id: str,
    payload: PosCompleteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "create")),
) -> PosCompleteResponse:
    svc = PosService(db)
    cart, receipt = svc.complete_cart(
        cart_id,
        [
            PosPaymentInput(
                payment_method=p.payment_method,
                amount=p.amount,
                reference=p.reference,
                card_last4=p.card_last4,
            )
            for p in payload.payments
        ],
        actor_id=user.id,
        client_mutation_id=payload.client_mutation_id,
    )
    db.commit()
    db.refresh(cart)
    db.refresh(receipt)
    return PosCompleteResponse(
        cart=_cart_payload(svc, cart),
        receipt=receipt_to_read(receipt),
    )


@router.get("/receipts", response_model=list[PosReceiptRead])
def list_receipts(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> list[PosReceiptRead]:
    return [receipt_to_read(row) for row in PosService(db).list_receipts(company_id)]


@router.get("/receipts/{receipt_id}", response_model=PosReceiptRead)
def get_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PosReceiptRead:
    receipt = PosService(db).get_receipt(receipt_id, company_id=company_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return receipt_to_read(receipt)


@router.post("/receipts/{receipt_id}/print", response_model=PosReceiptRead)
def print_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "write")),
) -> PosReceiptRead:
    svc = PosService(db)
    receipt = svc.mark_receipt_printed(receipt_id)
    db.commit()
    db.refresh(receipt)
    return receipt_to_read(receipt)


@router.get("/payments")
def list_payments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    session_id: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    rows = PosService(db).list_payments(company_id, session_id=session_id)
    return {
        "data": [
            {
                "id": payment.id,
                "cart_id": cart.id,
                "cart_number": cart.cart_number,
                "payment_method": payment.payment_method,
                "amount": str(payment.amount),
                "reference": payment.reference,
                "created_at": payment.created_at.isoformat() if payment.created_at else None,
            }
            for payment, cart in rows
        ]
    }


@router.get("/lookup")
def lookup_sale(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    data = PosService(db).lookup_sale(q, company_id=company_id)
    if not data:
        raise HTTPException(status_code=404, detail="Original sale not found")
    return {"data": data}


@router.get("/returns")
def list_returns(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    session_id: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    rows = PosService(db).list_returns(company_id, session_id=session_id)
    return {"data": [PosReturnRead.model_validate(row).model_dump(mode="json") for row in rows]}


@router.post("/sessions/{session_id}/returns", response_model=PosReturnRead, status_code=201)
def create_return(
    session_id: str,
    payload: PosReturnCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "write")),
) -> PosReturnRead:
    svc = PosService(db)
    ret = svc.create_return(
        session_id,
        payload.original_sales_order_id,
        [
            PosReturnLineInput(
                item_id=l.item_id,
                quantity=l.quantity,
                refund_amount=l.refund_amount,
                sales_order_line_id=l.sales_order_line_id,
                serial_number=l.serial_number,
            )
            for l in payload.lines
        ],
        refund_method=payload.refund_method,
        reason=payload.reason,
        actor_id=user.id,
        client_mutation_id=payload.client_mutation_id,
    )
    db.commit()
    db.refresh(ret)
    return PosReturnRead.model_validate(ret)


@router.get("/sessions/{session_id}/cash", response_model=list[PosCashMovementRead])
def list_session_cash(
    session_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
) -> list[PosCashMovementRead]:
    rows = PosService(db).list_cash_movements(session_id=session_id)
    return [PosCashMovementRead.model_validate(row) for row in rows]


@router.post("/sessions/{session_id}/cash", response_model=PosCashMovementRead, status_code=201)
def add_cash_movement(
    session_id: str,
    payload: PosCashMovementCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("pos", "write")),
) -> PosCashMovementRead:
    row = PosService(db).add_cash_movement(
        session_id,
        direction=payload.direction,
        amount=payload.amount,
        reason=payload.reason,
        note=payload.note,
        actor_id=user.id,
        actor_name=getattr(user, "name", None) or user.email,
    )
    db.commit()
    db.refresh(row)
    return PosCashMovementRead.model_validate(row)


@router.get("/cash", response_model=list[PosCashMovementRead])
def list_cash(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("pos", "read")),
    company_id: str = Depends(get_current_company_id),
    session_id: Optional[str] = Query(default=None),
) -> list[PosCashMovementRead]:
    rows = PosService(db).list_cash_movements(company_id, session_id=session_id)
    return [PosCashMovementRead.model_validate(row) for row in rows]
