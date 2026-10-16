from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.commerce_order import CommerceOrder, dump_json
from app.models.commerce_order_item import CommerceOrderItem
from app.models.storefront_cart import StorefrontCart, StorefrontCartItem
from app.services.ecommerce.storefront_cart_service import CartError, StorefrontCartService
from app.schemas.storefront import StorefrontCheckoutCreate
from app.security import new_session_token

FREE_SHIPPING_THRESHOLD = Decimal("2000")
SHIPPING_RATES = {"standard": Decimal("80"), "express": Decimal("150")}
PAYMENT_LABELS = {
    "cod": "Cash on Delivery",
    "bkash": "bKash",
    "card": "Credit / Debit Card",
    "bank": "Bank Transfer",
}


def _shipping_amount(method: str, subtotal: Decimal) -> Decimal:
    if subtotal >= FREE_SHIPPING_THRESHOLD:
        return Decimal("0")
    return SHIPPING_RATES.get(method, SHIPPING_RATES["standard"])


def _order_number() -> str:
    return f"ORD-{new_session_token()[:8].upper()}"


def _product_row_dict(row: CatalogProduct) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "brand": row.brand or "",
        "category": row.category or "",
        "price_bdt": float(row.price),
        "in_stock": row.stock > 0,
        "stock": row.stock,
    }


def search_products(db: Session, query: str, limit: int = 5) -> list[dict[str, Any]]:
    term = f"%{query.strip()}%"
    rows = (
        db.query(CatalogProduct)
        .filter(
            CatalogProduct.status == "published",
            (CatalogProduct.name.ilike(term))
            | (CatalogProduct.slug.ilike(term))
            | (CatalogProduct.brand.ilike(term))
            | (CatalogProduct.category.ilike(term)),
        )
        .order_by(CatalogProduct.stock.desc(), CatalogProduct.name.asc())
        .limit(min(limit, 10))
        .all()
    )
    return [_product_row_dict(row) for row in rows]


def list_products(
    db: Session,
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    query = db.query(CatalogProduct).filter(CatalogProduct.status == "published")
    if category and category.strip():
        query = query.filter(CatalogProduct.category.ilike(f"%{category.strip()}%"))
    total = query.count()
    rows = (
        query.order_by(CatalogProduct.name.asc())
        .offset(max(offset, 0))
        .limit(min(limit, 30))
        .all()
    )
    products = [_product_row_dict(row) for row in rows]
    return {
        "total": total,
        "offset": max(offset, 0),
        "showing": len(products),
        "category_filter": category.strip() if category else None,
        "products": products,
    }


def list_categories(db: Session, limit: int = 30) -> list[dict[str, Any]]:
    rows = (
        db.query(CatalogCategory)
        .filter(CatalogCategory.is_active.is_(True))
        .order_by(CatalogCategory.sort_order.asc(), CatalogCategory.name.asc())
        .limit(min(limit, 50))
        .all()
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        product_count = (
            db.query(CatalogProduct)
            .filter(
                CatalogProduct.status == "published",
                CatalogProduct.category.ilike(row.name),
            )
            .count()
        )
        result.append(
            {
                "id": row.id,
                "name": row.name,
                "slug": row.slug,
                "product_count": product_count,
            },
        )
    return result


def add_to_cart(
    db: Session,
    cart_token: Optional[str],
    product_id: str,
    quantity: int = 1,
) -> tuple[dict[str, Any], str]:
    service = StorefrontCartService(db)
    cart = service.get_or_create_cart(cart_token=cart_token)
    try:
        cart = service.add_item(cart, quantity=max(1, min(quantity, 99)), product_id=product_id)
    except CartError as exc:
        return {"ok": False, "error": str(exc)}, cart.cart_token
    cart_data = service.build_read_model(cart)
    return {
        "ok": True,
        "message": f"Added item x{quantity}",
        "cart": {
            "item_count": cart_data["item_count"],
            "subtotal_bdt": float(cart_data["subtotal"]),
            "items": [
                {
                    "name": item["name"],
                    "quantity": item["quantity"],
                    "unit_price_bdt": float(item["unit_price"]),
                }
                for item in cart_data["items"]
            ],
        },
    }, cart.cart_token


def view_cart(db: Session, cart_token: Optional[str]) -> tuple[dict[str, Any], str]:
    service = StorefrontCartService(db)
    cart = service.get_or_create_cart(cart_token=cart_token)
    cart_data = service.build_read_model(cart)
    return {
        "item_count": cart_data["item_count"],
        "subtotal_bdt": float(cart_data["subtotal"]),
        "items": [
            {
                "id": item["id"],
                "product_id": item["product_id"],
                "name": item["name"],
                "quantity": item["quantity"],
                "unit_price_bdt": float(item["unit_price"]),
            }
            for item in cart_data["items"]
        ],
    }, cart.cart_token


def place_order(
    db: Session,
    cart_token: Optional[str],
    payload: StorefrontCheckoutCreate,
) -> tuple[dict[str, Any], str]:
    service = StorefrontCartService(db)
    cart = service.get_or_create_cart(cart_token=cart_token)
    cart = service.load_cart(cart.id)
    if not cart.items:
        return {"ok": False, "error": "Cart is empty — add products first"}, cart.cart_token

    issues = service.validate_cart(cart)
    if any(i.blocking for i in issues):
        return {"ok": False, "error": issues[0].message}, cart.cart_token

    subtotal = sum((item.unit_price * item.quantity for item in cart.items), Decimal("0"))
    shipping_amount = _shipping_amount(payload.shipping_method, subtotal)
    grand_total = subtotal + shipping_amount

    customer_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip()
    payment_key = payload.payment_method.lower()
    payment_method = PAYMENT_LABELS.get(payment_key, payload.payment_method)

    order = CommerceOrder(
        order_number=_order_number(),
        order_date=datetime.utcnow(),
        status="pending",
        payment_status="unpaid",
        shipment_status="unfulfilled",
        source="AI Chat",
        customer_name=customer_name,
        customer_phone=payload.phone.strip(),
        customer_email=payload.email.strip().lower(),
        billing_address=payload.address.strip(),
        billing_city=payload.district.strip() or None,
        billing_region=payload.district.strip() or None,
        billing_country="Bangladesh",
        shipping_address=payload.address.strip(),
        shipping_city=payload.district.strip() or None,
        shipping_region=payload.district.strip() or None,
        shipping_country="Bangladesh",
        payment_method=payment_method,
        paid_amount=Decimal("0"),
        due_amount=grand_total,
        shipping_cost=shipping_amount,
        subtotal=subtotal,
        shipping_amount=shipping_amount,
        grand_total=grand_total,
        notes=payload.notes,
        timeline_json=dump_json(
            [
                {
                    "id": "evt_chat_order",
                    "type": "created",
                    "label": "Order placed via AI chat",
                    "at": datetime.utcnow().isoformat(),
                },
            ],
        ),
    )
    db.add(order)
    db.flush()

    for idx, item in enumerate(cart.items):
        line_total = item.unit_price * item.quantity
        db.add(
            CommerceOrderItem(
                order_id=order.id,
                product_id=item.product_id,
                sku=item.sku_snapshot or item.slug,
                name=item.name_snapshot,
                image_url=item.thumbnail,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=line_total,
                sort_order=idx,
            ),
        )

    db.query(StorefrontCartItem).filter(StorefrontCartItem.cart_id == cart.id).delete()
    db.commit()

    return {
        "ok": True,
        "order_number": order.order_number,
        "order_id": order.id,
        "grand_total_bdt": float(grand_total),
        "payment_method": payment_method,
        "customer_email": order.customer_email,
    }, cart.cart_token


def execute_chat_order_tool(
    db: Session,
    cart_token: Optional[str],
    tool_name: str,
    arguments: dict[str, Any],
) -> tuple[str, str, Optional[str]]:
    """Returns JSON result, cart_token, optional order_number."""
    order_number: Optional[str] = None

    if tool_name == "search_products":
        result = search_products(db, arguments.get("query", ""), int(arguments.get("limit", 5)))
        return json.dumps({"products": result}), cart_token or "", None

    if tool_name == "list_products":
        result = list_products(
            db,
            category=arguments.get("category"),
            limit=int(arguments.get("limit", 20)),
            offset=int(arguments.get("offset", 0)),
        )
        return json.dumps(result), cart_token or "", None

    if tool_name == "list_categories":
        result = list_categories(db, limit=int(arguments.get("limit", 30)))
        return json.dumps({"categories": result}), cart_token or "", None

    if tool_name == "add_to_cart":
        result, token = add_to_cart(
            db,
            cart_token,
            str(arguments.get("product_id", "")),
            int(arguments.get("quantity", 1)),
        )
        return json.dumps(result), token, None

    if tool_name == "view_cart":
        result, token = view_cart(db, cart_token)
        return json.dumps(result), token, None

    if tool_name == "place_order":
        phone = str(arguments.get("phone", "")).strip()
        email = str(arguments.get("email", "")).strip() or f"{phone.replace(' ', '').replace('+', '')}@chat.againerp.local"
        payload = StorefrontCheckoutCreate(
            email=email,
            first_name=str(arguments.get("first_name", "")),
            last_name=str(arguments.get("last_name", ".")),
            phone=phone,
            address=str(arguments.get("address", "")),
            district=str(arguments.get("district", "")),
            payment_method=str(arguments.get("payment_method", "cod")),
            shipping_method=str(arguments.get("shipping_method", "standard")),
            notes=arguments.get("notes"),
        )
        result, token = place_order(db, cart_token, payload)
        if result.get("ok"):
            order_number = str(result.get("order_number"))
        return json.dumps(result), token, order_number

    return json.dumps({"error": f"Unknown tool: {tool_name}"}), cart_token or "", None


CHAT_ORDER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_products",
            "description": (
                "Read published products from the store database. "
                "Use when customer asks for all products, product list, catalog, or stock overview."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Optional category name filter e.g. Electronics, Fashion",
                    },
                    "limit": {"type": "integer", "description": "Max products to return (default 20, max 30)"},
                    "offset": {"type": "integer", "description": "Pagination offset (default 0)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": "Read product categories from the store database with product counts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max categories (default 30)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search store products by name, brand, or category. Use when customer wants to buy or browse items.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Product search term e.g. laptop, iPhone, headphone"},
                    "limit": {"type": "integer", "description": "Max results (default 5)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_cart",
            "description": "Add a product to the customer's cart after they confirm which item to buy.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string", "description": "Product ID from search_products"},
                    "quantity": {"type": "integer", "description": "Quantity (default 1)"},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "view_cart",
            "description": "Show current cart contents and subtotal.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "place_order",
            "description": "Place the order when cart has items and customer provided name, phone, email, address. Ask for missing fields first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "first_name": {"type": "string"},
                    "last_name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "address": {"type": "string", "description": "Full delivery address"},
                    "district": {"type": "string", "description": "City/district e.g. Dhaka"},
                    "payment_method": {
                        "type": "string",
                        "enum": ["cod", "bkash", "card", "bank"],
                        "description": "Default cod if customer doesn't specify",
                    },
                    "shipping_method": {
                        "type": "string",
                        "enum": ["standard", "express"],
                    },
                    "notes": {"type": "string"},
                },
                "required": ["first_name", "phone", "address", "district"],
            },
        },
    },
]
