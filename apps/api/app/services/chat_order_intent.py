from __future__ import annotations

import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.schemas.storefront import StorefrontCheckoutCreate
from app.services.chat_order_service import (
    add_to_cart,
    list_categories,
    list_products,
    place_order,
    search_products,
    view_cart,
)

ORDER_WORDS = (
    "order", "buy", "purchase", "cart", "stock", "price", "dam",
    "অর্ডার", "কিন", "কিনতে", "স্টক", "দাম", "পণ্য", "product",
)
LIST_ALL_PHRASES = (
    "all product", "all products", "product list", "list product", "list products",
    "what do you sell", "show catalog", "browse catalog", "full catalog",
    "সমস্ত পণ্য", "সব পণ্য", "সকল পণ্য", "পণ্যের তালিকা", "কী কী পণ্য", "কি কি পণ্য",
    "কি পণ্য", "পণ্য দেখাও", "পণ্য দেখান", "ক্যাটালগ",
)
CATEGORY_PHRASES = (
    "category", "categories", "ক্যাটাগরি", "ক্যাটাগরির", "ধরন", "বিভাগ",
)
STOP_WORDS = {
    "order", "korte", "chai", "chay", "kinbo", "kinte", "dekhaw", "dekhao", "dekhte",
    "stock", "price", "ami", "theke", "chat", "direct", "sorasory", "directly",
    "want", "need", "show", "me", "please", "a", "an", "the", "for", "to",
    "আমি", "চাই", "কorte", "করতে", "দেখাও", "দেখতে", "স্টক", "একটি", "একটা", "টা",
    "টি", "please", "product", "products", "item", "items",
}


def extract_product_query(message: str) -> str:
    text = message.strip().lower()
    for word in ORDER_WORDS:
        text = text.replace(word, " ")
    text = re.sub(r"[^\w\s\-]", " ", text, flags=re.UNICODE)
    tokens = [t for t in text.split() if t and t not in STOP_WORDS and len(t) > 2]
    return " ".join(tokens[:4]).strip()


def is_order_intent(message: str) -> bool:
    lower = message.lower()
    return any(w in lower for w in ORDER_WORDS)


def format_product_list(products: list[dict[str, Any]], lang_bn: bool, *, include_header: bool = True) -> str:
    if not products:
        if lang_bn:
            return "দুঃখিত, এই নামে কোনো পণ্য স্টকে নেই। অন্য নাম বলুন (যেমন: laptop, mouse, monitor)।"
        return "Sorry, no products found in stock for that search. Try another name (e.g. laptop, mouse)."

    lines: list[str] = []
    if include_header:
        if lang_bn:
            lines.append("📦 স্টকে পাওয়া যাচ্ছে:\n")
        else:
            lines.append("📦 In stock now:\n")

    for i, p in enumerate(products, 1):
        stock = int(p.get("stock", 0))
        price = p.get("price_bdt", 0)
        stock_label = f"✅ {stock} টি" if lang_bn else f"✅ {stock} in stock"
        if stock <= 0:
            stock_label = "❌ স্টক শেষ" if lang_bn else "❌ Out of stock"
        lines.append(f"{i}. **{p['name']}**")
        lines.append(f"   💰 ৳{price:,.0f} | {stock_label}")
        if p.get("brand"):
            lines.append(f"   🏷 {p['brand']}")

    if lang_bn:
        lines.append("\n👉 নিচের বাটনে ক্লিক করে কার্টে যোগ করুন, অথবা নম্বর/নাম বলে অর্ডার চালিয়ে যান।")
    else:
        lines.append("\n👉 Tap Add to cart below, or reply with the product number/name to continue.")
    return "\n".join(lines)


def _is_bengali(text: str) -> bool:
    return bool(re.search(r"[\u0980-\u09FF]", text))


def handle_search(db: Session, query: str, message: str) -> dict[str, Any]:
    products = search_products(db, query or message, limit=6)
    lang_bn = _is_bengali(message)
    return {
        "content": format_product_list(products, lang_bn),
        "products": products,
    }


def handle_list_products(db: Session, message: str, category: str | None = None) -> dict[str, Any]:
    payload = list_products(db, category=category, limit=20)
    products = payload.get("products") or []
    lang_bn = _is_bengali(message)
    total = int(payload.get("total", len(products)))
    showing = int(payload.get("showing", len(products)))

    if not products:
        if lang_bn:
            content = "ডাটাবেসে এখন কোনো published পণ্য নেই।"
        else:
            content = "No published products found in the database right now."
        return {"content": content, "products": []}

    header = (
        f"📦 ডাটাবেস থেকে {showing}/{total}টি পণ্য:\n"
        if lang_bn
        else f"📦 {showing}/{total} products from database:\n"
    )
    if category:
        header = (
            f"📦 '{category}' ক্যাটাগরিতে {showing}/{total}টি পণ্য:\n"
            if lang_bn
            else f"📦 {showing}/{total} products in '{category}':\n"
        )

    body = format_product_list(products, lang_bn, include_header=False)
    return {
        "content": header + body,
        "products": products,
    }


def handle_list_categories(db: Session, message: str) -> dict[str, Any]:
    categories = list_categories(db)
    lang_bn = _is_bengali(message)
    if not categories:
        content = "কোনো ক্যাটাগরি নেই।" if lang_bn else "No categories found in database."
        return {"content": content, "products": []}

    lines = ["🏷 **ক্যাটাগরি তালিকা:**\n" if lang_bn else "🏷 **Categories:**\n"]
    for idx, cat in enumerate(categories, 1):
        count = int(cat.get("product_count", 0))
        count_label = f"{count}টি পণ্য" if lang_bn else f"{count} products"
        lines.append(f"{idx}. **{cat['name']}** — {count_label}")

    if lang_bn:
        lines.append("\n👉 কোনো ক্যাটাগরির পণ্য দেখতে নাম লিখুন (যেমন: Electronics)।")
    else:
        lines.append("\n👉 Reply with a category name to see its products.")
    return {"content": "\n".join(lines), "products": []}


def _wants_all_products(message: str) -> bool:
    lower = message.lower()
    return any(phrase in lower for phrase in LIST_ALL_PHRASES)


def _wants_categories(message: str) -> bool:
    lower = message.lower()
    return any(phrase in lower for phrase in CATEGORY_PHRASES)


def try_catalog_intent(db: Session, message: str) -> Optional[dict[str, Any]]:
    """DB-backed catalog browse — works even when LLM tools are unavailable."""
    if _wants_categories(message) and not extract_product_query(message):
        return handle_list_categories(db, message)

    if _wants_all_products(message):
        return handle_list_products(db, message)

    return None


def handle_add_to_cart(
    db: Session,
    cart_token: Optional[str],
    product_id: str,
    quantity: int,
    message: str,
) -> dict[str, Any]:
    result, token = add_to_cart(db, cart_token, product_id, quantity)
    lang_bn = _is_bengali(message)
    if not result.get("ok"):
        err = str(result.get("error", "Failed"))
        return {"content": err, "products": [], "cart_token": token}

    cart = result.get("cart") or {}
    if lang_bn:
        content = (
            f"✅ কার্টে যোগ হয়েছে!\n\n"
            f"🛒 মোট {cart.get('item_count', 0)}টি আইটেম · ৳{cart.get('subtotal_bdt', 0):,.0f}\n\n"
            "অর্ডার সম্পন্ন করতে দিন:\n"
            "• আপনার নাম\n• মোবাইল নম্বর\n• সম্পূর্ণ ঠিকানা\n• জেলা/শহর\n• পেমেন্ট (COD/bKash/card)"
        )
    else:
        content = (
            f"✅ Added to cart!\n\n"
            f"🛒 {cart.get('item_count', 0)} items · ৳{cart.get('subtotal_bdt', 0):,.0f}\n\n"
            "To complete order, share:\n"
            "• Name\n• Phone\n• Full address\n• District\n• Payment (COD/bKash/card)"
        )
    return {"content": content, "products": [], "cart_token": token}


def handle_view_cart(db: Session, cart_token: Optional[str], message: str) -> dict[str, Any]:
    cart, token = view_cart(db, cart_token)
    lang_bn = _is_bengali(message)
    items = cart.get("items") or []
    if not items:
        msg = "🛒 কার্ট খালি।" if lang_bn else "🛒 Your cart is empty."
        return {"content": msg, "products": [], "cart_token": token}

    lines = ["🛒 **Your cart:**\n" if not lang_bn else "🛒 **আপনার কার্ট:**\n"]
    for item in items:
        lines.append(f"• {item['name']} x{item['quantity']} — ৳{item['unit_price_bdt']:,.0f}")
    lines.append(f"\n**Total: ৳{cart.get('subtotal_bdt', 0):,.0f}**")
    return {"content": "\n".join(lines), "products": [], "cart_token": token}


def try_order_intent_fallback(
    db: Session,
    message: str,
    cart_token: Optional[str],
) -> Optional[dict[str, Any]]:
    """DB-backed order helper when LLM unavailable or for search-only requests."""
    catalog = try_catalog_intent(db, message)
    if catalog:
        return catalog

    if not is_order_intent(message):
        return None

    query = extract_product_query(message)
    if query:
        return handle_search(db, query, message)

    if _is_bengali(message):
        content = "কোন পণ্য চান? নাম লিখুন (যেমন: laptop, mouse) — স্টক সহ দেখাব।"
    else:
        content = "Which product do you want? Type a name (e.g. laptop, mouse) — I'll show stock and price."
    return {"content": content, "products": []}


def run_chat_action(
    db: Session,
    action: str,
    cart_token: Optional[str],
    message: str,
    *,
    product_id: Optional[str] = None,
    query: Optional[str] = None,
    quantity: int = 1,
    checkout: Optional[StorefrontCheckoutCreate] = None,
) -> dict[str, Any]:
    if action == "search":
        return handle_search(db, query or extract_product_query(message) or message, message)
    if action == "list":
        return handle_list_products(db, message, category=query)
    if action == "categories":
        return handle_list_categories(db, message)
    if action == "add_to_cart" and product_id:
        return handle_add_to_cart(db, cart_token, product_id, quantity, message)
    if action == "view_cart":
        return handle_view_cart(db, cart_token, message)
    if action == "place_order" and checkout:
        result, token = place_order(db, cart_token, checkout)
        lang_bn = _is_bengali(message)
        if not result.get("ok"):
            return {"content": str(result.get("error")), "products": [], "cart_token": token}
        if lang_bn:
            content = (
                f"🎉 **অর্ডার সফল!**\n\n"
                f"📋 অর্ডার নং: **{result['order_number']}**\n"
                f"💰 মোট: ৳{result['grand_total_bdt']:,.0f}\n"
                f"💳 পেমেন্ট: {result['payment_method']}\n\n"
                "SMS/email কনফার্মেশন শীঘ্রই পাবেন।"
            )
        else:
            content = (
                f"🎉 **Order placed!**\n\n"
                f"📋 Order: **{result['order_number']}**\n"
                f"💰 Total: ৳{result['grand_total_bdt']:,.0f}\n"
                f"💳 Payment: {result['payment_method']}"
            )
        return {
            "content": content,
            "products": [],
            "cart_token": token,
            "order_number": result.get("order_number"),
        }
    return {"content": "Unknown action", "products": []}
