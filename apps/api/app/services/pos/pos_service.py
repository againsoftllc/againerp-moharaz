"""POS orchestration — delegates sales + inventory + finance to shared services."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.pos import (
    PosCart,
    PosCartLine,
    PosCashMovement,
    PosPayment,
    PosReceipt,
    PosReturn,
    PosReturnLine,
    PosSession,
    PosSetting,
    PosTerminal,
)
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.inventory.constants import MOVEMENT_POS_RETURN
from app.services.inventory.inventory_settings_service import allow_negative_stock
from app.services.inventory.serial_service import clean_serial, find_by_number, set_status as set_serial_status
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.pos.constants import (
    CASH_DIRECTIONS,
    CASH_IN_REASONS,
    CASH_OUT_REASONS,
    DEFAULT_POS_SETTINGS,
    DEFAULT_WALK_IN_CUSTOMER_CODE,
    PAYMENT_METHODS,
    TERMINAL_STATUSES,
    expected_drawer_cash,
)
from app.services.rma import warranty as warranty_rules
from app.services.sales.sales_service import SalesLineInput, SalesService
from app.services.core.sequence_service import next_number as allocate_number


@dataclass(frozen=True)
class PosLineInput:
    item_id: str
    quantity: int = 1
    unit_price: Optional[Decimal] = None
    tax_rate: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    serial_number: Optional[str] = None


@dataclass(frozen=True)
class PosPaymentInput:
    payment_method: str
    amount: Decimal
    reference: Optional[str] = None
    card_last4: Optional[str] = None


@dataclass(frozen=True)
class PosReturnLineInput:
    item_id: str
    quantity: int
    refund_amount: Decimal
    sales_order_line_id: Optional[str] = None
    serial_number: Optional[str] = None


class PosService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._sales = SalesService(db)

    # ── Terminals ────────────────────────────────────────────────────────────

    def list_warehouses(self, company_id: str = "default") -> list[InventoryWarehouse]:
        return (
            self._db.query(InventoryWarehouse)
            .filter(
                InventoryWarehouse.company_id == company_id,
                InventoryWarehouse.is_active.is_(True),
            )
            .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name)
            .all()
        )

    def list_terminals(self, company_id: str = "default", *, status: Optional[str] = None) -> list[PosTerminal]:
        query = self._db.query(PosTerminal).filter(PosTerminal.company_id == company_id)
        if status:
            query = query.filter(PosTerminal.status == status)
        return query.order_by(PosTerminal.name).all()

    def get_terminal(self, terminal_id: str) -> Optional[PosTerminal]:
        return self._db.get(PosTerminal, terminal_id)

    def create_terminal(
        self,
        *,
        name: str,
        code: str,
        warehouse_id: str,
        company_id: str = "default",
        default_cash_account_id: Optional[str] = None,
        payment_methods: Optional[list[str]] = None,
        receipt_printer: Optional[str] = None,
        barcode_scanner: Optional[str] = None,
        customer_display: Optional[str] = None,
        status: str = "active",
        actor_id: Optional[str] = None,
    ) -> PosTerminal:
        self._require_warehouse(warehouse_id)
        if status not in TERMINAL_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid terminal status")
        code_clean = code.strip().upper()
        existing = (
            self._db.query(PosTerminal)
            .filter(PosTerminal.company_id == company_id, PosTerminal.code == code_clean)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Terminal code already exists")
        methods = payment_methods or ["cash", "card"]
        for method in methods:
            if method not in PAYMENT_METHODS:
                raise HTTPException(status_code=400, detail=f"Invalid payment method: {method}")
        row = PosTerminal(
            company_id=company_id,
            name=name.strip(),
            code=code_clean,
            warehouse_id=warehouse_id,
            default_cash_account_id=default_cash_account_id,
            payment_methods_json=json.dumps(methods),
            receipt_printer=receipt_printer,
            barcode_scanner=barcode_scanner,
            customer_display=customer_display,
            status=status,
            created_by=actor_id,
            updated_by=actor_id,
        )
        self._db.add(row)
        self._db.flush()
        return row

    def update_terminal(self, terminal_id: str, **fields: Any) -> PosTerminal:
        row = self.get_terminal(terminal_id)
        if not row:
            raise HTTPException(status_code=404, detail="Terminal not found")
        if "warehouse_id" in fields and fields["warehouse_id"]:
            self._require_warehouse(fields["warehouse_id"])
            row.warehouse_id = fields["warehouse_id"]
        if "name" in fields and fields["name"]:
            row.name = str(fields["name"]).strip()
        if "status" in fields and fields["status"]:
            if fields["status"] not in TERMINAL_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid terminal status")
            row.status = fields["status"]
        if "default_cash_account_id" in fields:
            row.default_cash_account_id = fields["default_cash_account_id"]
        if "payment_methods" in fields and fields["payment_methods"] is not None:
            for method in fields["payment_methods"]:
                if method not in PAYMENT_METHODS:
                    raise HTTPException(status_code=400, detail=f"Invalid payment method: {method}")
            row.payment_methods_json = json.dumps(fields["payment_methods"])
        for key in ("receipt_printer", "barcode_scanner", "customer_display"):
            if key in fields:
                setattr(row, key, fields[key])
        if fields.get("actor_id"):
            row.updated_by = fields["actor_id"]
        self._db.flush()
        return row

    # ── Sessions ───────────────────────────────────────────────────────────────

    def open_session(
        self,
        *,
        warehouse_id: Optional[str] = None,
        company_id: str = "default",
        register_name: str = "Register 1",
        opening_float: Decimal = Decimal("0"),
        cashier_id: Optional[str] = None,
        cashier_name: Optional[str] = None,
        notes: Optional[str] = None,
        terminal_id: Optional[str] = None,
        opening_note: Optional[str] = None,
    ) -> PosSession:
        terminal = None
        if terminal_id:
            terminal = self.get_terminal(terminal_id)
            if not terminal or terminal.company_id != company_id:
                raise HTTPException(status_code=404, detail="Terminal not found")
            if terminal.status != "active":
                raise HTTPException(status_code=400, detail="Terminal is inactive")
            warehouse_id = terminal.warehouse_id
            register_name = terminal.code
        if not warehouse_id:
            raise HTTPException(status_code=400, detail="Warehouse or terminal is required")
        self._require_warehouse(warehouse_id)
        existing = (
            self._db.query(PosSession)
            .filter(
                PosSession.company_id == company_id,
                PosSession.warehouse_id == warehouse_id,
                PosSession.register_name == register_name,
                PosSession.status == "open",
            )
            .first()
        )
        if existing:
            return existing
        session = PosSession(
            company_id=company_id,
            warehouse_id=warehouse_id,
            terminal_id=terminal.id if terminal else None,
            register_name=register_name,
            opening_float=opening_float,
            cashier_id=cashier_id,
            cashier_name=cashier_name,
            notes=notes or opening_note,
            opening_note=opening_note or notes,
            status="open",
        )
        self._db.add(session)
        self._db.flush()
        return session

    def close_session(
        self,
        session_id: str,
        *,
        closing_cash: Decimal,
        notes: Optional[str] = None,
    ) -> PosSession:
        session = self._require_session(session_id)
        if session.status != "open":
            raise HTTPException(status_code=400, detail="Session is closed")
        active = (
            self._db.query(PosCart)
            .filter(PosCart.session_id == session.id, PosCart.status == "active")
            .first()
        )
        if active and self.get_cart_lines(active.id):
            raise HTTPException(
                status_code=400,
                detail="Complete, hold, or clear the active cart before closing the session",
            )
        totals = self.session_cash_totals(session.id)
        expected = expected_drawer_cash(
            opening=session.opening_float,
            cash_sales=totals["cash_sales"],
            cash_in=totals["cash_in"],
            cash_refunds=totals["cash_refunds"],
            cash_out=totals["cash_out"],
        )
        session.closing_cash = closing_cash
        session.expected_cash = expected
        session.cash_variance = closing_cash - expected
        session.status = "closed"
        session.closed_at = datetime.utcnow()
        if notes:
            session.notes = notes
            session.closing_note = notes
        self._db.flush()
        return session

    def get_session(self, session_id: str, *, company_id: Optional[str] = None) -> Optional[PosSession]:
        session = self._db.get(PosSession, session_id)
        if session is not None and company_id is not None and session.company_id != company_id:
            return None
        return session

    def list_sessions(
        self,
        company_id: str = "default",
        *,
        status: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        terminal_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[PosSession]:
        query = self._db.query(PosSession).filter(PosSession.company_id == company_id)
        if status:
            query = query.filter(PosSession.status == status)
        if warehouse_id:
            query = query.filter(PosSession.warehouse_id == warehouse_id)
        if terminal_id:
            query = query.filter(PosSession.terminal_id == terminal_id)
        return query.order_by(PosSession.opened_at.desc()).limit(limit).all()

    def session_cash_totals(self, session_id: str) -> dict[str, Decimal]:
        cash_sales = (
            self._db.query(func.coalesce(func.sum(PosPayment.amount), 0))
            .join(PosCart, PosCart.id == PosPayment.pos_cart_id)
            .filter(
                PosCart.session_id == session_id,
                PosCart.status == "completed",
                PosPayment.payment_method == "cash",
            )
            .scalar()
        )
        cash_refunds = (
            self._db.query(func.coalesce(func.sum(PosReturn.refund_total), 0))
            .filter(PosReturn.session_id == session_id, PosReturn.refund_method == "cash")
            .scalar()
        )
        cash_in = (
            self._db.query(func.coalesce(func.sum(PosCashMovement.amount), 0))
            .filter(PosCashMovement.session_id == session_id, PosCashMovement.direction == "in")
            .scalar()
        )
        cash_out = (
            self._db.query(func.coalesce(func.sum(PosCashMovement.amount), 0))
            .filter(PosCashMovement.session_id == session_id, PosCashMovement.direction == "out")
            .scalar()
        )
        return {
            "cash_sales": Decimal(str(cash_sales or 0)),
            "cash_refunds": Decimal(str(cash_refunds or 0)),
            "cash_in": Decimal(str(cash_in or 0)),
            "cash_out": Decimal(str(cash_out or 0)),
        }

    # ── Product search / barcode ─────────────────────────────────────────────

    def search_products(
        self,
        query: str,
        *,
        warehouse_id: str,
        company_id: str = "default",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        q = query.strip()
        if not q:
            return []
        pattern = f"%{q}%"
        serial_item_ids = [
            row.item_id
            for row in (
                self._db.query(InventorySerial.item_id)
                .filter(
                    InventorySerial.company_id == company_id,
                    InventorySerial.serial_number.ilike(pattern),
                    InventorySerial.item_id.isnot(None),
                )
                .limit(limit)
                .all()
            )
            if row.item_id
        ]
        clauses = [
            Item.sku.ilike(pattern),
            Item.barcode.ilike(pattern),
            Item.name.ilike(pattern),
            CatalogProduct.brand.ilike(pattern),
            CatalogProduct.category.ilike(pattern),
            CatalogProduct.sku.ilike(pattern),
        ]
        if serial_item_ids:
            clauses.append(Item.id.in_(serial_item_ids))
        items = (
            self._db.query(Item)
            .outerjoin(CatalogProduct, CatalogProduct.item_id == Item.id)
            .filter(
                Item.company_id == company_id,
                Item.status == "active",
                or_(*clauses),
            )
            .limit(limit)
            .all()
        )
        return [self._product_payload(item, warehouse_id, company_id) for item in items]

    def scan_barcode(
        self,
        barcode: str,
        *,
        warehouse_id: str,
        company_id: str = "default",
    ) -> dict[str, Any]:
        code = barcode.strip()
        if not code:
            raise HTTPException(status_code=400, detail="Barcode required")
        item = (
            self._db.query(Item)
            .filter(
                Item.company_id == company_id,
                or_(Item.barcode == code, Item.sku == code),
            )
            .first()
        )
        if not item:
            serial = find_by_number(self._db, code, company_id=company_id)
            if serial and serial.item_id:
                item = self._db.get(Item, serial.item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Product not found")
        payload = self._product_payload(item, warehouse_id, company_id)
        serial = find_by_number(self._db, code, company_id=company_id)
        if serial:
            payload["scanned_serial"] = serial.serial_number
            payload["serial_status"] = serial.status
        return payload

    def browse_products(
        self,
        *,
        warehouse_id: str,
        company_id: str = "default",
        category: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 40,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        query = (
            self._db.query(Item)
            .outerjoin(CatalogProduct, CatalogProduct.item_id == Item.id)
            .filter(Item.company_id == company_id, Item.status == "active")
        )
        if category and category != "all":
            query = query.filter(CatalogProduct.category == category)
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    Item.name.ilike(pattern),
                    Item.sku.ilike(pattern),
                    Item.barcode.ilike(pattern),
                )
            )
        items = query.order_by(Item.name).offset(offset).limit(limit).all()
        return [self._product_payload(item, warehouse_id, company_id) for item in items]

    def list_product_categories(self, company_id: str = "default") -> list[str]:
        rows = (
            self._db.query(CatalogProduct.category)
            .join(Item, Item.id == CatalogProduct.item_id)
            .filter(
                Item.company_id == company_id,
                Item.status == "active",
                CatalogProduct.category.isnot(None),
                CatalogProduct.category != "",
            )
            .distinct()
            .order_by(CatalogProduct.category)
            .all()
        )
        return [row[0] for row in rows if row[0]]

    def list_available_serials(
        self,
        item_id: str,
        *,
        warehouse_id: Optional[str] = None,
        company_id: str = "default",
        limit: int = 50,
    ) -> list[InventorySerial]:
        query = self._db.query(InventorySerial).filter(
            InventorySerial.company_id == company_id,
            InventorySerial.item_id == item_id,
            InventorySerial.status == "in_stock",
        )
        if warehouse_id:
            query = query.filter(
                or_(InventorySerial.warehouse_id == warehouse_id, InventorySerial.warehouse_id.is_(None))
            )
        return query.order_by(InventorySerial.serial_number).limit(limit).all()

    # ── Cart ─────────────────────────────────────────────────────────────────

    def get_or_create_active_cart(self, session_id: str) -> PosCart:
        session = self._require_session(session_id)
        if session.status != "open":
            raise HTTPException(status_code=400, detail="Session is closed")
        cart = (
            self._db.query(PosCart)
            .filter(PosCart.session_id == session.id, PosCart.status == "active")
            .order_by(PosCart.created_at.desc())
            .first()
        )
        if cart:
            return cart
        return self._create_cart(session)

    def get_cart(self, cart_id: str, *, company_id: Optional[str] = None) -> Optional[PosCart]:
        cart = self._db.get(PosCart, cart_id)
        if cart is not None and company_id is not None and cart.company_id != company_id:
            return None
        return cart

    def get_cart_lines(self, cart_id: str) -> list[PosCartLine]:
        return (
            self._db.query(PosCartLine)
            .filter(PosCartLine.pos_cart_id == cart_id)
            .order_by(PosCartLine.line_number)
            .all()
        )

    def line_catalog_fields(self, item_id: str, warehouse_id: str, company_id: str) -> dict[str, Any]:
        item = self._db.get(Item, item_id)
        if not item:
            return {"thumbnail": None, "available": None}
        payload = self._product_payload(item, warehouse_id, company_id)
        return {"thumbnail": payload.get("thumbnail"), "available": payload.get("available")}

    def set_customer(self, cart_id: str, customer_id: Optional[str]) -> PosCart:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cannot change customer on non-active cart")
        if customer_id:
            self._sales._require_customer(customer_id)
        cart.customer_id = customer_id
        self._db.flush()
        return cart

    def set_order_discount(self, cart_id: str, amount: Decimal) -> PosCart:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        if amount < 0:
            raise HTTPException(status_code=400, detail="Discount cannot be negative")
        cart.order_discount = amount
        self._recalc_cart(cart)
        return cart

    def add_line(self, cart_id: str, data: PosLineInput) -> PosCartLine:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        item = self._sales._require_item(data.item_id)
        serial = self._normalize_serial(data.serial_number)
        track_serial = self._tracks_serial(item.id)
        if track_serial and not serial:
            raise HTTPException(
                status_code=400,
                detail="This product requires a serial / IMEI. Select an available unit.",
            )
        if serial:
            self._require_serial_available(serial, item.id, cart.company_id, exclude_cart_id=cart.id)
            if data.quantity != 1:
                raise HTTPException(status_code=400, detail="Serialized products must be sold one unit at a time")

        existing_qty = sum(
            line.quantity
            for line in self.get_cart_lines(cart.id)
            if line.item_id == item.id
        )
        self._assert_stock_available(
            item,
            warehouse_id=cart.warehouse_id,
            requested=existing_qty + data.quantity,
            company_id=cart.company_id,
        )

        unit_price = data.unit_price
        if unit_price is None:
            price_row = None
            if cart.customer_id:
                price_row = self._sales.resolve_customer_price(
                    cart.customer_id,
                    item.id,
                    company_id=cart.company_id,
                    quantity=data.quantity,
                )
            if price_row:
                unit_price = price_row.unit_price
            else:
                product = self._catalog_for_item(item)
                unit_price = product.price if product else Decimal("0")
        tax_amount, line_total = SalesService._calc_line(
            data.quantity,
            unit_price,
            data.tax_rate,
            data.discount_amount,
        )
        if not serial:
            existing = (
                self._db.query(PosCartLine)
                .filter(
                    PosCartLine.pos_cart_id == cart.id,
                    PosCartLine.item_id == item.id,
                    or_(PosCartLine.serial_number.is_(None), PosCartLine.serial_number == ""),
                )
                .first()
            )
            if existing:
                existing.quantity += data.quantity
                tax_amount, line_total = SalesService._calc_line(
                    existing.quantity,
                    existing.unit_price,
                    existing.tax_rate,
                    existing.discount_amount,
                )
                existing.tax_amount = tax_amount
                existing.line_total = line_total
                self._recalc_cart(cart)
                return existing
        product = self._catalog_for_item(item)
        line_num = len(self.get_cart_lines(cart.id)) + 1
        line = PosCartLine(
            pos_cart_id=cart.id,
            item_id=item.id,
            line_number=line_num,
            sku=item.sku,
            name=item.name,
            quantity=data.quantity,
            unit_price=unit_price,
            tax_rate=data.tax_rate,
            tax_amount=tax_amount,
            discount_amount=data.discount_amount,
            line_total=line_total,
            serial_number=serial,
            warranty_text=product.warranty if product else None,
        )
        self._db.add(line)
        self._recalc_cart(cart)
        return line

    def update_line_qty(self, line_id: str, quantity: int) -> Optional[PosCartLine]:
        line = self._db.get(PosCartLine, line_id)
        if not line:
            raise HTTPException(status_code=404, detail="Cart line not found")
        cart = self._require_cart(line.pos_cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        if quantity <= 0:
            self._db.delete(line)
            self._recalc_cart(cart)
            return None
        if line.serial_number and quantity != 1:
            raise HTTPException(status_code=400, detail="Serialized products must stay at quantity 1")
        item = self._sales._require_item(line.item_id)
        other_qty = sum(
            row.quantity
            for row in self.get_cart_lines(cart.id)
            if row.item_id == item.id and row.id != line.id
        )
        self._assert_stock_available(
            item,
            warehouse_id=cart.warehouse_id,
            requested=other_qty + quantity,
            company_id=cart.company_id,
        )
        line.quantity = quantity
        line.tax_amount, line.line_total = SalesService._calc_line(
            line.quantity,
            line.unit_price,
            line.tax_rate,
            line.discount_amount,
        )
        self._recalc_cart(cart)
        return line

    def update_line(
        self,
        line_id: str,
        *,
        quantity: Optional[int] = None,
        discount_amount: Optional[Decimal] = None,
        unit_price: Optional[Decimal] = None,
        tax_rate: Optional[Decimal] = None,
    ) -> Optional[PosCartLine]:
        line = self._db.get(PosCartLine, line_id)
        if not line:
            raise HTTPException(status_code=404, detail="Cart line not found")
        cart = self._require_cart(line.pos_cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        if quantity is not None:
            return self.update_line_qty(line_id, quantity)
        if unit_price is not None:
            if unit_price < 0:
                raise HTTPException(status_code=400, detail="Price cannot be negative")
            line.unit_price = unit_price
        if discount_amount is not None:
            if discount_amount < 0:
                raise HTTPException(status_code=400, detail="Discount cannot be negative")
            line.discount_amount = discount_amount
        if tax_rate is not None:
            if tax_rate < 0:
                raise HTTPException(status_code=400, detail="Tax rate cannot be negative")
            line.tax_rate = tax_rate
        line.tax_amount, line.line_total = SalesService._calc_line(
            line.quantity,
            line.unit_price,
            line.tax_rate,
            line.discount_amount,
        )
        self._recalc_cart(cart)
        return line

    def remove_line(self, line_id: str) -> None:
        line = self._db.get(PosCartLine, line_id)
        if not line:
            raise HTTPException(status_code=404, detail="Cart line not found")
        cart = self._require_cart(line.pos_cart_id)
        self._db.delete(line)
        self._recalc_cart(cart)

    def clear_cart(self, cart_id: str) -> PosCart:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        for line in self.get_cart_lines(cart.id):
            self._db.delete(line)
        cart.order_discount = Decimal("0")
        self._recalc_cart(cart)
        return cart

    def hold_cart(self, cart_id: str, *, label: Optional[str] = None) -> PosCart:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Only active carts can be held")
        if not self.get_cart_lines(cart.id):
            raise HTTPException(status_code=400, detail="Cannot hold empty cart")
        cart.status = "held"
        cart.held_label = label or f"Hold {cart.cart_number}"
        cart.held_at = datetime.utcnow()
        self._db.flush()
        session = self._require_session(cart.session_id)
        self._create_cart(session)
        return cart

    def resume_cart(self, cart_id: str) -> PosCart:
        cart = self._require_cart(cart_id)
        if cart.status != "held":
            raise HTTPException(status_code=400, detail="Cart is not on hold")
        active = (
            self._db.query(PosCart)
            .filter(PosCart.session_id == cart.session_id, PosCart.status == "active")
            .first()
        )
        if active and self.get_cart_lines(active.id):
            active.status = "voided"
        if active and not self.get_cart_lines(active.id):
            self._db.delete(active)
        cart.status = "active"
        cart.held_at = None
        self._db.flush()
        return cart

    def list_held_carts(self, session_id: str) -> list[PosCart]:
        return (
            self._db.query(PosCart)
            .filter(PosCart.session_id == session_id, PosCart.status == "held")
            .order_by(PosCart.held_at.desc())
            .all()
        )

    def list_orders(
        self,
        company_id: str = "default",
        *,
        status: str = "completed",
        session_id: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 100,
    ) -> list[PosCart]:
        query = self._db.query(PosCart).filter(PosCart.company_id == company_id)
        if status:
            query = query.filter(PosCart.status == status)
        if session_id:
            query = query.filter(PosCart.session_id == session_id)
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            query = query.outerjoin(CommerceCustomer, CommerceCustomer.id == PosCart.customer_id)
            query = query.filter(
                or_(
                    PosCart.cart_number.ilike(pattern),
                    CommerceCustomer.name.ilike(pattern),
                    CommerceCustomer.phone.ilike(pattern),
                )
            )
        return query.order_by(PosCart.completed_at.desc().nullslast(), PosCart.created_at.desc()).limit(limit).all()

    def complete_cart(
        self,
        cart_id: str,
        payments: list[PosPaymentInput],
        *,
        actor_id: Optional[str] = None,
        client_mutation_id: Optional[str] = None,
    ) -> tuple[PosCart, PosReceipt]:
        cart = self._require_cart(cart_id)
        if cart.status != "active":
            raise HTTPException(status_code=400, detail="Cart is not active")
        session = self._require_session(cart.session_id)
        if session.status != "open":
            raise HTTPException(status_code=400, detail="Session is closed")
        lines = self.get_cart_lines(cart.id)
        if not lines:
            raise HTTPException(status_code=400, detail="Cart is empty")
        settings = self.get_settings(cart.company_id)
        if settings.get("require_customer") and not cart.customer_id:
            raise HTTPException(status_code=400, detail="Customer is required for this sale")

        if client_mutation_id:
            existing = (
                self._db.query(PosCart)
                .filter(
                    PosCart.client_mutation_id == client_mutation_id,
                    PosCart.status == "completed",
                )
                .first()
            )
            if existing:
                receipt = (
                    self._db.query(PosReceipt)
                    .filter(PosReceipt.pos_cart_id == existing.id)
                    .first()
                )
                if receipt:
                    return existing, receipt

        if not payments:
            raise HTTPException(status_code=400, detail="At least one payment required")
        for p in payments:
            if p.payment_method not in PAYMENT_METHODS:
                raise HTTPException(status_code=400, detail=f"Invalid payment method: {p.payment_method}")
        paid = sum(p.amount for p in payments)
        if paid < cart.total:
            raise HTTPException(
                status_code=400,
                detail=f"Payment amount is insufficient: paid {paid} due {cart.total}",
            )

        qty_by_item: dict[str, int] = {}
        for line in lines:
            qty_by_item[line.item_id] = qty_by_item.get(line.item_id, 0) + line.quantity
            if line.serial_number:
                self._require_serial_available(
                    line.serial_number,
                    line.item_id,
                    cart.company_id,
                    exclude_cart_id=cart.id,
                )
        for item_id, qty in qty_by_item.items():
            item = self._sales._require_item(item_id)
            self._assert_stock_available(
                item,
                warehouse_id=cart.warehouse_id,
                requested=qty,
                company_id=cart.company_id,
            )

        customer_id = cart.customer_id or self._walk_in_customer_id(cart.company_id)
        sales_lines = [
            SalesLineInput(
                item_id=line.item_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax_rate=line.tax_rate,
                discount_amount=line.discount_amount,
            )
            for line in lines
        ]
        order, _delivery = self._sales.complete_instant_sale(
            customer_id=customer_id,
            warehouse_id=cart.warehouse_id,
            lines=sales_lines,
            company_id=cart.company_id,
            actor_id=actor_id,
            notes=f"POS {cart.cart_number}",
        )

        for pay in payments:
            self._db.add(
                PosPayment(
                    pos_cart_id=cart.id,
                    payment_method=pay.payment_method,
                    amount=pay.amount,
                    reference=pay.reference,
                    card_last4=pay.card_last4,
                ),
            )

        customer = self._db.get(CommerceCustomer, customer_id)
        for line in lines:
            if line.serial_number:
                self._mark_serial_sold(
                    line.serial_number,
                    order=order,
                    customer=customer,
                    company_id=cart.company_id,
                )

        cart.status = "completed"
        cart.customer_id = customer_id
        cart.sales_order_id = order.id
        cart.completed_at = datetime.utcnow()
        cart.client_mutation_id = client_mutation_id
        cart.sync_status = "synced"

        session.total_sales += cart.total
        session.sale_count += 1

        receipt = self._build_receipt(cart, order, payments, session)
        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_pos_payments(cart.id),
            source_type="sales_order",
            source_id=cart.sales_order_id or cart.id,
            company_id=cart.company_id,
        )

        return cart, receipt

    def get_receipt(self, receipt_id: str, *, company_id: Optional[str] = None) -> Optional[PosReceipt]:
        receipt = self._db.get(PosReceipt, receipt_id)
        if receipt is not None and company_id is not None and receipt.company_id != company_id:
            return None
        return receipt

    def get_receipt_for_cart(self, cart_id: str) -> Optional[PosReceipt]:
        return self._db.query(PosReceipt).filter(PosReceipt.pos_cart_id == cart_id).first()

    def mark_receipt_printed(self, receipt_id: str) -> PosReceipt:
        receipt = self._db.get(PosReceipt, receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")
        receipt.printed_at = datetime.utcnow()
        self._db.flush()
        return receipt

    def list_receipts(self, company_id: str = "default", *, limit: int = 100) -> list[PosReceipt]:
        return (
            self._db.query(PosReceipt)
            .filter(PosReceipt.company_id == company_id)
            .order_by(PosReceipt.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_payments(
        self,
        company_id: str = "default",
        *,
        session_id: Optional[str] = None,
        limit: int = 200,
    ) -> list[tuple[PosPayment, PosCart]]:
        query = (
            self._db.query(PosPayment, PosCart)
            .join(PosCart, PosCart.id == PosPayment.pos_cart_id)
            .filter(PosCart.company_id == company_id, PosCart.status == "completed")
        )
        if session_id:
            query = query.filter(PosCart.session_id == session_id)
        return query.order_by(PosPayment.created_at.desc()).limit(limit).all()

    # ── Returns ──────────────────────────────────────────────────────────────

    def lookup_sale(
        self,
        query: str,
        *,
        company_id: str = "default",
    ) -> Optional[dict[str, Any]]:
        q = query.strip()
        if not q:
            return None
        cart = (
            self._db.query(PosCart)
            .filter(PosCart.company_id == company_id, PosCart.cart_number == q)
            .first()
        )
        if not cart:
            receipt = (
                self._db.query(PosReceipt)
                .filter(
                    PosReceipt.company_id == company_id,
                    or_(PosReceipt.receipt_number == q, PosReceipt.invoice_number == q),
                )
                .first()
            )
            if receipt:
                cart = self.get_cart(receipt.pos_cart_id)
        if not cart:
            order = (
                self._db.query(SalesOrder)
                .filter(SalesOrder.company_id == company_id, SalesOrder.order_number == q)
                .first()
            )
            if order:
                cart = (
                    self._db.query(PosCart)
                    .filter(PosCart.sales_order_id == order.id)
                    .first()
                )
        if not cart or not cart.sales_order_id:
            return None
        return self.sale_for_return(cart.sales_order_id, company_id=company_id)

    def sale_for_return(self, sales_order_id: str, *, company_id: str = "default") -> dict[str, Any]:
        order = self._sales.get_order(sales_order_id)
        if not order or order.company_id != company_id:
            raise HTTPException(status_code=404, detail="Original sale not found")
        if order.status != "completed":
            raise HTTPException(status_code=400, detail="Original sales order must be completed")
        so_lines = self._sales.get_order_lines(order.id)
        returned_qty: dict[str, int] = {}
        prior = (
            self._db.query(PosReturnLine)
            .join(PosReturn, PosReturn.id == PosReturnLine.pos_return_id)
            .filter(PosReturn.original_sales_order_id == order.id)
            .all()
        )
        for row in prior:
            key = row.sales_order_line_id or row.item_id
            returned_qty[key] = returned_qty.get(key, 0) + row.quantity
        cart = (
            self._db.query(PosCart)
            .filter(PosCart.sales_order_id == order.id)
            .first()
        )
        customer = self._db.get(CommerceCustomer, order.customer_id) if order.customer_id else None
        pos_lines = self.get_cart_lines(cart.id) if cart else []
        serial_by_item = {line.item_id: line.serial_number for line in pos_lines if line.serial_number}
        items = []
        for line in so_lines:
            already = returned_qty.get(line.id, 0) + returned_qty.get(line.item_id, 0)
            remaining = max(line.quantity_ordered - already, 0)
            items.append(
                {
                    "sales_order_line_id": line.id,
                    "item_id": line.item_id,
                    "sku": line.sku,
                    "name": line.name,
                    "quantity_sold": line.quantity_ordered,
                    "quantity_returned": already,
                    "quantity_remaining": remaining,
                    "unit_price": float(line.unit_price),
                    "line_total": float(line.line_total),
                    "serial_number": serial_by_item.get(line.item_id),
                }
            )
        return {
            "sales_order_id": order.id,
            "order_number": order.order_number,
            "invoice_number": order.invoice_number,
            "cart_id": cart.id if cart else None,
            "cart_number": cart.cart_number if cart else None,
            "customer_id": order.customer_id,
            "customer_name": customer.name if customer else None,
            "total": float(order.total),
            "lines": items,
        }

    def create_return(
        self,
        session_id: str,
        original_sales_order_id: str,
        lines: list[PosReturnLineInput],
        *,
        refund_method: str = "cash",
        reason: Optional[str] = None,
        actor_id: Optional[str] = None,
        client_mutation_id: Optional[str] = None,
    ) -> PosReturn:
        session = self._require_session(session_id)
        if session.status != "open":
            raise HTTPException(status_code=400, detail="Session is closed")
        if refund_method not in PAYMENT_METHODS:
            raise HTTPException(status_code=400, detail=f"Invalid refund method: {refund_method}")
        order = self._sales.get_order(original_sales_order_id)
        if not order or order.status != "completed":
            raise HTTPException(status_code=400, detail="Original sales order must be completed")
        if not lines:
            raise HTTPException(status_code=400, detail="Return lines required")

        if client_mutation_id:
            existing = (
                self._db.query(PosReturn)
                .filter(PosReturn.client_mutation_id == client_mutation_id)
                .first()
            )
            if existing:
                return existing

        snapshot = self.sale_for_return(order.id, company_id=session.company_id)
        remaining_by_line = {row["sales_order_line_id"]: row["quantity_remaining"] for row in snapshot["lines"]}
        remaining_by_item = {row["item_id"]: row["quantity_remaining"] for row in snapshot["lines"]}

        ret = PosReturn(
            company_id=session.company_id,
            session_id=session.id,
            original_sales_order_id=order.id,
            return_number=self._next_return_number(session.company_id),
            status="posted",
            refund_method=refund_method,
            reason=reason,
            client_mutation_id=client_mutation_id,
        )
        self._db.add(ret)
        self._db.flush()

        movement_svc = StockMovementService(self._db)
        refund_total = Decimal("0")
        for line_in in lines:
            remaining = remaining_by_line.get(line_in.sales_order_line_id)
            if remaining is None:
                remaining = remaining_by_item.get(line_in.item_id, 0)
            if line_in.quantity > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Return quantity exceeds sold quantity. "
                        f"Available to return: {remaining}. Requested: {line_in.quantity}."
                    ),
                )
            self._db.add(
                PosReturnLine(
                    pos_return_id=ret.id,
                    item_id=line_in.item_id,
                    sales_order_line_id=line_in.sales_order_line_id,
                    quantity=line_in.quantity,
                    refund_amount=line_in.refund_amount,
                    serial_number=self._normalize_serial(line_in.serial_number),
                ),
            )
            refund_total += line_in.refund_amount
            movement_svc.apply_movement(
                MovementInput(
                    item_id=line_in.item_id,
                    warehouse_id=order.warehouse_id,
                    movement_type=MOVEMENT_POS_RETURN,
                    quantity=line_in.quantity,
                    company_id=order.company_id,
                    reference=ret.return_number,
                    notes=f"POS return for {order.order_number}",
                    created_by=actor_id,
                ),
            )
            if line_in.serial_number:
                self._restore_serial(line_in.serial_number, company_id=order.company_id)

        ret.refund_total = refund_total
        session.total_returns += refund_total
        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_pos_return(ret.id),
            source_type="pos_return",
            source_id=ret.id,
            company_id=session.company_id,
        )
        return ret

    def list_returns(
        self,
        company_id: str = "default",
        *,
        session_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[PosReturn]:
        query = self._db.query(PosReturn).filter(PosReturn.company_id == company_id)
        if session_id:
            query = query.filter(PosReturn.session_id == session_id)
        return query.order_by(PosReturn.created_at.desc()).limit(limit).all()

    def get_return_lines(self, return_id: str) -> list[PosReturnLine]:
        return (
            self._db.query(PosReturnLine)
            .filter(PosReturnLine.pos_return_id == return_id)
            .all()
        )

    # ── Cash movements ───────────────────────────────────────────────────────

    def add_cash_movement(
        self,
        session_id: str,
        *,
        direction: str,
        amount: Decimal,
        reason: str,
        note: Optional[str] = None,
        actor_id: Optional[str] = None,
        actor_name: Optional[str] = None,
    ) -> PosCashMovement:
        session = self._require_session(session_id)
        if session.status != "open":
            raise HTTPException(status_code=400, detail="Session is closed")
        if direction not in CASH_DIRECTIONS:
            raise HTTPException(status_code=400, detail="Cash movement must be in or out")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero")
        allowed = CASH_IN_REASONS if direction == "in" else CASH_OUT_REASONS
        if reason not in allowed:
            raise HTTPException(status_code=400, detail="Invalid cash movement reason")
        row = PosCashMovement(
            company_id=session.company_id,
            session_id=session.id,
            direction=direction,
            amount=amount,
            reason=reason,
            note=note,
            created_by=actor_id,
            created_by_name=actor_name,
        )
        self._db.add(row)
        self._db.flush()

        from app.services.finance.finance_service import FinanceService

        FinanceService(self._db).try_post(
            lambda: FinanceService(self._db).record_pos_cash_movement(row.id),
            source_type="pos_cash_movement",
            source_id=row.id,
            company_id=session.company_id,
        )
        return row

    def list_cash_movements(
        self,
        company_id: str = "default",
        *,
        session_id: Optional[str] = None,
        limit: int = 200,
    ) -> list[PosCashMovement]:
        query = self._db.query(PosCashMovement).filter(PosCashMovement.company_id == company_id)
        if session_id:
            query = query.filter(PosCashMovement.session_id == session_id)
        return query.order_by(PosCashMovement.created_at.desc()).limit(limit).all()

    # ── Settings ─────────────────────────────────────────────────────────────

    def get_settings(self, company_id: str = "default") -> dict[str, Any]:
        row = self._db.query(PosSetting).filter(PosSetting.company_id == company_id).first()
        data = dict(DEFAULT_POS_SETTINGS)
        if row:
            stored = json.loads(row.settings_json or "{}")
            if isinstance(stored, dict):
                data.update(stored)
        data["allow_negative_stock"] = allow_negative_stock(self._db, company_id)
        return data

    def update_settings(
        self,
        company_id: str = "default",
        payload: Optional[dict[str, Any]] = None,
        *,
        actor_id: Optional[str] = None,
    ) -> dict[str, Any]:
        current = self.get_settings(company_id)
        incoming = payload or {}
        incoming.pop("allow_negative_stock", None)
        current.update({k: v for k, v in incoming.items() if k in DEFAULT_POS_SETTINGS or k in current})
        current["allow_negative_stock"] = allow_negative_stock(self._db, company_id)
        row = self._db.query(PosSetting).filter(PosSetting.company_id == company_id).first()
        blob = json.dumps({k: v for k, v in current.items() if k != "allow_negative_stock"})
        if row:
            row.settings_json = blob
            row.updated_by = actor_id
        else:
            row = PosSetting(company_id=company_id, settings_json=blob, updated_by=actor_id)
            self._db.add(row)
        self._db.flush()
        return current

    # ── Dashboard / reports ──────────────────────────────────────────────────

    def dashboard(self, company_id: str = "default", *, session_id: Optional[str] = None) -> dict[str, Any]:
        start = datetime.combine(date.today(), datetime.min.time())
        completed_today = (
            self._db.query(PosCart)
            .filter(
                PosCart.company_id == company_id,
                PosCart.status == "completed",
                PosCart.completed_at >= start,
            )
            .all()
        )
        cart_ids = [c.id for c in completed_today]
        payments = []
        if cart_ids:
            payments = (
                self._db.query(PosPayment)
                .filter(PosPayment.pos_cart_id.in_(cart_ids))
                .all()
            )
        sales_total = sum((c.total for c in completed_today), Decimal("0"))
        discount_total = sum((c.discount_total for c in completed_today), Decimal("0"))
        tax_total = sum((c.tax_total for c in completed_today), Decimal("0"))
        order_count = len(completed_today)
        avg_order = (sales_total / order_count) if order_count else Decimal("0")
        by_method: dict[str, Decimal] = {}
        for pay in payments:
            by_method[pay.payment_method] = by_method.get(pay.payment_method, Decimal("0")) + pay.amount

        returns_today = (
            self._db.query(func.coalesce(func.sum(PosReturn.refund_total), 0))
            .filter(PosReturn.company_id == company_id, PosReturn.created_at >= start)
            .scalar()
        )

        open_sessions = (
            self._db.query(PosSession)
            .filter(PosSession.company_id == company_id, PosSession.status == "open")
            .order_by(PosSession.opened_at.desc())
            .all()
        )
        current = None
        if session_id:
            current = next((s for s in open_sessions if s.id == session_id), None)
        if current is None and open_sessions:
            current = open_sessions[0]

        session_payload = None
        if current:
            totals = self.session_cash_totals(current.id)
            expected = expected_drawer_cash(
                opening=current.opening_float,
                cash_sales=totals["cash_sales"],
                cash_in=totals["cash_in"],
                cash_refunds=totals["cash_refunds"],
                cash_out=totals["cash_out"],
            )
            terminal = self.get_terminal(current.terminal_id) if current.terminal_id else None
            session_payload = {
                "id": current.id,
                "status": current.status,
                "register_name": current.register_name,
                "terminal_id": current.terminal_id,
                "terminal_name": terminal.name if terminal else current.register_name,
                "warehouse_id": current.warehouse_id,
                "cashier_name": current.cashier_name,
                "opening_float": float(current.opening_float),
                "cash_sales": float(totals["cash_sales"]),
                "cash_in": float(totals["cash_in"]),
                "cash_out": float(totals["cash_out"]),
                "cash_refunds": float(totals["cash_refunds"]),
                "expected_cash": float(expected),
                "sale_count": current.sale_count,
                "total_sales": float(current.total_sales),
                "opened_at": current.opened_at.isoformat() if current.opened_at else None,
            }

        recent = self.list_orders(company_id, status="completed", limit=12)
        held = (
            self._db.query(PosCart)
            .filter(PosCart.company_id == company_id, PosCart.status == "held")
            .count()
        )
        return {
            "open_session_count": len(open_sessions),
            "completed_sale_count": order_count,
            "held_cart_count": held,
            "today": {
                "sales_total": float(sales_total),
                "order_count": order_count,
                "average_order": float(avg_order),
                "cash_sales": float(by_method.get("cash", 0)),
                "card_sales": float(by_method.get("card", 0)),
                "digital_sales": float(
                    by_method.get("mobile_banking", 0)
                    + by_method.get("mobile_wallet", 0)
                    + by_method.get("bank", 0)
                    + by_method.get("bank_transfer", 0)
                ),
                "returns": float(returns_today or 0),
                "discounts": float(discount_total),
                "tax_collected": float(tax_total),
                "payments": {k: float(v) for k, v in by_method.items()},
            },
            "current_session": session_payload,
            "recent_orders": [self.order_summary(cart) for cart in recent],
        }

    def reports(self, company_id: str = "default") -> dict[str, Any]:
        carts = (
            self._db.query(PosCart)
            .filter(PosCart.company_id == company_id, PosCart.status == "completed")
            .all()
        )
        payments = (
            self._db.query(PosPayment)
            .join(PosCart, PosCart.id == PosPayment.pos_cart_id)
            .filter(PosCart.company_id == company_id, PosCart.status == "completed")
            .all()
        )
        sessions = self._db.query(PosSession).filter(PosSession.company_id == company_id).all()
        returns = self._db.query(PosReturn).filter(PosReturn.company_id == company_id).all()
        lines = (
            self._db.query(PosCartLine)
            .join(PosCart, PosCart.id == PosCartLine.pos_cart_id)
            .filter(PosCart.company_id == company_id, PosCart.status == "completed")
            .all()
        )

        by_cashier: dict[str, dict[str, Any]] = {}
        by_terminal: dict[str, dict[str, Any]] = {}
        by_product: dict[str, dict[str, Any]] = {}
        by_customer: dict[str, dict[str, Any]] = {}
        by_method: dict[str, Decimal] = {}
        session_by_id = {s.id: s for s in sessions}

        gross = sum((c.subtotal + c.order_discount for c in carts), Decimal("0"))
        discounts = sum((c.discount_total for c in carts), Decimal("0"))
        tax = sum((c.tax_total for c in carts), Decimal("0"))
        net = sum((c.total for c in carts), Decimal("0"))
        refunds = sum((r.refund_total for r in returns), Decimal("0"))

        for cart in carts:
            session = session_by_id.get(cart.session_id)
            cashier = (session.cashier_name if session else None) or "Unknown"
            terminal = (session.register_name if session else None) or "Unknown"
            by_cashier.setdefault(cashier, {"count": 0, "total": Decimal("0")})
            by_cashier[cashier]["count"] += 1
            by_cashier[cashier]["total"] += cart.total
            by_terminal.setdefault(terminal, {"count": 0, "total": Decimal("0")})
            by_terminal[terminal]["count"] += 1
            by_terminal[terminal]["total"] += cart.total
            cust_key = cart.customer_id or "walk-in"
            by_customer.setdefault(cust_key, {"count": 0, "total": Decimal("0")})
            by_customer[cust_key]["count"] += 1
            by_customer[cust_key]["total"] += cart.total

        for pay in payments:
            by_method[pay.payment_method] = by_method.get(pay.payment_method, Decimal("0")) + pay.amount

        for line in lines:
            by_product.setdefault(line.sku, {"name": line.name, "qty": 0, "total": Decimal("0")})
            by_product[line.sku]["qty"] += line.quantity
            by_product[line.sku]["total"] += line.line_total

        session_rows = []
        for session in sessions:
            totals = self.session_cash_totals(session.id)
            expected = expected_drawer_cash(
                opening=session.opening_float,
                cash_sales=totals["cash_sales"],
                cash_in=totals["cash_in"],
                cash_refunds=totals["cash_refunds"],
                cash_out=totals["cash_out"],
            )
            session_rows.append(
                {
                    "id": session.id,
                    "register_name": session.register_name,
                    "cashier_name": session.cashier_name,
                    "status": session.status,
                    "opening_cash": float(session.opening_float),
                    "cash_sales": float(totals["cash_sales"]),
                    "cash_in": float(totals["cash_in"]),
                    "cash_out": float(totals["cash_out"]),
                    "refunds": float(totals["cash_refunds"]),
                    "expected_cash": float(expected),
                    "actual_cash": float(session.closing_cash) if session.closing_cash is not None else None,
                    "difference": float(session.cash_variance) if session.cash_variance is not None else None,
                }
            )

        top = sorted(by_product.values(), key=lambda r: r["qty"], reverse=True)[:20]
        slow = sorted(by_product.values(), key=lambda r: r["qty"])[:20]
        low_stock = (
            self._db.query(InventoryStockLevel, Item)
            .join(Item, Item.id == InventoryStockLevel.item_id)
            .filter(Item.company_id == company_id, InventoryStockLevel.on_hand <= 5)
            .order_by(InventoryStockLevel.on_hand.asc())
            .limit(20)
            .all()
        )

        def money_map(src: dict[str, dict[str, Any]]) -> dict[str, Any]:
            return {
                key: {"count": val["count"], "total": float(val["total"])}
                for key, val in src.items()
            }

        return {
            "financial": {
                "gross_sales": float(gross),
                "discounts": float(discounts),
                "tax": float(tax),
                "net_sales": float(net),
                "refunds": float(refunds),
                "order_count": len(carts),
            },
            "by_cashier": money_map(by_cashier),
            "by_terminal": money_map(by_terminal),
            "by_customer": money_map(by_customer),
            "by_payment_method": {k: float(v) for k, v in by_method.items()},
            "by_product": [
                {"sku": sku, "name": val["name"], "qty": val["qty"], "total": float(val["total"])}
                for sku, val in sorted(by_product.items(), key=lambda kv: kv[1]["qty"], reverse=True)[:50]
            ],
            "sessions": session_rows,
            "top_products": [
                {"name": r["name"], "qty": r["qty"], "total": float(r["total"])} for r in top
            ],
            "slow_products": [
                {"name": r["name"], "qty": r["qty"], "total": float(r["total"])} for r in slow
            ],
            "low_stock": [
                {"sku": item.sku, "name": item.name, "on_hand": stock.on_hand}
                for stock, item in low_stock
            ],
        }

    def order_summary(self, cart: PosCart) -> dict[str, Any]:
        lines = self.get_cart_lines(cart.id)
        payments = (
            self._db.query(PosPayment)
            .filter(PosPayment.pos_cart_id == cart.id)
            .all()
        )
        customer = self._db.get(CommerceCustomer, cart.customer_id) if cart.customer_id else None
        session = self.get_session(cart.session_id)
        receipt = self.get_receipt_for_cart(cart.id)
        return {
            "id": cart.id,
            "cart_number": cart.cart_number,
            "status": cart.status,
            "customer_id": cart.customer_id,
            "customer_name": customer.name if customer else "Walk-in",
            "item_count": sum(l.quantity for l in lines),
            "total": float(cart.total),
            "discount_total": float(cart.discount_total),
            "tax_total": float(cart.tax_total),
            "payment_methods": [p.payment_method for p in payments],
            "cashier_name": session.cashier_name if session else None,
            "register_name": session.register_name if session else None,
            "sales_order_id": cart.sales_order_id,
            "receipt_id": receipt.id if receipt else None,
            "invoice_number": receipt.invoice_number if receipt else None,
            "completed_at": cart.completed_at.isoformat() if cart.completed_at else None,
            "held_label": cart.held_label,
            "held_at": cart.held_at.isoformat() if cart.held_at else None,
            "created_at": cart.created_at.isoformat() if cart.created_at else None,
        }

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _create_cart(self, session: PosSession) -> PosCart:
        cart = PosCart(
            company_id=session.company_id,
            session_id=session.id,
            warehouse_id=session.warehouse_id,
            cart_number=self._next_cart_number(session.company_id),
            status="active",
        )
        self._db.add(cart)
        self._db.flush()
        return cart

    def _recalc_cart(self, cart: PosCart) -> None:
        # The session is created with autoflush=False, so any pending line
        # insert/update/delete on this cart (e.g. the line just added in
        # add_line(), or the deletes issued by remove_line()/clear_cart())
        # has NOT been sent to the database yet. get_cart_lines() below runs
        # a fresh SELECT, which would silently miss those pending changes
        # and produce totals computed from a stale line set (e.g. 0 for a
        # cart whose only line hasn't been flushed, or a stale non-zero
        # total after clearing a cart). Flush first so the totals always
        # reflect the real, current set of cart lines.
        self._db.flush()
        lines = self.get_cart_lines(cart.id)
        goods = sum((l.unit_price * l.quantity) for l in lines)
        line_discount = sum(l.discount_amount for l in lines)
        tax_total = sum(l.tax_amount for l in lines)
        order_discount = cart.order_discount or Decimal("0")
        subtotal = goods - line_discount
        if order_discount > subtotal:
            raise HTTPException(status_code=400, detail="Order discount cannot exceed subtotal")
        cart.subtotal = subtotal - order_discount
        cart.tax_total = tax_total
        cart.discount_total = line_discount + order_discount
        cart.total = cart.subtotal + tax_total
        self._db.flush()

    def _catalog_for_item(self, item: Item) -> Optional[CatalogProduct]:
        return (
            self._db.query(CatalogProduct)
            .filter(or_(CatalogProduct.item_id == item.id, CatalogProduct.id == item.id))
            .first()
        )

    def _tracks_serial(self, item_id: str) -> bool:
        ext = (
            self._db.query(InventoryItem)
            .filter(InventoryItem.item_id == item_id)
            .first()
        )
        return bool(ext and ext.track_serial)

    def _tracks_stock(self, item_id: str) -> bool:
        ext = (
            self._db.query(InventoryItem)
            .filter(InventoryItem.item_id == item_id)
            .first()
        )
        if ext is not None:
            return bool(ext.track_stock)
        return True

    def _stock_available(self, item_id: str, warehouse_id: str) -> tuple[int, int]:
        stock = (
            self._db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == item_id,
                InventoryStockLevel.warehouse_id == warehouse_id,
            )
            .first()
        )
        on_hand = int(stock.on_hand) if stock else 0
        reserved = int(stock.reserved) if stock else 0
        return on_hand, max(on_hand - reserved, 0)

    def _assert_stock_available(
        self,
        item: Item,
        *,
        warehouse_id: str,
        requested: int,
        company_id: str,
    ) -> None:
        if item.item_type in ("service", "digital", "combo"):
            return
        if not self._tracks_stock(item.id):
            return
        if allow_negative_stock(self._db, company_id):
            return
        _on_hand, available = self._stock_available(item.id, warehouse_id)
        if requested > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available Stock: {available}. Requested: {requested}.",
            )

    def _product_payload(self, item: Item, warehouse_id: str, company_id: str) -> dict[str, Any]:
        product = self._catalog_for_item(item)
        on_hand, available = self._stock_available(item.id, warehouse_id)
        track_serial = self._tracks_serial(item.id)
        warranty = product.warranty if product else None
        verdict = warranty_rules.evaluate(warranty_text=warranty, purchased_on=date.today())
        return {
            "item_id": item.id,
            "sku": item.sku,
            "barcode": item.barcode,
            "name": item.name,
            "brand": product.brand if product else None,
            "category": product.category if product else None,
            "unit_price": float(product.price) if product else 0,
            "on_hand": on_hand,
            "available": available,
            "thumbnail": product.thumbnail if product else None,
            "track_serial": track_serial,
            "warranty": warranty,
            "warranty_end": verdict.expires_on.isoformat() if verdict.expires_on else None,
        }

    def _build_receipt(
        self,
        cart: PosCart,
        order: SalesOrder,
        payments: list[PosPaymentInput],
        session: PosSession,
    ) -> PosReceipt:
        lines = self.get_cart_lines(cart.id)
        customer = self._db.get(CommerceCustomer, cart.customer_id) if cart.customer_id else None
        warehouse = self._db.get(InventoryWarehouse, cart.warehouse_id)
        settings = self.get_settings(cart.company_id)
        paid = sum((p.amount for p in payments), Decimal("0"))
        change = max(paid - cart.total, Decimal("0"))
        payload = {
            "receipt_number": self._next_receipt_number(cart.company_id),
            "order_number": order.order_number,
            "invoice_number": order.invoice_number,
            "cart_number": cart.cart_number,
            "business_name": "AgainERP",
            "branch": warehouse.name if warehouse else session.register_name,
            "address": warehouse.address if warehouse else None,
            "cashier": session.cashier_name,
            "terminal": session.register_name,
            "customer": customer.name if customer else "Walk-in Customer",
            "customer_phone": customer.phone if customer else None,
            "subtotal": float(cart.subtotal + cart.order_discount),
            "discount": float(cart.discount_total),
            "tax": float(cart.tax_total),
            "total": float(cart.total),
            "paid": float(paid),
            "change": float(change),
            "receipt_size": settings.get("receipt_size") or "80mm",
            "footer": settings.get("receipt_footer"),
            "return_policy": settings.get("return_policy"),
            "logo_url": settings.get("logo_url"),
            "show_warranty": bool(settings.get("show_warranty")),
            "lines": [
                {
                    "sku": l.sku,
                    "name": l.name,
                    "quantity": l.quantity,
                    "unit_price": float(l.unit_price),
                    "discount": float(l.discount_amount),
                    "line_total": float(l.line_total),
                    "serial_number": l.serial_number,
                    "warranty": l.warranty_text,
                }
                for l in lines
            ],
            "payments": [
                {"method": p.payment_method, "amount": float(p.amount), "reference": p.reference}
                for p in payments
            ],
            "completed_at": cart.completed_at.isoformat() if cart.completed_at else None,
        }
        receipt = PosReceipt(
            company_id=cart.company_id,
            pos_cart_id=cart.id,
            session_id=cart.session_id,
            receipt_number=payload["receipt_number"],
            sales_order_id=order.id,
            invoice_number=order.invoice_number or payload["receipt_number"],
            receipt_json=json.dumps(payload),
        )
        self._db.add(receipt)
        return receipt

    def _walk_in_customer_id(self, company_id: str) -> str:
        row = (
            self._db.query(CommerceCustomer)
            .filter(
                CommerceCustomer.company_id == company_id,
                CommerceCustomer.customer_code == DEFAULT_WALK_IN_CUSTOMER_CODE,
            )
            .first()
        )
        if row:
            return row.id
        fallback = (
            self._db.query(CommerceCustomer)
            .filter(CommerceCustomer.company_id == company_id, CommerceCustomer.status == "active")
            .first()
        )
        if not fallback:
            raise HTTPException(status_code=400, detail="No customer available for POS sale")
        return fallback.id

    def _next_cart_number(self, company_id: str) -> str:
        prefix = f"POS-{datetime.utcnow().year}-"
        return allocate_number(
            self._db,
            company_id,
            "pos.cart",
            initial=lambda: self._db.query(PosCart)
            .filter(PosCart.company_id == company_id, PosCart.cart_number.like(f"{prefix}%"))
            .count()
            + 1,
        )

    def _next_receipt_number(self, company_id: str) -> str:
        prefix = f"RCP-{datetime.utcnow().year}-"
        return allocate_number(
            self._db,
            company_id,
            "pos.receipt",
            initial=lambda: self._db.query(PosReceipt)
            .filter(PosReceipt.company_id == company_id, PosReceipt.receipt_number.like(f"{prefix}%"))
            .count()
            + 1,
        )

    def _next_return_number(self, company_id: str) -> str:
        prefix = f"RET-{datetime.utcnow().year}-"
        return allocate_number(
            self._db,
            company_id,
            "pos.return",
            initial=lambda: self._db.query(PosReturn)
            .filter(PosReturn.company_id == company_id, PosReturn.return_number.like(f"{prefix}%"))
            .count()
            + 1,
        )

    def _normalize_serial(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        cleaned = clean_serial(value)
        return cleaned or None

    def _require_serial_available(
        self,
        serial_number: str,
        item_id: str,
        company_id: str,
        *,
        exclude_cart_id: Optional[str] = None,
    ) -> InventorySerial:
        row = find_by_number(self._db, serial_number, company_id=company_id)
        if row is None:
            raise HTTPException(status_code=400, detail="Invalid serial number")
        if row.item_id and row.item_id != item_id:
            raise HTTPException(status_code=400, detail="Serial number does not belong to this product")
        if row.status != "in_stock":
            raise HTTPException(status_code=400, detail="Serial number already sold")
        in_cart = (
            self._db.query(PosCartLine)
            .join(PosCart, PosCart.id == PosCartLine.pos_cart_id)
            .filter(
                PosCart.company_id == company_id,
                PosCart.status.in_(("active", "held")),
                PosCartLine.serial_number == row.serial_number,
            )
        )
        if exclude_cart_id:
            in_cart = in_cart.filter(PosCart.id != exclude_cart_id)
        if in_cart.first():
            raise HTTPException(status_code=400, detail="Serial number already sold")
        return row

    def _mark_serial_sold(
        self,
        serial_number: str,
        *,
        order: SalesOrder,
        customer: Optional[CommerceCustomer],
        company_id: str,
    ) -> None:
        row = find_by_number(self._db, serial_number, company_id=company_id)
        if row is None or row.status != "in_stock":
            raise HTTPException(status_code=400, detail="Serial number already sold")
        product = None
        if row.sku:
            product = self._db.query(CatalogProduct).filter(CatalogProduct.sku == row.sku).first()
        from app.services.inventory.inventory_settings_service import warranty_anchor_date

        purchased_on = warranty_anchor_date(
            self._db,
            company_id,
            sold_on=order.created_at or date.today(),
            received_at=row.received_at,
        )
        verdict = warranty_rules.evaluate(
            warranty_text=product.warranty if product else None,
            purchased_on=purchased_on,
        )
        row.status = "sold"
        row.sold_at = order.created_at or datetime.utcnow()
        row.order_id = order.id
        row.order_number = order.order_number
        row.customer_id = customer.id if customer else None
        row.customer_name = customer.name if customer else ""
        row.warranty_expires_on = verdict.expires_on
        self._db.flush()

    def _restore_serial(self, serial_number: str, *, company_id: str) -> None:
        row = find_by_number(self._db, serial_number, company_id=company_id)
        if row is None:
            return
        set_serial_status(self._db, row, "in_stock")
        row.sold_at = None
        row.order_id = None
        row.order_number = None
        row.customer_id = None
        row.customer_name = ""
        self._db.flush()

    def _require_session(self, session_id: str) -> PosSession:
        row = self.get_session(session_id)
        if not row:
            raise HTTPException(status_code=404, detail="POS session not found")
        return row

    def _require_cart(self, cart_id: str) -> PosCart:
        row = self.get_cart(cart_id)
        if not row:
            raise HTTPException(status_code=404, detail="POS cart not found")
        return row

    def _require_warehouse(self, warehouse_id: str) -> InventoryWarehouse:
        row = self._db.get(InventoryWarehouse, warehouse_id)
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        return row
